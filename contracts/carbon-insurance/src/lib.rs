#![no_std]

//! Carbon credit insurance — issue #1412.
//!
//! Insurance product protecting farmers when their carbon project fails
//! verification. The farmer pays a premium up front and the contract
//! immediately reserves the guaranteed payout, so a claim can always be paid
//! out of funds that were ring-fenced for it.
//!
//! ## The guarantee
//! [`GUARANTEED_PAYOUT_BPS`] is a hard-coded 80% of the coverage amount and
//! cannot be reconfigured by the admin: a denied verification always pays
//! exactly 80% of the coverage amount. A verdict that never arrives before
//! the policy term ends is treated as a failed verification as well, so an
//! unresponsive verifier can never block the guarantee indefinitely.
//!
//! ## Lifecycle
//! 1. `fund_pool` — underwriters top the pool up with the payment token.
//! 2. `purchase_policy` — the farmer pays a 5% premium; the contract checks
//!    the pool's free (unreserved) balance covers the guarantee and reserves
//!    80% of the coverage amount.
//! 3. `record_verification` — the verifier records an approved/denied verdict
//!    for the project (write-once, and no verdict may exist at purchase time
//!    so a policy cannot be bought on an already-failed project).
//! 4. `claim` — pays the farmer the reserved 80% once verification is denied.
//! 5. `settle_approved` — releases the reserve back to the pool when
//!    verification passes (the insurer keeps the premium in that case).

// Soroban contract entry points must take `Env` (and the addresses they
// authorize) by value: the contract macro materializes arguments from the
// invocation, so `clippy::needless_pass_by_value` cannot be satisfied here
// without breaking the contract ABI.
#![allow(clippy::needless_pass_by_value)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Symbol,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Basis-point denominator.
const BPS_DENOM: i128 = 10_000;
/// Premium charged when a policy is purchased: 5% of the coverage amount.
const PREMIUM_BPS: u32 = 500;
/// Guaranteed payout when verification fails: 80% of the coverage amount.
///
/// Hard-coded on purpose — the admin cannot lower the guarantee.
const GUARANTEED_PAYOUT_BPS: u32 = 8_000;
/// Policy term: the verification verdict must arrive within one year.
const POLICY_TERM_SECS: u64 = 365 * 24 * 60 * 60;

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum CarbonInsuranceError {
    /// `initialize` was called a second time.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not the address allowed to perform this action.
    Unauthorized = 3,
    /// Coverage is zero/negative, or it is too small to produce a premium
    /// and a non-zero guaranteed payout.
    InvalidAmount = 4,
    /// No policy exists for the supplied id.
    PolicyNotFound = 5,
    /// The policy is no longer active (already paid out or settled).
    PolicyNotActive = 6,
    /// The project already has a verification verdict, so no new policy may
    /// be bought against it (anti-selection guard).
    VerificationAlreadyRecorded = 7,
    /// No verification verdict exists for the project.
    VerificationNotFound = 8,
    /// The verdict is missing but the policy term has not ended yet.
    VerificationPending = 9,
    /// Verification passed — there is nothing to insure against.
    VerificationApproved = 10,
    /// Verification was denied — the farmer must `claim`, not settle.
    VerificationDenied = 11,
    /// The pool does not hold enough unreserved funds for the guarantee.
    InsufficientPoolReserve = 12,
    /// The requested withdrawal exceeds the pool's unreserved funds.
    InsufficientPoolBalance = 13,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Lifecycle of a policy.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PolicyStatus {
    /// The guarantee is still outstanding — payable on denial, releasable on
    /// approval.
    Active,
    /// The guaranteed payout has been paid to the farmer.
    PaidOut,
    /// Verification passed and the reserve was released back to the pool.
    Settled,
}

/// An insurance policy covering one carbon project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Policy {
    pub id: u64,
    pub farmer: Address,
    pub project_id: Symbol,
    /// Insured amount the 80% guarantee is calculated from.
    pub coverage_amount: i128,
    /// Premium the farmer paid when the policy was purchased.
    pub premium_paid: i128,
    /// Funds ring-fenced for this policy's guaranteed payout.
    pub reserved_amount: i128,
    pub status: PolicyStatus,
    pub purchased_at: u64,
    /// After this timestamp a missing verdict counts as a failed one.
    pub expires_at: u64,
}

/// Write-once verification verdict for a carbon project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Verification {
    pub project_id: Symbol,
    /// `true` when the project passed verification.
    pub approved: bool,
    pub recorded_at: u64,
    pub recorded_by: Address,
}

/// Snapshot of the insurance pool.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolStatus {
    /// Token balance held by the contract (underwriter funding + premiums).
    pub total: i128,
    /// Portion ring-fenced for active policies.
    pub reserved: i128,
    /// Free balance that can back new policies or be withdrawn.
    pub available: i128,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Token,
    /// Address allowed to record verification verdicts (admin until set).
    Verifier,
    NextPolicyId,
    /// Sum of every active policy's `reserved_amount`.
    Reserved,
    Policy(u64),
    Verification(Symbol),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonInsurance;

#[contractimpl]
impl CarbonInsurance {
    /// Deploys the pool: `admin` controls the verifier role and withdrawals,
    /// `token` is the single payment token for premiums and payouts.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, CarbonInsuranceError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Reserved, &0_i128);
        env.storage().instance().set(&DataKey::NextPolicyId, &1_u64);
    }

    // ── Pool funding ─────────────────────────────────────────────────────────

    /// Anyone (normally an underwriter) can top the pool up with the
    /// payment token. Funding never changes the reserved amount.
    pub fn fund_pool(env: Env, funder: Address, amount: i128) {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidAmount);
        }

        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(&funder, env.current_contract_address(), &amount);

        env.events()
            .publish((symbol_short!("fund"), funder), amount);
    }

    /// Admin-only: withdraw *unreserved* pool funds (underwriter surplus /
    /// collected premiums). Reserved guarantees can never be touched.
    pub fn withdraw_excess(env: Env, caller: Address, to: Address, amount: i128) {
        caller.require_auth();
        Self::require_admin_caller(&env, &caller);
        if amount <= 0 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidAmount);
        }

        let pool = Self::pool_status(&env);
        if amount > pool.available {
            panic_with_error!(&env, CarbonInsuranceError::InsufficientPoolBalance);
        }

        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(&env.current_contract_address(), &to, &amount);

        env.events()
            .publish((symbol_short!("withdraw"), to), amount);
    }

    /// Admin-only: appoint the address that records verification verdicts.
    /// Until this is called the admin records verdicts itself.
    pub fn set_verifier(env: Env, caller: Address, verifier: Address) {
        caller.require_auth();
        Self::require_admin_caller(&env, &caller);

        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.events().publish((symbol_short!("verifier"),), verifier);
    }

    // ── Policies ─────────────────────────────────────────────────────────────

    /// Farmer-side entry point: buys a policy for `project_id`.
    ///
    /// Charges a 5% premium and reserves 80% of `coverage_amount` from the
    /// pool's free balance, so the guaranteed payout is fully funded from the
    /// moment the policy exists. Rejects projects that already have a
    /// verdict — nobody can insure a project that has already failed (or
    /// passed) verification.
    ///
    /// Returns the new policy id.
    #[must_use]
    pub fn purchase_policy(
        env: Env,
        farmer: Address,
        project_id: Symbol,
        coverage_amount: i128,
    ) -> u64 {
        farmer.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::Verification(project_id.clone()))
        {
            panic_with_error!(&env, CarbonInsuranceError::VerificationAlreadyRecorded);
        }

        // `None` means the coverage is zero/negative or overflows — either
        // way the policy is invalid. A coverage so small that the premium
        // rounds down to zero is invalid too.
        let premium = Self::amount_at_bps(coverage_amount, PREMIUM_BPS)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::InvalidAmount));
        let reserve = Self::amount_at_bps(coverage_amount, GUARANTEED_PAYOUT_BPS)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::InvalidAmount));
        if premium <= 0 || reserve <= 0 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidAmount);
        }

        let pool = Self::pool_status(&env);
        if pool.available < reserve {
            panic_with_error!(&env, CarbonInsuranceError::InsufficientPoolReserve);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextPolicyId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextPolicyId, &(id + 1));

        let now = env.ledger().timestamp();
        let policy = Policy {
            id,
            farmer: farmer.clone(),
            project_id: project_id.clone(),
            coverage_amount,
            premium_paid: premium,
            reserved_amount: reserve,
            status: PolicyStatus::Active,
            purchased_at: now,
            expires_at: now + POLICY_TERM_SECS,
        };

        // Effects before interaction: the guarantee is ring-fenced first, so
        // the premium transfer can never make it unpayable.
        env.storage()
            .persistent()
            .set(&DataKey::Policy(id), &policy);
        Self::set_reserved(&env, Self::reserved_total(&env) + reserve);

        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(
            &farmer,
            env.current_contract_address(),
            &premium,
        );

        env.events().publish(
            (symbol_short!("policy"), project_id),
            (id, farmer, coverage_amount),
        );
        id
    }

    /// Returns the policy for `policy_id`, panicking when it does not exist.
    #[must_use]
    pub fn get_policy(env: Env, policy_id: u64) -> Policy {
        Self::load_policy(&env, policy_id)
    }

    // ── Verification ─────────────────────────────────────────────────────────

    /// Records the verification verdict for `project_id` — write-once.
    ///
    /// The caller must be the configured verifier, falling back to the admin
    /// until [`Self::set_verifier`] is used.
    pub fn record_verification(env: Env, caller: Address, project_id: Symbol, approved: bool) {
        caller.require_auth();

        let configured: Option<Address> = env.storage().instance().get(&DataKey::Verifier);
        let expected = configured.unwrap_or_else(|| {
            env.storage()
                .instance()
                .get(&DataKey::Admin)
                .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::NotInitialized))
        });
        if caller != expected {
            panic_with_error!(&env, CarbonInsuranceError::Unauthorized);
        }

        let key = DataKey::Verification(project_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, CarbonInsuranceError::VerificationAlreadyRecorded);
        }

        let record = Verification {
            project_id: project_id.clone(),
            approved,
            recorded_at: env.ledger().timestamp(),
            recorded_by: caller,
        };
        env.storage().persistent().set(&key, &record);

        env.events()
            .publish((symbol_short!("verify"), project_id), approved);
    }

    /// Returns the verdict for `project_id`, panicking when none exists.
    #[must_use]
    pub fn get_verification(env: Env, project_id: Symbol) -> Verification {
        env.storage()
            .persistent()
            .get(&DataKey::Verification(project_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::VerificationNotFound))
    }

    // ── Claims / settlement ──────────────────────────────────────────────────

    /// Pays out the guaranteed 80% of the coverage amount to the farmer.
    ///
    /// Payable when verification was denied, and also when no verdict arrived
    /// before the policy expired — a stalled verification cannot block the
    /// guarantee. Panics if verification passed (use [`Self::settle_approved`]
    /// instead) or while the verdict is still pending.
    ///
    /// Returns the paid amount.
    #[must_use]
    pub fn claim(env: Env, claimant: Address, policy_id: u64) -> i128 {
        claimant.require_auth();

        let mut policy = Self::load_policy(&env, policy_id);
        if claimant != policy.farmer {
            panic_with_error!(&env, CarbonInsuranceError::Unauthorized);
        }
        if policy.status != PolicyStatus::Active {
            panic_with_error!(&env, CarbonInsuranceError::PolicyNotActive);
        }

        let verification: Option<Verification> = env
            .storage()
            .persistent()
            .get(&DataKey::Verification(policy.project_id.clone()));
        match verification {
            Some(record) => {
                if record.approved {
                    panic_with_error!(&env, CarbonInsuranceError::VerificationApproved);
                }
            }
            None => {
                if env.ledger().timestamp() < policy.expires_at {
                    panic_with_error!(&env, CarbonInsuranceError::VerificationPending);
                }
            }
        }

        // Same formula as the reserve taken at purchase time, so the payout
        // always fits inside the ring-fenced amount.
        let payout = Self::amount_at_bps(policy.coverage_amount, GUARANTEED_PAYOUT_BPS)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::InvalidAmount));

        // Effects before interaction: the policy is consumed before the
        // transfer, so a re-entering token cannot pay the claim twice.
        policy.status = PolicyStatus::PaidOut;
        env.storage()
            .persistent()
            .set(&DataKey::Policy(policy_id), &policy);
        Self::set_reserved(&env, Self::reserved_total(&env) - payout);

        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &claimant,
            &payout,
        );

        env.events()
            .publish((symbol_short!("claim"), policy_id), payout);
        payout
    }

    /// Releases a policy's reserve back to the free pool after verification
    /// passed. Permissionless: the reserve is only ever removed from a policy
    /// whose verdict is on record as approved.
    pub fn settle_approved(env: Env, policy_id: u64) {
        let mut policy = Self::load_policy(&env, policy_id);
        if policy.status != PolicyStatus::Active {
            panic_with_error!(&env, CarbonInsuranceError::PolicyNotActive);
        }

        let verification: Option<Verification> = env
            .storage()
            .persistent()
            .get(&DataKey::Verification(policy.project_id.clone()));
        let record = verification
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::VerificationNotFound));
        if !record.approved {
            panic_with_error!(&env, CarbonInsuranceError::VerificationDenied);
        }

        policy.status = PolicyStatus::Settled;
        env.storage()
            .persistent()
            .set(&DataKey::Policy(policy_id), &policy);
        Self::set_reserved(&env, Self::reserved_total(&env) - policy.reserved_amount);

        env.events()
            .publish((symbol_short!("settle"), policy_id), policy.reserved_amount);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// Snapshot of the pool: total balance, ring-fenced reserve, free funds.
    #[must_use]
    pub fn get_pool(env: Env) -> PoolStatus {
        Self::pool_status(&env)
    }

    /// The guaranteed payout share in basis points — always 8 000 (80%).
    #[must_use]
    pub fn guaranteed_payout_bps(_env: Env) -> u32 {
        GUARANTEED_PAYOUT_BPS
    }

    /// The payout a denial would produce for `coverage_amount`.
    #[must_use]
    pub fn preview_payout(_env: Env, coverage_amount: i128) -> i128 {
        Self::amount_at_bps(coverage_amount, GUARANTEED_PAYOUT_BPS).unwrap_or(0)
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// `coverage_amount × bps / 10_000`, or `None` when the coverage is not
    /// a positive amount or the multiplication overflows.
    fn amount_at_bps(coverage_amount: i128, bps: u32) -> Option<i128> {
        if coverage_amount <= 0 {
            return None;
        }
        coverage_amount
            .checked_mul(i128::from(bps))?
            .checked_div(BPS_DENOM)
    }

    fn require_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(env, CarbonInsuranceError::NotInitialized))
    }

    /// Authorizes `caller` against the stored admin (no-op when it matches).
    fn require_admin_caller(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, CarbonInsuranceError::NotInitialized));
        if caller != &admin {
            panic_with_error!(env, CarbonInsuranceError::Unauthorized);
        }
    }

    fn load_policy(env: &Env, policy_id: u64) -> Policy {
        env.storage()
            .persistent()
            .get(&DataKey::Policy(policy_id))
            .unwrap_or_else(|| panic_with_error!(env, CarbonInsuranceError::PolicyNotFound))
    }

    fn reserved_total(env: &Env) -> i128 {
        let reserved: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Reserved)
            .unwrap_or(0);
        reserved
    }

    fn set_reserved(env: &Env, reserved: i128) {
        env.storage().instance().set(&DataKey::Reserved, &reserved);
    }

    fn pool_status(env: &Env) -> PoolStatus {
        let token = Self::require_token(env);
        let total = token::Client::new(env, &token).balance(&env.current_contract_address());
        let reserved = Self::reserved_total(env);
        // The reserve can never exceed the balance (it was checked at every
        // purchase), but clamp defensively so views stay non-negative.
        let available = total.checked_sub(reserved).unwrap_or(0);
        PoolStatus {
            total,
            reserved,
            available,
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Address, Env, Symbol};

    const COVERAGE: i128 = 1_000_000;
    const PREMIUM: i128 = 50_000; // 5% of COVERAGE
    const PAYOUT: i128 = 800_000; // 80% of COVERAGE

    fn setup() -> (Env, Address, Address, CarbonInsuranceClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();

        let contract_id = env.register(CarbonInsurance, ());
        let client = CarbonInsuranceClient::new(&env, &contract_id);
        client.initialize(&admin, &token);

        (env, admin, token, client)
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    fn balance(env: &Env, token: &Address, of: &Address) -> i128 {
        token::Client::new(env, token).balance(of)
    }

    /// Funds the pool and buys a `COVERAGE` policy for a freshly generated
    /// farmer — the common arrangement most tests start from.
    fn funded_policy(
        env: &Env,
        client: &CarbonInsuranceClient<'static>,
        token: &Address,
        underwriter_funds: i128,
    ) -> (Address, u64) {
        let underwriter = Address::generate(env);
        mint(env, token, &underwriter, underwriter_funds);
        client.fund_pool(&underwriter, &underwriter_funds);

        let farmer = Address::generate(env);
        mint(env, token, &farmer, PREMIUM);
        let policy_id = client.purchase_policy(&farmer, &Symbol::new(env, "proj1"), &COVERAGE);
        (farmer, policy_id)
    }

    fn project(env: &Env, name: &str) -> Symbol {
        Symbol::new(env, name)
    }

    // ── initialize ───────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_starts_with_an_empty_pool() {
        let (env, _, token, client) = setup();
        let pool = client.get_pool();
        assert_eq!(pool.total, 0);
        assert_eq!(pool.reserved, 0);
        assert_eq!(pool.available, 0);
        assert_eq!(balance(&env, &token, &client.address), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_, admin, token, client) = setup();
        client.initialize(&admin, &token);
    }

    // ── pool funding / withdrawal ────────────────────────────────────────────

    #[test]
    fn test_fund_pool_moves_tokens_and_reports_totals() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 5_000_000);

        client.fund_pool(&underwriter, &2_000_000);

        assert_eq!(balance(&env, &token, &underwriter), 3_000_000);
        assert_eq!(balance(&env, &token, &client.address), 2_000_000);
        let pool = client.get_pool();
        assert_eq!(pool.total, 2_000_000);
        assert_eq!(pool.reserved, 0);
        assert_eq!(pool.available, 2_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_fund_pool_rejects_zero_amount() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 1);
        client.fund_pool(&underwriter, &0);
    }

    #[test]
    fn test_withdraw_excess_takes_only_unreserved_funds() {
        let (env, admin, token, client) = setup();
        let (_, _) = funded_policy(&env, &client, &token, 2_000_000);

        // Pool: 2_050_000 total, 800_000 reserved → 1_250_000 free.
        let pool = client.get_pool();
        assert_eq!(pool.total, 2_050_000);
        assert_eq!(pool.reserved, PAYOUT);
        assert_eq!(pool.available, 1_250_000);

        client.withdraw_excess(&admin, &admin, &1_250_000);

        let pool = client.get_pool();
        assert_eq!(pool.total, PAYOUT);
        assert_eq!(pool.reserved, PAYOUT);
        assert_eq!(pool.available, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_withdraw_excess_cannot_touch_reserved_guarantee() {
        let (env, admin, token, client) = setup();
        let (_, _) = funded_policy(&env, &client, &token, 2_000_000);

        // 1 token over the free balance would eat into the reserve.
        client.withdraw_excess(&admin, &admin, &1_250_001);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_withdraw_excess_requires_admin() {
        let (env, _, token, client) = setup();
        let (_, _) = funded_policy(&env, &client, &token, 2_000_000);

        let stranger = Address::generate(&env);
        client.withdraw_excess(&stranger, &stranger, &1);
    }

    // ── purchasing ───────────────────────────────────────────────────────────

    #[test]
    fn test_purchase_charges_premium_and_reserves_guaranteed_payout() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 5_000_000);
        client.fund_pool(&underwriter, &2_000_000);

        let farmer = Address::generate(&env);
        mint(&env, &token, &farmer, PREMIUM);

        let policy_id = client.purchase_policy(&farmer, &project(&env, "proj1"), &COVERAGE);
        assert_eq!(policy_id, 1);

        let policy = client.get_policy(&policy_id);
        assert_eq!(policy.farmer, farmer);
        assert_eq!(policy.project_id, project(&env, "proj1"));
        assert_eq!(policy.coverage_amount, COVERAGE);
        assert_eq!(policy.premium_paid, PREMIUM);
        assert_eq!(policy.reserved_amount, PAYOUT);
        assert_eq!(policy.status, PolicyStatus::Active);
        assert_eq!(policy.expires_at, policy.purchased_at + POLICY_TERM_SECS);

        assert_eq!(balance(&env, &token, &farmer), 0);
        let pool = client.get_pool();
        assert_eq!(pool.total, 2_050_000);
        assert_eq!(pool.reserved, PAYOUT);
        assert_eq!(pool.available, 1_250_000);
    }

    #[test]
    fn test_policy_ids_increment() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 10_000_000);
        client.fund_pool(&underwriter, &10_000_000);

        let farmer = Address::generate(&env);
        mint(&env, &token, &farmer, 2 * PREMIUM);

        let first = client.purchase_policy(&farmer, &project(&env, "projA"), &COVERAGE);
        let second = client.purchase_policy(&farmer, &project(&env, "projB"), &COVERAGE);
        assert_eq!((first, second), (1, 2));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_purchase_rejects_zero_coverage() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 1_000_000);
        client.fund_pool(&underwriter, &1_000_000);

        let farmer = Address::generate(&env);
        client.purchase_policy(&farmer, &project(&env, "proj1"), &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_purchase_rejects_coverage_below_premium_minimum() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 1_000_000);
        client.fund_pool(&underwriter, &1_000_000);

        let farmer = Address::generate(&env);
        // 10 × 500 / 10_000 = 0 — the premium would round down to nothing.
        client.purchase_policy(&farmer, &project(&env, "proj1"), &10);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_purchase_requires_unreserved_pool_funds() {
        let (env, _, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 100_000);
        client.fund_pool(&underwriter, &100_000);

        let farmer = Address::generate(&env);
        mint(&env, &token, &farmer, PREMIUM);
        // Guarantee needs 800_000 but only 100_000 is free.
        client.purchase_policy(&farmer, &project(&env, "proj1"), &COVERAGE);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_purchase_rejected_once_verdict_exists() {
        let (env, admin, token, client) = setup();
        let underwriter = Address::generate(&env);
        mint(&env, &token, &underwriter, 5_000_000);
        client.fund_pool(&underwriter, &5_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &false);

        let farmer = Address::generate(&env);
        mint(&env, &token, &farmer, PREMIUM);
        client.purchase_policy(&farmer, &project(&env, "proj1"), &COVERAGE);
    }

    // ── verification ─────────────────────────────────────────────────────────

    #[test]
    fn test_admin_records_verdict_until_a_verifier_is_set() {
        let (env, admin, _, client) = setup();

        client.record_verification(&admin, &project(&env, "proj1"), &true);
        assert!(client.get_verification(&project(&env, "proj1")).approved);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_record_verification_rejects_non_verifier() {
        let (env, admin, _, client) = setup();
        let verifier = Address::generate(&env);
        client.set_verifier(&admin, &verifier);

        let stranger = Address::generate(&env);
        client.record_verification(&stranger, &project(&env, "proj1"), &false);
    }

    #[test]
    fn test_configured_verifier_records_verdict() {
        let (env, admin, _, client) = setup();
        let verifier = Address::generate(&env);
        client.set_verifier(&admin, &verifier);

        client.record_verification(&verifier, &project(&env, "proj1"), &false);
        assert!(!client.get_verification(&project(&env, "proj1")).approved);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_verdict_is_write_once() {
        let (env, admin, _, client) = setup();
        client.record_verification(&admin, &project(&env, "proj1"), &true);
        client.record_verification(&admin, &project(&env, "proj1"), &false);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_get_missing_verdict_panics() {
        let (env, _, _, client) = setup();
        client.get_verification(&project(&env, "unknown"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_set_verifier_requires_admin() {
        let (env, _, _, client) = setup();
        let stranger = Address::generate(&env);
        client.set_verifier(&stranger, &stranger);
    }

    // ── claims ───────────────────────────────────────────────────────────────

    #[test]
    fn test_claim_after_denied_verification_pays_guaranteed_80_percent() {
        let (env, admin, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &false);

        let payout = client.claim(&farmer, &policy_id);
        assert_eq!(payout, PAYOUT);
        assert_eq!(payout * 10_000 / COVERAGE, 8_000);

        // Premium paid + payout received.
        assert_eq!(balance(&env, &token, &farmer), PAYOUT);

        let policy = client.get_policy(&policy_id);
        assert_eq!(policy.status, PolicyStatus::PaidOut);

        let pool = client.get_pool();
        assert_eq!(pool.total, 2_050_000 - PAYOUT);
        assert_eq!(pool.reserved, 0);
        assert_eq!(pool.available, 2_050_000 - PAYOUT);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_double_claim_rejected() {
        let (env, admin, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &false);
        client.claim(&farmer, &policy_id);
        client.claim(&farmer, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_only_the_policyholder_can_claim() {
        let (env, admin, token, client) = setup();
        let (_, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &false);

        let stranger = Address::generate(&env);
        client.claim(&stranger, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_claim_rejected_when_verification_passed() {
        let (env, admin, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &true);
        client.claim(&farmer, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_claim_pending_verdict_rejected_before_expiry() {
        let (env, _, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        // No verdict recorded yet and the term is still running.
        env.ledger()
            .with_mut(|l| l.timestamp += POLICY_TERM_SECS - 1);
        client.claim(&farmer, &policy_id);
    }

    #[test]
    fn test_missing_verdict_after_expiry_still_pays_guaranteed_80_percent() {
        let (env, _, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        // The verifier never responds: after the term ends the guarantee is
        // still owed, so a stalled verification cannot block the payout.
        env.ledger()
            .with_mut(|l| l.timestamp += POLICY_TERM_SECS + 1);

        assert_eq!(client.claim(&farmer, &policy_id), PAYOUT);
        assert_eq!(balance(&env, &token, &farmer), PAYOUT);
        assert_eq!(client.get_pool().reserved, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_claim_unknown_policy_rejected() {
        let (env, _, token, client) = setup();
        let (farmer, _) = funded_policy(&env, &client, &token, 2_000_000);
        client.claim(&farmer, &99);
    }

    // ── settlement ───────────────────────────────────────────────────────────

    #[test]
    fn test_settle_approved_releases_the_reserve() {
        let (env, admin, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &true);
        client.settle_approved(&policy_id);

        assert_eq!(client.get_policy(&policy_id).status, PolicyStatus::Settled);
        let pool = client.get_pool();
        assert_eq!(pool.total, 2_050_000);
        assert_eq!(pool.reserved, 0);
        assert_eq!(pool.available, 2_050_000);

        // The farmer keeps nothing but pays nothing further either.
        assert_eq!(balance(&env, &token, &farmer), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_settle_rejected_when_verification_denied() {
        let (env, admin, token, client) = setup();
        let (_, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &false);
        client.settle_approved(&policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_settle_rejected_without_verdict() {
        let (env, _, token, client) = setup();
        let (_, policy_id) = funded_policy(&env, &client, &token, 2_000_000);
        client.settle_approved(&policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_claim_after_settlement_rejected() {
        let (env, admin, token, client) = setup();
        let (farmer, policy_id) = funded_policy(&env, &client, &token, 2_000_000);

        client.record_verification(&admin, &project(&env, "proj1"), &true);
        client.settle_approved(&policy_id);
        client.claim(&farmer, &policy_id);
    }

    // ── guarantee views ──────────────────────────────────────────────────────

    #[test]
    fn test_guaranteed_payout_is_locked_at_80_percent() {
        let (_env, _, _, client) = setup();
        assert_eq!(client.guaranteed_payout_bps(), 8_000);
        assert_eq!(client.preview_payout(&COVERAGE), PAYOUT);
        assert_eq!(client.preview_payout(&1_000_001), 800_000);
        assert_eq!(client.preview_payout(&0), 0);
        assert_eq!(client.preview_payout(&-5), 0);
    }
}
