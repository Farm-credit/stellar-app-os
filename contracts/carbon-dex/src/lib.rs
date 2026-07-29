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
    /// Flash loan attempt detected — operation not allowed in the same ledger
    /// as a previous interaction on this position.
    FlashLoanAttempt = 15,
}

// ── Types ───────────────────────────────────────────────────────────────────

/// Shares permanently locked on a pool's first deposit and never credited to
/// any provider's position — see module docs.
const MINIMUM_LIQUIDITY: i128 = 1_000;

/// Minimum number of ledgers that must elapse between consecutive
/// interactions on the same position.  Setting this to 1 prevents
/// same-ledger flash loan attacks while allowing normal multi-ledger
/// usage.
const FLASH_LEDGER_BUFFER: u32 = 1;

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
    /// (token, provider) -> last ledger sequence of an interaction.
    LastInteractionLedger(Address, Address),
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolState {
    pub token: Address,
    pub total_shares: i128,
    pub total_deposits: i128,
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

        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
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

        // ── Flash loan guard ──────────────────────────────────────────────
        Self::assert_no_flash_loan(&env, &token, &from);

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

        // Update flash loan ledger tracker after successful deposit
        Self::update_interaction_ledger(&env, &token, &from);

        env.events()
            .publish((symbol_short!("deposit"), from), (token, amount, shares_minted));

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

        // ── Flash loan guard ──────────────────────────────────────────────
        Self::assert_no_flash_loan(&env, &token, &from);

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
            env.storage().persistent().set(&position_key, &remaining_shares);
            env.storage()
                .persistent()
                .extend_ttl(&position_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        }

        // Update flash loan ledger tracker
        Self::update_interaction_ledger(&env, &token, &from);

        token::Client::new(&env, &token).transfer(&env.current_contract_address(), &from, &amount_out);

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
        env.storage().instance().set(&symbol_short!("PAUSED"), &true);
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
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
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

    /// Read the last interaction ledger for a (token, provider) position.
    /// Returns `0` if never interacted.
    pub fn get_last_interaction_ledger(env: Env, token: Address, provider: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::LastInteractionLedger(token, provider))
            .unwrap_or(0)
    }

    // ── Internal ────────────────────────────────────────────────────────────

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

    /// Assert that the caller is not attempting a flash loan — i.e. that
    /// the current ledger sequence is different from the last recorded
    /// interaction ledger for this (token, provider) pair.
    fn assert_no_flash_loan(env: &Env, token: &Address, provider: &Address) {
        let last_ledger: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::LastInteractionLedger(token.clone(), provider.clone()))
            .unwrap_or(0);
        let current_ledger = env.ledger().sequence();
        if last_ledger > 0 && current_ledger <= last_ledger + FLASH_LEDGER_BUFFER - 1 {
            panic_with_error!(env, Error::FlashLoanAttempt);
        }
    }

    /// Record the current ledger sequence as the last interaction time for
    /// this (token, provider) position.
    fn update_interaction_ledger(env: &Env, token: &Address, provider: &Address) {
        let current_ledger = env.ledger().sequence();
        let ledger_key = DataKey::LastInteractionLedger(token.clone(), provider.clone());
        env.storage().persistent().set(&ledger_key, &current_ledger);
        env.storage()
            .persistent()
            .extend_ttl(&ledger_key, BUMP_THRESHOLD, BUMP_AMOUNT);
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
        assert_eq!(client.get_position(&token, &provider), 10_000 - MINIMUM_LIQUIDITY);

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

        assert_eq!(client.get_position(&token, &provider), 10_000 - MINIMUM_LIQUIDITY);
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

    // ── Flash loan protection ────────────────────────────────────────────

    #[test]
    fn test_deposit_allowed_in_different_ledger() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        // First deposit
        let shares = client.deposit(&provider, &token, &10_000);
        let ledger_after_first = client.get_last_interaction_ledger(&token, &provider);
        assert!(ledger_after_first > 0);

        // Advance to next ledger so withdraw is allowed
        env.ledger().set_sequence_number(ledger_after_first + 1);

        // Withdraw in a different ledger should succeed
        let amount_out = client.withdraw(&provider, &token, &shares);
        assert!(amount_out > 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_flash_loan_deposit_after_deposit_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 1_000_000);

        // Deposit first
        client.deposit(&provider, &token, &100_000);

        // Second deposit within the same ledger should be rejected
        // Env::default() uses ledger sequence 0 for all operations within
        // the same test unless we explicitly advance it.
        client.deposit(&provider, &token, &50_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_flash_loan_withdraw_after_deposit_rejected() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 1_000_000);

        let shares = client.deposit(&provider, &token, &100_000);

        // Withdraw in the same ledger should be rejected (flash loan pattern)
        client.withdraw(&provider, &token, &shares);
    }

    #[test]
    fn test_flash_loan_guard_allows_after_ledger_advance() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 1_000_000);

        // Deposit in ledger 0
        let shares = client.deposit(&provider, &token, &100_000);
        let last_ledger = client.get_last_interaction_ledger(&token, &provider);

        // Advance to the next ledger
        env.ledger().set_sequence_number(last_ledger + 1);

        // Now withdraw should succeed
        let amount_out = client.withdraw(&provider, &token, &shares);
        assert!(amount_out > 0);
    }

    #[test]
    fn test_get_last_interaction_ledger_returns_zero_for_new_position() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        assert_eq!(client.get_last_interaction_ledger(&token, &provider), 0);
    }

    #[test]
    fn test_get_last_interaction_ledger_updates_after_deposit() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 100_000);

        // Before deposit: ledger should be 0
        assert_eq!(client.get_last_interaction_ledger(&token, &provider), 0);

        // After deposit: ledger should be > 0
        client.deposit(&provider, &token, &10_000);
        assert!(client.get_last_interaction_ledger(&token, &provider) > 0);
    }

    #[test]
    fn test_flash_loan_guard_different_tokens_independent() {
        let (env, _, token1, client) = setup();
        let token_admin = Address::generate(&env);
        let token2 = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();

        let provider = Address::generate(&env);
        mint(&env, &token1, &provider, 1_000_000);
        mint(&env, &token2, &provider, 1_000_000);

        // Deposit token1
        client.deposit(&provider, &token1, &100_000);

        // Deposit token2 should still work (different pool)
        client.deposit(&provider, &token2, &100_000);

        assert_eq!(client.get_position(&token1, &provider), 100_000 - MINIMUM_LIQUIDITY);
        assert_eq!(client.get_position(&token2, &provider), 100_000 - MINIMUM_LIQUIDITY);
    }

    #[test]
    fn test_flash_loan_guard_different_providers_independent() {
        let (env, _, token, client) = setup();
        let first = Address::generate(&env);
        let second = Address::generate(&env);
        mint(&env, &token, &first, 1_000_000);
        mint(&env, &token, &second, 1_000_000);

        // First provider deposits
        client.deposit(&first, &token, &100_000);

        // Second provider can still deposit in same ledger (different position)
        client.deposit(&second, &token, &100_000);

        assert_eq!(client.get_position(&first, &token), 100_000 - MINIMUM_LIQUIDITY);
        assert_eq!(client.get_position(&second, &token), 100_000);
    }

    #[test]
    fn test_flash_loan_ledger_tracker_round_trip() {
        let (env, _, token, client) = setup();
        let provider = Address::generate(&env);
        mint(&env, &token, &provider, 1_000_000);

        // Before any interaction: 0
        assert_eq!(client.get_last_interaction_ledger(&token, &provider), 0);

        // After deposit: non-zero
        let _shares = client.deposit(&provider, &token, &100_000);
        let ledger_after_deposit = client.get_last_interaction_ledger(&token, &provider);
        assert!(ledger_after_deposit > 0);

        // After advancing ledger and withdrawing: updated
        env.ledger().set_sequence_number(ledger_after_deposit + 1);
        let shares = client.get_position(&token, &provider);
        client.withdraw(&provider, &token, &(shares / 2));
        let ledger_after_withdraw = client.get_last_interaction_ledger(&token, &provider);
        assert_eq!(ledger_after_withdraw, ledger_after_deposit + 1);
    }
