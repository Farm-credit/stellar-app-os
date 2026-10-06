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

        token::Client::new(&env, &token).transfer(&from, &env.current_contract_address(), &amount);

        let shares_added_to_pool = if is_first_deposit {
            shares_minted
                .checked_add(MINIMUM_LIQUIDITY)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError))
        } else {
            shares_minted
        };

        pool.total_deposits = pool
            .total_deposits
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));
        pool.total_shares = pool
            .total_shares
            .checked_add(shares_added_to_pool)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticError));

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
            token_a,
            token_b,
            reserve_a: 0,
            reserve_b: 0,
            total_lp_shares: 0,
            fee_bps,
        };
        env.storage().persistent().set(&key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
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
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
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
        mint(&env, &token, &provider, i128::MAX);

        client.deposit(&provider, &token, &i128::MAX);
        client.deposit(&provider, &token, &1);
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
}
