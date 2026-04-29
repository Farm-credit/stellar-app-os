#![no_std]

//! Escrow Milestone Release Contract — Closes #392
//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!   3. Contract instantly releases 75% to the farmer's Stellar wallet
//!   4. After 6 months, verifier confirms survival rate >= 70%
//!   5. Contract releases the remaining 25% to the farmer's Stellar wallet
//!
//! Dispute Resolution (new in #392):
//!   - Either the buyer (funder) or seller (farmer) can call `raise_dispute()`
//!     to flag a pending milestone. This blocks any milestone release.
//!   - The arbiter can then call `resolve_dispute()` to either release funds to
//!     the seller (farmer) or refund them to the buyer (funder).

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
};

/// Percentage released on first milestone verification (basis points: 7500 = 75%)
const MILESTONE_1_BPS: i128 = 7500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE_PERCENT: u32 = 70;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Milestone1Released,
    /// Survival rate >= 70%, Tranche 2 released — fully complete
    Completed,
    /// A party has raised a dispute; milestone release is blocked
    Disputed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    pub farmer: Address,
    pub funder: Address,
    pub token: Address,
    pub total_amount: i128,
    pub released: i128,
    pub status: EscrowStatus,
    pub verification_hash: BytesN<32>,
    pub milestone1_verified_at: u64,
    pub survival_verification_hash: BytesN<32>,
    pub survival_rate_percent: u32,
    /// The arbiter that can adjudicate disputes for this escrow
    pub arbiter: Address,
    /// Whether a dispute is currently open
    pub dispute_open: bool,
}

#[contract]
pub struct EscrowMilestone;

#[contractimpl]
impl EscrowMilestone {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    /// Funder deposits `amount` of `token` into escrow for `farmer`.
    /// `arbiter` is the address authorised to adjudicate disputes.
    pub fn deposit(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        arbiter: Address,
    ) {
        funder.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        token::Client::new(&env, &token)
            .transfer(&funder, &env.current_contract_address(), &amount);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        let state = EscrowState {
            farmer: farmer.clone(),
            funder,
            token,
            total_amount: amount,
            released: 0,
            status: EscrowStatus::Funded,
            verification_hash: empty_hash.clone(),
            milestone1_verified_at: 0,
            survival_verification_hash: empty_hash,
            survival_rate_percent: 0,
            arbiter,
            dispute_open: false,
        };

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Called by the admin/verifier after GPS + photo validation passes.
    /// Releases 75% of escrowed funds instantly to the farmer wallet.
    /// Blocked if a dispute is currently open.
    pub fn verify_milestone(env: Env, farmer: Address, verification_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.dispute_open {
            panic!("milestone release blocked: dispute is open");
        }

        if state.status != EscrowStatus::Funded {
            panic!("milestone already processed or escrow not in funded state");
        }

        let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;

        token::Client::new(&env, &state.token)
            .transfer(&env.current_contract_address(), &state.farmer, &release_amount);

        state.released = release_amount;
        state.status = EscrowStatus::Milestone1Released;
        state.verification_hash = verification_hash.clone();
        state.milestone1_verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m1release"), farmer), release_amount);
    }

    /// Release remaining 25% after 6-month survival milestone.
    /// Blocked if a dispute is currently open.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        survival_verification_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();

        if survival_rate_percent > 100 {
            panic!("survival_rate_percent must be between 0 and 100");
        }

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.dispute_open {
            panic!("milestone release blocked: dispute is open");
        }

        if state.status != EscrowStatus::Milestone1Released {
            panic!("first milestone not yet verified");
        }

        if env.ledger().timestamp() < state.milestone1_verified_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        if survival_rate_percent < MIN_SURVIVAL_RATE_PERCENT {
            panic!("survival rate below minimum");
        }

        let remainder = state.total_amount - state.released;
        if remainder <= 0 {
            panic!("nothing left to release");
        }

        token::Client::new(&env, &state.token)
            .transfer(&env.current_contract_address(), &state.farmer, &remainder);

        state.released += remainder;
        state.status = EscrowStatus::Completed;
        state.survival_verification_hash = survival_verification_hash;
        state.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m2release"), farmer), remainder);
    }

    /// Either the funder (buyer) or the farmer (seller) can raise a dispute
    /// on a pending milestone. While a dispute is open, milestone releases are
    /// blocked until the arbiter resolves it.
    pub fn raise_dispute(env: Env, farmer: Address, caller: Address) {
        caller.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        // Only the buyer (funder) or seller (farmer) may raise a dispute
        if caller != state.funder && caller != state.farmer {
            panic!("only the buyer or seller can raise a dispute");
        }

        if state.dispute_open {
            panic!("a dispute is already open for this escrow");
        }

        // Can only dispute while funds are at rest (not yet fully completed/refunded)
        if state.status == EscrowStatus::Completed || state.status == EscrowStatus::Refunded {
            panic!("escrow is already finalised; cannot raise dispute");
        }

        state.dispute_open = true;
        state.status = EscrowStatus::Disputed;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("DispRaisd"), farmer), caller);
    }

    /// The arbiter resolves the open dispute.
    /// - `release_to_seller = true`  → release the remaining escrowed funds to the farmer.
    /// - `release_to_seller = false` → refund the remaining escrowed funds to the funder.
    pub fn resolve_dispute(env: Env, farmer: Address, arbiter: Address, release_to_seller: bool) {
        arbiter.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if arbiter != state.arbiter {
            panic!("caller is not the designated arbiter for this escrow");
        }

        if !state.dispute_open {
            panic!("no open dispute for this escrow");
        }

        let remainder = state.total_amount - state.released;

        if release_to_seller {
            // Release remaining funds to the farmer
            if remainder > 0 {
                token::Client::new(&env, &state.token).transfer(
                    &env.current_contract_address(),
                    &state.farmer,
                    &remainder,
                );
                state.released += remainder;
            }
            state.status = EscrowStatus::Completed;
        } else {
            // Refund remaining funds to the funder
            if remainder > 0 {
                token::Client::new(&env, &state.token).transfer(
                    &env.current_contract_address(),
                    &state.funder,
                    &remainder,
                );
            }
            state.status = EscrowStatus::Refunded;
        }

        state.dispute_open = false;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("DispResol"), farmer), release_to_seller);
    }

    pub fn refund(env: Env, farmer: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow found for farmer");

        if state.status != EscrowStatus::Funded {
            panic!("cannot refund after milestone release");
        }

        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.funder,
            &state.total_amount,
        );

        state.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("refund"), farmer), state.total_amount);
    }

    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, &farmer))
    }

    fn escrow_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESCROW"), farmer.clone()).into_val(env)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    fn setup() -> (
        Env,
        Address, // admin
        Address, // funder
        Address, // farmer
        Address, // arbiter
        Address, // token
        EscrowMilestoneClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowMilestone);
        let client = EscrowMilestoneClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);
        let arbiter = Address::generate(&env);

        // Deploy a test token
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&funder, &10_000);

        client.initialize(&admin);

        (env, admin, funder, farmer, arbiter, token_id, client)
    }

    fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Full lifecycle ────────────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle_with_balances() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();
        let contract = client.address.clone();

        assert_eq!(balance(&env, &token, &funder), 10_000);
        assert_eq!(balance(&env, &token, &contract), 0);
        assert_eq!(balance(&env, &token, &farmer), 0);

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        assert_eq!(balance(&env, &token, &funder), 0, "funder drained");
        assert_eq!(
            balance(&env, &token, &contract),
            10_000,
            "contract holds full amount"
        );

        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer), 7_500, "farmer received 75%");

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80u32);

        assert_eq!(balance(&env, &token, &contract), 0, "contract fully drained");
        assert_eq!(balance(&env, &token, &farmer), 10_000, "farmer received all");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    // ── Dispute lifecycle ─────────────────────────────────────────────────────

    #[test]
    fn test_raise_dispute_blocks_milestone_release() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        // Farmer raises a dispute
        client.raise_dispute(&farmer, &farmer);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Disputed);
        assert!(state.dispute_open);
    }

    #[test]
    #[should_panic(expected = "milestone release blocked: dispute is open")]
    fn test_verify_milestone_blocked_during_dispute() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &funder); // funder raises dispute

        // verify_milestone must panic
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
    }

    #[test]
    fn test_resolve_dispute_release_to_seller() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &farmer);

        // Arbiter rules in favour of the farmer (seller)
        client.resolve_dispute(&farmer, &arbiter, &true);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert!(!state.dispute_open);
        assert_eq!(balance(&env, &token, &farmer), 10_000);
        assert_eq!(balance(&env, &token, &funder), 0);
    }

    #[test]
    fn test_resolve_dispute_refund_to_buyer() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &farmer);

        // Arbiter rules in favour of the funder (buyer)
        client.resolve_dispute(&farmer, &arbiter, &false);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Refunded);
        assert!(!state.dispute_open);
        assert_eq!(balance(&env, &token, &funder), 10_000);
        assert_eq!(balance(&env, &token, &farmer), 0);
    }

    #[test]
    fn test_funder_can_raise_dispute() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &funder); // buyer raises dispute

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Disputed);
        assert!(state.dispute_open);
    }

    #[test]
    #[should_panic(expected = "only the buyer or seller can raise a dispute")]
    fn test_non_party_cannot_raise_dispute() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();
        let stranger = Address::generate(&env);

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &stranger); // must panic
    }

    #[test]
    #[should_panic(expected = "caller is not the designated arbiter for this escrow")]
    fn test_non_arbiter_cannot_resolve_dispute() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();
        let impostor = Address::generate(&env);

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &farmer);
        client.resolve_dispute(&farmer, &impostor, &true); // must panic
    }

    #[test]
    #[should_panic(expected = "a dispute is already open for this escrow")]
    fn test_duplicate_dispute_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &farmer);
        client.raise_dispute(&farmer, &funder); // must panic
    }

    #[test]
    fn test_partial_release_then_dispute_then_resolve_to_seller() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        // 7_500 already released; 2_500 still locked
        assert_eq!(balance(&env, &token, &farmer), 7_500);

        client.raise_dispute(&farmer, &farmer);
        client.resolve_dispute(&farmer, &arbiter, &true);

        // Arbiter released the remaining 2_500 to farmer
        assert_eq!(balance(&env, &token, &farmer), 10_000);
        assert_eq!(balance(&env, &token, &funder), 0);
        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_survival_below_70_percent_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &69);
    }

    #[test]
    #[should_panic(expected = "milestone already processed")]
    fn test_double_verify_milestone_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_milestone(&farmer, &dummy_hash(&env, 1)); // must panic
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();
        client.deposit(&funder, &farmer, &token, &0, &arbiter);
    }

    #[test]
    #[should_panic(expected = "active escrow already exists")]
    fn test_duplicate_deposit_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();
        client.deposit(&funder, &farmer, &token, &5_000, &arbiter);
        client.deposit(&funder, &farmer, &token, &5_000, &arbiter);
    }

    // ── Refund paths ──────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_milestone_restores_funder_balance() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        assert_eq!(balance(&env, &token, &funder), 0);

        client.refund(&farmer);

        assert_eq!(balance(&env, &token, &funder), 10_000, "funder fully refunded");
        assert_eq!(balance(&env, &token, &farmer), 0, "farmer got nothing");
        assert_eq!(
            client.get_escrow(&farmer).unwrap().status,
            EscrowStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "cannot refund after milestone release")]
    fn test_refund_after_milestone_rejected() {
        let (env, _admin, funder, farmer, arbiter, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.refund(&farmer); // must panic
    }
}
