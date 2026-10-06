#![no_std]

//! Farmer Escrow — Closes #1329 (v1)
//!
//! Buyer-protection escrow for farmer carbon-credit sales. A buyer's payment
//! is held by this contract until the underlying carbon credits are both
//! **verified** and **retired**; only then is the farmer paid. The farmer's
//! payout additionally passes a **verification period** during which the
//! buyer (or a dispute arbiter) can claw the funds back if verification
//! turns out to be fraudulent.
//!
//! # Lifecycle
//!
//! ```text
//!   buyer.deposit(order_id, farmer, token, amount, credit tonnes)
//!         │  funds move buyer → contract; status = Funded
//!         ▼
//!   verifier.confirm_retirement(order_id, proof_hash)
//!         │  credits verified + retired on-chain; status = Retired
//!         ▼
//!   farmer.claim(order_id)
//!         │  farmer signs; status = VerificationPeriod
//!         │  93.5% of funds queued for payout after VERIFICATION_PERIOD
//!         │  6.5% platform fee split: treasury + farmer's reviewer
//!         ▼
//!   (after VERIFICATION_PERIOD, default 30 days)
//!   anyone.payout(order_id)          → farmer receives net funds
//!   buyer.clawback(order_id)         → only before the period elapses
//!   arbiter.resolve_dispute(...)     → 50/50 split, any time before payout
//! ```
//!
//! # Guarantees (v1)
//!
//! - **Funds are never released to the farmer before credits are verified
//!   AND retired** — enforced by state-machine checks, not by convention.
//! - **Clawback window**: `claim()` starts a clock; the buyer can claw back
//!   only while it runs. After `payout()` is possible, nothing can reverse
//!   the transfer.
//! - **CEI ordering**: all state mutations happen before cross-contract token
//!   transfers (the same checks-effects-interactions discipline used by
//!   `tree-escrow`).
//! - Every state-mutating entry point is gated by `assert_not_paused()` via
//!   admin-controls, and funds only ever move with `require_auth()` from the
//!   entitled party.

use admin_controls::AdminControlsClient;
use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env,
};

// ── Constants ────────────────────────────────────────────────────────────────

/// Verification period after the farmer claims: 30 days. During this window
/// the buyer may claw back; after it, anyone may trigger the payout.
const VERIFICATION_PERIOD_SECS: u64 = 30 * 24 * 60 * 60;

/// Platform fee in basis points (6.5%): covers retirement audits and the
/// verification oracle. Split between treasury and verifier on payout.
const PLATFORM_FEE_BPS: u32 = 650;
const BPS_DENOM: u32 = 10_000;

/// Share of the platform fee that goes to the verifier (the rest to treasury).
const VERIFIER_FEE_SHARE_BPS: u32 = 4_000;

/// Maximum platform fee the admin may configure (50%).
const MAX_PLATFORM_FEE_BPS: u32 = 5_000;

// ── Types ────────────────────────────────────────────────────────────────────

/// Compact storage-key enum (encoding rationale in farmer-registry docs).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    /// (admin, treasury, admin_controls, platform_fee_bps)
    Config,
    /// EscrowOrder for a given order id.
    Order(u64),
    /// Monotonic order-id sequence.
    OrderSeq,
}

/// State machine: Funded → Retired → VerificationPeriod → Paid,
/// with Refunded / Disputed / Resolved as terminal or transient branches.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderStatus {
    /// Buyer's deposit is locked.
    Funded,
    /// Verifier confirmed credits are verified and retired.
    Retired,
    /// Farmer claimed; clawback window running.
    VerificationPeriod,
    /// Funds fully paid out to the farmer.
    Paid,
    /// Refunded to the buyer (clawback or buyer-initiated refund).
    Refunded,
    /// A dispute is open (arbiter can resolve).
    Disputed,
}

/// One buyer→farmer purchase of retired carbon credits.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct EscrowOrder {
    pub order_id: u64,
    pub buyer: Address,
    pub farmer: Address,
    pub token: Address,
    /// Gross amount deposited by the buyer.
    pub amount: i128,
    /// Tonnes of CO2e the order covers (×100 scaling, informational).
    pub tonnes_scaled: i128,
    pub status: OrderStatus,
    /// SHA-256 retirement proof submitted by the verifier.
    pub retirement_proof: BytesN<32>,
    pub deposited_at: u64,
    pub retired_at: u64,
    pub claimed_at: u64,
    pub closed_at: u64,
    /// Amount already transferred to the farmer (0 until payout).
    pub paid_to_farmer: i128,
}

/// Result of a dispute resolution.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DisputeResolution {
    /// Amount transferred to the buyer.
    pub buyer_amount: i128,
    /// Amount transferred to the farmer.
    pub farmer_amount: i128,
    pub resolved_at: u64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum FarmerEscrowError {
    /// Order id does not exist.
    OrderNotFound = 1,
    /// Order is in a state that does not permit this transition.
    InvalidOrderState = 2,
    /// Only the buyer of this order may perform this action.
    NotBuyer = 3,
    /// Only the farmer of this order may perform this action.
    NotFarmer = 4,
    /// Amount or tonnes must be positive.
    InvalidAmount = 5,
    /// Buyer tried to claw back after the verification period elapsed.
    VerificationPeriodElapsed = 6,
    /// Farmer tried to claim before credits are verified and retired.
    CreditsNotRetired = 7,
    /// Nothing left to pay out (already paid or refunded).
    NothingToRelease = 8,
    /// Caller is not the designated dispute arbiter.
    NotArbiter = 9,
    /// A dispute is already open for this order.
    DisputeAlreadyOpen = 10,
    /// No open dispute on this order.
    NoOpenDispute = 11,
    /// Clawback requires the verification period to be running.
    VerificationPeriodNotRunning = 12,
}

// ── Contract ─────────────────────────────────────────────────────────────────

//! Farmer payment escrow for carbon-credit purchases.
//!
//! A buyer's payment is held by this contract rather than sent directly to the
//! farmer. An authorised verifier must attest that the purchased credits were
//! retired or verified. The payment can then be released to the farmer only
//! after the configured verification period. If no attestation arrives before
//! the verification deadline, the buyer can recover the full payment.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, IntoVal,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FarmerEscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    VerificationWindowMustBePositive = 4,
    EscrowAlreadyExists = 5,
    EscrowNotFound = 6,
    Unauthorized = 7,
    InvalidStatus = 8,
    VerificationDeadlineNotReached = 9,
    VerificationDeadlinePassed = 10,
    ReleasePeriodNotElapsed = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    /// Payment has been received but the credits are not yet verified.
    Held,
    /// Credits are verified/retired; payment remains protected until release.
    Verified,
    Released,
    Refunded,
}

/// Immutable payment terms and the current settlement state for one purchase.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FarmerEscrowRecord {
    pub buyer: Address,
    pub farmer: Address,
    pub payment_token: Address,
    pub amount: i128,
    /// Identifies the carbon-credit purchase without exposing off-chain data.
    pub credit_id: BytesN<32>,
    pub funded_at: u64,
    /// Last timestamp at which the verifier can approve the credits.
    pub verification_deadline: u64,
    /// Timestamp after which anyone may execute the farmer payout.
    pub release_at: u64,
    /// Buyer-selected protection period applied after verification.
    pub release_delay_secs: u64,
    pub verified_at: u64,
    pub verification_proof: BytesN<32>,
    pub status: PaymentStatus,
}

#[contract]
pub struct FarmerEscrow;

#[contractimpl]
impl FarmerEscrow {
    /// One-time initialisation.
    ///
    /// * `admin`         — fee configuration authority (governance multisig)
    /// * `treasury`      — platform-fee recipient
    /// * `admin_controls`— shared pause switch for the suite
    /// * `arbiter`       — dispute resolution authority
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        admin_controls: Address,
        arbiter: Address,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(
            &DataKey::Config,
            &(admin, treasury, admin_controls, PLATFORM_FEE_BPS, arbiter),
        );
    }

    // ── Buyer flow ───────────────────────────────────────────────────────────

    /// Buyer deposits payment for `tonnes_scaled` of carbon credits from
    /// `farmer`. Funds are pulled from the buyer into this contract and locked
    /// until verification + retirement.
    ///
    /// # Errors
    /// - `InvalidAmount` — amount or tonnes ≤ 0
    pub fn deposit(
        env: Env,
        buyer: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tonnes_scaled: i128,
    ) -> u64 {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if amount <= 0 || tonnes_scaled <= 0 {
            panic_with_error!(&env, FarmerEscrowError::InvalidAmount);
        }

        let seq: u64 = env.storage().instance().get(&DataKey::OrderSeq).unwrap_or(0);
        let order_id = seq + 1;

        // Cross-contract pull first (fail fast before any state change would
        // require cleanup — the transfer itself reverts on failure).
        token::Client::new(&env, &token).transfer(
    /// Sets the administrator and independent credit verifier once.
    pub fn initialize(env: Env, admin: Address, verifier: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, FarmerEscrowError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFY"), &verifier);
    }

    /// Rotates the verifier. Only governance can change the settlement oracle.
    pub fn set_verifier(env: Env, verifier: Address) {
        Self::admin(&env).require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFY"), &verifier);
    }

    /// Holds a buyer payment for a carbon-credit purchase.
    ///
    /// `verification_window_secs` is the maximum time the buyer waits for a
    /// verifier attestation. `release_delay_secs` is the post-attestation
    /// protection period before funds can be paid to the farmer.
    pub fn fund(
        env: Env,
        buyer: Address,
        farmer: Address,
        payment_token: Address,
        escrow_id: u64,
        credit_id: BytesN<32>,
        amount: i128,
        verification_window_secs: u64,
        release_delay_secs: u64,
    ) {
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, FarmerEscrowError::AmountMustBePositive);
        }
        if verification_window_secs == 0 {
            panic_with_error!(&env, FarmerEscrowError::VerificationWindowMustBePositive);
        }

        let key = Self::key(&env, escrow_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, FarmerEscrowError::EscrowAlreadyExists);
        }

        let funded_at = env.ledger().timestamp();
        let verification_deadline = funded_at.saturating_add(verification_window_secs);
        token::Client::new(&env, &payment_token).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        let now = env.ledger().timestamp();
        let order = EscrowOrder {
            order_id,
            buyer: buyer.clone(),
            farmer,
            token: token.clone(),
            amount,
            tonnes_scaled,
            status: OrderStatus::Funded,
            retirement_proof: BytesN::from_array(&env, &[0u8; 32]),
            deposited_at: now,
            retired_at: 0,
            claimed_at: 0,
            closed_at: 0,
            paid_to_farmer: 0,
        };
        env.storage().persistent().set(&DataKey::Order(order_id), &order);
        env.storage().instance().set(&DataKey::OrderSeq, &order_id);

        env.events().publish(
            (symbol_short!("Dep"), order_id),
            (buyer, token, amount, tonnes_scaled),
        );

        order_id
    }

    /// Buyer cancels a `Funded` order before verification: full refund.
    /// This is the pre-verification "payment protection" path — no credits
    /// were delivered, so the buyer's funds are not at risk.
    pub fn cancel(env: Env, order_id: u64) {
        Self::assert_not_paused(&env);

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        if order.status != OrderStatus::Funded {
            panic_with_error!(&env, FarmerEscrowError::InvalidOrderState);
        }

        order.buyer.require_auth();

        let amount = order.amount;
        let token = order.token.clone();
        let buyer = order.buyer.clone();

        // CEI: state first, transfer second.
        order.status = OrderStatus::Refunded;
        order.closed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &order);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        env.events().publish(
            (symbol_short!("Cancel"), order_id),
            (buyer, amount),
        );
    }

    // ── Verifier flow ────────────────────────────────────────────────────────

    /// Verifier confirms the credits behind `order_id` are verified **and**
    /// permanently retired. This is the gate that protects the buyer: without
    /// retirement proof the farmer can never touch the funds.
    pub fn confirm_retirement(env: Env, verifier: Address, order_id: u64, proof_hash: BytesN<32>) {
        Self::assert_not_paused(&env);
        verifier.require_auth();

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        if order.status != OrderStatus::Funded {
            panic_with_error!(&env, FarmerEscrowError::InvalidOrderState);
        }

        order.status = OrderStatus::Retired;
        order.retirement_proof = proof_hash;
        order.retired_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &order);

        env.events().publish(
            (symbol_short!("Retired"), order_id),
            (verifier, proof_hash, order.retired_at),
        );
    }

    // ── Farmer flow ──────────────────────────────────────────────────────────

    /// Farmer claims payment after retirement confirmation. Starts the
    /// verification period — the funds remain recoverable by the buyer until
    /// it elapses, then become payable.
    ///
    /// # Errors
    /// - `NotFarmer` — caller is not the order's farmer
    /// - `InvalidOrderState` — credits not yet retired
    pub fn claim(env: Env, order_id: u64) {
        Self::assert_not_paused(&env);

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        order.farmer.require_auth();

        if order.status != OrderStatus::Retired {
            panic_with_error!(&env, FarmerEscrowError::CreditsNotRetired);
        }

        order.status = OrderStatus::VerificationPeriod;
        order.claimed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &order);

        env.events().publish(
            (symbol_short!("Claimed"), order_id),
            (order.farmer.clone(), order.claimed_at + verification_period(&env)),
        );
    }

    /// Anyone may finalize the payout once the verification period has elapsed.
    /// The farmer receives the gross amount minus the platform fee; the fee is
    /// split between treasury and verifier.
    ///
    /// Permissionless execution keeps the farmer's payout independent of any
    /// single operator's availability.
    ///
    /// # Errors
    /// - `InvalidOrderState` — order not in VerificationPeriod
    /// - `VerificationPeriodElapsed` inverted: fires when the period is still running
    pub fn payout(env: Env, order_id: u64) -> i128 {
        Self::assert_not_paused(&env);

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        if order.status != OrderStatus::VerificationPeriod {
            panic_with_error!(&env, FarmerEscrowError::InvalidOrderState);
        }
        if env.ledger().timestamp() < order.claimed_at + verification_period(&env) {
            panic_with_error!(&env, FarmerEscrowError::VerificationPeriodNotRunning);
        }

        let (fee, verifier_fee) = Self::fee_split(&env, order.amount);
        let treasury_fee = fee - verifier_fee;
        let net_to_farmer = order.amount - fee;

        // CEI: mark paid before moving tokens.
        order.status = OrderStatus::Paid;
        order.paid_to_farmer = net_to_farmer;
        order.closed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &order);

        let token = order.token.clone();
        let farmer = order.farmer.clone();
        let contract_addr = env.current_contract_address();

        token::Client::new(&env, &token).transfer(&contract_addr, &farmer, &net_to_farmer);

        let (_, _, _, _, arbiter) = Self::config(&env);
        let (treasury, _, _, _, _) = Self::config(&env);
        let contract_addr = env.current_contract_address();

        token::Client::new(&env, &token).transfer(&contract_addr, &farmer, &net_to_farmer);

        if treasury_fee > 0 {
            token::Client::new(&env, &token).transfer(&contract_addr, &treasury, &treasury_fee);
        }
        if verifier_fee > 0 {
            token::Client::new(&env, &token).transfer(&contract_addr, &arbiter, &verifier_fee);
        }

        env.events().publish(
            (symbol_short!("Payout"), order_id),
            (farmer, net_to_farmer, fee),
        );

        net_to_farmer
    }

    // ── Buyer protection ─────────────────────────────────────────────────────

    /// Buyer clawback during the verification period: if verification is
    /// disputed/fraudulent, the buyer recovers the full gross amount before
    /// the payout can execute.
    ///
    /// # Errors
    /// - `NotBuyer` — caller is not the order's buyer
    /// - `VerificationPeriodNotRunning` — no active verification window
    /// - `VerificationPeriodElapsed` — window already closed
    pub fn clawback(env: Env, order_id: u64) {
        Self::assert_not_paused(&env);

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        order.buyer.require_auth();

        if order.status != OrderStatus::VerificationPeriod {
            panic_with_error!(&env, FarmerEscrowError::VerificationPeriodNotRunning);
        }
        let now = env.ledger().timestamp();
        if now >= order.claimed_at + verification_period(&env) {
            panic_with_error!(&env, FarmerEscrowError::VerificationPeriodElapsed);
        }

        let amount = order.amount;
        let token = order.token.clone();
        let buyer = order.buyer.clone();

        // CEI: state first.
        order.status = OrderStatus::Refunded;
        order.closed_at = now;
        env.storage().persistent().set(&key, &order);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        env.events().publish(
            (symbol_short!("Clawback"), order_id),
            (buyer, amount),
        );
    }

    // ── Dispute resolution ───────────────────────────────────────────────────

    /// Arbiter opens a dispute, freezing the order against automatic payout
    /// or clawback until resolved.
    pub fn open_dispute(env: Env, order_id: u64) {
        Self::assert_not_paused(&env);
        let (_, _, _, _, arbiter) = Self::config(&env);
        arbiter.require_auth();

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        if order.status != OrderStatus::VerificationPeriod {
            panic_with_error!(&env, FarmerEscrowError::InvalidOrderState);
        }

        order.status = OrderStatus::Disputed;
        env.storage().persistent().set(&key, &order);

        env.events().publish((symbol_short!("Dispute"), order_id), env.ledger().timestamp());
    }

    /// Arbiter resolves a dispute with a buyer/farmer split. Both amounts must
    /// sum to the order total. Payable regardless of the verification clock —
    /// the arbiter is the final authority.
    ///
    /// # Errors
    /// - `NoOpenDispute` — order is not in Disputed state
    /// - `InvalidAmount` — split does not conserve the order total
    pub fn resolve_dispute(
        env: Env,
        order_id: u64,
        buyer_amount: i128,
        farmer_amount: i128,
    ) -> DisputeResolution {
        Self::assert_not_paused(&env);
        let (_, _, _, _, arbiter) = Self::config(&env);
        arbiter.require_auth();

        let key = DataKey::Order(order_id);
        let mut order: EscrowOrder = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerEscrowError::OrderNotFound));

        if order.status != OrderStatus::Disputed {
            panic_with_error!(&env, FarmerEscrowError::NoOpenDispute);
        }
        if buyer_amount < 0 || farmer_amount < 0 || buyer_amount + farmer_amount != order.amount {
            panic_with_error!(&env, FarmerEscrowError::InvalidAmount);
        }

        let token = order.token.clone();
        let buyer = order.buyer.clone();
        let farmer = order.farmer.clone();
        let contract_addr = env.current_contract_address();

        // CEI: state first.
        order.status = OrderStatus::Paid;
        order.paid_to_farmer = farmer_amount;
        order.closed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &order);

        if buyer_amount > 0 {
            token::Client::new(&env, &token).transfer(&contract_addr, &buyer, &buyer_amount);
        }
        if farmer_amount > 0 {
            token::Client::new(&env, &token).transfer(&contract_addr, &farmer, &farmer_amount);
        }

        env.events().publish(
            (symbol_short!("Resolved"), order_id),
            (buyer_amount, farmer_amount),
        );

        DisputeResolution {
            buyer_amount,
            farmer_amount,
            resolved_at: env.ledger().timestamp(),
        }
    }

    // ── Admin configuration ──────────────────────────────────────────────────

    /// Admin-only: adjust the platform fee (≤ 50%).
    pub fn set_platform_fee_bps(env: Env, admin: Address, fee_bps: u32) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if fee_bps > MAX_PLATFORM_FEE_BPS {
            panic_with_error!(&env, FarmerEscrowError::InvalidAmount);
        }
        let (_, treasury, ac, _, arbiter) = Self::config(&env);
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, treasury, ac, fee_bps, arbiter));
        env.events().publish((symbol_short!("FeeSet"),), (fee_bps, env.ledger().timestamp()));
    }

    // ── Query ────────────────────────────────────────────────────────────────

    /// Returns the order, if it exists.
    pub fn get_order(env: Env, order_id: u64) -> Option<EscrowOrder> {
        env.storage().persistent().get(&DataKey::Order(order_id))
    }

    /// Returns (fee_bps, verifier_share_bps) currently configured.
    pub fn get_fee_config(env: Env) -> (u32, u32) {
        let (_, _, _, fee_bps, _) = Self::config(&env);
        (fee_bps, VERIFIER_FEE_SHARE_BPS)
    }

    /// Returns the timestamp at which `order_id` becomes payable
    /// (0 when the order is not in or past the verification period).
    pub fn get_payout_eligible_at(env: Env, order_id: u64) -> u64 {
        if let Some(order) = env.storage().persistent().get::<_, EscrowOrder>(&DataKey::Order(order_id)) {
            if order.claimed_at > 0 {
                return order.claimed_at + verification_period(&env);
            }
        }
        0
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    fn config(
        env: &Env,
    ) -> (Address, Address, Address, u32, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let (admin, _, _, _, _) = Self::config(env);
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
    }

    fn assert_not_paused(env: &Env) {
        let (_, _, ac, _, _) = Self::config(env);
        AdminControlsClient::new(env, &ac).assert_not_paused();
    }

    /// Splits `amount` into (total_fee, verifier_share).
    fn fee_split(env: &Env, amount: i128) -> (i128, i128) {
        let (_, _, _, fee_bps, _) = Self::config(env);
        let fee = (amount as u128)
            .checked_mul(fee_bps as u128)
            .and_then(|v| v.checked_div(BPS_DENOM as u128))
            .unwrap_or(0) as i128;
        let verifier_fee = (fee as u128)
            .checked_mul(VERIFIER_FEE_SHARE_BPS as u128)
            .and_then(|v| v.checked_div(BPS_DENOM as u128))
            .unwrap_or(0) as i128;
        (fee, verifier_fee)
    }
}

/// Verification period is fixed in v1; a getter keeps call sites self-documenting.
fn verification_period(_env: &Env) -> u64 {
    VERIFICATION_PERIOD_SECS
}

// ── Tests ────────────────────────────────────────────────────────────────────

        env.storage().persistent().set(
            &key,
            &FarmerEscrowRecord {
                buyer: buyer.clone(),
                farmer: farmer.clone(),
                payment_token: payment_token.clone(),
                amount,
                credit_id,
                funded_at,
                verification_deadline,
                release_at: 0,
                release_delay_secs,
                verified_at: 0,
                verification_proof: BytesN::from_array(&env, &[0; 32]),
                status: PaymentStatus::Held,
            },
        );
        env.events().publish(
            (symbol_short!("PayHeld"), escrow_id),
            (buyer, farmer, payment_token, amount, verification_deadline),
        );
    }

    /// Records a verifier's credit-retirement or credit-verification proof.
    pub fn verify_credits(env: Env, escrow_id: u64, verification_proof: BytesN<32>) {
        Self::verifier(&env).require_auth();
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        if escrow.status != PaymentStatus::Held {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        let now = env.ledger().timestamp();
        if now > escrow.verification_deadline {
            panic_with_error!(&env, FarmerEscrowError::VerificationDeadlinePassed);
        }

        escrow.status = PaymentStatus::Verified;
        escrow.verified_at = now;
        escrow.release_at = now.saturating_add(escrow.release_delay_secs);
        escrow.verification_proof = verification_proof;
        env.storage().persistent().set(&key, &escrow);
        env.events().publish(
            (symbol_short!("CredVrf"), escrow_id),
            (escrow.credit_id, escrow.release_at),
        );
    }

    /// Releases a verified payment after the protection period.
    ///
    /// This call is intentionally permissionless: once the on-chain deadline is
    /// satisfied, neither buyer nor verifier can indefinitely withhold payout.
    pub fn release_payment(env: Env, escrow_id: u64) {
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        if escrow.status != PaymentStatus::Verified {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        if env.ledger().timestamp() < escrow.release_at {
            panic_with_error!(&env, FarmerEscrowError::ReleasePeriodNotElapsed);
        }

        // Checks-effects-interactions: settle state before the token call.
        escrow.status = PaymentStatus::Released;
        env.storage().persistent().set(&key, &escrow);
        token::Client::new(&env, &escrow.payment_token).transfer(
            &env.current_contract_address(),
            &escrow.farmer,
            &escrow.amount,
        );
        env.events().publish(
            (symbol_short!("PayRel"), escrow_id),
            (escrow.farmer, escrow.amount),
        );
    }

    /// Returns an unverified payment to its buyer once verification has timed out.
    pub fn refund_unverified(env: Env, escrow_id: u64) {
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        escrow.buyer.require_auth();
        if escrow.status != PaymentStatus::Held {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        if env.ledger().timestamp() <= escrow.verification_deadline {
            panic_with_error!(&env, FarmerEscrowError::VerificationDeadlineNotReached);
        }

        escrow.status = PaymentStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);
        token::Client::new(&env, &escrow.payment_token).transfer(
            &env.current_contract_address(),
            &escrow.buyer,
            &escrow.amount,
        );
        env.events().publish(
            (symbol_short!("PayRef"), escrow_id),
            (escrow.buyer, escrow.amount),
        );
    }

    pub fn get_escrow(env: Env, escrow_id: u64) -> Option<FarmerEscrowRecord> {
        env.storage().persistent().get(&Self::key(&env, escrow_id))
    }

    fn key(env: &Env, escrow_id: u64) -> soroban_sdk::Val {
        (symbol_short!("FESC"), escrow_id).into_val(env)
    }

    fn record(env: &Env, key: &soroban_sdk::Val) -> FarmerEscrowRecord {
        env.storage()
            .persistent()
            .get(key)
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::EscrowNotFound))
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::NotInitialized))
    }

    fn verifier(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("VERIFY"))
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::NotInitialized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env,
    };

    struct Ctx {
        env: Env,
        admin: Address,
        buyer: Address,
        farmer: Address,
        verifier: Address,
        arbiter: Address,
        token: Address,
        client: FarmerEscrowClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000);

        let ac_id = env.register_contract(None, admin_controls::AdminControls);
        let ac_client = admin_controls::AdminControlsClient::new(&env, &ac_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        ac_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, FarmerEscrow);
        let client = FarmerEscrowClient::new(&env, &contract_id);

        let treasury = Address::generate(&env);
        let arbiter = Address::generate(&env);
        client.initialize(&admin, &treasury, &ac_id, &arbiter);

        let buyer = Address::generate(&env);
        let farmer = Address::generate(&env);
        let verifier = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &1_000_000);

        Ctx { env, admin, buyer, farmer, verifier, arbiter, token, client }
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn bal(ctx: &Ctx, who: &Address) -> i128 {
        token::Client::new(&ctx.env, &ctx.token).balance(who)
    }

    /// Standard flow up to retirement confirmation.
    fn funded(ctx: &Ctx) -> u64 {
        ctx.client
            .deposit(&ctx.buyer, &ctx.farmer, &ctx.token, &10_000, &1_500i128)
    }

    // ── deposit ──────────────────────────────────────────────────────────────

    #[test]
    fn test_deposit_locks_funds_and_creates_order() {
        let ctx = setup();
        let before = bal(&ctx, &ctx.buyer);
        let id = funded(&ctx);

        assert_eq!(before - bal(&ctx, &ctx.buyer), 10_000);
        let order = ctx.client.get_order(&id).unwrap();
        assert_eq!(order.status, OrderStatus::Funded);
        assert_eq!(order.amount, 10_000);
        assert_eq!(order.buyer, ctx.buyer);
        assert_eq!(order.farmer, ctx.farmer);
    }

    #[test]
    fn test_order_ids_increment() {
        let ctx = setup();
        let id1 = funded(&ctx);
        let id2 = funded(&ctx);
        assert!(id2 > id1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_deposit_zero_amount_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.buyer, &ctx.farmer, &ctx.token, &0, &1_500i128);
    }

    // ── cancellation (pre-verification protection) ───────────────────────────

    #[test]
    fn test_buyer_cancel_before_verification_refunds() {
        let ctx = setup();
        let id = funded(&ctx);
        let buyer_before = bal(&ctx, &ctx.buyer);

        ctx.client.cancel(&id);

        assert_eq!(bal(&ctx, &ctx.buyer) - buyer_before, 10_000);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_cancel_after_retirement_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.cancel(&id);
    }

    // ── retirement gate ──────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_farmer_cannot_claim_before_retirement() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.claim(&id);
    }

    #[test]
    fn test_retirement_stores_proof_and_allows_claim() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 7));

        let order = ctx.client.get_order(&id).unwrap();
        assert_eq!(order.status, OrderStatus::Retired);
        assert_eq!(order.retirement_proof, proof(&ctx.env, 7));

        ctx.client.claim(&id);
        let order = ctx.client.get_order(&id).unwrap();
        assert_eq!(order.status, OrderStatus::VerificationPeriod);
        assert!(order.claimed_at > 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_double_retirement_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 2));
    }

    // ── payout ───────────────────────────────────────────────────────────────

    #[test]
    fn test_clawback_wins_race_against_early_payout() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);

        // Window nearly elapsed: payout is still blocked, clawback still works.
        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS - 1);
        let farmer_before = bal(&ctx, &ctx.farmer);
        ctx.client.clawback(&id);
        assert_eq!(bal(&ctx, &ctx.farmer), farmer_before);
        assert_eq!(
            ctx.client.get_order(&id).unwrap().status,
            OrderStatus::Refunded
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        FarmerEscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let contract_id = env.register_contract(None, FarmerEscrow);
        let client = FarmerEscrowClient::new(&env, &contract_id);
        client.initialize(&admin, &verifier);
        (env, verifier, token, contract_id, admin, client)
    }

    fn credit(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7; 32])
    }

    #[test]
    fn verified_payment_is_released_only_after_the_protection_period() {
        let (env, _, token, contract_id, _, client) = setup();
        let buyer = Address::generate(&env);
        let farmer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &500);

        client.fund(&buyer, &farmer, &token, &1, &credit(&env), &500, &100, &50);
        client.verify_credits(&1, &credit(&env));
        assert_eq!(token::Client::new(&env, &token).balance(&contract_id), 500);

        env.ledger().with_mut(|ledger| ledger.timestamp += 50);
        client.release_payment(&1);
        assert_eq!(token::Client::new(&env, &token).balance(&farmer), 500);
        assert_eq!(
            client.get_escrow(&1).unwrap().status,
            PaymentStatus::Released
        );
    }

    #[test]    fn test_payout_splits_fees_and_pays_farmer() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);

        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS + 1);

        // Fee config default: 650 bps → 650 of 10_000; verifier share 40% → 260.
        let (fee_bps, verifier_share) = ctx.client.get_fee_config();
        assert_eq!(fee_bps, PLATFORM_FEE_BPS);
        assert_eq!(verifier_share, VERIFIER_FEE_SHARE_BPS);

        let farmer_before = bal(&ctx, &ctx.farmer);
        let paid = ctx.client.payout(&id);

        // 10_000 × 650/10_000 = 650 fee → farmer nets 9_350.
        assert_eq!(paid, 9_350);
        assert_eq!(bal(&ctx, &ctx.farmer) - farmer_before, 9_350);

        let order = ctx.client.get_order(&id).unwrap();
        assert_eq!(order.status, OrderStatus::Paid);
        assert_eq!(order.paid_to_farmer, 9_350);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_payout_before_period_elapses_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);

        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS - 1);
        ctx.client.payout(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_double_payout_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);
        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS + 1);
        ctx.client.payout(&id);
        ctx.client.payout(&id);
    }

    // ── clawback ─────────────────────────────────────────────────────────────

    #[test]
    fn test_buyer_clawback_within_period_refunds_full_amount() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);

        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS - 1);
        let buyer_before = bal(&ctx, &ctx.buyer);
        ctx.client.clawback(&id);

        assert_eq!(bal(&ctx, &ctx.buyer) - buyer_before, 10_000);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_clawback_after_period_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);
        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS + 1);
        ctx.client.clawback(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_clawback_without_claim_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.clawback(&id);
    }

    // ── disputes ─────────────────────────────────────────────────────────────

    #[test]
    fn test_arbiter_resolves_dispute_with_split() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);

        ctx.client.open_dispute(&id);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Disputed);

        let farmer_before = bal(&ctx, &ctx.farmer);
        let buyer_before = bal(&ctx, &ctx.buyer);

        ctx.client.resolve_dispute(&id, &4_000, &6_000);

        assert_eq!(bal(&ctx, &ctx.buyer) - buyer_before, 4_000);
        assert_eq!(bal(&ctx, &ctx.farmer) - farmer_before, 6_000);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Paid);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_open_dispute_twice_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);
        ctx.client.open_dispute(&id);
        ctx.client.open_dispute(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_resolve_without_dispute_rejected() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.resolve_dispute(&id, &10_000, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_dispute_split_must_conserve_total() {
        let ctx = setup();
        let id = funded(&ctx);
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 1));
        ctx.client.claim(&id);
        ctx.client.open_dispute(&id);
        ctx.client.resolve_dispute(&id, &5_000, &4_000);
    }

    // ── fee configuration ────────────────────────────────────────────────────

    #[test]
    fn test_admin_updates_platform_fee() {
        let ctx = setup();
        ctx.client.set_platform_fee_bps(&ctx.admin, &1_000u32);
        let (fee_bps, _) = ctx.client.get_fee_config();
        assert_eq!(fee_bps, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_non_admin_cannot_set_fee() {
        let ctx = setup();
        ctx.client.set_platform_fee_bps(&Address::generate(&ctx.env), &1_000u32);
    }

    // ── full lifecycle ───────────────────────────────────────────────────────

    #[test]
    fn test_full_buyer_protection_lifecycle() {
        let ctx = setup();

        // 1. Buyer funds the order — farmer cannot touch it.
        let id = funded(&ctx);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Funded);

        // 2. Credits verified + retired on-chain.
        ctx.client.confirm_retirement(&ctx.verifier, &id, &proof(&ctx.env, 3));

        // 3. Farmer claims; verification window opens.
        ctx.client.claim(&id);

        // 4. Window elapses with no clawback.
        ctx.env.ledger().set_timestamp(1_000 + VERIFICATION_PERIOD_SECS + 5);

        // 5. Permissionless payout releases net funds to the farmer.
        let paid = ctx.client.payout(&id);
        assert_eq!(paid, 9_350);
        assert_eq!(ctx.client.get_order(&id).unwrap().status, OrderStatus::Paid);
    fn buyer_can_recover_an_unverified_payment_after_the_deadline() {
        let (env, _, token, contract_id, _, client) = setup();
        let buyer = Address::generate(&env);
        let farmer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &500);

        client.fund(&buyer, &farmer, &token, &2, &credit(&env), &500, &10, &0);
        env.ledger().with_mut(|ledger| ledger.timestamp += 11);
        client.refund_unverified(&2);

        assert_eq!(token::Client::new(&env, &token).balance(&buyer), 500);
        assert_eq!(token::Client::new(&env, &token).balance(&contract_id), 0);
        assert_eq!(
            client.get_escrow(&2).unwrap().status,
            PaymentStatus::Refunded
        );
    }
}
