#![no_std]

//! Escrow Milestone Release Contract — Closes #314
//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!      → releases 75% to farmer instantly
//!   3. After 6 months, oracle calls `verify_survival(survival_rate, proof_hash)`
//!      → survival_rate >= 70%: releases remaining 25% to farmer (Completed)
//!      → survival_rate <  70%: marks Disputed, holds 25% for manual resolution

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env,
};

// ── Storage keys ──────────────────────────────────────────────────────────────
const ADMIN: &str    = "ADMIN";
const ESCROW: &str   = "ESCROW";

/// Percentage released on first milestone verification (basis points: 7500 = 75%)
const MILESTONE_1_BPS: i128 = 7500;
const BPS_DENOM: i128       = 10_000;

/// Minimum oracle-confirmed survival rate (0–100) to release Tranche 2.
const MIN_SURVIVAL_RATE: u32 = 70;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Milestone1Released,
    /// Survival rate >= 70%, Tranche 2 released — fully complete
    Completed,
    /// Survival rate < 70%, Tranche 2 held pending dispute resolution
    Disputed,
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
    /// SHA-256 of GPS + photo proof at Milestone 1 (planting)
    pub verification_hash: Option<soroban_sdk::BytesN<32>>,
    /// SHA-256 of survival proof submitted at 6-month check
    pub survival_proof:    Option<soroban_sdk::BytesN<32>>,
    /// Oracle-confirmed survival rate (0–100)
    pub survival_rate:     Option<u32>,
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
    }

    /// Funder deposits `amount` of `token` into escrow for `farmer`.
    /// Creates a new escrow record keyed by farmer address.
    pub fn deposit(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        amount: i128,
    ) {
        funder.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Reject if escrow already active for this farmer
        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        // Pull funds from funder into contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let state = EscrowState {
            farmer:            farmer.clone(),
            funder,
            token,
            total_amount:      amount,
            released:          0,
            status:            EscrowStatus::Funded,
            verification_hash: None,
            survival_proof:    None,
            survival_rate:     None,
        };

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (symbol_short!("deposit"), farmer),
            amount,
        );
    }

    /// Called by the admin/verifier after GPS + photo validation passes.
    /// Releases 75% of escrowed funds instantly to the farmer wallet.
    /// `verification_hash` is the SHA-256 of the submitted GPS + photo proof.
    pub fn verify_milestone(
        env: Env,
        farmer: Address,
        verification_hash: soroban_sdk::BytesN<32>,
    ) {
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

        // Calculate 75% release
        let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;

        // Transfer to farmer
        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.farmer,
            &release_amount,
        );

        state.released          = release_amount;
        state.status            = EscrowStatus::Milestone1Released;
        state.verification_hash = Some(verification_hash.clone());

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (symbol_short!("m1release"), farmer),
            release_amount,
        );
    }

    /// Oracle/verifier calls this after the 6-month survival check.
    ///
    /// `survival_rate` — oracle-confirmed percentage (0–100) of planted trees
    /// that survived.
    ///
    /// - survival_rate >= 70% → releases remaining 25% to farmer (Completed)
    /// - survival_rate <  70% → marks Disputed, holds 25% for manual resolution
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: soroban_sdk::BytesN<32>,
        survival_rate: u32,
    ) {
        Self::require_admin(&env);

        if survival_rate > 100 {
            panic!("survival_rate must be between 0 and 100");
        }

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Milestone1Released {
            panic!("first milestone not yet verified");
        }

        state.survival_proof = Some(proof_hash);
        state.survival_rate  = Some(survival_rate);

        if survival_rate >= MIN_SURVIVAL_RATE {
            let remainder = state.total_amount - state.released;
            if remainder <= 0 {
                panic!("nothing left to release");
            }

            token::Client::new(&env, &state.token).transfer(
                &env.current_contract_address(),
                &state.farmer,
                &remainder,
            );

            state.released += remainder;
            state.status    = EscrowStatus::Completed;

            env.storage().persistent().set(&key, &state);

            env.events().publish(
                (symbol_short!("survived"), farmer.clone()),
                (remainder, survival_rate),
            );
        } else {
            state.status = EscrowStatus::Disputed;

            env.storage().persistent().set(&key, &state);

            env.events().publish(
                (symbol_short!("disputed"), farmer.clone()),
                survival_rate,
            );
        }
    }

    /// Admin resolves a Disputed escrow after manual review.
    ///
    /// `release_to_farmer` — true: pays held 25% to farmer; false: refunds to funder.
    pub fn resolve_dispute(env: Env, farmer: Address, release_to_farmer: bool) {
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Disputed {
            panic!("escrow is not in Disputed state");
        }

        let remainder = state.total_amount - state.released;
        if remainder <= 0 {
            panic!("nothing left to release");
        }

        let recipient = if release_to_farmer { &state.farmer } else { &state.funder };

        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            recipient,
            &remainder,
        );

        state.released += remainder;
        state.status    = EscrowStatus::Completed;

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (symbol_short!("resolved"), farmer),
            (remainder, release_to_farmer),
        );
    }

    /// Refund full amount to funder — only before any milestone is verified.
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
            (symbol_short!("refund"), farmer),
            state.total_amount,
        );
    }

    /// Read escrow state for a farmer.
    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage().persistent().get(&Self::escrow_key(&env, &farmer))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn escrow_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESCROW"), farmer.clone()).into_val(env)
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
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

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

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_deposit_and_verify_milestone() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        assert_eq!(client.get_escrow(&farmer).unwrap().status, EscrowStatus::Funded);

        client.verify_milestone(&farmer, &hash(&env, 1));
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.released, 7_500);
        assert_eq!(state.status, EscrowStatus::Milestone1Released);
    }

    #[test]
    fn test_verify_survival_passing_rate() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));

        // 80% survival — above threshold
        client.verify_survival(&farmer, &hash(&env, 2), &80u32);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.released, 10_000);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.survival_rate, Some(80u32));
    }

    #[test]
    fn test_verify_survival_at_boundary_70_percent() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));

        client.verify_survival(&farmer, &hash(&env, 2), &70u32);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    #[test]
    fn test_verify_survival_below_threshold_disputes() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));

        // 65% — below threshold
        client.verify_survival(&farmer, &hash(&env, 2), &65u32);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Disputed);
        assert_eq!(state.released, 7_500); // only Tranche 1 released
        assert_eq!(state.survival_rate, Some(65u32));
    }

    #[test]
    fn test_resolve_dispute_to_farmer() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));
        client.verify_survival(&farmer, &hash(&env, 2), &60u32);

        client.resolve_dispute(&farmer, &true);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    #[test]
    fn test_resolve_dispute_to_funder() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));
        client.verify_survival(&farmer, &hash(&env, 2), &50u32);

        client.resolve_dispute(&farmer, &false);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    #[test]
    #[should_panic(expected = "survival_rate must be between 0 and 100")]
    fn test_invalid_survival_rate_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));
        client.verify_survival(&farmer, &hash(&env, 2), &101u32);
    }

    #[test]
    #[should_panic(expected = "milestone already processed")]
    fn test_double_verify_milestone_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));
        client.verify_milestone(&farmer, &hash(&env, 1));
    }

    #[test]
    fn test_refund_before_milestone() {
        let (_env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.refund(&farmer);
        assert_eq!(client.get_escrow(&farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after milestone release")]
    fn test_refund_after_milestone_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &hash(&env, 1));
        client.refund(&farmer);
    }
}
