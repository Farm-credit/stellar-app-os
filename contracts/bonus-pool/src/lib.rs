#![no_std]

//! Farmer Bonus Pool — Closes #1355
//!
//! Performance incentives for farmers who exceed their carbon targets.
//! 1% of every marketplace sale is routed into this pool, and the balance
//! is distributed to high-performing farmers on a quarterly schedule.
//!
//! # Flow
//!   1. Admin calls `initialize(admin, payment_token, bonus_bps)`.
//!      `bonus_bps` defaults to 100 (1.00% of sales).
//!   2. The platform routes each sale's bonus share to the pool via
//!      `contribute(payer, sale_id, amount)`. Funds are escrowed in the
//!      contract and attributed to the running pool balance.
//!   3. Admin records farmer performance with `record_performance`
//!      (carbon tonnes exceeded vs. target per quarter). Only farmers whose
//!      performance exceeds their target accrue bonus points.
//!   4. Each quarter the admin calls `open_quarter(period)` then
//!      `distribute(period, farmer, amount)` once per farmer. Allocations
//!      are capped so the sum of payouts can never exceed the pool balance
//!      for that quarter; unallocated funds roll forward.
//!   5. Farmers call `claim(farmer, period)` to receive their allocated
//!      tokens.
//!
//! # Safety
//! - Reentrancy: `claim` and `distribute` mark the ledger entry *before*
//!   the cross-contract token transfer (checks-effects-interactions).
//! - Integer overflow: all arithmetic checked (release profile keeps
//!   `overflow-checks = true`).
//! - Double distribution / double claim is impossible: ledger entries are
//!   one-per-(farmer, period) and transition `Allocated → Claimed` only.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum BonusPoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InvalidBps = 4,
    InvalidPeriod = 5,
    QuarterNotOpen = 6,
    QuarterAlreadyClosed = 7,
    AlreadyDistributed = 8,
    NothingToClaim = 9,
    FarmerNotFound = 10,
    PoolBalanceExceeded = 11,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// A farmer's measured performance for one quarter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Performance {
    /// Stellar address of the farmer.
    pub farmer: Address,
    /// Quarter period id, e.g. 20264 for Q4 2026 (year * 10 + quarter).
    pub period: u32,
    /// Carbon tonnes sequestered (grams × 10⁶ to stay in i128 integer space).
    pub carbon_achieved_tonnes_scaled: i128,
    /// The carbon target the farmer was expected to hit (same scaling).
    pub carbon_target_tonnes_scaled: i128,
    /// Whether the farmer exceeded the target (derived, stored for reads).
    pub exceeded: bool,
    recorded_at: u64,
}

/// Per-farmer, per-quarter payout ledger entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LedgerEntry {
    pub farmer: Address,
    pub period: u32,
    /// Bonus tokens allocated for this quarter.
    pub allocated: i128,
    /// True once the farmer has claimed.
    pub claimed: bool,
    claimed_at: u64,
}

/// Snapshot of one quarterly distribution cycle.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuarterInfo {
    pub period: u32,
    /// Pool balance available when the quarter was opened.
    pub pool_at_open: i128,
    /// Total allocated to farmers for this quarter.
    pub total_allocated: i128,
    /// Whether the admin closed the quarter (no more distributions).
    pub closed: bool,
    opened_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    PaymentToken,
    /// Basis points of each sale routed to the pool (100 = 1%).
    BonusBps,
    /// Total tokens currently held by the pool (unallocated).
    PoolBalance,
    /// Total contributions received since inception.
    TotalContributions,
    /// Sale id → true, prevents double-routing the same sale.
    ProcessedSale(u64),
    /// (farmer, period) → Performance
    Performance(Address, u32),
    /// (farmer, period) → LedgerEntry
    Ledger(Address, u32),
    /// period → QuarterInfo
    Quarter(u32),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct BonusPool;

#[contractimpl]
impl BonusPool {
    /// One-time setup.
    ///
    /// * `bonus_bps` — share of each sale routed here, in basis points
    ///   (100 = 1%). Issue #1355 specifies 1%; any value 1..=10_000 is
    ///   accepted so the platform can tune it later.
    pub fn initialize(env: Env, admin: Address, payment_token: Address, bonus_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, BonusPoolError::AlreadyInitialized);
        }
        if bonus_bps == 0 || bonus_bps > 10_000 {
            panic_with_error!(&env, BonusPoolError::InvalidBps);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::BonusBps, &bonus_bps);
        env.storage().instance().set(&DataKey::PoolBalance, &0i128);
        env.storage().instance().set(&DataKey::TotalContributions, &0i128);

        env.events().publish(
            (symbol_short!("init"), symbol_short!("pool")),
            (admin, payment_token, bonus_bps),
        );
    }

    // ── Reads ────────────────────────────────────────────────

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::NotInitialized))
    }

    pub fn get_payment_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::PaymentToken)
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::NotInitialized))
    }

    /// Basis points of each sale routed to the pool.
    pub fn get_bonus_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::BonusBps)
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::NotInitialized))
    }

    /// Tokens currently held and unallocated.
    pub fn get_pool_balance(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::PoolBalance).unwrap_or(0i128)
    }

    /// Lifetime contributions routed into the pool.
    pub fn get_total_contributions(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalContributions)
            .unwrap_or(0i128)
    }

    /// The bonus share (in token units) the platform should route to the
    /// pool for a sale of `sale_amount`. Convenience helper for the backend.
    pub fn bonus_share_for_sale(env: Env, sale_amount: i128) -> i128 {
        let bps = Self::get_bonus_bps(env);
        (sale_amount * i128::from(bps)) / 10_000
    }

    pub fn get_performance(env: Env, farmer: Address, period: u32) -> Option<Performance> {
        env.storage().persistent().get(&DataKey::Performance(farmer, period))
    }

    pub fn get_ledger(env: Env, farmer: Address, period: u32) -> Option<LedgerEntry> {
        env.storage().persistent().get(&DataKey::Ledger(farmer, period))
    }

    pub fn get_quarter(env: Env, period: u32) -> Option<QuarterInfo> {
        env.storage().persistent().get(&DataKey::Quarter(period))
    }

    // ── Contributions ────────────────────────────────────────

    /// Route the bonus share of a completed sale into the pool.
    ///
    /// The caller is the platform fee-payer (or the marketplace contract
    /// itself). The caller pre-approves the transfer; the pool pulls
    /// `amount` tokens from `payer` into escrow.
    ///
    /// `sale_id` must be unique per sale — replaying a sale id reverts.
    pub fn contribute(env: Env, payer: Address, sale_id: u64, amount: i128) {
        payer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, BonusPoolError::InvalidAmount);
        }
        if env.storage().persistent().has(&DataKey::ProcessedSale(sale_id)) {
            panic_with_error!(&env, BonusPoolError::InvalidPeriod);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::PaymentToken)
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::NotInitialized));

        // Effects before interactions: mark the sale, bump balances, then
        // pull the tokens.
        env.storage().persistent().set(&DataKey::ProcessedSale(sale_id), &true);
        let balance: i128 = env.storage().instance().get(&DataKey::PoolBalance).unwrap_or(0i128);
        env.storage().instance().set(&DataKey::PoolBalance, &(balance + amount));

        let total: i128 =
            env.storage().instance().get(&DataKey::TotalContributions).unwrap_or(0i128);
        env.storage().instance().set(&DataKey::TotalContributions, &(total + amount));

        soroban_sdk::token::Client::new(&env, &token).transfer(&payer, &env.current_contract_address(), &amount);

        env.events().publish(
            (symbol_short!("pool"), symbol_short!("fund")),
            (payer, sale_id, amount),
        );
    }

    // ── Performance tracking ─────────────────────────────────

    /// Admin-only: record a farmer's quarterly carbon performance.
    /// Farmers only accrue eligibility when `achieved > target`.
    pub fn record_performance(
        env: Env,
        farmer: Address,
        period: u32,
        carbon_achieved_tonnes_scaled: i128,
        carbon_target_tonnes_scaled: i128,
    ) {
        Self::require_admin(&env);

        if period == 0 {
            panic_with_error!(&env, BonusPoolError::InvalidPeriod);
        }
        if carbon_achieved_tonnes_scaled < 0 || carbon_target_tonnes_scaled <= 0 {
            panic_with_error!(&env, BonusPoolError::InvalidAmount);
        }
        if env.storage().persistent().has(&DataKey::Performance(farmer.clone(), period)) {
            panic_with_error!(&env, BonusPoolError::AlreadyDistributed);
        }

        let perf = Performance {
            farmer: farmer.clone(),
            period,
            carbon_achieved_tonnes_scaled,
            carbon_target_tonnes_scaled,
            exceeded: carbon_achieved_tonnes_scaled > carbon_target_tonnes_scaled,
            recorded_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Performance(farmer.clone(), period), &perf);

        env.events().publish(
            (symbol_short!("perf"), symbol_short!("record")),
            (farmer, period, carbon_achieved_tonnes_scaled, carbon_target_tonnes_scaled),
        );
    }

    // ── Quarterly distribution ───────────────────────────────

    /// Admin-only: open a distribution quarter, snapshotting the pool balance.
    /// All allocations for `period` are capped at this snapshot.
    pub fn open_quarter(env: Env, period: u32) {
        Self::require_admin(&env);

        if period == 0 {
            panic_with_error!(&env, BonusPoolError::InvalidPeriod);
        }
        if env.storage().persistent().has(&DataKey::Quarter(period)) {
            panic_with_error!(&env, BonusPoolError::QuarterAlreadyClosed);
        }

        let pool_at_open: i128 =
            env.storage().instance().get(&DataKey::PoolBalance).unwrap_or(0i128);
        let info = QuarterInfo {
            period,
            pool_at_open,
            total_allocated: 0i128,
            closed: false,
            opened_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Quarter(period), &info);

        env.events().publish(
            (symbol_short!("quarter"), symbol_short!("open")),
            (period, pool_at_open),
        );
    }

    /// Admin-only: allocate `amount` of the quarter's pool to `farmer`.
    /// The farmer must have recorded performance exceeding their target for
    /// that period. Sum of allocations never exceeds the pool snapshot.
    pub fn distribute(env: Env, period: u32, farmer: Address, amount: i128) {
        Self::require_admin(&env);

        if amount <= 0 {
            panic_with_error!(&env, BonusPoolError::InvalidAmount);
        }

        let mut quarter: QuarterInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Quarter(period))
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::QuarterNotOpen));

        if quarter.closed {
            panic_with_error!(&env, BonusPoolError::QuarterAlreadyClosed);
        }
        if env.storage().persistent().has(&DataKey::Ledger(farmer.clone(), period)) {
            panic_with_error!(&env, BonusPoolError::AlreadyDistributed);
        }

        // Farmer must be a recorded high performer for this quarter.
        let perf: Performance = env
            .storage()
            .persistent()
            .get(&DataKey::Performance(farmer.clone(), period))
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::FarmerNotFound));
        if !perf.exceeded {
            panic_with_error!(&env, BonusPoolError::FarmerNotFound);
        }

        // Hard cap: total allocations ≤ pool snapshot for the quarter.
        let new_total = quarter.total_allocated + amount;
        if new_total > quarter.pool_at_open {
            panic_with_error!(&env, BonusPoolError::PoolBalanceExceeded);
        }
        quarter.total_allocated = new_total;
        env.storage().persistent().set(&DataKey::Quarter(period), &quarter);

        // Deduct from the live pool balance at allocation time so the
        // remainder rolls into future quarters.
        let balance: i128 = env.storage().instance().get(&DataKey::PoolBalance).unwrap_or(0i128);
        env.storage().instance().set(&DataKey::PoolBalance, &(balance - amount));

        let entry = LedgerEntry {
            farmer: farmer.clone(),
            period,
            allocated: amount,
            claimed: false,
            claimed_at: 0u64,
        };
        env.storage().persistent().set(&DataKey::Ledger(farmer.clone(), period), &entry);

        env.events().publish(
            (symbol_short!("bonus"), symbol_short!("alloc")),
            (period, farmer, amount),
        );
    }

    /// Admin-only: close the quarter. Unallocated funds roll forward.
    pub fn close_quarter(env: Env, period: u32) {
        Self::require_admin(&env);

        let mut quarter: QuarterInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Quarter(period))
            .unwrap_or_else(|| panic_with_error!(&env, BonusPoolError::QuarterNotOpen));

        if quarter.closed {
            panic_with_error!(&env, BonusPoolError::QuarterAlreadyClosed);
        }
        quarter.closed = true;
        env.storage().persistent().set(&DataKey::Quarter(period), &quarter);

        env.events().publish(
            (symbol_short!("quarter"), symbol_short!("close")),
            (period, quarter.total_allocated),
        );
    }

    // ── Claims ───────────────────────────────────────────────

    /// Farmer-only: claim the tokens allocated for `period`.
    /// The farmer must sign (caller-auth). There is no implicit msg.sender
    /// in Soroban, so the farmer address is passed and authenticated.
    pub fn claim(env: Env, farmer: Address, period: u32) {
        farmer.require_auth();
        Self::settle_claim(&env, farmer, period);
    }

    /// Convenience read: has this farmer claimed for `period`?
    pub fn has_claimed(env: Env, farmer: Address, period: u32) -> bool {
        let entry: Option<LedgerEntry> =
            env.storage().persistent().get(&DataKey::Ledger(farmer, period));
        entry.map(|e| e.claimed).unwrap_or(false)
    }

    // ── Internal ─────────────────────────────────────────────

    fn require_admin(env: &Env) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, BonusPoolError::NotInitialized));
        admin.require_auth();
        admin
    }

    fn settle_claim(env: &Env, farmer: Address, period: u32) {
        let mut entry: LedgerEntry = env
            .storage()
            .persistent()
            .get(&DataKey::Ledger(farmer.clone(), period))
            .unwrap_or_else(|| panic_with_error!(env, BonusPoolError::NothingToClaim));

        if entry.claimed {
            panic_with_error!(env, BonusPoolError::AlreadyDistributed);
        }

        // Effects before interactions.
        entry.claimed = true;
        entry.claimed_at = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Ledger(farmer.clone(), period), &entry);

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::PaymentToken)
            .unwrap_or_else(|| panic_with_error!(env, BonusPoolError::NotInitialized));

        soroban_sdk::token::Client::new(env, &token).transfer(
            &env.current_contract_address(),
            &farmer,
            &entry.allocated,
        );

        env.events().publish(
            (symbol_short!("bonus"), symbol_short!("claim")),
            (period, farmer, entry.allocated),
        );
    }
}

#[cfg(test)]
mod test;

