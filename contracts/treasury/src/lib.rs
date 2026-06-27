#![no_std]

//! Treasury Contract — 2-of-3 Multisig for Platform Fee Withdrawals
//!
//! Closes #492
//!
//! Platform fees accumulate in this contract. Any withdrawal requires
//! 2-of-3 signers to approve a `WithdrawProposal` before funds move.
//!
//! ## Flow
//! 1. `initialize(signers, token)` — set three signer addresses.
//! 2. Anyone calls `deposit(from, amount)` to top up the treasury.
//! 3. A signer calls `propose(signer, to, amount)` → returns `proposal_id`.
//! 4. A *different* signer calls `approve(signer, proposal_id)` to reach 2/3.
//! 5. On the second approval the token transfer executes automatically.
//! 6. Any signer can `cancel(signer, proposal_id)` an open proposal.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

// ── Types ─────────────────────────────────────────────────────────────────────

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
    /// Address of the second signer who approved; None until approved.
    pub approver: Option<Address>,
    pub to: Address,
    pub amount: i128,
    pub status: ProposalStatus,
}

#[contracttype]
enum DataKey {
    /// (signer_a, signer_b, signer_c)
    Signers,
    /// Payment token address
    Token,
    /// Auto-incrementing proposal counter
    NextId,
    /// Proposal by id
    Proposal(u32),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    // ── Admin ─────────────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// * `signer_a/b/c` — the three multisig keyholders; must be distinct.
    /// * `token` — the token contract used to hold and disburse platform fees.
    pub fn initialize(
        env: Env,
        signer_a: Address,
        signer_b: Address,
        signer_c: Address,
        token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Signers) {
            panic!("already initialized");
        }
        if signer_a == signer_b || signer_a == signer_c || signer_b == signer_c {
            panic!("signers must be distinct");
        }
        env.storage()
            .instance()
            .set(&DataKey::Signers, &(signer_a, signer_b, signer_c));
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u32);
    }

    // ── Deposit ───────────────────────────────────────────────────────────────

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
        token::Client::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
    }

    // ── Multisig flow ─────────────────────────────────────────────────────────

    /// A signer opens a withdrawal proposal.  Returns the new `proposal_id`.
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

        let proposal = WithdrawProposal {
            proposer: signer,
            approver: None,
            to,
            amount,
            status: ProposalStatus::Open,
        };
        env.storage()
            .instance()
            .set(&DataKey::Proposal(id), &proposal);
        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));

        env.events()
            .publish((symbol_short!("proposed"),), (id,));

        id
    }

    /// A *different* signer approves an open proposal.
    /// Reaching 2 approvals immediately executes the transfer.
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
        if proposal.proposer == signer {
            panic!("proposer cannot also approve");
        }
        if proposal.approver.is_some() {
            panic!("already approved");
        }

        // ── Execute transfer ──────────────────────────────────────────────────
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

        proposal.approver = Some(signer);
        proposal.status = ProposalStatus::Executed;
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        env.events()
            .publish((symbol_short!("executed"),), (proposal_id,));
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

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Return a proposal by id.
    pub fn get_proposal(env: Env, proposal_id: u32) -> WithdrawProposal {
        env.storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found")
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

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn assert_signer(env: &Env, addr: &Address) {
        let (a, b, c): (Address, Address, Address) = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .expect("not initialized");
        if *addr != a && *addr != b && *addr != c {
            panic!("not a signer");
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{ProposalStatus, Treasury, TreasuryClient};

    // ── helpers ──────────────────────────────────────────────────────────────

    fn deploy_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone()).address()
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        soroban_sdk::token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    struct Ctx {
        env: Env,
        contract: Address,
        sa: Address,
        sb: Address,
        sc: Address,
        token: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = deploy_token(&env, &admin);
        let sa = Address::generate(&env);
        let sb = Address::generate(&env);
        let sc = Address::generate(&env);
        let contract = env.register(Treasury, ());
        TreasuryClient::new(&env, &contract).initialize(&sa, &sb, &sc, &token);
        Ctx { env, contract, sa, sb, sc, token }
    }

    // ── happy path ────────────────────────────────────────────────────────────

    #[test]
    fn test_propose_and_approve_executes_transfer() {
        let Ctx { env, contract, sa, sb, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);

        let recipient = Address::generate(&env);
        let proposal_id = client.propose(&sa, &recipient, &500);
        assert_eq!(soroban_sdk::token::Client::new(&env, &token).balance(&recipient), 0);

        client.approve(&sb, &proposal_id);

        assert_eq!(soroban_sdk::token::Client::new(&env, &token).balance(&recipient), 500);
        assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Executed);
    }

    #[test]
    fn test_third_signer_can_also_approve() {
        let Ctx { env, contract, sa, sc, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);

        let recipient = Address::generate(&env);
        let proposal_id = client.propose(&sa, &recipient, &300);
        client.approve(&sc, &proposal_id);

        assert_eq!(soroban_sdk::token::Client::new(&env, &token).balance(&recipient), 300);
    }

    #[test]
    fn test_deposit_increases_balance() {
        let Ctx { env, contract, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        let funder = Address::generate(&env);
        mint(&env, &token, &funder, 2_000);
        client.deposit(&funder, &2_000);
        assert_eq!(client.balance(), 2_000);
    }

    #[test]
    fn test_cancel_open_proposal() {
        let Ctx { env, contract, sa, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let proposal_id = client.propose(&sa, &recipient, &100);
        client.cancel(&sa, &proposal_id);
        assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Cancelled);
    }

    // ── error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_rejected() {
        let Ctx { env, contract, sa, sb, sc, token } = setup();
        TreasuryClient::new(&env, &contract).initialize(&sa, &sb, &sc, &token);
    }

    #[test]
    #[should_panic(expected = "signers must be distinct")]
    fn test_duplicate_signers_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = deploy_token(&env, &admin);
        let sa = Address::generate(&env);
        let contract = env.register(Treasury, ());
        TreasuryClient::new(&env, &contract).initialize(&sa, &sa, &sa, &token);
    }

    #[test]
    #[should_panic(expected = "proposer cannot also approve")]
    fn test_proposer_cannot_approve_own_proposal() {
        let Ctx { env, contract, sa, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let proposal_id = client.propose(&sa, &recipient, &100);
        client.approve(&sa, &proposal_id);
    }

    #[test]
    #[should_panic(expected = "not a signer")]
    fn test_non_signer_cannot_propose() {
        let Ctx { env, contract, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let outsider = Address::generate(&env);
        let recipient = Address::generate(&env);
        client.propose(&outsider, &recipient, &100);
    }

    #[test]
    #[should_panic(expected = "proposal is not open")]
    fn test_approve_cancelled_proposal_rejected() {
        let Ctx { env, contract, sa, sb, token, .. } = setup();
        let client = TreasuryClient::new(&env, &contract);
        mint(&env, &token, &contract, 1_000);
        let recipient = Address::generate(&env);
        let proposal_id = client.propose(&sa, &recipient, &100);
        client.cancel(&sa, &proposal_id);
        client.approve(&sb, &proposal_id);
    }
}
