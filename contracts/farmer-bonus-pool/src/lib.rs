//! Farmer bonus pool — performance incentives (Issue #1417)
//!
//! 1% of every carbon credit sale is routed into a quarterly bonus pool. At the
//! end of each quarter the pool is shared between the farmers who beat their
//! carbon target, pro-rata to how far they exceeded it (tonnes above target).
//!
//! Flow:
//! 1. `initialize` wires the admin, the payment token and the marketplace that
//!    is allowed to report sales.
//! 2. `record_sale` is called by the marketplace for each sale; the 1% bonus
//!    contribution is pulled from the payer into the current quarter's pool.
//! 3. The admin (acting as the verification oracle) sets each farmer's standing
//!    target with `set_target` and reports verified sequestration per quarter
//!    with `record_performance`.
//! 4. Once a quarter has ended, `distribute` pays out the pool. Rounding dust,
//!    and the whole pool when nobody beat their target, rolls over into the
//!    quarter that is currently open so no contribution is ever stranded.

#![no_std]
// Soroban entry points must take `Env` and `Address` by value, and their return
// values are the contract ABI, so these two pedantic lints do not apply here.
#![allow(clippy::needless_pass_by_value, clippy::must_use_candidate)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

/// Share of every sale routed into the bonus pool, in basis points (1%).
pub const BONUS_BPS: i128 = 100;
/// Basis-point denominator.
pub const BPS_DENOMINATOR: i128 = 10_000;
/// Length of a bonus quarter: 90 days, in seconds.
pub const QUARTER_SECONDS: u64 = 90 * 24 * 60 * 60;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum BonusPoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    QuarterNotEnded = 5,
    AlreadyDistributed = 6,
    TargetNotSet = 7,
    InvalidQuarter = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub marketplace: Address,
    /// Ledger timestamp at which quarter 0 started.
    pub genesis: u64,
}

/// A farmer's verified result for one quarter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Performance {
    /// Target in force when the result was recorded, in tonnes CO₂-equivalent.
    pub target_tonnes: i128,
    /// Verified sequestration for the quarter, in tonnes CO₂-equivalent.
    pub achieved_tonnes: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionSummary {
    pub quarter: u32,
    /// Pool balance that was up for distribution.
    pub pool: i128,
    /// Amount actually paid out to farmers.
    pub distributed: i128,
    /// Amount carried into the currently open quarter.
    pub rolled_over: i128,
    /// Number of farmers who received a bonus.
    pub recipients: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    Target(Address),
    Pool(u32),
    Farmers(u32),
    Performance(u32, Address),
    Payout(u32, Address),
    Distributed(u32),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaleContribution {
    #[topic]
    pub quarter: u32,
    pub payer: Address,
    pub sale_amount: i128,
    pub contribution: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BonusPaid {
    #[topic]
    pub quarter: u32,
    #[topic]
    pub farmer: Address,
    pub amount: i128,
}

#[contract]
pub struct FarmerBonusPool;

#[contractimpl]
impl FarmerBonusPool {
    pub fn initialize(env: Env, admin: Address, token: Address, marketplace: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            fail(&env, BonusPoolError::AlreadyInitialized);
        }
        admin.require_auth();
        let config = Config {
            admin,
            token,
            marketplace,
            genesis: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Rotates the address allowed to report sales.
    pub fn set_marketplace(env: Env, marketplace: Address) {
        let mut config = load_config(&env);
        config.admin.require_auth();
        config.marketplace = marketplace;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Routes 1% of `sale_amount` from `payer` into the current quarter's pool
    /// and returns the contribution. Sales too small to yield a whole unit
    /// contribute nothing.
    pub fn record_sale(env: Env, payer: Address, sale_amount: i128) -> i128 {
        let config = load_config(&env);
        config.marketplace.require_auth();
        payer.require_auth();
        if sale_amount <= 0 {
            fail(&env, BonusPoolError::InvalidAmount);
        }

        let contribution = bonus_contribution(sale_amount);
        if contribution == 0 {
            return 0;
        }

        token::Client::new(&env, &config.token).transfer(
            &payer,
            env.current_contract_address(),
            &contribution,
        );
        let quarter = quarter_at(&config, env.ledger().timestamp());
        add_to_pool(&env, quarter, contribution);

        SaleContribution {
            quarter,
            payer,
            sale_amount,
            contribution,
        }
        .publish(&env);
        contribution
    }

    /// Sets the standing carbon target (tonnes CO₂-equivalent per quarter) for a farmer.
    pub fn set_target(env: Env, farmer: Address, target_tonnes: i128) {
        let config = load_config(&env);
        config.admin.require_auth();
        if target_tonnes <= 0 {
            fail(&env, BonusPoolError::InvalidAmount);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Target(farmer), &target_tonnes);
    }

    /// Records a farmer's verified sequestration for `quarter`, snapshotting the
    /// target in force. Re-recording before distribution overwrites the result.
    pub fn record_performance(env: Env, farmer: Address, quarter: u32, achieved_tonnes: i128) {
        let config = load_config(&env);
        config.admin.require_auth();
        if achieved_tonnes < 0 {
            fail(&env, BonusPoolError::InvalidAmount);
        }
        if quarter > quarter_at(&config, env.ledger().timestamp()) {
            fail(&env, BonusPoolError::InvalidQuarter);
        }
        if is_distributed(&env, quarter) {
            fail(&env, BonusPoolError::AlreadyDistributed);
        }
        let target_tonnes: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Target(farmer.clone()))
            .unwrap_or_else(|| fail(&env, BonusPoolError::TargetNotSet));

        let performance_key = DataKey::Performance(quarter, farmer.clone());
        if !env.storage().persistent().has(&performance_key) {
            let mut farmers = quarter_farmers(&env, quarter);
            farmers.push_back(farmer);
            env.storage()
                .persistent()
                .set(&DataKey::Farmers(quarter), &farmers);
        }
        env.storage().persistent().set(
            &performance_key,
            &Performance {
                target_tonnes,
                achieved_tonnes,
            },
        );
    }

    /// Pays out an ended quarter's pool to every farmer who beat their target,
    /// pro-rata to tonnes above target. Dust — or the whole pool when nobody
    /// qualified — rolls over into the quarter that is currently open.
    pub fn distribute(env: Env, quarter: u32) -> DistributionSummary {
        let config = load_config(&env);
        config.admin.require_auth();
        let current = quarter_at(&config, env.ledger().timestamp());
        if quarter >= current {
            fail(&env, BonusPoolError::QuarterNotEnded);
        }
        if is_distributed(&env, quarter) {
            fail(&env, BonusPoolError::AlreadyDistributed);
        }

        let pool = quarter_pool(&env, quarter);
        let farmers = quarter_farmers(&env, quarter);
        let mut total_excess: i128 = 0;
        for farmer in farmers.iter() {
            total_excess += excess_tonnes(&performance_of(&env, quarter, &farmer));
        }

        let mut distributed: i128 = 0;
        let mut recipients: u32 = 0;
        if pool > 0 && total_excess > 0 {
            let token = token::Client::new(&env, &config.token);
            for farmer in farmers.iter() {
                let excess = excess_tonnes(&performance_of(&env, quarter, &farmer));
                let amount = pool * excess / total_excess;
                if amount == 0 {
                    continue;
                }
                token.transfer(&env.current_contract_address(), &farmer, &amount);
                env.storage()
                    .persistent()
                    .set(&DataKey::Payout(quarter, farmer.clone()), &amount);
                BonusPaid {
                    quarter,
                    farmer,
                    amount,
                }
                .publish(&env);
                distributed += amount;
                recipients += 1;
            }
        }

        let rolled_over = pool - distributed;
        env.storage()
            .persistent()
            .set(&DataKey::Pool(quarter), &0i128);
        if rolled_over > 0 {
            add_to_pool(&env, current, rolled_over);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Distributed(quarter), &true);

        DistributionSummary {
            quarter,
            pool,
            distributed,
            rolled_over,
            recipients,
        }
    }

    pub fn config(env: Env) -> Config {
        load_config(&env)
    }

    pub fn current_quarter(env: Env) -> u32 {
        quarter_at(&load_config(&env), env.ledger().timestamp())
    }

    pub fn quarter_pool(env: Env, quarter: u32) -> i128 {
        quarter_pool(&env, quarter)
    }

    pub fn target(env: Env, farmer: Address) -> Option<i128> {
        env.storage().persistent().get(&DataKey::Target(farmer))
    }

    pub fn performance(env: Env, quarter: u32, farmer: Address) -> Option<Performance> {
        env.storage()
            .persistent()
            .get(&DataKey::Performance(quarter, farmer))
    }

    pub fn payout(env: Env, quarter: u32, farmer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Payout(quarter, farmer))
            .unwrap_or(0)
    }

    pub fn is_distributed(env: Env, quarter: u32) -> bool {
        is_distributed(&env, quarter)
    }
}

/// 1% of a sale, rounded down.
#[must_use]
pub fn bonus_contribution(sale_amount: i128) -> i128 {
    sale_amount * BONUS_BPS / BPS_DENOMINATOR
}

fn excess_tonnes(performance: &Performance) -> i128 {
    (performance.achieved_tonnes - performance.target_tonnes).max(0)
}

fn quarter_at(config: &Config, timestamp: u64) -> u32 {
    let elapsed = timestamp.saturating_sub(config.genesis) / QUARTER_SECONDS;
    u32::try_from(elapsed).unwrap_or(u32::MAX)
}

fn load_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| fail(env, BonusPoolError::NotInitialized))
}

fn quarter_pool(env: &Env, quarter: u32) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Pool(quarter))
        .unwrap_or(0)
}

fn add_to_pool(env: &Env, quarter: u32, amount: i128) {
    let balance = quarter_pool(env, quarter) + amount;
    env.storage()
        .persistent()
        .set(&DataKey::Pool(quarter), &balance);
}

fn quarter_farmers(env: &Env, quarter: u32) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Farmers(quarter))
        .unwrap_or_else(|| Vec::new(env))
}

fn performance_of(env: &Env, quarter: u32, farmer: &Address) -> Performance {
    env.storage()
        .persistent()
        .get(&DataKey::Performance(quarter, farmer.clone()))
        .unwrap_or_else(|| fail(env, BonusPoolError::TargetNotSet))
}

fn is_distributed(env: &Env, quarter: u32) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Distributed(quarter))
        .unwrap_or(false)
}

fn fail(env: &Env, error: BonusPoolError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

#[cfg(test)]
mod test;
