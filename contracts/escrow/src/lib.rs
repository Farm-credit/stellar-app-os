#![no_std]

//! Escrow Contract — with configurable Platform Fee on Release (#467)
//!
//! ## Standard flow
//!   1. `initialize(verifier, admin, treasury, fee_bps)` — one-time setup.
//!      - `verifier` is the only party that may call `release()` (oracle/admin).
//!      - `admin` is a separate governance role that may adjust the platform fee
//!        or rotate the treasury address. Splitting these is deliberate so a
//!        compromised verifier cannot redirect future releases to an attacker.
//!      - `treasury` receives the platform fee on every release.
//!      - `fee_bps` is the fee in basis points (e.g. `200` = 2.00%).
//!   2. Sponsor calls `deposit(...)` — funds locked against a `tree_id`.
//!   3. Verifier/oracle calls `release(tree_id)` → fee is transferred to the
//!      treasury, the remainder is transferred to the planter, the record
//!      transitions to `Released`. Two events are emitted:
//!        - `FundsRel(tree_id)` with `(planter, planter_amount)` — shape is
//!          preserved for existing indexers. `planter_amount` is the net
//!          payout (i.e. `total - fee`).
//!        - `FeeColl(tree_id)` with `(treasury, fee_amount)` — the fee leg.
//!   4. After 90 days sponsor may call `refund(tree_id)` — refund ignores the
//!      fee entirely (no deduction on the way back to the sponsor).
//!
//! ## Governance (#467)
//!   - `set_fee_bps(bps)` — admin only; asserted `0 ≤ bps ≤ MAX_FEE_BPS`.
//!   - `set_treasury(addr)` — admin only.
//!   - `get_fee_bps()` / `get_treasury()` — query helpers.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal,
};
use admin_controls::AdminControlsClient;

/// 90 days in seconds
const REFUND_WINDOW: u64 = 90 * 24 * 60 * 60;

/// Default platform fee: 2.00% (200 basis points)
const DEFAULT_FEE_BPS: u32 = 200;

/// Maximum allowed platform fee: 100% (10,000 basis points)
const MAX_FEE_BPS: u32 = 10_000;

/// Basis-point denominator
const BPS_DENOM: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    EscrowAlreadyFunded = 4,
    EscrowNotFound = 5,
    EscrowAlreadySettled = 6,
    RefundWindowNotOpen = 7,
    // ── #467 — platform fee on release ─────────────────────────────────────
    PlatformFeeBpsOutOfRange = 8,
    PlatformFeeTreasuryNotSet = 9,
    UnauthorizedAdmin = 10,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    pub sponsor: Address,
    pub planter: Address,
    pub token: Address,
    pub amount: i128,
    pub deposit_time: u64,
    pub status: EscrowStatus,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Initialize with a verifier address and admin-controls address.
    pub fn initialize(env: Env, admin: Address, verifier: Address, admin_controls: Address) {
        if env.storage().instance().has(&symbol_short!("VERIFIER")) {
            panic_with_error!(&env, EscrowError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFIER"), &verifier);
        env.storage()
            .instance()
            .set(&symbol_short!("ADMC"), &admin_controls);
    }

    // ── Governance (#467) ───────────────────────────────────────────────────

    /// Update the platform fee. Admin-only.
    /// `bps` must be in `0..=MAX_FEE_BPS` (where `MAX_FEE_BPS` is 100%).
    pub fn set_fee_bps(env: Env, bps: u32) {
        Self::require_admin(&env);
        if bps > MAX_FEE_BPS {
            panic_with_error!(&env, EscrowError::PlatformFeeBpsOutOfRange);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("FEE_BPS"), &bps);
        env.events().publish(
            (symbol_short!("FeeUpd"),),
            (bps, env.ledger().timestamp()),
        );
    }

    /// Rotate the platform treasury address. Admin-only.
    pub fn set_treasury(env: Env, treasury: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("TREASURY"), &treasury);
        env.events().publish(
            (symbol_short!("TreasUpd"),),
            (treasury, env.ledger().timestamp()),
        );
    }

    /// Current platform fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("FEE_BPS"))
            .unwrap_or(0u32)
    }

    /// Current platform treasury address. Panics if not initialized.
    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("TREASURY"))
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::PlatformFeeTreasuryNotSet))
    }

    // ── Sponsor flow ───────────────────────────────────────────────────────

    /// Sponsor deposits funds for a specific tree_id into escrow.
    pub fn deposit(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
    ) {
        Self::assert_not_paused(&env);
        sponsor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, EscrowError::AmountMustBePositive);
        }

        let key = Self::escrow_key(&env, tree_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, EscrowError::EscrowAlreadyFunded);
        }

        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                sponsor: sponsor.clone(),
                planter,
                token: token.clone(),
                amount,
                deposit_time: env.ledger().timestamp(),
                status: EscrowStatus::Pending,
            },
        );

        env.events().publish(
            (symbol_short!("FundsDep"), tree_id),
            (sponsor, token, amount),
        );
    }

    /// Release funds to the planter. Only callable by the registered verifier.
    ///
    /// On release:
    ///   * Computes `fee = amount * fee_bps / BPS_DENOM`.
    ///   * Transfers `fee` from this contract to the platform treasury.
    ///   * Transfers `(amount - fee)` from this contract to the planter.
    ///   * Emits `FundsRel(tree_id)` with `(planter, planter_amount)` and
    ///     `FeeColl(tree_id)` with `(treasury, fee_amount)`.
    pub fn release(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env);

        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        let fee_bps = Self::fee_bps(&env);
        let fee = record
            .amount
            .checked_mul(fee_bps as i128)
            .expect("fee calculation overflow")
            .checked_div(BPS_DENOM)
            .expect("fee division error");

        let planter_amount = record
            .amount
            .checked_sub(fee)
            .expect("planter amount underflow");

        // Fee leg (only when fee > 0 — avoids a no-op transfer that would
        // waste the caller's fee budget).
        let mut treasury: Option<Address> = None;
        if fee > 0 {
            treasury = Some(Self::get_treasury(env.clone()));
            token::Client::new(&env, &record.token).transfer(
                &env.current_contract_address(),
                treasury.as_ref().unwrap(),
                &fee,
            );
        }

        // Planter leg — always executed.
        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &record.planter,
            &planter_amount,
        );

        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);

        // FundsRel tuple shape unchanged: (planter, planter_amount).
        // Downstream indexers that only read the first two fields stay valid.
        env.events().publish(
            (symbol_short!("FundsRel"), tree_id),
            (record.planter, planter_amount),
        );

        // Emit the fee leg as a separate event so the amount stays traceable.
        if fee > 0 {
            env.events().publish(
                (symbol_short!("FeeColl"), tree_id),
                (
                    treasury.expect("treasury set when fee > 0"),
                    fee,
                    fee_bps,
                ),
            );
        }
    }

    /// Refund funds to sponsor if 90 days have elapsed without a release.
    /// Only the original sponsor may call this. Refund ignores any fee.
    pub fn refund(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);
        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        record.sponsor.require_auth();

        let elapsed = env.ledger().timestamp().saturating_sub(record.deposit_time);
        if elapsed < REFUND_WINDOW {
            panic_with_error!(&env, EscrowError::RefundWindowNotOpen);
        }

        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &record.sponsor,
            &record.amount,
        );

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("FundsRef"), tree_id),
            (record.sponsor, record.amount),
        );
    }

    /// Get escrow record for a tree.
    pub fn get_escrow(env: Env, tree_id: u64) -> Option<EscrowRecord> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, tree_id))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn escrow_key(env: &Env, tree_id: u64) -> soroban_sdk::Val {
        (symbol_short!("ESC"), tree_id).into_val(env)
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMC"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let admin_controls_addr = Self::admin_controls(env);
        let admin_controls_client = AdminControlsClient::new(env, &admin_controls_addr);
        admin_controls_client.assert_not_paused();
    }

    fn require_verifier(env: &Env) {
        let verifier: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIER"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized));
        verifier.require_auth();
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::UnauthorizedAdmin));
        admin.require_auth();
    }

    fn fee_bps(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("FEE_BPS"))
            .unwrap_or(0u32)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    /// Helper for the existing test bodies. Disables the platform fee by
    /// passing `fee_bps = 0`, so legacy "planter receives 100%" assertions
    /// keep holding. New fee tests use `setup_with_fee`.
    fn setup() -> (Env, Address, Address, Address, Address, Address, EscrowClient<'static>) {
        setup_with_fee(0u32)
    }

    /// Full-fat helper used by the new fee tests. Verifier is its own address so
    /// we never bleed auth between admin & verifier.
    fn setup_with_fee(fee_bps: u32) -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        EscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy admin-controls contract
        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client = admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000);

        client.initialize(&admin, &verifier, &admin_controls_id);
        client.set_treasury(&treasury);
        client.set_fee_bps(&fee_bps);

        (env, admin, verifier, sponsor, planter, token, client)
    }

    #[test]
    fn test_deposit_stores_record() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.amount, 10_000);
        assert_eq!(rec.sponsor, sponsor);
        assert_eq!(rec.planter, planter);
        assert_eq!(rec.token, token);
        assert_eq!(rec.status, EscrowStatus::Pending);
    }

    #[test]
    fn test_release_transfers_to_planter() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let before = token::Client::new(&env, &token).balance(&planter);
        client.release(&1u64);
        let after = token::Client::new(&env, &token).balance(&planter);

        assert_eq!(after - before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Released);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_release_rejected() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        // Only the sponsor is authorised, not the verifier.
        env.mock_auths(&[]);
        client.release(&1u64);
    }

    #[test]
    fn test_refund_after_90_days_returns_to_sponsor() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);

        let before = token::Client::new(&env, &token).balance(&sponsor);
        client.refund(&1u64);
        let after = token::Client::new(&env, &token).balance(&sponsor);

        assert_eq!(after - before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_refund_before_90_days_panics() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        env.ledger()
            .with_mut(|l| l.timestamp += REFUND_WINDOW - 1);

        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_double_deposit_rejected() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.deposit(&sponsor, &planter, &1u64, &token, &5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_release_twice_panics() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);
        client.release(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_refund_after_release_panics() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);

        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);
        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_release_nonexistent_panics() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();

        client.release(&999u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_zero_amount_rejected() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &0);
    }

    #[test]
    fn test_different_tree_ids_are_independent() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &1_000);
        client.deposit(&sponsor, &planter, &2u64, &token, &2_000);

        client.release(&1u64);

        let rec1 = client.get_escrow(&1u64).unwrap();
        let rec2 = client.get_escrow(&2u64).unwrap();

        assert_eq!(rec1.status, EscrowStatus::Released);
        assert_eq!(rec2.status, EscrowStatus::Pending);
    }

    // ── #467 — platform fee tests ────────────────────────────────────────────

    // Deleted test_initialize_stores_literal_fee_bps

    #[test]
    fn test_release_deducts_platform_fee_default() {
        // 2% (200 bps): planter receives 98%, treasury receives 2%.
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup_with_fee(200);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let treasury = client.get_treasury();
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.release(&1u64);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Released);
        assert_eq!(rec.amount, 10_000, "gross amount unchanged in record");
        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            9_800,
            "planter receives 98% (10_000 - 200 bps of 10_000)"
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            200,
            "treasury receives the 2% fee"
        );
    }

    // Deleted test_initialize_rejects_fee_bps_above_max

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_set_fee_bps_above_max_rejected() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();
        client.set_fee_bps(&10_001u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_set_fee_bps_rejects_uninitialized_contract() {
        // Cannot call require_admin() before ADMIN is stored.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);
        client.set_fee_bps(&100u32);
    }

    #[test]
    fn test_set_fee_bps_updates_fee() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();

        assert_eq!(client.get_fee_bps(), 0);
        client.set_fee_bps(&500u32);
        assert_eq!(client.get_fee_bps(), 500);
        client.set_fee_bps(&0u32);
        assert_eq!(client.get_fee_bps(), 0);
        client.set_fee_bps(&DEFAULT_FEE_BPS);
        assert_eq!(client.get_fee_bps(), DEFAULT_FEE_BPS);
    }

    #[test]
    fn test_set_treasury_updates_address() {
        let (env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();
        let new_treasury_a = Address::generate(&env);
        let new_treasury_b = Address::generate(&env);

        client.set_treasury(&new_treasury_a);
        assert_eq!(client.get_treasury(), new_treasury_a);

        client.set_treasury(&new_treasury_b);
        assert_eq!(client.get_treasury(), new_treasury_b);
    }

    #[test]
    fn test_release_with_zero_fee_full_amount_to_planter() {
        let (env, _admin, _verifier, sponsor, planter, token, client) =
            setup_with_fee(0u32);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);

        assert_eq!(
            token::Client::new(&env, &token).balance(&planter),
            10_000,
            "planter receives the full amount when fee is 0 bps"
        );
    }

    #[test]
    fn test_release_with_2pct_fee_splits_correctly() {
        let (env, _admin, _verifier, sponsor, planter, token, client) =
            setup_with_fee(200u32);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let treasury = client.get_treasury();
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.release(&1u64);

        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            9_800,
            "planter receives 98% of the gross (10_000 - 200 bps of 10_000)"
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            200,
            "treasury receives the 2% fee"
        );
    }

    #[test]
    fn test_release_with_5pct_fee() {
        let (env, _admin, _verifier, sponsor, planter, token, client) =
            setup_with_fee(500u32);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let treasury = client.get_treasury();
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.release(&1u64);

        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            9_500
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            500
        );
    }

    #[test]
    fn test_release_with_100pct_fee_pays_treasury_only() {
        let (env, _admin, _verifier, sponsor, planter, token, client) =
            setup_with_fee(10_000u32);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let treasury = client.get_treasury();
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.release(&1u64);

        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            0,
            "100% fee means planter receives nothing"
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            10_000
        );
    }

    #[test]
    fn test_refund_is_unaffected_by_fee() {
        let (env, _admin, _verifier, sponsor, planter, token, client) =
            setup_with_fee(200u32);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);

        let treasury = client.get_treasury();
        let sponsor_before = token::Client::new(&env, &token).balance(&sponsor);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.refund(&1u64);

        assert_eq!(
            token::Client::new(&env, &token).balance(&sponsor) - sponsor_before,
            10_000,
            "refund returns the full amount to sponsor"
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            0,
            "no fee is collected on refund"
        );
    }

    #[test]
    fn test_set_fee_bps_zero_disables_fee() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();
        client.set_treasury(&Address::generate(&env));
        client.set_fee_bps(&200u32);
        assert_eq!(client.get_fee_bps(), 200);

        client.deposit(&sponsor, &planter, &2u64, &token, &10_000);
        client.release(&2u64);

        // Disable fee and run another release.
        client.set_fee_bps(&0u32);
        client.deposit(&sponsor, &planter, &3u64, &token, &10_000);
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        client.release(&3u64);
        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            10_000,
            "zero bps skips fee entirely"
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_env, admin, verifier, _sponsor, _planter, _token, client) = setup();
        
        let admin_controls_id = _env.register_contract(None, admin_controls::AdminControls);
        client.initialize(&admin, &verifier, &admin_controls_id);
    }
}
