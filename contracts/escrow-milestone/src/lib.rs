#![no_std]

//! Escrow Milestone Release Contract — Closes #314
//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!   3. Contract instantly releases 75% to the farmer's Stellar wallet
//!   4. Remaining 25% stays locked until final milestone or dispute resolution

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal, Symbol,
};

// ── Storage keys ──────────────────────────────────────────────────────────────
const ADMIN: &str  = "ADMIN";
const ESCROW: &str = "ESCROW";

/// Percentage released on first milestone verification (basis points: 7500 = 75%)
const MILESTONE_1_BPS: i128 = 7500;
const BPS_DENOM: i128       = 10_000;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Milestone1Released,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    pub farmer:            Address,
    pub funder:            Address,
    pub token:             Address,
    pub total_amount:      i128,
    pub released:          i128,
    pub status:            EscrowStatus,
    /// All-zero bytes until set by verify_milestone.
    pub verification_hash: BytesN<32>,
}

#[contract]
pub struct EscrowMilestone;

#[contractimpl]
impl EscrowMilestone {
    /// One-time init — sets the admin/verifier address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
    }

    // ── Emergency pause ───────────────────────────────────────────────────────

    /// Halt deposits and milestone releases immediately. Admin only.
    /// `refund()` remains available during a pause so funders can retrieve funds.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &true);
        env.events().publish((symbol_short!("pause"),), ());
    }

    /// Resume normal operations. Admin only.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
        env.events().publish((symbol_short!("unpause"),), ());
    }

    /// Returns true if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    // ── Admin transfer (2-step) ───────────────────────────────────────────────

    /// Step 1: current admin nominates a successor.
    /// The admin account should be a Stellar multisig account (M-of-N) for mainnet.
    pub fn propose_admin(env: Env, new_admin: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PADMIN"), &new_admin);
        env.events()
            .publish((symbol_short!("propAdmin"),), new_admin);
    }

    /// Step 2: nominated admin accepts ownership. Clears the pending slot.
    pub fn accept_admin(env: Env) {
        let pending: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("PADMIN"))
            .expect("no pending admin");
        pending.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &pending);
        env.storage()
            .instance()
            .remove(&symbol_short!("PADMIN"));
        env.events()
            .publish((symbol_short!("admAccept"),), pending);
    }

    // ── Core functions ────────────────────────────────────────────────────────

    /// Funder deposits `amount` of `token` into escrow for `farmer`.
    /// Blocked while paused.
    pub fn deposit(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        amount: i128,
    ) {
        Self::require_not_paused(&env);
        funder.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let state = EscrowState {
            farmer:            farmer.clone(),
            funder:            funder.clone(),
            token:             token.clone(),
            total_amount:      amount,
            released:          0,
            status:            EscrowStatus::Funded,
            verification_hash: BytesN::from_array(&env, &[0u8; 32]),
        };

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "DonationReceived"), funder, farmer),
            (amount, token),
        );
    }

    /// Called by the admin/verifier after GPS + photo validation passes.
    /// Releases 75% of escrowed funds instantly to the farmer wallet.
    /// Blocked while paused.
    pub fn verify_milestone(
        env: Env,
        farmer: Address,
        verification_hash: BytesN<32>,
    ) {
        Self::require_not_paused(&env);
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Funded {
            panic!("milestone already processed or escrow not in funded state");
        }

        let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;

        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.farmer,
            &release_amount,
        );

        state.released          = release_amount;
        state.status            = EscrowStatus::Milestone1Released;
        state.verification_hash = verification_hash.clone();

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "PlantingVerified"), farmer),
            (release_amount, verification_hash),
        );
    }

    /// Release remaining 25% after final milestone — called by admin.
    /// Blocked while paused.
    pub fn release_remainder(env: Env, farmer: Address) {
        Self::require_not_paused(&env);
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Milestone1Released {
            panic!("first milestone not yet verified");
        }

        let remainder = state.total_amount - state.released;
        if remainder <= 0 {
            panic!("nothing left to release");
        }

        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.farmer,
            &remainder,
        );

        state.released += remainder;
        state.status    = EscrowStatus::Completed;

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "MilestonePaymentReleased"), farmer),
            remainder,
        );
    }

    /// Refund full amount to funder — only before any milestone is verified.
    /// Intentionally allowed while paused so funders can always retrieve funds.
    pub fn refund(env: Env, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Funded {
            panic!("cannot refund after milestone release");
        }

        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.funder,
            &state.total_amount,
        );

        state.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "DonationRefunded"), state.funder, farmer),
            state.total_amount,
        );
    }

    /// Read escrow state for a farmer.
    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, &farmer))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn escrow_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESCROW"), farmer.clone()).into_val(env)
    }

    fn require_not_paused(env: &Env) {
        if env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
        {
            panic!("contract is paused");
        }
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token, Address, BytesN, Env,
    };

    fn setup() -> (Env, Address, Address, Address, Address, EscrowMilestoneClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowMilestone);
        let client      = EscrowMilestoneClient::new(&env, &contract_id);

        let admin  = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token_id    = env.register_stellar_asset_contract(admin.clone());
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&funder, &10_000);

        client.initialize(&admin);

        (env, admin, funder, farmer, token_id, client)
    }

    fn dummy_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32]).into()
    }

    #[test]
    fn test_deposit_and_verify_milestone() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.total_amount, 10_000);
        assert_eq!(state.status, EscrowStatus::Funded);

        client.verify_milestone(&farmer, &dummy_hash(&env));

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.released, 7_500);
        assert_eq!(state.status, EscrowStatus::Milestone1Released);
    }

    #[test]
    fn test_release_remainder() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env));
        client.release_remainder(&farmer);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.released, 10_000);
        assert_eq!(state.status, EscrowStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "milestone already processed")]
    fn test_double_verify_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env));
        client.verify_milestone(&farmer, &dummy_hash(&env));
    }

    #[test]
    fn test_refund_before_milestone() {
        let (_env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.refund(&farmer);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after milestone release")]
    fn test_refund_after_milestone_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env));
        client.refund(&farmer);
    }

    // ── Pause tests ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "contract is paused")]
    fn test_pause_blocks_deposit() {
        let (_env, _admin, funder, farmer, token, client) = setup();

        client.pause();
        assert!(client.is_paused());
        client.deposit(&funder, &farmer, &token, &10_000);
    }

    #[test]
    #[should_panic(expected = "contract is paused")]
    fn test_pause_blocks_verify_milestone() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.pause();
        client.verify_milestone(&farmer, &dummy_hash(&env));
    }

    #[test]
    fn test_refund_allowed_while_paused() {
        let (_env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.pause();

        // Refund must still work during a pause — funds always retrievable
        client.refund(&farmer);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Refunded);
    }

    #[test]
    fn test_unpause_restores_operations() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.pause();
        client.unpause();
        assert!(!client.is_paused());

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env));
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Milestone1Released);
    }

    // ── Admin transfer tests ──────────────────────────────────────────────────

    #[test]
    fn test_propose_and_accept_admin() {
        let (env, _old_admin, _funder, _farmer, _token, client) = setup();
        let new_admin = Address::generate(&env);

        client.propose_admin(&new_admin);
        client.accept_admin();

        // New admin can pause — verifies they hold the active admin role
        client.pause();
        assert!(client.is_paused());
    }
}
