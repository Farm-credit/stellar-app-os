#![no_std]

//! Treasury Contract — 4-of-7 Multisig with Emergency Withdrawal Guard
//!
//! Closes #492, #797, #SC-085
//!
//! Platform fees accumulate in this contract. Any withdrawal requires
//! 4-of-7 signers to approve a `WithdrawProposal` before funds move.
//!
//! For large transfers above `EMERGENCY_THRESHOLD` (50,000 USDC-equivalent
//! stroops), an emergency guard enforces 4 approvals before execution.
//! Regular transfers below the threshold also require 4 approvals
//! (4-of-7 supermajority).
//!
//! ## Flow
//! 1. `initialize(signers[7], token)` — set seven signer addresses.
//! 2. Anyone calls `deposit(from, amount)` to top up the treasury.
//! 3. A signer calls `propose(signer, to, amount)` → returns `proposal_id`.
//! 4. Three *different* signers call `approve(signer, proposal_id)` to
//!    reach 4/7. On the fourth approval the token transfer executes.
//! 5. Any signer can `cancel(signer, proposal_id)` an open proposal.
//!
//! ## Emergency Guard
//! Transfers with `amount >= EMERGENCY_THRESHOLD` are flagged as emergency
//! proposals. They follow the same 4-of-7 flow but emit an additional
//! `emrg_prp` event so off-chain monitors can raise alerts.
//!
//! ## Vault Balance Sync (#SC-085)
//! `sync_vault_balance(call_id)` pulls `vault_balance` from the
//! call-registry contract and caches it locally. `get_synced_vault(call_id)`
//! returns the cached value for analytics without repeated cross-contract
//! calls.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env, Vec};

use call_registry::CallRegistryClient;

// — Constants ————————————————————————————————————————————————————————————

/// Number of required approvers (including proposer) to execute.
const REQUIRED_APPROVALS: u32 = 4;
/// Total number of signers in the multisig.
const TOTAL_SIGNERS: u32 = 7;
/// Transfers at or above this amount (in token stroops) trigger the
/// emergency guard path and emit an extra alert event.
/// 50,000 USDC with 7 decimal places = 50_000 * 10_000_000
pub const EMERGENCY_THRESHOLD: i128 = 500_000_000_000;

// — Types ——————————————————————————————————————————————————————————————

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalStatus {
    Open,
    Executed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct WithdrawProposal {
    pub proposer: Address,
    /// List of signers who have approved (includes proposer as first entry).
    pub approvers: Vec<Address>,
    pub to: Address,
    pub amount: i128,
    pub status: ProposalStatus,
    /// True when `amount >= EMERGENCY_THRESHOLD`.
    pub is_emergency: bool,
}

#[contracttype]
enum DataKey {
    /// Vec<Address> of the seven signers
    Signers,
    /// Payment token address
    Token,
    /// Auto-incrementing proposal counter
    NextId,
    /// Proposal by id
    Proposal(u32),
    /// Address of the call-registry contract
    CallRegistry,
    /// Cached vault_balance from call_registry keyed by call_id
    SyncedVault(u64),
}

// — Contract ——————————————————————————————————————————————————————————

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    // — Admin ———————————————————————————————————————————————————————

    /// One-time initialisation.
    ///
    /// * `signers` — exactly 7 distinct multisig keyholders.
    /// * `token`   — the token contract used to hold and disburse platform fees.
    pub fn initialize(env: Env, signers: Vec<Address>, token: Address) {
        if env.storage().instance().has(&DataKey::Signers) {
            panic!("already initialized");
        }
        if signers.len() != TOTAL_SIGNERS {
            panic!("must supply exactly 7 signers");
        }
        // Ensure all signers are distinct
        for i in 0..signers.len() {
            for j in (i + 1)..signers.len() {
                if signers.get(i).unwrap() == signers.get(j).unwrap() {
                    panic!("signers must be distinct");
                }
            }
        }
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u32);
    }

    /// Set the address of the call-registry contract.
    /// Must be called before sync_vault_balance.
    pub fn set_call_registry(env: Env, registry: Address) {
        if !env.storage().instance().has(&DataKey::Signers) {
            panic!("not initialized");
        }
        env.storage()
            .instance()
            .set(&DataKey::CallRegistry, &registry);
    }

    // — Deposit ———————————————————————————————————————————————————

    /// Transfer `amount` of the treasury token from `from` into this contract.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");
        token::Client::new(&env, &token).transfer(&from, &env.current_contract_address(), &amount);
    }

    // — Multisig flow ————————————————————————————————————————————

    /// A signer opens a withdrawal proposal. Returns the new `proposal_id`.
    ///
    /// If `amount >= EMERGENCY_THRESHOLD`, the proposal is flagged as an
    /// emergency and an `emrg_prp` event is published.
    pub fn propose(env: Env, signer: Address, to: Address, amount: i128) -> u32 {
        signer.require_auth();
        Self::assert_signer(&env, &signer);
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .expect("not initialized");

        let is_emergency = amount >= EMERGENCY_THRESHOLD;

        let mut approvers = Vec::new(&env);
        approvers.push_back(signer.clone());

        let proposal = WithdrawProposal {
            proposer: signer.clone(),
            approvers,
            to,
            amount,
            status: ProposalStatus::Open,
            is_emergency,
        };
        env.storage()
            .instance()
            .set(&DataKey::Proposal(id), &proposal);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        env.events().publish((symbol_short!("proposed"),), (id,));

        if is_emergency {
            env.events()
                .publish((symbol_short!("emrg_prp"),), (id, amount));
        }

        id
    }

    /// A *different* signer approves an open proposal.
    /// Reaching 4 total distinct approvals immediately executes the transfer.
    pub fn approve(env: Env, signer: Address, proposal_id: u32) {
        signer.require_auth();
        Self::assert_signer(&env, &signer);

        let mut proposal: WithdrawProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Open {
            panic!("proposal is not open");
        }

        // Ensure this signer hasn't already approved
        for i in 0..proposal.approvers.len() {
            if proposal.approvers.get(i).unwrap() == signer {
                panic!("signer already approved");
            }
        }

        proposal.approvers.push_back(signer.clone());

        if proposal.approvers.len() >= REQUIRED_APPROVALS {
            let token: Address = env
                .storage()
                .instance()
                .get(&DataKey::Token)
                .expect("not initialized");

            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &proposal.to,
                &proposal.amount,
            );

            proposal.status = ProposalStatus::Executed;
            env.storage()
                .instance()
                .set(&DataKey::Proposal(proposal_id), &proposal);

            env.events()
                .publish((symbol_short!("executed"),), (proposal_id,));
        } else {
            env.storage()
                .instance()
                .set(&DataKey::Proposal(proposal_id), &proposal);

            env.events().publish(
                (symbol_short!("approved"),),
                (proposal_id, proposal.approvers.len()),
            );
        }
    }

    /// Any signer can cancel an open proposal.
    pub fn cancel(env: Env, signer: Address, proposal_id: u32) {
        signer.require_auth();
        Self::assert_signer(&env, &signer);

        let mut proposal: WithdrawProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Open {
            panic!("proposal is not open");
        }

        proposal.status = ProposalStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events()
            .publish((symbol_short!("cancelled"),), (proposal_id,));
    }

    // — Queries ———————————————————————————————————————————————————

    /// Return a proposal by id.
    pub fn get_proposal(env: Env, proposal_id: u32) -> WithdrawProposal {
        env.storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found")
    }

    /// Return the number of approvals a proposal has received.
    pub fn approval_count(env: Env, proposal_id: u32) -> u32 {
        let proposal: WithdrawProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");
        proposal.approvers.len()
    }

    /// Return whether a proposal is marked as an emergency.
    pub fn is_emergency(env: Env, proposal_id: u32) -> bool {
        let proposal: WithdrawProposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");
        proposal.is_emergency
    }

    /// Return the current treasury token balance of this contract.
    pub fn balance(env: Env) -> i128 {
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");
        token::Client::new(&env, &token).balance(&env.current_contract_address())
    }

    /// Sync vault_balance from call_registry into treasury cache.
    /// Pulls vault_balance for the given call_id and stores it locally.
    pub fn sync_vault_balance(env: Env, call_id: u64) -> i128 {
        let registry_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::CallRegistry)
            .expect("call registry not set");

        let vault_balance =
            CallRegistryClient::new(&env, &registry_addr).get_vault_balance(&call_id);

        env.storage()
            .instance()
            .set(&DataKey::SyncedVault(call_id), &vault_balance);

        env.events()
            .publish((symbol_short!("v_sync"),), (call_id, vault_balance));

        vault_balance
    }

    /// Return the cached vault_balance for a given call_id.
    /// Reverts if the call has not been synced yet.
    pub fn get_synced_vault(env: Env, call_id: u64) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::SyncedVault(call_id))
            .expect("vault not synced")
    }

    /// Return the list of configured signers.
    pub fn get_signers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Signers)
            .expect("not initialized")
    }

    // — Internal helpers ——————————————————————————————————————————

    fn assert_signer(env: &Env, addr: &Address) {
        let signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .expect("not initialized");
        let mut found = false;
        for i in 0..signers.len() {
            if signers.get(i).unwrap() == *addr {
                found = true;
                break;
            }
        }
        if !found {
            panic!("not a signer");
        }
    }
}

// — Tests ———————————————————————————————————————————————————————————

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

    use crate::{ProposalStatus, Treasury, TreasuryClient, EMERGENCY_THRESHOLD};
    use call_registry::{CallRegistry, CallRegistryClient};

    fn deploy_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        soroban_sdk::token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    struct Ctx {
        env: Env,
        contract: Address,
        signers: Vec<Address>,
        token: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = deploy_token(&env, &admin);
        let mut signers = Vec::new(&env);
        for _ in 0..7 {
            signers.push_back(Address::generate(&env));
        }
        let contract = env.register(Treasury, ());
        TreasuryClient::new(&env, &contract).initialize(&signers, &token);
        Ctx {
            env,
            contract,
            signers,
            token,
        }
    }

    fn setup_with_registry() -> (Ctx, Address) {
        let ctx = setup();
        let registry_contract = ctx.env.register(CallRegistry, ());
        CallRegistryClient::new(&ctx.env, &registry_contract).initialize();
        TreasuryClient::new(&ctx.env, &ctx.contract).set_call_registry(&registry_contract);
        (ctx, registry_contract)
    }

    #[test]
    fn test_propose_and_four_approvals_execute_transfer() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 10_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &1_000);
        assert_eq!(client.approval_count(&pid), 1);
        client.approve(&signers.get(1).unwrap(), &pid);
        client.approve(&signers.get(2).unwrap(), &pid);
        client.approve(&signers.get(3).unwrap(), &pid);
        assert_eq!(
            soroban_sdk::token::Client::new(&env, &token).balance(&recipient),
            1_000
        );
        assert_eq!(client.get_proposal(&pid).status, ProposalStatus::Executed);
    }

    #[test]
    fn test_three_approvals_not_enough() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 10_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &1_000);
        client.approve(&signers.get(1).unwrap(), &pid);
        client.approve(&signers.get(2).unwrap(), &pid);
        assert_eq!(
            soroban_sdk::token::Client::new(&env, &token).balance(&recipient),
            0
        );
        assert_eq!(client.get_proposal(&pid).status, ProposalStatus::Open);
        assert_eq!(client.approval_count(&pid), 3);
    }

    #[test]
    fn test_deposit_increases_balance() {
        let Ctx {
            env,
            contract,
            token,
            ..
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        let funder = Address::generate(&env);
        mint(&env, &token, &funder, 2_000);
        client.deposit(&funder, &2_000);
        assert_eq!(client.balance(), 2_000);
    }

    #[test]
    fn test_cancel_open_proposal() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &100);
        client.cancel(&signers.get(0).unwrap(), &pid);
        assert_eq!(client.get_proposal(&pid).status, ProposalStatus::Cancelled);
    }

    #[test]
    fn test_emergency_flag_set_for_large_transfers() {
        let Ctx {
            env,
            contract,
            signers,
            ..
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        let recipient = Address::generate(&env);
        let pid_normal = client.propose(&signers.get(0).unwrap(), &recipient, &1_000);
        assert!(!client.is_emergency(&pid_normal));
        let pid_emerg = client.propose(&signers.get(0).unwrap(), &recipient, &EMERGENCY_THRESHOLD);
        assert!(client.is_emergency(&pid_emerg));
    }

    #[test]
    fn test_seven_signers_retrieved_correctly() {
        let Ctx {
            env,
            contract,
            signers,
            ..
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        let stored = client.get_signers();
        assert_eq!(stored.len(), 7);
        for i in 0..7u32 {
            assert_eq!(stored.get(i).unwrap(), signers.get(i).unwrap());
        }
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_rejected() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        TreasuryClient::new(&env, &contract).initialize(&signers, &token);
    }

    #[test]
    #[should_panic(expected = "must supply exactly 7 signers")]
    fn test_wrong_signer_count_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = deploy_token(&env, &admin);
        let contract = env.register(Treasury, ());
        let mut signers = Vec::new(&env);
        for _ in 0..3 {
            signers.push_back(Address::generate(&env));
        }
        TreasuryClient::new(&env, &contract).initialize(&signers, &token);
    }

    #[test]
    #[should_panic(expected = "signers must be distinct")]
    fn test_duplicate_signers_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = deploy_token(&env, &admin);
        let dup = Address::generate(&env);
        let contract = env.register(Treasury, ());
        let mut signers = Vec::new(&env);
        for _ in 0..7 {
            signers.push_back(dup.clone());
        }
        TreasuryClient::new(&env, &contract).initialize(&signers, &token);
    }

    #[test]
    #[should_panic(expected = "signer already approved")]
    fn test_proposer_cannot_approve_own_proposal() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &100);
        client.approve(&signers.get(0).unwrap(), &pid);
    }

    #[test]
    #[should_panic(expected = "not a signer")]
    fn test_non_signer_cannot_propose() {
        let Ctx {
            env,
            contract,
            token,
            ..
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let outsider = Address::generate(&env);
        let recipient = Address::generate(&env);
        client.propose(&outsider, &recipient, &100);
    }

    #[test]
    #[should_panic(expected = "proposal is not open")]
    fn test_approve_cancelled_proposal_rejected() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &100);
        client.cancel(&signers.get(0).unwrap(), &pid);
        client.approve(&signers.get(1).unwrap(), &pid);
    }

    #[test]
    #[should_panic(expected = "signer already approved")]
    fn test_double_approve_rejected() {
        let Ctx {
            env,
            contract,
            signers,
            token,
        } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let pid = client.propose(&signers.get(0).unwrap(), &recipient, &100);
        client.approve(&signers.get(1).unwrap(), &pid);
        client.approve(&signers.get(1).unwrap(), &pid);
    }

    #[test]
    fn test_sync_vault_balance_matches_registry() {
        let (ctx, registry_contract) = setup_with_registry();
        let treasury_client = TreasuryClient::new(&ctx.env, &ctx.contract);
        let registry_client = CallRegistryClient::new(&ctx.env, &registry_contract);
        let caller = Address::generate(&ctx.env);

        let call_id = registry_client.register_call(&caller, &42_000);
        let synced = treasury_client.sync_vault_balance(&call_id);
        assert_eq!(synced, 42_000);

        let cached = treasury_client.get_synced_vault(&call_id);
        assert_eq!(cached, 42_000);
    }

    #[test]
    fn test_sync_multiple_vault_balances() {
        let (ctx, registry_contract) = setup_with_registry();
        let treasury_client = TreasuryClient::new(&ctx.env, &ctx.contract);
        let registry_client = CallRegistryClient::new(&ctx.env, &registry_contract);
        let caller = Address::generate(&ctx.env);

        let id0 = registry_client.register_call(&caller, &100);
        let id1 = registry_client.register_call(&caller, &200);

        assert_eq!(treasury_client.sync_vault_balance(&id0), 100);
        assert_eq!(treasury_client.sync_vault_balance(&id1), 200);
        assert_eq!(treasury_client.get_synced_vault(&id0), 100);
        assert_eq!(treasury_client.get_synced_vault(&id1), 200);
    }

    #[test]
    #[should_panic(expected = "call not found")]
    fn test_sync_vault_balance_missing_call_reverts() {
        let (ctx, _registry_contract) = setup_with_registry();
        let treasury_client = TreasuryClient::new(&ctx.env, &ctx.contract);
        treasury_client.sync_vault_balance(&99);
    }

    #[test]
    #[should_panic(expected = "vault not synced")]
    fn test_get_synced_vault_before_sync_reverts() {
        let (ctx, _registry_contract) = setup_with_registry();
        let treasury_client = TreasuryClient::new(&ctx.env, &ctx.contract);
        treasury_client.get_synced_vault(&0);
    }

    #[test]
    #[should_panic(expected = "call registry not set")]
    fn test_sync_vault_without_registry_reverts() {
        let ctx = setup();
        let treasury_client = TreasuryClient::new(&ctx.env, &ctx.contract);
        treasury_client.sync_vault_balance(&0);
    }
}
