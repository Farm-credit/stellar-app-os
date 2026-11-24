#![no_std]

//! Carbon DEX — liquidity pool contract.
//!
//! Liquidity providers deposit a token into a per-token pool and are minted
//! pool shares proportional to their contribution; withdrawing burns shares
//! and returns the proportional underlying balance. Pool shares are the
//! liquidity provider's "receipt" of ownership in the pool.
//!
//! Entry points intentionally match the `AmmInterface` shape already relied
//! on by `tree-escrow` / `escrow-milestone` (`deposit(env, from, token,
//! amount) -> i128`, `withdraw(env, from, token, share_amount) -> i128`), so
//! this contract can be deployed as a real implementation in place of their
//! `MockAmm` test double.
//!
//! ## Roles
//! - **admin**: set at `initialize`, can `pause` / `unpause` the contract.
//! - **liquidity provider**: any address calling `deposit` / `withdraw`.
//!
//! ## Share accounting
//! A pool's first deposit permanently locks `MINIMUM_LIQUIDITY` shares that
//! are never credited to any provider's position (mirrors Uniswap V2's
//! send-to-burn-address convention). This keeps `total_shares` from ever
//! being fully drained back to zero and raises the cost of a first-depositor
//! share-price manipulation attack.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env,
};

// ── Errors ──────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ContractPaused = 4,
    AlreadyPaused = 5,
    NotPaused = 6,
    AmountMustBePositive = 7,
    SharesMustBePositive = 8,
    PoolNotFound = 9,
    InsufficientShares = 10,
    ZeroSharesMinted = 11,
    WithdrawalAmountTooSmall = 12,
    DepositBelowMinimumLiquidity = 13,
    ArithmeticError = 14,
    PairAlreadyExists = 15,
    PairNotFound = 16,
    IdenticalTokens = 17,
    InvalidFee = 18,
    InsufficientLiquidity = 19,
    InsufficientOutput = 20,
    SlippageExceeded = 21,
    InsufficientLpShares = 22,
    FlashLoanGuardActive = 23,
    FlashLoanManipulationDetected = 24,
    InvalidGuardConfiguration = 25,
    SameBlockManipulationRejected = 26,
    PriceDivergenceExceeded = 27,
    ObservationWindowTooShort = 28,
}

// ── Types ───────────────────────────────────────────────────────────────────

/// Shares permanently locked on a pool's first deposit and never credited to
/// any provider's position — see module docs.
const MINIMUM_LIQUIDITY: i128 = 1_000;

/// TTL bump: extend when remaining TTL drops below this many ledgers.
const BUMP_THRESHOLD: u32 = 100_000;
/// TTL bump: extend to this many ledgers out.
const BUMP_AMOUNT: u32 = 500_000;

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    /// Per-token pool state.
    Pool(Address),
    /// (token, provider) -> share balance.
    Position(Address, Address),
    /// Ordered token pair state. The pair order is fixed at creation.
    Pair(Address, Address),
    /// (token_a, token_b, provider) -> LP shares.
    PairPosition(Address, Address, Address),
    /// (token_a, token_b) -> flash loan guard configuration.
    FlashLoanGuard(Address, Address),
    /// (token_a, token_b) -> flash loan guard state (snapshots, timestamps, cumulative prices).
    FlashLoanState(Address, Address),
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolState {
    pub token: Address,
    pub total_shares: i128,
    pub total_deposits: i128,
}

/// Reserves and LP share supply for an ordered constant-product pair.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PairState {
    pub token_a: Address,
    pub token_b: Address,
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_lp_shares: i128,
    pub fee_bps: u32,
}

const PAIR_MINIMUM_LIQUIDITY: i128 = 1_000;
const BPS_DENOMINATOR: i128 = 10_000;
/// Scaling factor for fixed-point cumulative TWAP pricing (1e12).
const PRICE_PRECISION: i128 = 1_000_000_000_000;

/// Configuration for flash loan protection guard on an AMM pair.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FlashLoanGuardConfig {
    /// Whether flash loan protection is active for this pair.
    pub enabled: bool,
    /// Maximum allowed basis points price deviation within the observation/cooldown window (e.g. 500 = 5%).
    pub max_divergence_bps: u32,
    /// Minimum ledger sequence delta required before allowing new guarded price reads or rapid repricing (default: 1).
    pub cooldown_ledgers: u32,
    /// When strict mode is enabled, guarded queries immediately reject same-block swaps without allowing any divergence tolerance.
    pub strict_mode: bool,
}

/// Historical block-start reserves and TWAP tracking for flash loan protection.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FlashLoanGuardState {
    /// Ledger sequence when the last swap occurred.
    pub last_swap_ledger: u32,
    /// Timestamp when the last swap occurred.
    pub last_swap_timestamp: u64,
    /// Snapshot of reserve A at the beginning of the current block / after previous block close.
    pub block_start_reserve_a: i128,
    /// Snapshot of reserve B at the beginning of the current block / after previous block close.
    pub block_start_reserve_b: i128,
    /// Cumulative price of token A scaled by PRICE_PRECISION.
    pub cumulative_price_a: i128,
    /// Cumulative price of token B scaled by PRICE_PRECISION.
    pub cumulative_price_b: i128,
    /// Count of swaps executed within the current block.
    pub total_swaps_in_block: u32,
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonDexContract;

#[contractimpl]
impl CarbonDexContract {
    /// One-time setup. `admin` is the only address allowed to `pause` / `unpause`.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        Self::extend_instance_ttl(&env);
    }

    /// Deposit `amount` of `token` into its pool, minting proportional shares.
    ///
    /// Returns the number of shares minted (credited to `from`'s position).
    /// A pool's first deposit must exceed `MINIMUM_LIQUIDITY`, a portion of
    /// which is permanently locked out of any position (see module docs).
    pub fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128 {
        Self::extend_instance_ttl(&env);
        Self::assert_not_paused(&env);
        from.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::AmountMustBePositive);
        }

        let pool_key = DataKey::Pool(token.clone());
        let mut pool: PoolState = env
            .storage()
            .persistent()
            .get(&pool_key)
            .unwrap_or(PoolState {
                token: token.clone(),
                total_shares: 0,
                total_deposits: 0,
            });

        let is_first_deposit = pool.total_shares == 0;

        let shares_minted: i128 = if is_first_deposit {
            if amount <= MINIMUM_LIQUIDITY {
                panic_with_error!(&env, Error::DepositBelowMinimumLiquidity);
            }
            amount - MINIMUM_LIQUIDITY
        } else {
            amount
                .checked_mul(pool.total_shares)
                .and_then(|v| v.checked_div(pool.total_deposits))
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError))
        };

        if shares_minted <= 0 {
            panic_with_error!(&env, Error::ZeroSharesMinted);
        }

        let new_total_deposits = pool
            .total_deposits
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        let shares_added_to_pool = if is_first_deposit {
            shares_minted
                .checked_add(MINIMUM_LIQUIDITY)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError))
        } else {
            shares_minted
        };

        let new_total_shares = pool
            .total_shares
            .checked_add(shares_added_to_pool)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        token::Client::new(&env, &token).transfer(&from, &env.current_contract_address(), &amount);

        pool.total_deposits = new_total_deposits;
        pool.total_shares = new_total_shares;

        env.storage().persistent().set(&pool_key, &pool);
        env.storage()
            .persistent()
            .extend_ttl(&pool_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        let position_key = DataKey::Position(token.clone(), from.clone());
        let existing_shares: i128 = env.storage().persistent().get(&position_key).unwrap_or(0);
        let new_shares = existing_shares
            .checked_add(shares_minted)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        env.storage().persistent().set(&position_key, &new_shares);
        env.storage()
            .persistent()
            .extend_ttl(&position_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("deposit"), from),
            (token, amount, shares_minted),
        );

        shares_minted
    }

    /// Burn `share_amount` of `from`'s shares in `token`'s pool, returning the
    /// proportional underlying amount withdrawn.
    pub fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128 {
        Self::extend_instance_ttl(&env);
        Self::assert_not_paused(&env);
        from.require_auth();

        if share_amount <= 0 {
            panic_with_error!(&env, Error::SharesMustBePositive);
        }

        let pool_key = DataKey::Pool(token.clone());
        let mut pool: PoolState = env
            .storage()
            .persistent()
            .get(&pool_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PoolNotFound));

        let position_key = DataKey::Position(token.clone(), from.clone());
        let existing_shares: i128 = env.storage().persistent().get(&position_key).unwrap_or(0);

        if share_amount > existing_shares {
            panic_with_error!(&env, Error::InsufficientShares);
        }

        let amount_out = share_amount
            .checked_mul(pool.total_deposits)
            .and_then(|v| v.checked_div(pool.total_shares))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        if amount_out <= 0 {
            panic_with_error!(&env, Error::WithdrawalAmountTooSmall);
        }

        pool.total_shares = pool
            .total_shares
            .checked_sub(share_amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        pool.total_deposits = pool
            .total_deposits
            .checked_sub(amount_out)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        env.storage().persistent().set(&pool_key, &pool);
        env.storage()
            .persistent()
            .extend_ttl(&pool_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        let remaining_shares = existing_shares
            .checked_sub(share_amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        if remaining_shares == 0 {
            env.storage().persistent().remove(&position_key);
        } else {
            env.storage()
                .persistent()
                .set(&position_key, &remaining_shares);
            env.storage()
                .persistent()
                .extend_ttl(&position_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        }

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &from,
            &amount_out,
        );

        env.events().publish(
            (symbol_short!("withdraw"), from),
            (token, share_amount, amount_out),
        );

        amount_out
    }

    /// Admin-only: reject `deposit` / `withdraw` while paused.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if paused {
            panic_with_error!(&env, Error::AlreadyPaused);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
    }

    /// Admin-only: resume `deposit` / `withdraw`.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if !paused {
            panic_with_error!(&env, Error::NotPaused);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
    }

    /// Read a pool's state. Returns `None` if nothing has ever been deposited.
    pub fn get_pool(env: Env, token: Address) -> Option<PoolState> {
        env.storage().persistent().get(&DataKey::Pool(token))
    }

    /// Read a provider's share balance in a pool. Returns `0` if they hold none.
    pub fn get_position(env: Env, token: Address, provider: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Position(token, provider))
            .unwrap_or(0)
    }

    /// Create an ordered token pair. Only the initialized admin may create pairs.
    /// `fee_bps` is the swap fee in basis points and must not exceed 100%.
    pub fn create_pair(env: Env, token_a: Address, token_b: Address, fee_bps: u32) {
        Self::extend_instance_ttl(&env);
        Self::require_admin(&env);
        if token_a == token_b {
            panic_with_error!(&env, Error::IdenticalTokens);
        }
        if fee_bps as i128 >= BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidFee);
        }
        let key = DataKey::Pair(token_a.clone(), token_b.clone());
        if env.storage().persistent().has(&key)
            || env
                .storage()
                .persistent()
                .has(&DataKey::Pair(token_b.clone(), token_a.clone()))
        {
            panic_with_error!(&env, Error::PairAlreadyExists);
        }
        let state = PairState {
            token_a: token_a.clone(),
            token_b: token_b.clone(),
            reserve_a: 0,
            reserve_b: 0,
            total_lp_shares: 0,
            fee_bps,
        };
        env.storage().persistent().set(&key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);

        // Initialize flash loan protection guard with safe defaults
        let default_config = FlashLoanGuardConfig {
            enabled: true,
            max_divergence_bps: 500, // 5% max allowed single-block divergence
            cooldown_ledgers: 1,     // Require at least 1 ledger transition
            strict_mode: false,
        };
        let guard_config_key = DataKey::FlashLoanGuard(token_a.clone(), token_b.clone());
        env.storage()
            .persistent()
            .set(&guard_config_key, &default_config);
        env.storage()
            .persistent()
            .extend_ttl(&guard_config_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        let initial_guard_state = FlashLoanGuardState {
            last_swap_ledger: env.ledger().sequence(),
            last_swap_timestamp: env.ledger().timestamp(),
            block_start_reserve_a: 0,
            block_start_reserve_b: 0,
            cumulative_price_a: 0,
            cumulative_price_b: 0,
            total_swaps_in_block: 0,
        };
        let guard_state_key = DataKey::FlashLoanState(token_a, token_b);
        env.storage()
            .persistent()
            .set(&guard_state_key, &initial_guard_state);
        env.storage()
            .persistent()
            .extend_ttl(&guard_state_key, BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    /// Add both assets to a pair and mint LP shares to `from`.
    pub fn add_liquidity(
        env: Env,
        from: Address,
        token_a: Address,
        token_b: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        Self::extend_instance_ttl(&env);
        Self::assert_not_paused(&env);
        from.require_auth();
        if amount_a <= 0 || amount_b <= 0 {
            panic_with_error!(&env, Error::AmountMustBePositive);
        }
        let key = DataKey::Pair(token_a.clone(), token_b.clone());
        let mut pair: PairState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));
        let shares = if pair.total_lp_shares == 0 {
            let product = amount_a
                .checked_mul(amount_b)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
            let root = Self::integer_sqrt(product);
            if root <= PAIR_MINIMUM_LIQUIDITY {
                panic_with_error!(&env, Error::DepositBelowMinimumLiquidity);
            }
            root - PAIR_MINIMUM_LIQUIDITY
        } else {
            let shares_a = amount_a
                .checked_mul(pair.total_lp_shares)
                .and_then(|v| v.checked_div(pair.reserve_a))
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
            let shares_b = amount_b
                .checked_mul(pair.total_lp_shares)
                .and_then(|v| v.checked_div(pair.reserve_b))
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
            shares_a.min(shares_b)
        };
        if shares <= 0 {
            panic_with_error!(&env, Error::ZeroSharesMinted);
        }
        token::Client::new(&env, &token_a).transfer(
            &from,
            &env.current_contract_address(),
            &amount_a,
        );
        token::Client::new(&env, &token_b).transfer(
            &from,
            &env.current_contract_address(),
            &amount_b,
        );
        pair.reserve_a = pair
            .reserve_a
            .checked_add(amount_a)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        pair.reserve_b = pair
            .reserve_b
            .checked_add(amount_b)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        pair.total_lp_shares = pair
            .total_lp_shares
            .checked_add(shares)
            .and_then(|v| {
                v.checked_add(if pair.total_lp_shares == 0 {
                    PAIR_MINIMUM_LIQUIDITY
                } else {
                    0
                })
            })
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        env.storage().persistent().set(&key, &pair);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);

        // If this is initial liquidity, initialize block_start_reserves for the guard
        if pair.reserve_a == amount_a && pair.reserve_b == amount_b {
            let guard_state_key = DataKey::FlashLoanState(token_a.clone(), token_b.clone());
            let mut guard_state: FlashLoanGuardState = env
                .storage()
                .persistent()
                .get(&guard_state_key)
                .unwrap_or(FlashLoanGuardState {
                    last_swap_ledger: env.ledger().sequence(),
                    last_swap_timestamp: env.ledger().timestamp(),
                    block_start_reserve_a: amount_a,
                    block_start_reserve_b: amount_b,
                    cumulative_price_a: 0,
                    cumulative_price_b: 0,
                    total_swaps_in_block: 0,
                });
            if guard_state.block_start_reserve_a == 0 && guard_state.block_start_reserve_b == 0 {
                guard_state.block_start_reserve_a = amount_a;
                guard_state.block_start_reserve_b = amount_b;
                guard_state.last_swap_ledger = env.ledger().sequence();
                guard_state.last_swap_timestamp = env.ledger().timestamp();
                env.storage()
                    .persistent()
                    .set(&guard_state_key, &guard_state);
                env.storage().persistent().extend_ttl(
                    &guard_state_key,
                    BUMP_THRESHOLD,
                    BUMP_AMOUNT,
                );
            }
        }
        let position_key = DataKey::PairPosition(token_a.clone(), token_b.clone(), from.clone());
        let current: i128 = env.storage().persistent().get(&position_key).unwrap_or(0);
        env.storage().persistent().set(
            &position_key,
            &current
                .checked_add(shares)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError)),
        );
        env.storage()
            .persistent()
            .extend_ttl(&position_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.events().publish(
            (symbol_short!("liq_add"), from),
            (token_a, token_b, amount_a, amount_b, shares),
        );
        shares
    }

    /// Burn LP shares and return the provider's proportional reserves.
    pub fn remove_liquidity(
        env: Env,
        from: Address,
        token_a: Address,
        token_b: Address,
        shares: i128,
    ) -> (i128, i128) {
        Self::extend_instance_ttl(&env);
        Self::assert_not_paused(&env);
        from.require_auth();
        if shares <= 0 {
            panic_with_error!(&env, Error::SharesMustBePositive);
        }
        let key = DataKey::Pair(token_a.clone(), token_b.clone());
        let mut pair: PairState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));
        let position_key = DataKey::PairPosition(token_a.clone(), token_b.clone(), from.clone());
        let owned: i128 = env.storage().persistent().get(&position_key).unwrap_or(0);
        if shares > owned {
            panic_with_error!(&env, Error::InsufficientLpShares);
        }
        let amount_a = shares
            .checked_mul(pair.reserve_a)
            .and_then(|v| v.checked_div(pair.total_lp_shares))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        let amount_b = shares
            .checked_mul(pair.reserve_b)
            .and_then(|v| v.checked_div(pair.total_lp_shares))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        if amount_a <= 0 || amount_b <= 0 {
            panic_with_error!(&env, Error::WithdrawalAmountTooSmall);
        }
        pair.reserve_a -= amount_a;
        pair.reserve_b -= amount_b;
        pair.total_lp_shares -= shares;
        env.storage().persistent().set(&key, &pair);
        let remaining = owned - shares;
        if remaining == 0 {
            env.storage().persistent().remove(&position_key);
        } else {
            env.storage().persistent().set(&position_key, &remaining);
        }
        token::Client::new(&env, &token_a).transfer(
            &env.current_contract_address(),
            &from,
            &amount_a,
        );
        token::Client::new(&env, &token_b).transfer(
            &env.current_contract_address(),
            &from,
            &amount_b,
        );
        env.events().publish(
            (symbol_short!("liq_rm"), from),
            (token_a, token_b, amount_a, amount_b, shares),
        );
        (amount_a, amount_b)
    }

    /// Calculate the output amount for a swap without changing state.
    pub fn quote_swap(env: Env, token_a: Address, token_b: Address, amount_in: i128) -> i128 {
        let pair: PairState = env
            .storage()
            .persistent()
            .get(&DataKey::Pair(token_a.clone(), token_b.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));
        Self::swap_output(&env, &pair, amount_in, true)
    }

    /// Swap `token_a` for `token_b` using the pair's xy=k invariant.
    pub fn swap(
        env: Env,
        from: Address,
        token_a: Address,
        token_b: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> i128 {
        Self::extend_instance_ttl(&env);
        Self::assert_not_paused(&env);
        from.require_auth();
        let key = DataKey::Pair(token_a.clone(), token_b.clone());
        let mut pair: PairState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));
        let amount_out = Self::swap_output(&env, &pair, amount_in, true);
        if amount_out < min_amount_out {
            panic_with_error!(&env, Error::SlippageExceeded);
        }
        token::Client::new(&env, &token_a).transfer(
            &from,
            &env.current_contract_address(),
            &amount_in,
        );
        token::Client::new(&env, &token_b).transfer(
            &env.current_contract_address(),
            &from,
            &amount_out,
        );
        pair.reserve_a = pair
            .reserve_a
            .checked_add(amount_in)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        pair.reserve_b = pair
            .reserve_b
            .checked_sub(amount_out)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

        // Flash loan protection: snapshot block-start reserves & update cumulative pricing
        let guard_state_key = DataKey::FlashLoanState(token_a.clone(), token_b.clone());
        let current_ledger = env.ledger().sequence();
        let current_timestamp = env.ledger().timestamp();
        let mut guard_state: FlashLoanGuardState = env
            .storage()
            .persistent()
            .get(&guard_state_key)
            .unwrap_or(FlashLoanGuardState {
                last_swap_ledger: 0,
                last_swap_timestamp: current_timestamp,
                block_start_reserve_a: pair.reserve_a - amount_in,
                block_start_reserve_b: pair.reserve_b + amount_out,
                cumulative_price_a: 0,
                cumulative_price_b: 0,
                total_swaps_in_block: 0,
            });

        let pre_swap_reserve_a = pair.reserve_a - amount_in;
        let pre_swap_reserve_b = pair.reserve_b + amount_out;

        if current_ledger > guard_state.last_swap_ledger {
            // New block: snapshot closing reserves of prior block as new block_start
            guard_state.block_start_reserve_a = pre_swap_reserve_a;
            guard_state.block_start_reserve_b = pre_swap_reserve_b;
            let time_elapsed = current_timestamp.saturating_sub(guard_state.last_swap_timestamp);
            if time_elapsed > 0 && pre_swap_reserve_a > 0 && pre_swap_reserve_b > 0 {
                let price_a = pre_swap_reserve_b
                    .checked_mul(PRICE_PRECISION)
                    .and_then(|v| v.checked_div(pre_swap_reserve_a))
                    .unwrap_or(0);
                let price_b = pre_swap_reserve_a
                    .checked_mul(PRICE_PRECISION)
                    .and_then(|v| v.checked_div(pre_swap_reserve_b))
                    .unwrap_or(0);
                guard_state.cumulative_price_a = guard_state
                    .cumulative_price_a
                    .saturating_add(price_a.saturating_mul(time_elapsed as i128));
                guard_state.cumulative_price_b = guard_state
                    .cumulative_price_b
                    .saturating_add(price_b.saturating_mul(time_elapsed as i128));
            }
            guard_state.total_swaps_in_block = 1;
            guard_state.last_swap_ledger = current_ledger;
            guard_state.last_swap_timestamp = current_timestamp;
        } else {
            // Same block swap: preserve existing block_start_reserves for manipulation detection
            guard_state.total_swaps_in_block = guard_state.total_swaps_in_block.saturating_add(1);
            guard_state.last_swap_timestamp = current_timestamp;
        }
        env.storage()
            .persistent()
            .set(&guard_state_key, &guard_state);
        env.storage()
            .persistent()
            .extend_ttl(&guard_state_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        env.storage().persistent().set(&key, &pair);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.events().publish(
            (symbol_short!("swap"), from),
            (token_a, token_b, amount_in, amount_out),
        );
        amount_out
    }

    /// Return pair reserves and fee configuration.
    pub fn get_pair(env: Env, token_a: Address, token_b: Address) -> Option<PairState> {
        env.storage()
            .persistent()
            .get(&DataKey::Pair(token_a, token_b))
    }

    /// Return a provider's LP share balance for an ordered pair.
    pub fn get_pair_position(
        env: Env,
        token_a: Address,
        token_b: Address,
        provider: Address,
    ) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::PairPosition(token_a, token_b, provider))
            .unwrap_or(0)
    }

    /// Calculate swap quote with flash loan protection guard.
    ///
    /// Validates that the pair's price has not been manipulated in the current block
    /// or within the cooldown window beyond `max_divergence_bps`.
    ///
    /// # Errors
    /// - `PairNotFound` if the pair does not exist.
    /// - `SameBlockManipulationRejected` if strict mode is enabled and a same-block swap occurred.
    /// - `FlashLoanManipulationDetected` if single-block price movement exceeds `max_divergence_bps`.
    /// - `PriceDivergenceExceeded` if cooldown price movement exceeds `max_divergence_bps`.
    pub fn quote_swap_guarded(
        env: Env,
        token_a: Address,
        token_b: Address,
        amount_in: i128,
    ) -> i128 {
        let pair: PairState = env
            .storage()
            .persistent()
            .get(&DataKey::Pair(token_a.clone(), token_b.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));

        let guard_config_key = DataKey::FlashLoanGuard(token_a.clone(), token_b.clone());
        let config: FlashLoanGuardConfig = env
            .storage()
            .persistent()
            .get(&guard_config_key)
            .unwrap_or(FlashLoanGuardConfig {
                enabled: true,
                max_divergence_bps: 500,
                cooldown_ledgers: 1,
                strict_mode: false,
            });

        if config.enabled {
            let guard_state_key = DataKey::FlashLoanState(token_a.clone(), token_b.clone());
            if let Some(guard_state) = env
                .storage()
                .persistent()
                .get::<_, FlashLoanGuardState>(&guard_state_key)
            {
                let current_ledger = env.ledger().sequence();
                let same_block = guard_state.last_swap_ledger == current_ledger
                    && guard_state.total_swaps_in_block > 0;

                if same_block {
                    if config.strict_mode {
                        panic_with_error!(&env, Error::SameBlockManipulationRejected);
                    }
                    if guard_state.block_start_reserve_a > 0
                        && guard_state.block_start_reserve_b > 0
                    {
                        let within_bounds = Self::check_price_divergence(
                            guard_state.block_start_reserve_a,
                            guard_state.block_start_reserve_b,
                            pair.reserve_a,
                            pair.reserve_b,
                            config.max_divergence_bps,
                        );
                        if !within_bounds {
                            panic_with_error!(&env, Error::FlashLoanManipulationDetected);
                        }
                    }
                } else if current_ledger
                    < guard_state
                        .last_swap_ledger
                        .saturating_add(config.cooldown_ledgers)
                {
                    if guard_state.block_start_reserve_a > 0
                        && guard_state.block_start_reserve_b > 0
                    {
                        let within_bounds = Self::check_price_divergence(
                            guard_state.block_start_reserve_a,
                            guard_state.block_start_reserve_b,
                            pair.reserve_a,
                            pair.reserve_b,
                            config.max_divergence_bps,
                        );
                        if !within_bounds {
                            panic_with_error!(&env, Error::PriceDivergenceExceeded);
                        }
                    }
                }
            }
        }

        Self::swap_output(&env, &pair, amount_in, true)
    }

    /// Calculate swap quote immune to intra-block flash loan manipulations by pricing against
    /// the pre-swap block-start snapshot reserves.
    ///
    /// If no swap has occurred yet in the pool or if the snapshot is uninitialized, falls back to spot reserves.
    pub fn quote_swap_twap(env: Env, token_a: Address, token_b: Address, amount_in: i128) -> i128 {
        let pair: PairState = env
            .storage()
            .persistent()
            .get(&DataKey::Pair(token_a.clone(), token_b.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));

        let guard_state_key = DataKey::FlashLoanState(token_a.clone(), token_b.clone());
        let effective_pair = if let Some(guard_state) =
            env.storage()
                .persistent()
                .get::<_, FlashLoanGuardState>(&guard_state_key)
        {
            let current_ledger = env.ledger().sequence();
            let same_block = guard_state.last_swap_ledger == current_ledger
                && guard_state.total_swaps_in_block > 0;
            if same_block
                && guard_state.block_start_reserve_a > 0
                && guard_state.block_start_reserve_b > 0
            {
                PairState {
                    token_a: pair.token_a.clone(),
                    token_b: pair.token_b.clone(),
                    reserve_a: guard_state.block_start_reserve_a,
                    reserve_b: guard_state.block_start_reserve_b,
                    total_lp_shares: pair.total_lp_shares,
                    fee_bps: pair.fee_bps,
                }
            } else {
                pair
            }
        } else {
            pair
        };

        Self::swap_output(&env, &effective_pair, amount_in, true)
    }

    /// Return manipulation-resistant pair reserves `(safe_reserve_a, safe_reserve_b)`.
    ///
    /// If an intra-block swap has taken place, returns the pre-swap block-start snapshot reserves
    /// instead of the skewed spot reserves, effectively protecting downstream lending and
    /// collateral evaluation protocols from flash loan attacks.
    ///
    /// # Errors
    /// - `PairNotFound` if the pair does not exist.
    /// - `SameBlockManipulationRejected` if strict mode is enabled and a same-block swap occurred.
    /// - `FlashLoanManipulationDetected` if single-block price movement exceeds `max_divergence_bps`.
    pub fn get_safe_price(env: Env, token_a: Address, token_b: Address) -> (i128, i128) {
        let pair: PairState = env
            .storage()
            .persistent()
            .get(&DataKey::Pair(token_a.clone(), token_b.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));

        let guard_config_key = DataKey::FlashLoanGuard(token_a.clone(), token_b.clone());
        let config: FlashLoanGuardConfig = env
            .storage()
            .persistent()
            .get(&guard_config_key)
            .unwrap_or(FlashLoanGuardConfig {
                enabled: true,
                max_divergence_bps: 500,
                cooldown_ledgers: 1,
                strict_mode: false,
            });

        if config.enabled {
            let guard_state_key = DataKey::FlashLoanState(token_a.clone(), token_b.clone());
            if let Some(guard_state) = env
                .storage()
                .persistent()
                .get::<_, FlashLoanGuardState>(&guard_state_key)
            {
                let current_ledger = env.ledger().sequence();
                let same_block = guard_state.last_swap_ledger == current_ledger
                    && guard_state.total_swaps_in_block > 0;
                if same_block {
                    if config.strict_mode {
                        panic_with_error!(&env, Error::SameBlockManipulationRejected);
                    }
                    if guard_state.block_start_reserve_a > 0
                        && guard_state.block_start_reserve_b > 0
                    {
                        let within_bounds = Self::check_price_divergence(
                            guard_state.block_start_reserve_a,
                            guard_state.block_start_reserve_b,
                            pair.reserve_a,
                            pair.reserve_b,
                            config.max_divergence_bps,
                        );
                        if !within_bounds {
                            panic_with_error!(&env, Error::FlashLoanManipulationDetected);
                        }
                        return (
                            guard_state.block_start_reserve_a,
                            guard_state.block_start_reserve_b,
                        );
                    }
                }
            }
        }

        (pair.reserve_a, pair.reserve_b)
    }

    /// Return cumulative time-weighted prices `(cumulative_price_a, cumulative_price_b)`
    /// scaled by `PRICE_PRECISION` (1e12).
    ///
    /// Integrates any uncommitted time elapsed up to the current ledger timestamp.
    pub fn get_twap_price(env: Env, token_a: Address, token_b: Address) -> (i128, i128) {
        let pair: PairState = env
            .storage()
            .persistent()
            .get(&DataKey::Pair(token_a.clone(), token_b.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::PairNotFound));

        let guard_state_key = DataKey::FlashLoanState(token_a, token_b);
        let guard_state: FlashLoanGuardState = env
            .storage()
            .persistent()
            .get(&guard_state_key)
            .unwrap_or(FlashLoanGuardState {
                last_swap_ledger: 0,
                last_swap_timestamp: env.ledger().timestamp(),
                block_start_reserve_a: pair.reserve_a,
                block_start_reserve_b: pair.reserve_b,
                cumulative_price_a: 0,
                cumulative_price_b: 0,
                total_swaps_in_block: 0,
            });

        let current_timestamp = env.ledger().timestamp();
        let time_elapsed = current_timestamp.saturating_sub(guard_state.last_swap_timestamp);
        let (mut cum_a, mut cum_b) = (
            guard_state.cumulative_price_a,
            guard_state.cumulative_price_b,
        );

        if time_elapsed > 0 && pair.reserve_a > 0 && pair.reserve_b > 0 {
            let price_a = pair
                .reserve_b
                .checked_mul(PRICE_PRECISION)
                .and_then(|v| v.checked_div(pair.reserve_a))
                .unwrap_or(0);
            let price_b = pair
                .reserve_a
                .checked_mul(PRICE_PRECISION)
                .and_then(|v| v.checked_div(pair.reserve_b))
                .unwrap_or(0);
            cum_a = cum_a.saturating_add(price_a.saturating_mul(time_elapsed as i128));
            cum_b = cum_b.saturating_add(price_b.saturating_mul(time_elapsed as i128));
        }

        (cum_a, cum_b)
    }

    /// Admin-only: configure flash loan protection guard parameters for an ordered pair.
    ///
    /// # Parameters
    /// - `token_a`, `token_b`: Ordered pair tokens.
    /// - `config`: Guard configuration (`enabled`, `max_divergence_bps`, `cooldown_ledgers`, `strict_mode`).
    ///
    /// # Errors
    /// - `PairNotFound` if the pair does not exist.
    /// - `InvalidGuardConfiguration` if `max_divergence_bps` exceeds 10,000 (100%) or `cooldown_ledgers` is 0.
    pub fn configure_flash_loan_guard(
        env: Env,
        token_a: Address,
        token_b: Address,
        config: FlashLoanGuardConfig,
    ) {
        Self::extend_instance_ttl(&env);
        Self::require_admin(&env);

        let pair_key = DataKey::Pair(token_a.clone(), token_b.clone());
        if !env.storage().persistent().has(&pair_key) {
            panic_with_error!(&env, Error::PairNotFound);
        }

        if config.max_divergence_bps as i128 > BPS_DENOMINATOR || config.cooldown_ledgers == 0 {
            panic_with_error!(&env, Error::InvalidGuardConfiguration);
        }

        let guard_config_key = DataKey::FlashLoanGuard(token_a.clone(), token_b.clone());
        env.storage().persistent().set(&guard_config_key, &config);
        env.storage()
            .persistent()
            .extend_ttl(&guard_config_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));

        env.events().publish(
            (symbol_short!("fl_cfg"), admin),
            (
                token_a,
                token_b,
                config.enabled,
                config.max_divergence_bps as i128,
            ),
        );
    }

    /// Return the flash loan guard configuration for a token pair.
    pub fn get_flash_loan_guard_config(
        env: Env,
        token_a: Address,
        token_b: Address,
    ) -> FlashLoanGuardConfig {
        let guard_config_key = DataKey::FlashLoanGuard(token_a, token_b);
        env.storage()
            .persistent()
            .get(&guard_config_key)
            .unwrap_or(FlashLoanGuardConfig {
                enabled: true,
                max_divergence_bps: 500,
                cooldown_ledgers: 1,
                strict_mode: false,
            })
    }

    /// Return the current flash loan guard state for a token pair.
    pub fn get_flash_loan_guard_state(
        env: Env,
        token_a: Address,
        token_b: Address,
    ) -> Option<FlashLoanGuardState> {
        let guard_state_key = DataKey::FlashLoanState(token_a, token_b);
        env.storage().persistent().get(&guard_state_key)
    }

    /// Check whether flash loan protection guard is active for a token pair.
    pub fn is_flash_loan_guarded(env: Env, token_a: Address, token_b: Address) -> bool {
        let guard_config_key = DataKey::FlashLoanGuard(token_a, token_b);
        env.storage()
            .persistent()
            .get::<_, FlashLoanGuardConfig>(&guard_config_key)
            .map(|c| c.enabled)
            .unwrap_or(false)
    }

    // ── Internal ────────────────────────────────────────────────────────────

    fn swap_output(env: &Env, pair: &PairState, amount_in: i128, a_to_b: bool) -> i128 {
        if amount_in <= 0 {
            panic_with_error!(env, Error::AmountMustBePositive);
        }
        let (reserve_in, reserve_out) = if a_to_b {
            (pair.reserve_a, pair.reserve_b)
        } else {
            (pair.reserve_b, pair.reserve_a)
        };
        if reserve_in <= 0 || reserve_out <= 0 {
            panic_with_error!(env, Error::InsufficientLiquidity);
        }
        let fee = amount_in
            .checked_mul(pair.fee_bps as i128)
            .and_then(|v| v.checked_div(BPS_DENOMINATOR))
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticError));
        let amount_after_fee = amount_in
            .checked_sub(fee)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticError));
        if amount_after_fee <= 0 {
            panic_with_error!(env, Error::InsufficientOutput);
        }
        let numerator = reserve_out
            .checked_mul(amount_after_fee)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticError));
        let denominator = reserve_in
            .checked_add(amount_after_fee)
            .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticError));
        let output = numerator / denominator;
        if output <= 0 || output >= reserve_out {
            panic_with_error!(env, Error::InsufficientOutput);
        }
        output
    }

    fn integer_sqrt(value: i128) -> i128 {
        if value <= 0 {
            return 0;
        }
        let mut x = value;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + value / x) / 2;
        }
        x
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        if paused {
            panic_with_error!(env, Error::ContractPaused);
        }
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    /// Check whether price divergence between snapshot reserves and current reserves
    /// remains within `max_divergence_bps`.
    fn check_price_divergence(
        start_a: i128,
        start_b: i128,
        curr_a: i128,
        curr_b: i128,
        max_divergence_bps: u32,
    ) -> bool {
        if start_a <= 0 || start_b <= 0 || curr_a <= 0 || curr_b <= 0 {
            return false;
        }
        // Price ratio = reserve_b / reserve_a
        // Diff = |(curr_b * start_a) - (start_b * curr_a)| / (start_b * curr_a)
        let curr_prod = match curr_b.checked_mul(start_a) {
            Some(p) => p,
            None => return false,
        };
        let start_prod = match start_b.checked_mul(curr_a) {
            Some(p) => p,
            None => return false,
        };
        let diff = if curr_prod >= start_prod {
            curr_prod - start_prod
        } else {
            start_prod - curr_prod
        };
        if let Some(diff_scaled) = diff.checked_mul(BPS_DENOMINATOR) {
            let max_allowed = (max_divergence_bps as i128).saturating_mul(start_prod);
            diff_scaled <= max_allowed
        } else {
            let diff_bps = diff / (start_prod / BPS_DENOMINATOR).max(1);
            diff_bps <= max_divergence_bps as i128
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{Address, Env};

    fn setup() -> (Env, Address, Address, CarbonDexContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();

        let contract_id = env.register_contract(None, CarbonDexContract);
        let client = CarbonDexContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        (env, admin, token, client)
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    // ── initialize ────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_, admin, _, client) = setup();
        client.initialize(&admin);
    }

    // ── deposit: success ──────────────────────────────────────────────────

    #[test]
    fn test_deposit_first_depositor_locks_minimum_liquidity() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        let shares = client.deposit(&provider, &token, &10_000);

        assert_eq!(shares, 10_000 - MINIMUM_LIQUIDITY);
        assert_eq!(
            client.get_position(&token, &provider),
            10_000 - MINIMUM_LIQUIDITY
        );

        let pool = client.get_pool(&token).unwrap();
        assert_eq!(pool.total_shares, 10_000);
        assert_eq!(pool.total_deposits, 10_000);
    }

    #[test]
    fn test_deposit_transfers_tokens_into_contract() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        client.deposit(&provider, &token, &10_000);

        assert_eq!(token::Client::new(&env, &token).balance(&provider), 90_000);
        assert_eq!(
            token::Client::new(&env, &token).balance(&client.address),
            10_000
        );
    }

    #[test]
    fn test_deposit_second_depositor_gets_proportional_shares() {
        let (env, _, token, client) = setup();
        let first = Address::generate(&env);
        let second = Address::generate(&env);
        mint(&env, &token, &first, 100_000);
        mint(&env, &token, &second, 100_000);

        client.deposit(&first, &token, &10_000);
        let second_shares = client.deposit(&second, &token, &10_000);

        // Same deposit amount at an unchanged share price -> same shares minted.
        assert_eq!(second_shares, 10_000);

        let pool = client.get_pool(&token).unwrap();
        assert_eq!(pool.total_deposits, 20_000);
        assert_eq!(pool.total_shares, 10_000 + 10_000);
    }

    // ── deposit: failure / edge cases ────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_deposit_zero_amount_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        client.deposit(&provider, &token, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_deposit_negative_amount_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        client.deposit(&provider, &token, &-1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_deposit_below_minimum_liquidity_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        client.deposit(&provider, &token, &MINIMUM_LIQUIDITY);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_deposit_while_paused_rejected() {
        let (env, admin, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        client.pause();
        let _ = admin;
        client.deposit(&provider, &token, &10_000);
    }

    #[test]
    #[should_panic]
    fn test_deposit_requires_auth() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        env.mock_auths(&[]);
        client.deposit(&provider, &token, &10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_deposit_overflow_protection_triggers_error() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        client.deposit(&provider, &token, &10_000);
        client.deposit(&provider, &token, &i128::MAX);
    }

    // ── withdraw: success ─────────────────────────────────────────────────

    #[test]
    fn test_withdraw_full_position_returns_underlying_and_clears_position() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        let amount_out = client.withdraw(&provider, &token, &shares);

        assert_eq!(amount_out, 10_000 - MINIMUM_LIQUIDITY);
        assert_eq!(client.get_position(&token, &provider), 0);
        assert_eq!(
            token::Client::new(&env, &token).balance(&provider),
            100_000 - MINIMUM_LIQUIDITY
        );
    }

    #[test]
    fn test_withdraw_partial_position_reduces_shares() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        client.withdraw(&provider, &token, &(shares / 2));

        assert_eq!(client.get_position(&token, &provider), shares - shares / 2);
    }

    #[test]
    fn test_minimum_liquidity_shares_are_permanently_locked() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        client.withdraw(&provider, &token, &shares);

        let pool = client.get_pool(&token).unwrap();
        assert_eq!(pool.total_shares, MINIMUM_LIQUIDITY);
        assert_eq!(pool.total_deposits, MINIMUM_LIQUIDITY);
    }

    #[test]
    fn test_deposit_withdraw_round_trip_multiple_providers() {
        let (env, _, token, client) = setup();
        let first = Address::generate(&env);
        let second = Address::generate(&env);
        mint(&env, &token, &first, 100_000);
        mint(&env, &token, &second, 100_000);

        let first_shares = client.deposit(&first, &token, &10_000);
        client.deposit(&second, &token, &5_000);

        client.withdraw(&first, &token, &(first_shares / 2));

        let pool = client.get_pool(&token).unwrap();
        assert_eq!(
            pool.total_shares,
            MINIMUM_LIQUIDITY + (first_shares - first_shares / 2) + 5_000
        );
    }

    // ── withdraw: failure / edge cases ───────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_withdraw_nonexistent_pool_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        client.withdraw(&provider, &token, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_withdraw_zero_shares_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        client.deposit(&provider, &token, &10_000);

        client.withdraw(&provider, &token, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_withdraw_more_than_owned_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        client.withdraw(&provider, &token, &(shares + 1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_withdraw_while_paused_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        client.pause();
        client.withdraw(&provider, &token, &shares);
    }

    #[test]
    #[should_panic]
    fn test_withdraw_requires_auth() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);
        let shares = client.deposit(&provider, &token, &10_000);

        env.mock_auths(&[]);
        client.withdraw(&provider, &token, &shares);
    }

    // ── pause / unpause ───────────────────────────────────────────────────

    #[test]
    fn test_pause_then_unpause_allows_deposit_again() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        client.pause();
        client.unpause();
        client.deposit(&provider, &token, &10_000);

        assert_eq!(
            client.get_position(&token, &provider),
            10_000 - MINIMUM_LIQUIDITY
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_double_pause_rejected() {
        let (_, _, _, client) = setup();
        client.pause();
        client.pause();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_unpause_when_not_paused_rejected() {
        let (_, _, _, client) = setup();
        client.unpause();
    }

    // ── read-only views ───────────────────────────────────────────────────

    #[test]
    fn test_get_pool_returns_none_for_unknown_token() {
        let (env, _, _, client) = setup();
        let unknown_token = Address::generate(&env);
        assert!(client.get_pool(&unknown_token).is_none());
    }

    #[test]
    fn test_get_position_returns_zero_for_no_position() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        assert_eq!(client.get_position(&token, &provider), 0);
    }

    fn setup_pair() -> (
        Env,
        Address,
        Address,
        Address,
        CarbonDexContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_a = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_b = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let contract_id = env.register_contract(None, CarbonDexContract);
        let client = CarbonDexContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        client.create_pair(&token_a, &token_b, &30);
        (env, admin, token_a, token_b, client)
    }

    #[test]
    fn test_pair_add_liquidity_quote_and_swap_preserve_invariant_direction() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);

        let shares = client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);
        assert_eq!(shares, 99_000);
        let quoted = client.quote_swap(&token_a, &token_b, &10_000);
        assert!(quoted > 9_000 && quoted < 10_000);
        let received = client.swap(&provider, &token_a, &token_b, &10_000, &quoted);
        assert_eq!(received, quoted);
        let pair = client.get_pair(&token_a, &token_b).unwrap();
        assert_eq!(pair.reserve_a, 110_000);
        assert_eq!(pair.reserve_b, 100_000 - received);
        assert_eq!(
            client.get_pair_position(&token_a, &token_b, &provider),
            shares
        );
    }

    #[test]
    fn test_pair_remove_liquidity_returns_proportional_reserves() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        let shares = client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);
        let before_a = token::Client::new(&env, &token_a).balance(&provider);
        let returned = client.remove_liquidity(&provider, &token_a, &token_b, &shares);
        assert_eq!(returned, (99_000, 99_000));
        assert_eq!(
            token::Client::new(&env, &token_a).balance(&provider),
            before_a + 99_000
        );
        assert_eq!(client.get_pair_position(&token_a, &token_b, &provider), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_pair_rejects_identical_tokens() {
        let (_, _, token, client) = setup();
        client.create_pair(&token, &token, &30);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #21)")]
    fn test_swap_enforces_slippage_limit() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);
        client.swap(&provider, &token_a, &token_b, &10_000, &10_000);
    }

    // ── Flash Loan Protection Guard tests ────────────────────────────────

    #[test]
    fn test_flash_loan_guard_initialized_on_pair_creation() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let config = client.get_flash_loan_guard_config(&token_a, &token_b);
        assert!(config.enabled);
        assert_eq!(config.max_divergence_bps, 500);
        assert_eq!(config.cooldown_ledgers, 1);
        assert!(!config.strict_mode);
        assert!(client.is_flash_loan_guarded(&token_a, &token_b));

        let state = client
            .get_flash_loan_guard_state(&token_a, &token_b)
            .unwrap();
        assert_eq!(state.total_swaps_in_block, 0);
        assert_eq!(state.last_swap_ledger, env.ledger().sequence());
    }

    #[test]
    fn test_quote_swap_guarded_succeeds_when_no_swap_in_block() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        let quote = client.quote_swap_guarded(&token_a, &token_b, &1_000);
        assert!(quote > 900 && quote < 1_000);
    }

    #[test]
    fn test_quote_swap_guarded_allows_small_swaps_within_divergence_limit() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        // Small swap: 100 on 100,000 reserves is ~0.1% price movement (< 5% max_divergence_bps)
        client.swap(&provider, &token_a, &token_b, &100, &0);

        // Guarded quote should succeed because divergence is well below 500 bps
        let quote = client.quote_swap_guarded(&token_a, &token_b, &1_000);
        assert!(quote > 900);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_quote_swap_guarded_detects_single_block_flash_loan_manipulation() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let attacker = Address::generate(&env);
        mint(&env, &token_a, &attacker, 500_000);
        mint(&env, &token_b, &attacker, 500_000);
        client.add_liquidity(&attacker, &token_a, &token_b, &100_000, &100_000);

        // Flash loan attack simulation: massive swap shifts spot reserves heavily in current block
        // Swapping 50,000 shifts reserves to (150,000, ~66,889), a >50% price swing!
        client.swap(&attacker, &token_a, &token_b, &50_000, &0);

        // Downstream guarded pricing query in the same block detects flash loan manipulation!
        client.quote_swap_guarded(&token_a, &token_b, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #26)")]
    fn test_quote_swap_guarded_strict_mode_rejects_any_same_block_swap() {
        let (env, _admin, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        // Admin configures strict mode
        let strict_config = FlashLoanGuardConfig {
            enabled: true,
            max_divergence_bps: 500,
            cooldown_ledgers: 1,
            strict_mode: true,
        };
        client.configure_flash_loan_guard(&token_a, &token_b, &strict_config);

        // Minor swap in current block
        client.swap(&provider, &token_a, &token_b, &100, &0);

        // In strict mode, guarded query strictly rejects any same-block swap
        client.quote_swap_guarded(&token_a, &token_b, &1_000);
    }

    #[test]
    fn test_quote_swap_twap_immune_to_same_block_flash_loan() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 500_000);
        mint(&env, &token_b, &provider, 500_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        // Baseline pre-swap TWAP quote
        let baseline_quote = client.quote_swap_twap(&token_a, &token_b, &1_000);

        // Massive flash loan swap in the same block skewing spot reserves
        client.swap(&provider, &token_a, &token_b, &50_000, &0);

        // Standard spot quote drops significantly due to distorted reserves
        let spot_quote = client.quote_swap(&token_a, &token_b, &1_000);
        assert!(spot_quote < baseline_quote / 2);

        // TWAP quote retains block-start snapshot pricing, completely immune!
        let protected_quote = client.quote_swap_twap(&token_a, &token_b, &1_000);
        assert_eq!(protected_quote, baseline_quote);
    }

    #[test]
    fn test_get_safe_price_returns_snapshot_reserves_during_same_block() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        // Small swap that stays within divergence limits
        client.swap(&provider, &token_a, &token_b, &200, &0);

        // Spot pair has shifted reserves
        let spot_pair = client.get_pair(&token_a, &token_b).unwrap();
        assert_eq!(spot_pair.reserve_a, 100_200);

        // get_safe_price returns the protected pre-swap block-start snapshot reserves
        let (safe_a, safe_b) = client.get_safe_price(&token_a, &token_b);
        assert_eq!(safe_a, 100_000);
        assert_eq!(safe_b, 100_000);
    }

    #[test]
    fn test_configure_flash_loan_guard_updates_settings() {
        let (_env, _admin, token_a, token_b, client) = setup_pair();
        let new_config = FlashLoanGuardConfig {
            enabled: false,
            max_divergence_bps: 200,
            cooldown_ledgers: 5,
            strict_mode: true,
        };
        client.configure_flash_loan_guard(&token_a, &token_b, &new_config);

        let retrieved = client.get_flash_loan_guard_config(&token_a, &token_b);
        assert_eq!(retrieved, new_config);
        assert!(!client.is_flash_loan_guarded(&token_a, &token_b));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #25)")]
    fn test_configure_flash_loan_guard_rejects_invalid_divergence() {
        let (_, _admin, token_a, token_b, client) = setup_pair();
        let invalid_config = FlashLoanGuardConfig {
            enabled: true,
            max_divergence_bps: 10_001, // Exceeds 10,000 (100%)
            cooldown_ledgers: 1,
            strict_mode: false,
        };
        client.configure_flash_loan_guard(&token_a, &token_b, &invalid_config);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #25)")]
    fn test_configure_flash_loan_guard_rejects_zero_cooldown() {
        let (_, _admin, token_a, token_b, client) = setup_pair();
        let invalid_config = FlashLoanGuardConfig {
            enabled: true,
            max_divergence_bps: 500,
            cooldown_ledgers: 0, // Invalid: cooldown must be at least 1 ledger
            strict_mode: false,
        };
        client.configure_flash_loan_guard(&token_a, &token_b, &invalid_config);
    }

    #[test]
    #[should_panic]
    fn test_configure_flash_loan_guard_requires_admin_auth() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let config = FlashLoanGuardConfig {
            enabled: true,
            max_divergence_bps: 500,
            cooldown_ledgers: 1,
            strict_mode: false,
        };
        env.mock_auths(&[]);
        client.configure_flash_loan_guard(&token_a, &token_b, &config);
    }

    #[test]
    fn test_multi_block_safe_execution_recovers() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let attacker = Address::generate(&env);
        mint(&env, &token_a, &attacker, 500_000);
        mint(&env, &token_b, &attacker, 500_000);
        client.add_liquidity(&attacker, &token_a, &token_b, &100_000, &100_000);

        // Flash loan swap in block N
        client.swap(&attacker, &token_a, &token_b, &50_000, &0);

        // Advance ledger to block N + 2 (beyond cooldown)
        env.ledger().with_mut(|l| {
            l.sequence_number += 2;
            l.timestamp += 10;
        });

        // Now in the new block outside the attack window, guarded pricing queries succeed normally
        let quote = client.quote_swap_guarded(&token_a, &token_b, &1_000);
        assert!(quote > 0);
    }

    #[test]
    fn test_twap_price_accumulates_across_time() {
        let (env, _, token_a, token_b, client) = setup_pair();
        let provider = Address::generate(&env);
        mint(&env, &token_a, &provider, 200_000);
        mint(&env, &token_b, &provider, 200_000);
        client.add_liquidity(&provider, &token_a, &token_b, &100_000, &100_000);

        let (initial_a, initial_b) = client.get_twap_price(&token_a, &token_b);

        // Advance time by 100 seconds
        env.ledger().with_mut(|l| {
            l.timestamp += 100;
        });

        let (accumulated_a, accumulated_b) = client.get_twap_price(&token_a, &token_b);
        assert!(accumulated_a > initial_a);
        assert!(accumulated_b > initial_b);
    }
}
