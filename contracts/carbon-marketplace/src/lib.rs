#![no_std]

//! Carbon Credit Marketplace — Closes #490, #760, #780
//!
//! On-chain orderbook for TREE token carbon credit certificates plus
//! a constant-product AMM (xy = k) liquidity pool for Carbon DEX swaps.
//!
//! # Fixed-price listings (original flow)
//!   1. `initialize(admin, tree_token, admin_controls)`
//!   2. `list(seller, planter, amount, price_per_token, payment_token)` → escrows TREE tokens
//!   3. `buy(buyer, listing_id, amount)` → partial or full fill
//!   4. `cancel(seller, listing_id)` → reclaim remaining tokens
//!
//! # Partial order matching (issue #760)
//!   1. `place_buy_order(buyer, payment_token, amount, max_price_per_token)` → places an
//!      open buy order and immediately matches it against existing sell listings in
//!      price-ascending order until the order is filled or no eligible listings remain.
//!   2. `place_sell_order(seller, planter, amount, min_price_per_token)` → escrows TREE
//!      tokens and immediately matches against existing buy orders in price-descending
//!      order until the order is filled or no eligible orders remain.
//!   3. `cancel_order(caller, order_id)` → cancels an open (partially-filled) order.
//!      Refunds escrowed TREE tokens to the seller, or releases the reserved payment
//!      reservation note (no payment is escrowed for buy orders; buyers pay on match).
//!
//! # Constant-Product AMM — Carbon DEX (issue #780)
//!
//! Implements the Uniswap v2-style xy = k invariant for on-chain TREE/payment-token
//! swaps. Protocol fee is 30 bps (0.30 %) deducted from the input before the swap.
//!
//! ## AMM Flow
//!   1. `amm_add_liquidity(provider, tree_amount, payment_amount)` — deposits both
//!      tokens and mints LP shares proportional to contribution.
//!   2. `amm_remove_liquidity(provider, lp_shares)` — burns LP shares and returns
//!      proportional reserves.
//!   3. `amm_swap_exact_in(caller, token_in, amount_in, min_amount_out)` — swaps
//!      an exact input for at least `min_amount_out` output tokens.  Supports both
//!      TREE→payment and payment→TREE directions.
//!   4. `amm_get_quote(token_in, amount_in)` — view-only price quote.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype,
    panic_with_error, symbol_short, token, Address, Env, Vec,
};
use harvesta_errors::HarvestaError;
use admin_controls::AdminControlsClient;

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketplaceError {
    ListingAmountMustBePositive = 100,
    BuyAmountMustBePositive = 101,
    AuctionNotFound = 102,
    AuctionNotActive = 103,
    SelfTrade = 104,
    InsufficientLiquidity = 105,
    AuctionExpired = 106,
    BidBelowReservePrice = 107,
    ListingNotFound = 108,
    ListingNotActive = 109,
    InvalidPriceRange = 110,
    InvalidDecayRate = 111,
    InvalidDuration = 112,
    PriceMustBePositive = 113,
    // AMM-specific errors (Issue #780)
    AmmNotInitialized = 200,
    AmmAmountMustBePositive = 201,
    AmmInsufficientLiquidity = 202,
    AmmSlippageExceeded = 203,
    AmmInvalidTokenIn = 204,
    AmmZeroShares = 205,
    AmmInsufficientShares = 206,
}

    BelowMinimumTradeSize = 114,
    TwapPeriodMustBePositive = 114,
    MaxObservationsMustBePositive = 115,
    TwapNotConfigured = 116,
    NoObservationsRecorded = 117,
    ObservationCountTooLow = 118,
    PriceMustBePositiveForObservation = 119,
}

/// Time-Weighted Average Price observation.
///
/// Stores a cumulative price accumulator (`price_cumulative`) and the
/// timestamp of the last update. The accumulator grows as:
///   `price_cumulative += last_price × Δt`
/// TWAP over `[t_old, t_now]`:
///   `twap = (price_cumulative_now - price_cumulative_old) / (t_now - t_old)`
#[contracttype]
#[derive(Clone, Debug)]
pub struct CumulativeObservation {
    /// Σ(price_i × Δt_i) — cumulative price accumulator
    pub price_cumulative: i128,
    /// Ledger timestamp of the last observation update
    pub timestamp: u64,
    /// The price that was observed at this update
    pub price: i128,
}

/// Configuration for the TWAP oracle.
pub struct TwapConfig {
    /// Time window (in seconds) for the TWAP computation
    pub period_seconds: u64,
    /// Maximum number of historical observations to retain
    pub max_observations: u32,
}

// ── Listing / Order types ─────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingStatus {
    Active,
    Filled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AuctionStatus {
    Active,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller: Address,
    /// Original planter who planted the trees for these carbon credits
    pub planter: Address,
    /// TREE token address
    pub tree_token: Address,
    /// Payment token (USDC / XLM)
    pub payment_token: Address,
    /// TREE tokens per unit payment token, scaled by 1e7
    pub price_per_token: i128,
    pub amount: i128,
    pub filled: i128,
    pub status: ListingStatus,
    pub created_at: u64,
}

// ── AMM Pool types (Issue #780) ───────────────────────────────────────────────

/// AMM pool state stored in contract instance storage.
///
/// Invariant: `reserve_tree * reserve_payment = k` (constant product).
/// Maintained after every swap, add-liquidity, and remove-liquidity.
///
/// All amounts are in raw token stroops.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AmmPool {
    /// TREE token reserve (token A)
    pub reserve_tree: i128,
    /// Payment token reserve (token B)
    pub reserve_payment: i128,
    /// Total LP shares outstanding
    pub total_lp_shares: i128,
    /// Cumulative trading fees collected in payment-token stroops
    pub fees_collected: i128,
}

/// Per-provider LP share record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct LpPosition {
    pub provider: Address,
    pub shares: i128,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Config,
    NextListingId,
    Listing(u64),
    AmmPool,
    LpShares(Address),
    /// Global auction counter
    AuctionCount,
    /// Per-auction record
    Auction(u64),
    /// Auction configuration (starting_price, reserve_price, decay_rate, duration)
    AuctionConfig,
    /// Royalty basis points (e.g. 500 = 5%)
    RoyaltyConfig,
    /// TWAP oracle configuration (period, max_observations)
    TwapConfig,
    /// Current cumulative price observation
    CurrentObservation,
    /// Historical observation buffer (ring buffer, keyed by index)
    HistoricalObservation(u64),
    /// Next slot index for the historical observation ring buffer
    NextObservationSlot,
    /// Total observations recorded so far (for TWAP queries)
    TotalObservations,
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Protocol swap fee: 30 bps = 0.30 %.
/// Numerator / denominator so we can do integer arithmetic:
///   fee_amount = amount_in * FEE_NUM / FEE_DEN
const FEE_NUMERATOR: i128 = 30;
const FEE_DENOMINATOR: i128 = 10_000;

/// LP share precision factor (similar to 1e18 in EVM).
/// We use 1_000_000_000_000i128 (1e12) to keep shares well-separated
/// from raw token amounts while staying within i128.
const LP_PRECISION: i128 = 1_000_000_000_000;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    // ── Admin ─────────────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// * `admin`         — controls privileged operations.
    /// * `tree_token`    — the TREE carbon-credit token.
    /// * `payment_token` — the default payment token (USDC / XLM) for the AMM pool.
    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        payment_token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic!("already initialized");
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token, payment_token));
        env.storage().instance().set(&DataKey::NextListingId, &0u64);
    }

    // ── Orderbook: fixed-price listings ─────────────────────────────────────

    /// List TREE tokens for sale at a fixed price.
    ///
    /// Escrows `amount` TREE tokens from `seller`.
    pub fn list(
        env: Env,
        seller: Address,
        planter: Address,
        amount: i128,
        price_per_token: i128,
        payment_token: Address,
    ) -> u64 {
        seller.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }
        if price_per_token <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

        let (_, tree_token, _): (Address, Address, Address) = Self::config(&env);

        // Escrow TREE tokens
        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextListingId)
            .unwrap_or(0u64);

        let listing = Listing {
            id,
            seller: seller.clone(),
            planter,
            tree_token,
            payment_token,
            price_per_token,
            amount,
            filled: 0,
            status: ListingStatus::Active,
            created_at: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Listing(id), &listing);
        env.storage().instance().set(&DataKey::NextListingId, &(id + 1));

        env.events()
            .publish((symbol_short!("listed"),), (id, seller, amount));

        id
    }

    /// Buy TREE tokens from an active listing.
    pub fn buy(env: Env, buyer: Address, listing_id: u64, amount: i128) {
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }
        if buyer == listing.seller {
            panic_with_error!(&env, MarketplaceError::SelfTrade);
        }

        let available = listing.amount - listing.filled;
        if amount > available {
            panic_with_error!(&env, MarketplaceError::InsufficientLiquidity);
        }

        let total_cost = amount * listing.price_per_token / 1_000_0000; // price scaled
        // Transfer payment from buyer to seller
        token::Client::new(&env, &listing.payment_token).transfer(
            &buyer,
            &listing.seller,
            &total_cost,
        );
        // Transfer TREE from escrow to buyer
        token::Client::new(&env, &listing.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        listing.filled += amount;
        if listing.filled >= listing.amount {
            listing.status = ListingStatus::Filled;
        }
        env.storage().instance().set(&DataKey::Listing(listing_id), &listing);

        // Record TWAP observation from this trade price
        Self::record_observation(&env, listing.price_per_token);

        env.events()
            .publish((symbol_short!("bought"),), (listing_id, buyer, amount));
    }

    /// Cancel an active listing and reclaim remaining escrowed TREE tokens.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        seller.require_auth();

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        let remaining = listing.amount - listing.filled;
        if remaining > 0 {
            token::Client::new(&env, &listing.tree_token).transfer(
                &env.current_contract_address(),
                &seller,
                &remaining,
            );
        }

        listing.status = ListingStatus::Cancelled;
        env.storage().instance().set(&DataKey::Listing(listing_id), &listing);

        env.events()
            .publish((symbol_short!("cancl"),), (listing_id,));
    }

    /// Return a listing by id.
    pub fn get_listing(env: Env, listing_id: u64) -> Listing {
        env.storage()
            .instance()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound))
    }

    // ── AMM: Constant-Product Pool (Issue #780) ───────────────────────────────
    //
    // Implements the Uniswap v2 invariant: x * y = k
    //
    // Where x = reserve_tree (TREE token reserve)
    //       y = reserve_payment (payment token reserve)
    //       k = constant that increases with fee collection
    //
    // Swap formula (with fee):
    //   amount_out = (amount_in_with_fee * reserve_out)
    //                / (reserve_in * FEE_DEN + amount_in_with_fee)
    //
    //   where amount_in_with_fee = amount_in * (FEE_DEN - FEE_NUM)
    //
    // This contract holds both token reserves directly.
    //
    // LP shares use integer approximation:
    //   First deposit: shares = sqrt(tree_amount * payment_amount) * LP_PRECISION
    //   Subsequent:    shares = min(
    //                     tree_amount * total_lp / reserve_tree,
    //                     payment_amount * total_lp / reserve_payment
    //                  )

    /// Add liquidity to the constant-product AMM pool.
    ///
    /// On first deposit, mints `sqrt(tree_amount * payment_amount) * LP_PRECISION`
    /// shares. On subsequent deposits, mints shares proportional to the smaller
    /// of the two ratio contributions.
    ///
    /// Transfers both tokens from `provider` into this contract.
    pub fn amm_add_liquidity(
        env: Env,
        provider: Address,
        tree_amount: i128,
        payment_amount: i128,
    ) -> i128 {
        provider.require_auth();
        if tree_amount <= 0 || payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }

        let (_, tree_token, payment_token): (Address, Address, Address) = Self::config(&env);

        // Transfer both tokens into the pool
        token::Client::new(&env, &tree_token).transfer(
            &provider,
            &env.current_contract_address(),
            &tree_amount,
        );
        token::Client::new(&env, &payment_token).transfer(
            &provider,
            &env.current_contract_address(),
            &payment_amount,
        );

        let mut pool = Self::pool(&env);

        let new_shares = if pool.total_lp_shares == 0 {
            // First deposit: geometric mean × precision
            // Use integer isqrt to avoid floating point
            let product = tree_amount * payment_amount;
            let geometric_mean = Self::isqrt(product);
            geometric_mean * LP_PRECISION
        } else {
            // Proportional deposit — take the minimum ratio
            let shares_by_tree =
                tree_amount * pool.total_lp_shares / pool.reserve_tree;
            let shares_by_payment =
                payment_amount * pool.total_lp_shares / pool.reserve_payment;
            if shares_by_tree < shares_by_payment {
                shares_by_tree
            } else {
                shares_by_payment
            }
        };

        if new_shares <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmZeroShares);
        }

        // Update pool reserves and total shares
        pool.reserve_tree += tree_amount;
        pool.reserve_payment += payment_amount;
        pool.total_lp_shares += new_shares;
        Self::save_pool(&env, &pool);

        // Update provider LP balance
        let lp_key = DataKey::LpShares(provider.clone());
        let existing_shares: i128 = env.storage().persistent().get(&lp_key).unwrap_or(0i128);
        env.storage()
            .persistent()
            .set(&lp_key, &(existing_shares + new_shares));

        env.events().publish(
            (symbol_short!("amm_add"),),
            (provider, tree_amount, payment_amount, new_shares),
        );

        new_shares
    }

    /// Remove liquidity from the AMM pool by burning LP shares.
    ///
    /// Returns proportional amounts of both tokens to `provider`.
    pub fn amm_remove_liquidity(
        env: Env,
        provider: Address,
        lp_shares: i128,
    ) -> (i128, i128) {
        provider.require_auth();
        if lp_shares <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }

        let lp_key = DataKey::LpShares(provider.clone());
        let existing_shares: i128 = env
            .storage()
            .persistent()
            .get(&lp_key)
            .unwrap_or(0i128);
        if existing_shares < lp_shares {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientShares);
        }

        let mut pool = Self::pool(&env);
        if pool.total_lp_shares == 0 {
            panic_with_error!(&env, MarketplaceError::AmmNotInitialized);
        }

        // Proportional withdrawal
        let tree_out = lp_shares * pool.reserve_tree / pool.total_lp_shares;
        let payment_out = lp_shares * pool.reserve_payment / pool.total_lp_shares;

        if tree_out <= 0 || payment_out <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }

        pool.reserve_tree -= tree_out;
        pool.reserve_payment -= payment_out;
        pool.total_lp_shares -= lp_shares;
        Self::save_pool(&env, &pool);

        // Burn shares
        let remaining = existing_shares - lp_shares;
        if remaining == 0 {
            env.storage().persistent().remove(&lp_key);
        } else {
            env.storage().persistent().set(&lp_key, &remaining);
        }

        let (_, tree_token, payment_token): (Address, Address, Address) = Self::config(&env);
        token::Client::new(&env, &tree_token).transfer(
            &env.current_contract_address(),
            &provider,
            &tree_out,
        );
        token::Client::new(&env, &payment_token).transfer(
            &env.current_contract_address(),
            &provider,
            &payment_out,
        );

        env.events().publish(
            (symbol_short!("amm_rem"),),
            (provider, tree_out, payment_out, lp_shares),
        );

        (tree_out, payment_out)
    }

    /// Swap an exact amount of `token_in` for at least `min_amount_out` of
    /// the other token.
    ///
    /// Supports both directions:
    ///   - TREE  → payment token
    ///   - payment token → TREE
    ///
    /// Fee of `FEE_NUMERATOR / FEE_DENOMINATOR` (30 bps) is deducted from
    /// `amount_in` before applying the xy = k formula. The fee stays in the
    /// pool, incrementing k for all LP holders.
    ///
    /// Panics with `AmmSlippageExceeded` if `amount_out < min_amount_out`.
    pub fn amm_swap_exact_in(
        env: Env,
        caller: Address,
        token_in: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> i128 {
        caller.require_auth();
        if amount_in <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }

        let (_, tree_token, payment_token): (Address, Address, Address) = Self::config(&env);

        // Determine swap direction
        let tree_to_payment = token_in == tree_token;
        let payment_to_tree = token_in == payment_token;
        if !tree_to_payment && !payment_to_tree {
            panic_with_error!(&env, MarketplaceError::AmmInvalidTokenIn);
        }

        let mut pool = Self::pool(&env);
        if pool.total_lp_shares == 0 || pool.reserve_tree == 0 || pool.reserve_payment == 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }

        // Compute amount out using constant-product formula with fee:
        //   amount_in_with_fee = amount_in * (FEE_DEN - FEE_NUM)
        //   amount_out = (amount_in_with_fee * reserve_out)
        //                / (reserve_in * FEE_DEN + amount_in_with_fee)
        let (reserve_in, reserve_out) = if tree_to_payment {
            (pool.reserve_tree, pool.reserve_payment)
        } else {
            (pool.reserve_payment, pool.reserve_tree)
        };

        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - FEE_NUMERATOR);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * FEE_DENOMINATOR + amount_in_with_fee;
        let amount_out = numerator / denominator;

        if amount_out <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }
        if amount_out < min_amount_out {
            panic_with_error!(&env, MarketplaceError::AmmSlippageExceeded);
        }

        // Fee is implicitly retained in pool (not deducted from reserve_in update)
        // reserve_in increases by the FULL amount_in (including fee portion)
        let (token_out, fee_in_payment_units) = if tree_to_payment {
            pool.reserve_tree += amount_in;
            pool.reserve_payment -= amount_out;
            // Track fee collected in payment-token equivalent
            let fee = amount_in * FEE_NUMERATOR / FEE_DENOMINATOR;
            let fee_payment = fee * pool.reserve_payment / pool.reserve_tree;
            (payment_token.clone(), fee_payment)
        } else {
            pool.reserve_payment += amount_in;
            pool.reserve_tree -= amount_out;
            let fee = amount_in * FEE_NUMERATOR / FEE_DENOMINATOR;
            (tree_token.clone(), fee)
        };
        pool.fees_collected += fee_in_payment_units;
        Self::save_pool(&env, &pool);

        // Execute token transfers
        token::Client::new(&env, &token_in).transfer(
            &caller,
            &env.current_contract_address(),
            &amount_in,
        );
        token::Client::new(&env, &token_out).transfer(
            &env.current_contract_address(),
            &caller,
            &amount_out,
        );

        env.events().publish(
            (symbol_short!("amm_swp"),),
            (caller, token_in, amount_in, amount_out),
        );

        amount_out
    }

    /// View-only price quote: given `amount_in` of `token_in`, return the
    /// expected output amount (before slippage, assuming current reserves).
    ///
    /// Does NOT execute the swap or emit events.
    pub fn amm_get_quote(env: Env, token_in: Address, amount_in: i128) -> i128 {
        if amount_in <= 0 {
            return 0;
        }
        let (_, tree_token, payment_token): (Address, Address, Address) = Self::config(&env);

        let pool = Self::pool(&env);
        if pool.total_lp_shares == 0 {
            return 0;
        }

        let (reserve_in, reserve_out) = if token_in == tree_token {
            (pool.reserve_tree, pool.reserve_payment)
        } else if token_in == payment_token {
            (pool.reserve_payment, pool.reserve_tree)
        } else {
            return 0;
        };

        if reserve_in == 0 || reserve_out == 0 {
            return 0;
        }

        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - FEE_NUMERATOR);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * FEE_DENOMINATOR + amount_in_with_fee;
        numerator / denominator
    }

    /// Return current AMM pool state (reserves, LP shares, fees collected).
    pub fn amm_pool_info(env: Env) -> AmmPool {
        Self::pool(&env)
    }

    /// Return the LP share balance for a given provider.
    pub fn amm_lp_balance(env: Env, provider: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LpShares(provider))
            .unwrap_or(0i128)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .expect("not initialized")
    }

    fn pool(env: &Env) -> AmmPool {
        env.storage()
            .instance()
            .get(&DataKey::AmmPool)
            .unwrap_or(AmmPool {
                reserve_tree: 0,
                reserve_payment: 0,
                total_lp_shares: 0,
                fees_collected: 0,
            })
    }

    fn save_pool(env: &Env, pool: &AmmPool) {
        env.storage().instance().set(&DataKey::AmmPool, pool);
    }

    /// Integer square root (floor) using Newton's method.
    /// Handles the xy = k geometric mean for initial LP share minting.
    fn isqrt(n: i128) -> i128 {
        if n <= 0 {
            return 0;
        }
        let mut x = n;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    fn deploy_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    struct Ctx {
        env: Env,
        contract: Address,
        client: CarbonMarketplaceClient<'static>,
        tree_token: Address,
        payment_token: Address,
        admin: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let tree_token = deploy_token(&env, &admin);
        let payment_token = deploy_token(&env, &admin);
        let contract = env.register(CarbonMarketplace, ());
        let client = CarbonMarketplaceClient::new(&env, &contract);
        client.initialize(&admin, &tree_token, &payment_token);
        Ctx { env, contract, client, tree_token, payment_token, admin }
    }

    // ── AMM: add liquidity ─────────────────────────────────────────────────────

    #[test]
    fn test_amm_first_deposit_mints_geometric_mean_shares() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 1_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 1_000_000);

        // 1,000,000 * 1,000,000 = 1e12; sqrt = 1,000,000
        let shares = ctx.client.amm_add_liquidity(&lp, &1_000_000i128, &1_000_000i128);
        // shares = isqrt(1e12) * LP_PRECISION = 1_000_000 * 1_000_000_000_000
        assert_eq!(shares, 1_000_000 * 1_000_000_000_000i128);

        let pool = ctx.client.amm_pool_info();
        assert_eq!(pool.reserve_tree, 1_000_000);
        assert_eq!(pool.reserve_payment, 1_000_000);
        assert_eq!(pool.total_lp_shares, shares);

        assert_eq!(ctx.client.amm_lp_balance(&lp), shares);
    }

    #[test]
    fn test_amm_second_deposit_proportional_shares() {
        let ctx = setup();
        let lp1 = Address::generate(&ctx.env);
        let lp2 = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp1, 2_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp1, 2_000_000);
        mint(&ctx.env, &ctx.tree_token, &lp2, 1_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp2, 1_000_000);

        let shares1 = ctx.client.amm_add_liquidity(&lp1, &2_000_000i128, &2_000_000i128);
        let shares2 = ctx.client.amm_add_liquidity(&lp2, &1_000_000i128, &1_000_000i128);

        // lp2 contributes half of lp1's deposit; expects half the shares
        assert_eq!(shares2, shares1 / 2);

        let pool = ctx.client.amm_pool_info();
        assert_eq!(pool.total_lp_shares, shares1 + shares2);
    }

    // ── AMM: remove liquidity ──────────────────────────────────────────────────

    #[test]
    fn test_amm_remove_returns_proportional_tokens() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 4_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 4_000);

        let shares = ctx.client.amm_add_liquidity(&lp, &4_000i128, &4_000i128);

        let tree_pre = token::Client::new(&ctx.env, &ctx.tree_token).balance(&lp);
        let payment_pre = token::Client::new(&ctx.env, &ctx.payment_token).balance(&lp);

        // Remove half the shares
        let half = shares / 2;
        let (tree_out, payment_out) = ctx.client.amm_remove_liquidity(&lp, &half);

        assert_eq!(tree_out, 2_000);
        assert_eq!(payment_out, 2_000);

        assert_eq!(
            token::Client::new(&ctx.env, &ctx.tree_token).balance(&lp),
            tree_pre + tree_out
        );
        assert_eq!(
            token::Client::new(&ctx.env, &ctx.payment_token).balance(&lp),
            payment_pre + payment_out
        );
        assert_eq!(ctx.client.amm_lp_balance(&lp), shares - half);
    }

    #[test]
    fn test_amm_full_removal_zeros_balance() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 2_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 2_000);

        let shares = ctx.client.amm_add_liquidity(&lp, &2_000i128, &2_000i128);
        ctx.client.amm_remove_liquidity(&lp, &shares);

        assert_eq!(ctx.client.amm_lp_balance(&lp), 0);
    }

    // ── AMM: constant-product swap ─────────────────────────────────────────────

    #[test]
    fn test_amm_swap_tree_to_payment() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 10_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 10_000_000);
        ctx.client.amm_add_liquidity(&lp, &10_000_000i128, &10_000_000i128);

        let trader = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &trader, 100_000);

        let amount_in: i128 = 100_000;
        let quote = ctx.client.amm_get_quote(&ctx.tree_token, &amount_in);
        assert!(quote > 0);
        assert!(quote < amount_in); // output < input due to fee + slippage

        let amount_out = ctx.client.amm_swap_exact_in(
            &trader,
            &ctx.tree_token,
            &amount_in,
            &1i128,
        );
        assert_eq!(amount_out, quote);

        // Trader received payment tokens
        let payment_balance = token::Client::new(&ctx.env, &ctx.payment_token).balance(&trader);
        assert_eq!(payment_balance, amount_out);

        // xy should have increased (k increases with fees)
        let pool = ctx.client.amm_pool_info();
        let new_k = pool.reserve_tree * pool.reserve_payment;
        assert!(new_k >= 10_000_000i128 * 10_000_000i128);
    }

    #[test]
    fn test_amm_swap_payment_to_tree() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 10_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 10_000_000);
        ctx.client.amm_add_liquidity(&lp, &10_000_000i128, &10_000_000i128);

        let trader = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.payment_token, &trader, 200_000);

        let amount_out = ctx.client.amm_swap_exact_in(
            &trader,
            &ctx.payment_token,
            &200_000i128,
            &1i128,
        );
        assert!(amount_out > 0);

        let tree_balance = token::Client::new(&ctx.env, &ctx.tree_token).balance(&trader);
        assert_eq!(tree_balance, amount_out);
    }

    #[test]
    #[should_panic]
    fn test_amm_slippage_exceeded_panics() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 1_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 1_000_000);
        ctx.client.amm_add_liquidity(&lp, &1_000_000i128, &1_000_000i128);

        let trader = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &trader, 1_000);
        // Set min_amount_out impossibly high
        ctx.client.amm_swap_exact_in(&trader, &ctx.tree_token, &1_000i128, &999_999_999i128);
    }

    #[test]
    fn test_amm_get_quote_matches_swap() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &lp, 5_000_000);
        mint(&ctx.env, &ctx.payment_token, &lp, 5_000_000);
        ctx.client.amm_add_liquidity(&lp, &5_000_000i128, &5_000_000i128);

        let amount_in: i128 = 50_000;
        let quote = ctx.client.amm_get_quote(&ctx.tree_token, &amount_in);

        let trader = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &trader, amount_in);
        let actual_out = ctx.client.amm_swap_exact_in(&trader, &ctx.tree_token, &amount_in, &1i128);

        assert_eq!(quote, actual_out);
    }

    // ── AMM: integer sqrt test ────────────────────────────────────────────────

    #[test]
    fn test_isqrt_correctness() {
        // Test via amm_add_liquidity geometric mean (indirect)
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        // 9 * 4 = 36; sqrt = 6; shares = 6 * LP_PRECISION
        mint(&ctx.env, &ctx.tree_token, &lp, 9);
        mint(&ctx.env, &ctx.payment_token, &lp, 4);
        let shares = ctx.client.amm_add_liquidity(&lp, &9i128, &4i128);
        assert_eq!(shares, 6 * 1_000_000_000_000i128);
    }

    // ── Fixed-price listing tests ─────────────────────────────────────────────

    #[test]
    fn test_list_and_buy() {
        let ctx = setup();
        let seller = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let planter = Address::generate(&ctx.env);

        mint(&ctx.env, &ctx.tree_token, &seller, 1_000);
        // price 100 payment per TREE, scaled by 1e7
        let price: i128 = 100 * 1_000_0000;
        let listing_id = ctx.client.list(&seller, &planter, &1_000i128, &price, &ctx.payment_token);

        let cost = 500i128 * price / 1_000_0000; // 500 TREE at price 100 = 50,000
        mint(&ctx.env, &ctx.payment_token, &buyer, cost);
        ctx.client.buy(&buyer, &listing_id, &500i128);

        let listing = ctx.client.get_listing(&listing_id);
        assert_eq!(listing.filled, 500);
        assert_eq!(listing.status, ListingStatus::Active); // partial fill

        let tree_balance = token::Client::new(&ctx.env, &ctx.tree_token).balance(&buyer);
        assert_eq!(tree_balance, 500);
    }

    #[test]
    fn test_cancel_listing_returns_tokens() {
        let ctx = setup();
        let seller = Address::generate(&ctx.env);
        let planter = Address::generate(&ctx.env);
        mint(&ctx.env, &ctx.tree_token, &seller, 1_000);

        let listing_id = ctx.client.list(&seller, &planter, &1_000i128, &1_000_0000i128, &ctx.payment_token);
        ctx.client.cancel(&seller, &listing_id);

        let listing = ctx.client.get_listing(&listing_id);
        assert_eq!(listing.status, ListingStatus::Cancelled);

        let tree_balance = token::Client::new(&ctx.env, &ctx.tree_token).balance(&seller);
        assert_eq!(tree_balance, 1_000); // tokens returned
    }
}
#[contractclient(name = "PriceOracleClient")]
trait PriceOracleTrait {
    fn initialize(env: Env, price: i128, timestamp: u64);
    fn set_price(env: Env, price: i128, timestamp: u64);
    fn price(env: Env) -> i128;
    fn timestamp(env: Env) -> u64;
}

// ── Error codes ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketplaceError {
    ListingAmountMustBePositive  = 100,
    BuyAmountMustBePositive      = 101,
    AuctionNotFound              = 102,
    AuctionNotActive             = 103,
    SelfTrade                    = 104,
    InsufficientLiquidity        = 105,
    AuctionExpired               = 106,
    BidBelowReservePrice         = 107,
    ListingNotFound              = 108,
    ListingNotActive             = 109,
    InvalidPriceRange            = 110,
    InvalidDecayRate             = 111,
    InvalidDuration              = 112,
    PriceMustBePositive          = 113,
    /// Order does not exist
    OrderNotFound                = 114,
    /// Order is no longer open (already filled or cancelled)
    OrderNotOpen                 = 115,
    /// Caller is not the owner of the order
    Unauthorized                 = 116,
    /// Amount requested exceeds remaining order quantity
    OrderAmountExceeded          = 117,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingStatus {
    Active,
    Filled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AuctionStatus {
    Active,
    Completed,
    Cancelled,
}

/// Status of a partial-match order.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderStatus {
    /// Order is open and available for matching
    Open,
    /// Order has been completely filled
    Filled,
    /// Order was cancelled by the owner
    Cancelled,
}

/// Side of an order in the partial-matching orderbook.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

/// An open order in the partial-match orderbook.
///
/// For `Buy` orders:
///   - `owner` is the prospective buyer
///   - `price_limit` is the maximum price per token the buyer will pay
///   - TREE tokens are NOT escrowed; the buyer pays on each match
///
/// For `Sell` orders:
///   - `owner` is the seller
///   - `price_limit` is the minimum price per token the seller will accept
///   - `remaining` TREE tokens are escrowed in the contract
#[contracttype]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: u64,
    pub side: OrderSide,
    pub owner: Address,
    /// Original planter (for royalty routing on sell orders)
    pub planter: Address,
    pub tree_token: Address,
    pub payment_token: Address,
    /// Original requested quantity
    pub total_amount: i128,
    /// Quantity not yet matched
    pub remaining: i128,
    /// Buy: max price per token willing to pay. Sell: min acceptable price.
    pub price_limit: i128,
    pub status: OrderStatus,
    pub created_at: u64,
}


#[contracttype]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller: Address,
    pub planter: Address,
    pub tree_token: Address,
    pub payment_token: Address,
    pub total_amount: i128,
    pub remaining: i128,
    pub price_per_token: i128,
    pub status: ListingStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DutchAuction {
    pub id: u64,
    pub seller: Address,
    pub planter: Address,
    pub tree_token: Address,
    pub payment_token: Address,
    pub total_amount: i128,
    pub remaining: i128,
    pub starting_price: i128,
    pub reserve_price: i128,
    pub decay_rate: u64,
    pub start_time: u64,
    pub duration: u64,
    pub status: AuctionStatus,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Config,
    AdminControls,
    Oracle,
    OracleConfig,
    ListingCount,
    Listing(u64),
    AuctionCount,
    Auction(u64),
    AuctionConfig,
    RoyaltyConfig,
    /// Minimum trade size threshold
    MinTradeSize,
    /// Global order counter (covers both buy and sell orders)
    OrderCount,
    /// Per-order record
    Order(u64),
    /// Index: list of active buy order IDs (for sell-order matching)
    BuyOrderIndex,
    /// Index: list of active sell order IDs (for buy-order matching)
    SellOrderIndex,
}

/// Default minimum trade size: 1.0 metric ton CO2 (1,000,000 base units).
pub const MIN_TRADE_SIZE: i128 = 1_000_000;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {

    /// One-time initialisation.
    pub fn initialize(env: Env, admin: Address, tree_token: Address, admin_controls: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Config, &(admin, tree_token));
        env.storage().instance().set(&DataKey::AdminControls, &admin_controls);
        env.storage().instance().set(&DataKey::ListingCount, &0u64);
        env.storage().instance().set(&DataKey::AuctionCount, &0u64);
        env.storage().instance().set(&DataKey::OrderCount, &0u64);
        env.storage().instance().set(&DataKey::BuyOrderIndex, &Vec::<u64>::new(&env));
        env.storage().instance().set(&DataKey::SellOrderIndex, &Vec::<u64>::new(&env));
    }


    /// Admin configures a price oracle feed.
    pub fn configure_price_oracle(env: Env, oracle: Address, max_staleness: u64, fallback_price: i128) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();
        if fallback_price <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::OracleConfig, &(max_staleness, fallback_price));
    }

    }

    /// Returns the minimum trade size threshold in base units (default: 1_000_000 = 1.0 metric ton CO2).
    pub fn get_min_trade_size(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinTradeSize)
            .unwrap_or(MIN_TRADE_SIZE)
    }

    /// Admin configures the minimum trade size threshold.
    pub fn set_min_trade_size(env: Env, min_size: i128) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if min_size <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

            .set(&DataKey::MinTradeSize, &min_size);
    }

    /// Returns the current marketplace price for TREE tokens.
    ///
    /// If an oracle is configured and fresh, its price is returned. Otherwise the
    /// administrator-configured fallback price is used.
    /// Returns the current oracle-or-fallback price for TREE tokens.
    pub fn get_dynamic_price(env: Env) -> i128 {
        Self::resolve_listing_price(&env, 0)
    }

    /// Admin configures default Dutch Auction parameters.
    pub fn configure_auction(
        env: Env,
        starting_price: i128,
        reserve_price: i128,
        decay_rate: u64,
        duration: u64,
    ) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();
        if starting_price <= 0 { panic_with_error!(&env, MarketplaceError::PriceMustBePositive); }
        if reserve_price <= 0  { panic_with_error!(&env, MarketplaceError::PriceMustBePositive); }
        if reserve_price >= starting_price { panic_with_error!(&env, MarketplaceError::InvalidPriceRange); }
        if decay_rate == 0 || decay_rate > 10000 { panic_with_error!(&env, MarketplaceError::InvalidDecayRate); }
        if duration == 0 { panic_with_error!(&env, MarketplaceError::InvalidDuration); }
        env.storage().instance().set(&DataKey::AuctionConfig, &(starting_price, reserve_price, decay_rate, duration));
    }

    /// Seller lists TREE tokens at a fixed price. TREE tokens are escrowed.
    pub fn list(
        env: Env,
        seller: Address,
        planter: Address,
        amount: i128,
        price_per_token: i128,
        payment_token: Address,
    ) -> u64 {
        Self::assert_not_paused(&env);
        seller.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }

        if amount < Self::get_min_trade_size(&env) {
            panic_with_error!(&env, MarketplaceError::BelowMinimumTradeSize);
        }

        if amount <= 0 { panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive); }
        let resolved_price = Self::resolve_listing_price(&env, price_per_token);
        let (_, tree_token) = Self::config(&env);
        token::Client::new(&env, &tree_token).transfer(&seller, &env.current_contract_address(), &amount);
        let id: u64 = env.storage().instance().get(&DataKey::ListingCount).unwrap_or(0);
        let new_id = id + 1;
        let listing = Listing {
            id: new_id,
            seller: seller.clone(),
            planter,
            tree_token,
            payment_token,
            total_amount: amount,
            remaining: amount,
            price_per_token: resolved_price,
            status: ListingStatus::Active,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Listing(new_id), &listing);
        env.storage().instance().set(&DataKey::ListingCount, &new_id);
        env.events().publish((symbol_short!("listed"), seller), (new_id, amount, resolved_price));
        new_id
    }


    /// Buy from a specific listing (partial or full fill).
    pub fn buy(env: Env, buyer: Address, listing_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        if amount <= 0 { panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive); }
        let mut listing: Listing = env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));
        if listing.status != ListingStatus::Active { panic_with_error!(&env, MarketplaceError::ListingNotActive); }
        if buyer == listing.seller { panic_with_error!(&env, MarketplaceError::SelfTrade); }
        if amount > listing.remaining { panic_with_error!(&env, MarketplaceError::InsufficientLiquidity); }
        let payment = amount.checked_mul(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));
        let (royalty_amount, seller_amount) = Self::split_payment(&env, payment, &listing.planter, &listing.seller);
        if royalty_amount > 0 {
            token::Client::new(&env, &listing.payment_token).transfer(&buyer, &listing.planter, &royalty_amount);
        }
        token::Client::new(&env, &listing.payment_token).transfer(&buyer, &listing.seller, &seller_amount);
        token::Client::new(&env, &listing.tree_token).transfer(&env.current_contract_address(), &buyer, &amount);
        listing.remaining -= amount;
        if listing.remaining == 0 { listing.status = ListingStatus::Filled; }
        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);
        env.events().publish((symbol_short!("sold"), listing_id), (buyer, amount, payment, royalty_amount));
    }

    /// Seller cancels a listing, reclaiming remaining TREE tokens.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();
        let mut listing: Listing = env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));
        if listing.status != ListingStatus::Active { panic_with_error!(&env, MarketplaceError::ListingNotActive); }
        if listing.remaining > 0 {
            token::Client::new(&env, &listing.tree_token).transfer(
                &env.current_contract_address(), &seller, &listing.remaining,
            );
        }
        listing.status = ListingStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);
        env.events().publish((symbol_short!("cancelled"), listing_id), listing.remaining);
    }

    /// Admin de-lists any active listing.
    pub fn admin_cancel(env: Env, listing_id: u64) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();
        let mut listing: Listing = env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));
        if listing.status != ListingStatus::Active { panic_with_error!(&env, MarketplaceError::ListingNotActive); }
        if listing.remaining > 0 {
            token::Client::new(&env, &listing.tree_token).transfer(
                &env.current_contract_address(), &listing.seller, &listing.remaining,
            );
        }
        listing.status = ListingStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);
        env.events().publish((symbol_short!("adm_cncl"), listing_id), ());
    }

    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        env.storage().persistent().get(&DataKey::Listing(listing_id))
    }

    pub fn listing_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::ListingCount).unwrap_or(0)
    }


    // ── Dutch Auction ─────────────────────────────────────────────────────────

    pub fn create_auction(env: Env, seller: Address, planter: Address, amount: i128, payment_token: Address) -> u64 {
        Self::assert_not_paused(&env);
        seller.require_auth();
        if amount <= 0 { panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive); }
        let (starting_price, reserve_price, decay_rate, duration) = Self::auction_config(&env);
        let (_, tree_token) = Self::config(&env);
        token::Client::new(&env, &tree_token).transfer(&seller, &env.current_contract_address(), &amount);
        let id: u64 = env.storage().instance().get(&DataKey::AuctionCount).unwrap_or(0);
        let new_id = id + 1;
        let auction = DutchAuction {
            id: new_id, seller: seller.clone(), planter, tree_token, payment_token,
            total_amount: amount, remaining: amount, starting_price, reserve_price,
            decay_rate, start_time: env.ledger().timestamp(), duration, status: AuctionStatus::Active,
        };
        env.storage().persistent().set(&DataKey::Auction(new_id), &auction);
        env.storage().instance().set(&DataKey::AuctionCount, &new_id);
        env.events().publish((symbol_short!("auct_crtd"), seller), (new_id, amount, starting_price));
        new_id
    }

    pub fn bid(env: Env, buyer: Address, auction_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        if amount <= 0 { panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive); }
        let mut auction: DutchAuction = env.storage().persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));
        if auction.status != AuctionStatus::Active { panic_with_error!(&env, MarketplaceError::AuctionNotActive); }
        if buyer == auction.seller { panic_with_error!(&env, MarketplaceError::SelfTrade); }
        if amount > auction.remaining { panic_with_error!(&env, MarketplaceError::InsufficientLiquidity); }
        let elapsed = env.ledger().timestamp().saturating_sub(auction.start_time);
        if elapsed > auction.duration { panic_with_error!(&env, MarketplaceError::AuctionExpired); }
        let current_price = Self::calculate_current_price(&auction, env.ledger().timestamp());
        if current_price < auction.reserve_price { panic_with_error!(&env, MarketplaceError::BidBelowReservePrice); }
        let payment = amount.checked_mul(current_price)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));
        let (royalty_amount, seller_amount) = Self::split_payment(&env, payment, &auction.planter, &auction.seller);
        if royalty_amount > 0 {
            token::Client::new(&env, &auction.payment_token).transfer(&buyer, &auction.planter, &royalty_amount);
        }
        token::Client::new(&env, &auction.payment_token).transfer(&buyer, &auction.seller, &seller_amount);
        token::Client::new(&env, &auction.tree_token).transfer(&env.current_contract_address(), &buyer, &amount);
        auction.remaining -= amount;
        if auction.remaining == 0 { auction.status = AuctionStatus::Completed; }
        env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
        env.events().publish((symbol_short!("bid"), auction_id), (buyer, amount, current_price, payment, royalty_amount));
    }

    pub fn cancel_auction(env: Env, seller: Address, auction_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();
        let mut auction: DutchAuction = env.storage().persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));
        if auction.status != AuctionStatus::Active { panic_with_error!(&env, MarketplaceError::AuctionNotActive); }
        if auction.remaining > 0 {
            token::Client::new(&env, &auction.tree_token).transfer(
                &env.current_contract_address(), &seller, &auction.remaining,
            );
        }
        auction.status = AuctionStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
        env.events().publish((symbol_short!("auct_cncl"), auction_id), auction.remaining);
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Option<DutchAuction> {
        env.storage().persistent().get(&DataKey::Auction(auction_id))
    }

    pub fn get_current_price(env: Env, auction_id: u64) -> i128 {
        let auction: DutchAuction = env.storage().persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));
        Self::calculate_current_price(&auction, env.ledger().timestamp())
    }

    pub fn auction_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::AuctionCount).unwrap_or(0)
    }


    // ── Partial Order Matching (issue #760) ───────────────────────────────────

    /// Place a buy order and immediately match it against existing sell listings.
    ///
    /// The engine walks active sell listings in ascending price order (cheapest
    /// first) and fills as many tokens as possible at or below `max_price_per_token`.
    /// Any unmatched quantity is stored as an open `Buy` order available for
    /// future sell orders to match against.
    ///
    /// # Authorization
    /// `buyer` must sign the transaction.
    ///
    /// # Parameters
    /// * `buyer`               — account placing the buy order
    /// * `payment_token`       — token used for payment (e.g. USDC)
    /// * `amount`              — total TREE tokens to acquire
    /// * `max_price_per_token` — maximum price per token the buyer will pay
    ///
    /// # Returns
    /// The new order ID. Query with `get_order`.
    pub fn place_buy_order(
        env: Env,
        buyer: Address,
        payment_token: Address,
        amount: i128,
        max_price_per_token: i128,
    ) -> u64 {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        if amount <= 0 { panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive); }
        if max_price_per_token <= 0 { panic_with_error!(&env, MarketplaceError::PriceMustBePositive); }

        let (_, tree_token) = Self::config(&env);

        // Allocate order ID
        let order_id = Self::next_order_id(&env);

        let mut order = Order {
            id: order_id,
            side: OrderSide::Buy,
            owner: buyer.clone(),
            planter: buyer.clone(), // buy orders don't have a planter
            tree_token: tree_token.clone(),
            payment_token: payment_token.clone(),
            total_amount: amount,
            remaining: amount,
            price_limit: max_price_per_token,
            status: OrderStatus::Open,
            created_at: env.ledger().timestamp(),
        };

        // Match against sell listings (price ascending)
        let sell_ids: Vec<u64> = env.storage().instance()
            .get(&DataKey::SellOrderIndex)
            .unwrap_or_else(|| Vec::new(&env));

        let mut matched_total: i128 = 0;

        // Collect eligible sell order IDs sorted by price ascending
        let mut eligible: Vec<u64> = Vec::new(&env);
        for i in 0..sell_ids.len() {
            let sid = sell_ids.get(i).unwrap();
            if let Some(sell_order) = env.storage().persistent().get::<DataKey, Order>(&DataKey::Order(sid)) {
                if sell_order.status == OrderStatus::Open
                    && sell_order.payment_token == payment_token
                    && sell_order.price_limit <= max_price_per_token
                    && sell_order.remaining > 0
                {
                    eligible.push_back(sid);
                }
            }
        }

        // Simple insertion sort by price_limit ascending (eligible list is typically small)
        let n = eligible.len();
        for i in 1..n {
            for j in (1..=i).rev() {
                let a = eligible.get(j - 1).unwrap();
                let b = eligible.get(j).unwrap();
                let pa: i128 = env.storage().persistent()
                    .get::<DataKey, Order>(&DataKey::Order(a))
                    .map(|o| o.price_limit).unwrap_or(i128::MAX);
                let pb: i128 = env.storage().persistent()
                    .get::<DataKey, Order>(&DataKey::Order(b))
                    .map(|o| o.price_limit).unwrap_or(i128::MAX);
                if pa > pb {
                    eligible.set(j - 1, b);
                    eligible.set(j, a);
                } else {
                    break;
                }
            }
        }

        for i in 0..eligible.len() {
            if order.remaining == 0 { break; }
            let sid = eligible.get(i).unwrap();
            let mut sell_order: Order = match env.storage().persistent().get(&DataKey::Order(sid)) {
                Some(o) => o,
                None => continue,
            };
            if sell_order.status != OrderStatus::Open || sell_order.remaining == 0 { continue; }

            let fill_qty = if order.remaining < sell_order.remaining {
                order.remaining
            } else {
                sell_order.remaining
            };

            let exec_price = sell_order.price_limit; // execute at the sell limit (maker price)
            let payment = fill_qty.checked_mul(exec_price)
                .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

            let (royalty_amount, seller_amount) = Self::split_payment(
                &env, payment, &sell_order.planter, &sell_order.owner,
            );
            if royalty_amount > 0 {
                token::Client::new(&env, &payment_token).transfer(
                    &buyer, &sell_order.planter, &royalty_amount,
                );
            }
            token::Client::new(&env, &payment_token).transfer(
                &buyer, &sell_order.owner, &seller_amount,
            );
            // Release escrowed TREE tokens from sell order to buyer
            token::Client::new(&env, &tree_token).transfer(
                &env.current_contract_address(), &buyer, &fill_qty,
            );

            matched_total += fill_qty;
            order.remaining -= fill_qty;
            sell_order.remaining -= fill_qty;
            if sell_order.remaining == 0 { sell_order.status = OrderStatus::Filled; }
            env.storage().persistent().set(&DataKey::Order(sid), &sell_order);

            env.events().publish(
                (symbol_short!("matched"), order_id),
                (sid, fill_qty, exec_price, payment, royalty_amount),
            );
        }

        if order.remaining > 0 {
            order.status = OrderStatus::Open;
            // Add to buy index for future sell-order matching
            let mut buy_ids: Vec<u64> = env.storage().instance()
                .get(&DataKey::BuyOrderIndex)
                .unwrap_or_else(|| Vec::new(&env));
            buy_ids.push_back(order_id);
            env.storage().instance().set(&DataKey::BuyOrderIndex, &buy_ids);
        } else {
            order.status = OrderStatus::Filled;
        }

        env.storage().persistent().set(&DataKey::Order(order_id), &order);
        if matched_total > 0 {
            Self::compact_sell_index(&env);
        }

        env.events().publish(
            (symbol_short!("buy_ordr"), buyer),
            (order_id, amount, max_price_per_token, matched_total),
        );
        order_id
    }


    /// Place a sell order and immediately match it against existing buy orders.
    ///
    /// TREE tokens are escrowed in the contract. The engine walks open buy orders
    /// in descending price order (highest bidder first) and fills as many tokens
    /// as possible at or above `min_price_per_token`. Any unmatched quantity is
    /// stored as an open `Sell` order.
    ///
    /// # Authorization
    /// `seller` must sign the transaction.
    ///
    /// # Parameters
    /// * `seller`              — account placing the sell order
    /// * `planter`             — original tree planter (receives royalty if configured)
    /// * `amount`              — total TREE tokens to sell
    /// * `min_price_per_token` — minimum acceptable price per token
    ///
    /// # Returns
    /// The new order ID. Query with `get_order`.
    pub fn place_sell_order(
        env: Env,
        seller: Address,
        planter: Address,
        amount: i128,
        min_price_per_token: i128,
    ) -> u64 {
        Self::assert_not_paused(&env);
        seller.require_auth();
        if amount <= 0 { panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive); }
        if min_price_per_token <= 0 { panic_with_error!(&env, MarketplaceError::PriceMustBePositive); }

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }

        if amount < Self::get_min_trade_size(&env) {
            panic_with_error!(&env, MarketplaceError::BelowMinimumTradeSize);
        }

        let (starting_price, reserve_price, decay_rate, duration) = Self::auction_config(&env);
        let (_, tree_token) = Self::config(&env);

        // Escrow TREE tokens upfront
        token::Client::new(&env, &tree_token).transfer(
            &seller, &env.current_contract_address(), &amount,
        );

        let order_id = Self::next_order_id(&env);

        // Infer payment_token from the highest-priced matching buy order if available,
        // otherwise use the first available buy order's payment token.
        // Sellers specify min price; payment token is resolved from matched buy orders.
        // We store a placeholder and update it upon first match.
        let payment_token_placeholder: Address = seller.clone();

        let mut order = Order {
            id: order_id,
            side: OrderSide::Sell,
            owner: seller.clone(),
            planter: planter.clone(),
            tree_token: tree_token.clone(),
            payment_token: payment_token_placeholder,
            total_amount: amount,
            remaining: amount,
            price_limit: min_price_per_token,
            status: OrderStatus::Open,
            created_at: env.ledger().timestamp(),
        };

        // Match against buy orders (price descending — best bid first)
        let buy_ids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BuyOrderIndex)
            .unwrap_or_else(|| Vec::new(&env));

        let mut eligible: Vec<u64> = Vec::new(&env);
        for i in 0..buy_ids.len() {
            let bid = buy_ids.get(i).unwrap();
            if let Some(buy_order) = env.storage().persistent().get::<DataKey, Order>(&DataKey::Order(bid)) {
                if buy_order.status == OrderStatus::Open
                    && buy_order.price_limit >= min_price_per_token
                    && buy_order.remaining > 0
                {
                    eligible.push_back(bid);
                }
            }
        }

        // Insertion sort descending by price_limit
        let n = eligible.len();
        for i in 1..n {
            for j in (1..=i).rev() {
                let a = eligible.get(j - 1).unwrap();
                let b = eligible.get(j).unwrap();
                let pa: i128 = env.storage().persistent()
                    .get::<DataKey, Order>(&DataKey::Order(a))
                    .map(|o| o.price_limit).unwrap_or(0);
                let pb: i128 = env.storage().persistent()
                    .get::<DataKey, Order>(&DataKey::Order(b))
                    .map(|o| o.price_limit).unwrap_or(0);
                if pa < pb {
                    eligible.set(j - 1, b);
                    eligible.set(j, a);
                } else {
                    break;
                }
            }
        }

        let mut matched_total: i128 = 0;
        let mut resolved_payment_token: Option<Address> = None;

        for i in 0..eligible.len() {
            if order.remaining == 0 { break; }
            let bid = eligible.get(i).unwrap();
            let mut buy_order: Order = match env.storage().persistent().get(&DataKey::Order(bid)) {
                Some(o) => o,
                None => continue,
            };
            if buy_order.status != OrderStatus::Open || buy_order.remaining == 0 { continue; }

            let fill_qty = if order.remaining < buy_order.remaining {
                order.remaining
            } else {
                buy_order.remaining
            };

            // Execute at the buy order's limit price (taker gets price improvement if any)
            let exec_price = buy_order.price_limit;
            let payment = fill_qty.checked_mul(exec_price)
                .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

            let (royalty_amount, seller_amount) = Self::split_payment(
                &env, payment, &planter, &seller,
            );
            if royalty_amount > 0 {
                token::Client::new(&env, &buy_order.payment_token).transfer(
                    &buy_order.owner, &planter, &royalty_amount,
                );
            }
                &buy_order.owner, &seller, &seller_amount,
            );
            // Release escrowed TREE from this contract to buyer
            token::Client::new(&env, &tree_token).transfer(
                &env.current_contract_address(), &buy_order.owner, &fill_qty,
            );

            if resolved_payment_token.is_none() {
                resolved_payment_token = Some(buy_order.payment_token.clone());
            }

            matched_total += fill_qty;
            order.remaining -= fill_qty;
            buy_order.remaining -= fill_qty;
            if buy_order.remaining == 0 { buy_order.status = OrderStatus::Filled; }
            env.storage().persistent().set(&DataKey::Order(bid), &buy_order);

            env.events().publish(
                (symbol_short!("matched"), order_id),
                (bid, fill_qty, exec_price, payment, royalty_amount),
            );
        }

        // Resolve payment token for storage (use first matched buy order's token, or seller address as sentinel)
        order.payment_token = resolved_payment_token.unwrap_or(seller.clone());

        if order.remaining > 0 {
            order.status = OrderStatus::Open;
            let mut sell_ids: Vec<u64> = env.storage().instance()
                .get(&DataKey::SellOrderIndex)
                .unwrap_or_else(|| Vec::new(&env));
            sell_ids.push_back(order_id);
            env.storage().instance().set(&DataKey::SellOrderIndex, &sell_ids);
        } else {
            order.status = OrderStatus::Filled;
        }

        env.storage().persistent().set(&DataKey::Order(order_id), &order);
        if matched_total > 0 {
            Self::compact_buy_index(&env);
        }

            (symbol_short!("sel_ordr"), seller),
            (order_id, amount, min_price_per_token, matched_total),
        );
        order_id

            };

            } else {
            };


            );
                );
            }
            );
            );

            }


                (symbol_short!("matched"), order_id),
                (bid, fill_qty, exec_price, payment, royalty_amount),
            );
        }


        } else {
        }

        }

        // Record TWAP observation from this trade price
        Self::record_observation(&env, current_price);

        env.events()
            .publish((symbol_short!("bid"), auction_id), (buyer, amount, current_price, payment, royalty_amount));
    }


    /// Cancel an open order.
    ///
    /// For sell orders, remaining escrowed TREE tokens are returned to the seller.
    /// For buy orders, no tokens are held so nothing is refunded.
    ///
    /// # Authorization
    /// Only the order owner may cancel.
    pub fn cancel_order(env: Env, caller: Address, order_id: u64) {
        Self::assert_not_paused(&env);
        caller.require_auth();

        let mut order: Order = env.storage().persistent()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::OrderNotFound));

        if order.status != OrderStatus::Open {
            panic_with_error!(&env, MarketplaceError::OrderNotOpen);
        }
        if order.owner != caller {
            panic_with_error!(&env, MarketplaceError::Unauthorized);
        }

        // Refund escrowed TREE tokens for sell orders
        if order.side == OrderSide::Sell && order.remaining > 0 {
            token::Client::new(&env, &order.tree_token).transfer(
                &env.current_contract_address(), &caller, &order.remaining,
            );
        }

        order.status = OrderStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Order(order_id), &order);

        // Remove from the appropriate index
        match order.side {
            OrderSide::Buy  => Self::compact_buy_index(&env),
            OrderSide::Sell => Self::compact_sell_index(&env),
        }

        env.events().publish((symbol_short!("ord_cncl"), order_id), caller);
    }

    /// Returns the order record, or `None` if it does not exist.
    pub fn get_order(env: Env, order_id: u64) -> Option<Order> {
        env.storage().persistent().get(&DataKey::Order(order_id))
    }

    /// Returns the total number of orders created (buy + sell, all statuses).
    pub fn order_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::OrderCount).unwrap_or(0)
    }

    // ── Royalty ───────────────────────────────────────────────────────────────

    pub fn set_royalty(env: Env, basis_points: u32) {
        let (admin, _) = Self::config(&env);
        admin.require_auth();
        if basis_points > 10_000 {
            panic_with_error!(&env, HarvestaError::InvalidRoyalty);
        }
        env.storage().instance().set(&DataKey::RoyaltyConfig, &basis_points);
    }

    pub fn get_royalty(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::RoyaltyConfig).unwrap_or(0)
    }

    }

    // ── Anti-Wash Trading Order Validation (Closes #771) ──────────────────────

    /// Validate that a buy order and sell order do not constitute self-trading / wash trading.
    ///
    /// Panics with `MarketplaceError::SelfTrade` if `seller == buyer`.
    pub fn validate_order_trade(env: Env, seller: Address, buyer: Address) {
        if seller == buyer {
            panic_with_error!(&env, MarketplaceError::SelfTrade);
        }
    }

    /// Pre-validate order matching between a buy order owner and sell order owner.
    /// Panics with `MarketplaceError::SelfTrade` if `buy_owner == sell_owner`.
    pub fn validate_order_matching(env: Env, buy_owner: Address, sell_owner: Address) {
        if buy_owner == sell_owner {
        }
    }

    // ── Soroban Instance Storage Auto-Bump Helpers (Closes #774) ─────────────

    /// Extend the contract instance storage TTL to prevent expiration.
    pub fn extend_instance_ttl(env: Env, threshold: u32, extend_to: u32) {
        env.storage().instance().extend_ttl(threshold, extend_to);
    }

    /// Bump the contract instance storage TTL using default parameters (1 day threshold, 30 days extension).
    pub fn bump_instance_ttl(env: Env) {
        env.storage().instance().extend_ttl(17_280, 518_400);
    }

    // ── TWAP Oracle ────────────────────────────────────────────────────────────

    /// Admin configures the TWAP oracle parameters.
    /// * `period_seconds` — time window (in seconds) for the TWAP computation
    /// * `max_observations` — maximum number of historical observations to retain
    ///   in the ring buffer (minimum 2 required for meaningful TWAP queries)
    pub fn configure_twap(env: Env, period_seconds: u64, max_observations: u32) {
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if period_seconds == 0 {
            panic_with_error!(&env, MarketplaceError::TwapPeriodMustBePositive);
        }
        if max_observations < 2 {
            panic_with_error!(&env, MarketplaceError::MaxObservationsMustBePositive);
        }

        env.storage()
            .instance()
            .set(&DataKey::TwapConfig, &TwapConfig {
                period_seconds,
                max_observations,
            });

        // Initialize observation tracking if not already set
        if !env.storage().instance().has(&DataKey::NextObservationSlot) {
                .set(&DataKey::NextObservationSlot, &0u64);
        }
        if !env.storage().instance().has(&DataKey::TotalObservations) {
                .set(&DataKey::TotalObservations, &0u64);
        }

        env.events()
            .publish((symbol_short!("twap_cfg"),), (period_seconds, max_observations));
    }

    /// Internal: record a new price observation and update the cumulative accumulator.
    /// Called automatically on every `buy()` and `bid()` when TWAP is configured.
    /// Updates the cumulative price accumulator and appends to the ring buffer.
    fn record_observation(env: &Env, price: i128) {
        if price <= 0 {
            return; // Skip invalid prices; don't corrupt the accumulator
        }

        // Only record if TWAP is configured
        let twap_config: TwapConfig = match env.storage().instance().get(&DataKey::TwapConfig) {
            Some(cfg) => cfg,
            None => return, // TWAP not configured, silently skip
        };

        let now = env.ledger().timestamp();

        // Load or initialize the current cumulative observation
        let mut current: CumulativeObservation = env
            .storage()
            .get(&DataKey::CurrentObservation)
            .unwrap_or(CumulativeObservation {
                price_cumulative: 0,
                timestamp: now,
                price,
            });

        // Compute time elapsed since last observation
        let elapsed = now.saturating_sub(current.timestamp);
        if elapsed > 0 && current.price > 0 {
            // Accumulate: price_cumulative += last_price * elapsed
            current.price_cumulative = current
                .price_cumulative
                .checked_add(current.price.checked_mul(elapsed as i128).unwrap_or(i128::MAX))
                .unwrap_or(i128::MAX);
        }

        // Update the current observation with the new price and timestamp
        current.price = price;
        current.timestamp = now;
            .set(&DataKey::CurrentObservation, &current);

        // Append to the historical ring buffer
        let next_slot: u64 = env
            .get(&DataKey::NextObservationSlot)
            .unwrap_or(0);
        let ring_index = next_slot % twap_config.max_observations as u64;

            .persistent()
            .set(&DataKey::HistoricalObservation(ring_index), &current);

            .set(&DataKey::NextObservationSlot, &(next_slot + 1));

        let total: u64 = env
            .get(&DataKey::TotalObservations)
            .set(&DataKey::TotalObservations, &(total + 1));
    }

    /// Returns the current cumulative observation.
    pub fn get_cumulative_observation(env: Env) -> Option<CumulativeObservation> {
    }

    /// Returns the Time-Weighted Average Price over the configured TWAP period.
    /// Uses the cumulative price accumulator to compute:
    ///   `twap = (cumulative_now - cumulative_old) / (timestamp_now - timestamp_old)`
    /// If fewer than 2 observations are available, returns `None`.
    /// The observation is taken from the ring buffer at `(current_slot - count)`
    /// where `count` should be <= total observations recorded.
    pub fn get_twap(env: Env, observation_count: u32) -> Option<i128> {
            None => return None,
        };

        let current: CumulativeObservation = match env
        {
            Some(obs) => obs,
        };


        // Ensure we have enough observations
        if total < 2 {
            return None;
        }

        let count = if observation_count == 0 || observation_count as u64 >= total {
            total - 1
        } else {
            observation_count as u64
        };


        if next_slot < count {
        }

        let target_slot = next_slot.saturating_sub(count);
        let ring_index = target_slot % twap_config.max_observations as u64;

        let old_observation: CumulativeObservation = match env
            .get(&DataKey::HistoricalObservation(ring_index))
        };

        let time_diff = current.timestamp.saturating_sub(old_observation.timestamp);
        if time_diff == 0 {
            // If no time elapsed, return the current price directly
            return Some(current.price);
        }

        let price_diff = current
            .saturating_sub(old_observation.price_cumulative);

        let twap = price_diff / time_diff as i128;
        Some(twap)
    }

    /// Returns the TWAP configuration, or None if not configured.
    pub fn get_twap_config(env: Env) -> Option<TwapConfig> {
        env.storage().instance().get(&DataKey::TwapConfig)
    }

    /// Returns the total number of observations recorded.
    pub fn get_total_observations(env: Env) -> u64 {
            .unwrap_or(0)
    }


    // ── Internal helpers ──────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage().instance().get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::AdminControls)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let addr = Self::admin_controls(env);
        AdminControlsClient::new(env, &addr).assert_not_paused();
    }

    fn auction_config(env: &Env) -> (i128, i128, u64, u64) {
        env.storage().instance().get(&DataKey::AuctionConfig)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn resolve_listing_price(env: &Env, provided: i128) -> i128 {
        if provided > 0 { return provided; }
        if let Some(oracle) = env.storage().instance().get::<DataKey, Address>(&DataKey::Oracle) {
            let (max_staleness, fallback_price): (u64, i128) = env.storage().instance()
                .get(&DataKey::OracleConfig).unwrap_or((0, 0));
            let client = PriceOracleClient::new(env, &oracle);
            let price = client.price();
            let ts = client.timestamp();
            if env.ledger().timestamp().saturating_sub(ts) <= max_staleness && price > 0 {
                return price;
            }
            if fallback_price > 0 { return fallback_price; }
        }
        panic_with_error!(env, MarketplaceError::PriceMustBePositive);
    }

    fn calculate_current_price(auction: &DutchAuction, now: u64) -> i128 {
        let elapsed = now.saturating_sub(auction.start_time);
        if elapsed >= auction.duration { return auction.reserve_price; }
        let frac = elapsed as i128 * 10_000 / auction.duration as i128;
        let decay = (auction.starting_price - auction.reserve_price) * frac / 10_000;
        auction.starting_price - decay
    }

    /// Split a payment into (royalty_amount, seller_amount).
    /// Royalty is only non-zero when a RoyaltyConfig is set and planter ≠ seller.
    fn split_payment(env: &Env, payment: i128, planter: &Address, seller: &Address) -> (i128, i128) {
        let royalty_bps: u32 = env.storage().instance()
            .get(&DataKey::RoyaltyConfig).unwrap_or(0);
        let royalty = if royalty_bps > 0 && planter != seller {
            (payment * royalty_bps as i128) / 10_000
        } else {
            0
        };
        (royalty, payment - royalty)
    }

    /// Allocate the next order ID (monotonically incrementing).
    fn next_order_id(env: &Env) -> u64 {
        let current: u64 = env.storage().instance().get(&DataKey::OrderCount).unwrap_or(0);
        let next = current + 1;
        env.storage().instance().set(&DataKey::OrderCount, &next);
        next
    }

    /// Remove filled/cancelled orders from the buy index.
    fn compact_buy_index(env: &Env) {
        let ids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BuyOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut live: Vec<u64> = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env.storage().persistent().get::<DataKey, Order>(&DataKey::Order(id)) {
                if o.status == OrderStatus::Open { live.push_back(id); }
            }
        }
        env.storage().instance().set(&DataKey::BuyOrderIndex, &live);
    }

    /// Remove filled/cancelled orders from the sell index.
    fn compact_sell_index(env: &Env) {
        let ids: Vec<u64> = env.storage().instance()
            .get(&DataKey::SellOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut live: Vec<u64> = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env.storage().persistent().get::<DataKey, Order>(&DataKey::Order(id)) {
                if o.status == OrderStatus::Open { live.push_back(id); }
            }
        }
        env.storage().instance().set(&DataKey::SellOrderIndex, &live);
    }
}


// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

    // ── Mock oracle ───────────────────────────────────────────────────────────

    #[contract]
    struct MockPriceOracle;

    #[contractimpl]
    impl MockPriceOracle {
        pub fn initialize(env: Env, price: i128, timestamp: u64) {
            env.storage().instance().set(&symbol_short!("price"), &price);
            env.storage().instance().set(&symbol_short!("ts"), &timestamp);
        }
        pub fn set_price(env: Env, price: i128, timestamp: u64) {
            env.storage().instance().set(&symbol_short!("price"), &price);
            env.storage().instance().set(&symbol_short!("ts"), &timestamp);
        }
        pub fn price(env: Env) -> i128 {
            env.storage().instance().get(&symbol_short!("price")).unwrap_or(0)
        }
        pub fn timestamp(env: Env) -> u64 {
            env.storage().instance().get(&symbol_short!("ts")).unwrap_or(0)
        }
    }

    // ── Test context ──────────────────────────────────────────────────────────

    struct Ctx {
        env: Env,
        admin: Address,
        seller: Address,
        buyer: Address,
        planter: Address,
        tree_token: Address,
        payment_token: Address,
        client: CarbonMarketplaceClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let ac_client = admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        ac_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, CarbonMarketplace);
        let client = CarbonMarketplaceClient::new(&env, &contract_id);

        let seller  = Address::generate(&env);
        let buyer   = Address::generate(&env);
        let planter = Address::generate(&env);

        let tree_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        token::StellarAssetClient::new(&env, &tree_token).mint(&seller, &100_000);

        let payment_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &1_000_000);

        client.initialize(&admin, &tree_token, &admin_controls_id);

        Ctx { env, admin, seller, buyer, planter, tree_token, payment_token, client }
    }

    fn bal(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Oracle pricing (unchanged) ────────────────────────────────────────────

    #[test]
    fn test_list_uses_oracle_price_when_price_not_provided() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        PriceOracleClient::new(&ctx.env, &oracle_id).initialize(&100, &ctx.env.ledger().timestamp());
        ctx.client.configure_price_oracle(&ctx.admin, &oracle_id, &60, &75);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &0, &ctx.payment_token);
        assert_eq!(ctx.client.get_listing(&id).unwrap().price_per_token, 100);
    }

    #[test]
    fn test_list_uses_fallback_price_when_oracle_is_stale() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        PriceOracleClient::new(&ctx.env, &oracle_id).initialize(&100, &ctx.env.ledger().timestamp());
        ctx.client.configure_price_oracle(&ctx.admin, &oracle_id, &30, &75);
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 60);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &0, &ctx.payment_token);
        assert_eq!(ctx.client.get_listing(&id).unwrap().price_per_token, 75);
    }

    // ── Fixed-price listing (unchanged) ──────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.tree_token, &ctx.tree_token);
    }

    #[test]
    fn test_list_escrows_tokens_and_returns_id() {
        let ctx = setup();
        let pre = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        assert_eq!(id, 1);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 1_000);
        let l = ctx.client.get_listing(&id).unwrap();
        assert_eq!(l.remaining, 1_000);
        assert_eq!(l.status, ListingStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_list_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.list(&ctx.seller, &ctx.planter, &0, &10, &ctx.payment_token);
    }

    #[test]
    fn test_buy_partial_fill() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);
        let l = ctx.client.get_listing(&id).unwrap();
        assert_eq!(l.remaining, 800);
        assert_eq!(l.status, ListingStatus::Active);
    }

    #[test]
    fn test_buy_full_fill_marks_filled() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);
        assert_eq!(ctx.client.get_listing(&id).unwrap().status, ListingStatus::Filled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_buy_more_than_remaining_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &501);
    }

    #[test]
    fn test_cancel_returns_remaining() {
        let ctx = setup();
        let pre = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &300);
        ctx.client.cancel(&ctx.seller, &id);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);
        assert_eq!(ctx.client.get_listing(&id).unwrap().status, ListingStatus::Cancelled);
    }


    // ── Partial order matching tests ──────────────────────────────────────────

    /// Place a sell order then a buy order that fully matches it.
    #[test]
    fn test_buy_order_fully_matches_existing_sell_order() {
        let ctx = setup();
        // Seller places a sell order: 500 TREE @ min 10
        let sell_id = ctx.client.place_sell_order(
            &ctx.seller, &ctx.planter, &500, &10,
        );
        // Sell order is open, TREE tokens escrowed
        let sell_order = ctx.client.get_order(&sell_id).unwrap();
        assert_eq!(sell_order.status, OrderStatus::Open);
        assert_eq!(sell_order.remaining, 500);

        let buyer_tree_before  = bal(&ctx.env, &ctx.tree_token,    &ctx.buyer);
        let seller_pay_before  = bal(&ctx.env, &ctx.payment_token, &ctx.seller);

        // Buyer places a buy order: 500 TREE @ max 10 — should fully match
        let buy_id = ctx.client.place_buy_order(
            &ctx.buyer, &ctx.payment_token, &500, &10,
        );

        let buy_order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(buy_order.status, OrderStatus::Filled, "buy order should be filled");
        assert_eq!(buy_order.remaining, 0);

        let sell_order_after = ctx.client.get_order(&sell_id).unwrap();
        assert_eq!(sell_order_after.status, OrderStatus::Filled, "sell order should be filled");

        // Buyer received TREE tokens
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.buyer), buyer_tree_before + 500);
        // Seller received payment
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.seller), seller_pay_before + 500 * 10);
    }

    /// Buy order partially matches one sell order, remainder stays open.
    #[test]
    fn test_buy_order_partial_match_remainder_open() {
        let ctx = setup();
        ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &200, &10);

        let buy_id = ctx.client.place_buy_order(
            &ctx.buyer, &ctx.payment_token, &500, &10,
        );
        let buy_order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(buy_order.status, OrderStatus::Open, "unmatched portion should remain open");
        assert_eq!(buy_order.remaining, 300, "300 unmatched tokens");
    }

    /// Sell order matches multiple buy orders in descending price order.
    #[test]
    fn test_sell_order_matches_multiple_buy_orders_descending_price() {
        let ctx = setup();

        // Two buyers with different max prices
        let buyer2 = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.payment_token).mint(&buyer2, &1_000_000);

        // Buyer1 wants 300 @ max 15, Buyer2 wants 300 @ max 10
        let buy1 = ctx.client.place_buy_order(&ctx.buyer,  &ctx.payment_token, &300, &15);
        let buy2 = ctx.client.place_buy_order(&buyer2, &ctx.payment_token, &300, &10);

        let seller_pay_before = bal(&ctx.env, &ctx.payment_token, &ctx.seller);

        // Seller places 500 @ min 10 — should fill buyer1 (300) then part of buyer2 (200)
        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &500, &10);

        let sell_order = ctx.client.get_order(&sell_id).unwrap();
        assert_eq!(sell_order.status, OrderStatus::Filled);
        assert_eq!(sell_order.remaining, 0);

        // buy1 fully filled at price 15
        assert_eq!(ctx.client.get_order(&buy1).unwrap().status, OrderStatus::Filled);
        // buy2 partially filled (200 of 300 matched)
        let b2 = ctx.client.get_order(&buy2).unwrap();
        assert_eq!(b2.status, OrderStatus::Open);
        assert_eq!(b2.remaining, 100);

        // Seller received: 300*15 + 200*10 = 4500 + 2000 = 6500
        assert_eq!(
            bal(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 300 * 15 + 200 * 10
        );
    }

    /// Buy order matches multiple sell orders in ascending price order.
    #[test]
    fn test_buy_order_matches_multiple_sell_orders_ascending_price() {
        let ctx = setup();

        let seller2 = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.tree_token).mint(&seller2, &10_000);

        // Two sell orders: cheaper first
        ctx.client.place_sell_order(&ctx.seller,  &ctx.planter, &300, &8);
        ctx.client.place_sell_order(&seller2, &ctx.planter, &300, &12);

        let buyer_tree_before = bal(&ctx.env, &ctx.tree_token, &ctx.buyer);

        // Buyer wants 400 @ max 12 — should fill sell@8 (300) then partial sell@12 (100)
        let buy_id = ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &400, &12);

        let buy_order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(buy_order.status, OrderStatus::Filled);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.buyer), buyer_tree_before + 400);
    }

    /// Buy order price below all sell orders — no match, order stays open.
    #[test]
    fn test_buy_order_below_ask_price_stays_open() {
        let ctx = setup();
        ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &500, &20);

        let buy_id = ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &100, &10);
        let buy_order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(buy_order.status, OrderStatus::Open);
        assert_eq!(buy_order.remaining, 100);
    }

    /// Sell order price above all buy orders — no match, order stays open.
    #[test]
    fn test_sell_order_above_bid_price_stays_open() {
        let ctx = setup();
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &200, &5);

        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &200, &10);
        let sell_order = ctx.client.get_order(&sell_id).unwrap();
        assert_eq!(sell_order.status, OrderStatus::Open);
        assert_eq!(sell_order.remaining, 200);
    }

    /// Cancel an open sell order reclaims escrowed TREE tokens.
    #[test]
    fn test_cancel_sell_order_reclaims_tree_tokens() {
        let ctx = setup();
        let pre = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &500, &10);

        // Partially fill: buyer places a buy order for 200
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &200, &10);

        // Seller cancels remaining 300
        ctx.client.cancel_order(&ctx.seller, &sell_id);

        let order = ctx.client.get_order(&sell_id).unwrap();
        assert_eq!(order.status, OrderStatus::Cancelled);
        // Seller got back 300 TREE (200 were sold)
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 200);
    }

    /// Cancel an open buy order succeeds (no tokens to return).
    #[test]
    fn test_cancel_buy_order_succeeds() {
        let ctx = setup();
        let buy_id = ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &300, &10);
        ctx.client.cancel_order(&ctx.buyer, &buy_id);
        assert_eq!(ctx.client.get_order(&buy_id).unwrap().status, OrderStatus::Cancelled);
    }

    /// Non-owner cannot cancel an order.
    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_cancel_order_by_non_owner_rejected() {
        let ctx = setup();
        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &200, &10);
        ctx.client.cancel_order(&ctx.buyer, &sell_id);
    }

    /// Cancel already-cancelled order is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_cancel_already_cancelled_order_rejected() {
        let ctx = setup();
        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &200, &10);
        ctx.client.cancel_order(&ctx.seller, &sell_id);
        ctx.client.cancel_order(&ctx.seller, &sell_id);
    }

    /// Cancel a filled order is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_cancel_filled_order_rejected() {
        let ctx = setup();
        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &200, &10);
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &200, &10);
        ctx.client.cancel_order(&ctx.seller, &sell_id);
    }

    /// Place sell order with zero amount is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_place_sell_order_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &0, &10);
    }

    /// Place buy order with zero amount is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_place_buy_order_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &0, &10);
    }

    /// Place sell order with zero price is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #113)")]
    fn test_place_sell_order_zero_price_rejected() {
        let ctx = setup();
        ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &100, &0);
    }

    /// Place buy order with zero max price is rejected.
    #[test]
    #[should_panic(expected = "Error(Contract, #113)")]
    fn test_place_buy_order_zero_price_rejected() {
        let ctx = setup();
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &100, &0);
    }

    /// order_count increments for both buy and sell orders.
    #[test]
    fn test_order_count_increments() {
        let ctx = setup();
        assert_eq!(ctx.client.order_count(), 0);
        ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &100, &10);
        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &50, &10);
        assert_eq!(ctx.client.order_count(), 2);
    }

    /// Royalty is correctly split during partial order matching.
    #[test]
    fn test_royalty_applied_during_order_matching() {
        let ctx = setup();
        ctx.client.set_royalty(&ctx.admin, &500); // 5%

        let sell_id = ctx.client.place_sell_order(&ctx.seller, &ctx.planter, &1_000, &10);
        let planter_before = bal(&ctx.env, &ctx.payment_token, &ctx.planter);
        let seller_before  = bal(&ctx.env, &ctx.payment_token, &ctx.seller);

        ctx.client.place_buy_order(&ctx.buyer, &ctx.payment_token, &1_000, &10);

        let total_payment = 1_000 * 10;
        let royalty = total_payment * 5 / 100;
        let seller_net = total_payment - royalty;

        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.planter), planter_before + royalty);
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.seller),  seller_before  + seller_net);
        assert_eq!(ctx.client.get_order(&sell_id).unwrap().status, OrderStatus::Filled);
    }

    // ── Dutch Auction tests (unchanged) ───────────────────────────────────────

    fn auction_setup() -> Ctx {
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &10, &3600);
        ctx
    }

    #[test]
    fn test_create_auction_escrows_tokens() {
        let ctx = auction_setup();
        let pre = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 1_000);
        assert_eq!(ctx.client.get_auction(&id).unwrap().status, AuctionStatus::Active);
    }

    #[test]
    fn test_bid_transfers_tokens() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        let buyer_before = bal(&ctx.env, &ctx.tree_token, &ctx.buyer);
        ctx.client.bid(&ctx.buyer, &id, &200);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.buyer), buyer_before + 200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_bid_after_expiry_rejected() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &10, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &500, &ctx.payment_token);
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 200);
        ctx.client.bid(&ctx.buyer, &id, &100);
    }

    // ── Fuzz tests ────────────────────────────────────────────────────────────
    // ── TWAP Oracle Tests ───────────────────────────────────────────────────────

    fn twap_setup() -> Ctx {
        let ctx = setup();
        ctx.client.configure_twap(&3600, &100);
        ctx
    }

    #[test]
    fn test_configure_twap_sets_parameters() {
        let cfg = ctx.client.get_twap_config().unwrap();
        assert_eq!(cfg.period_seconds, 3600);
        assert_eq!(cfg.max_observations, 100);
    }

    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_configure_twap_zero_period_rejected() {
        ctx.client.configure_twap(&0, &100);
    }

    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_configure_twap_max_obs_below_2_rejected() {
        ctx.client.configure_twap(&3600, &1);
    }

    fn test_get_twap_config_not_configured_returns_none() {
        assert!(ctx.client.get_twap_config().is_none());
    }

    fn test_get_twap_no_observations_returns_none() {
        let ctx = twap_setup();
        assert!(ctx.client.get_twap(&1).is_none());
    }

    fn test_get_cumulative_observation_not_configured_returns_none() {
        assert!(ctx.client.get_cumulative_observation().is_none());
    }

    fn test_buy_records_twap_observation() {
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        let obs = ctx.client.get_cumulative_observation().unwrap();
        assert_eq!(obs.price, 10);
        assert!(obs.price_cumulative >= 0);
        assert_eq!(ctx.client.get_total_observations(), 1);
    }

    fn test_multiple_buys_accumulate_observations() {

        // First buy at price 10
        let id1 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id1, &200);

        // Advance time so accumulator has meaningful delta
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 60);

        // Second buy at price 15
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &15, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id2, &300);

        assert_eq!(obs.price, 15);
        // First observation at t=0 had no elapsed time, second at t=60
        // Accumulator should be: 10 * 60 = 600
        assert!(obs.price_cumulative >= 600);
        assert_eq!(ctx.client.get_total_observations(), 2);
    }

    fn test_get_twap_returns_reasonable_price() {


        // Advance time by 60 seconds to get a meaningful TWAP

        // Second buy creates second observation
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &20, &ctx.payment_token);

        // TWAP with observation_count=1 should give us the price between obs 0 and 1
        let twap = ctx.client.get_twap(&1);
        assert!(twap.is_some());
        // The cumulative accumulator grew by 10 (price) * 60 (seconds) = 600
        // TWAP = 600 / 60 = 10 for the period between the two observations
        assert_eq!(twap.unwrap(), 10);
    }

    fn test_bid_records_twap_observation() {
        ctx.client.configure_auction(&100, &50, &10, &3600);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &200);

        assert_eq!(obs.price, 100);
    }

    fn test_twap_not_configured_still_works_normally() {
        // Verify that TWAP not being configured doesn't break existing functionality
        ctx.client.buy(&ctx.buyer, &id, &500);

        // TWAP queries should return None since not configured
        assert_eq!(ctx.client.get_total_observations(), 0);
    }

    fn test_twap_ring_buffer_overwrites_old_observations() {
        // Configure with only 3 max observations
        ctx.client.configure_twap(&3600, &3);


        // Record 5 observations to overflow the ring buffer
        for i in 0..5u64 {
            ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 10);
            ctx.client.buy(&ctx.buyer, &id, &100);
        }

        // Total should be 5, but ring buffer only keeps latest 3
        assert_eq!(ctx.client.get_total_observations(), 5);

        // TWAP should still work with recent observations
        let twap = ctx.client.get_twap(&2);
    }

    fn test_list_below_minimum_trade_size_rejected() {
        // MIN_TRADE_SIZE is 1_000_000; attempting to list 999_999 base units must panic with BelowMinimumTradeSize (#114)
        ctx.client.list(&ctx.seller, &ctx.planter, &999_999, &10, &ctx.payment_token);
    }

    // ── Fuzz Tests (Proptest) ──────────────────────────────────────────────────

    #[cfg(test)]
    mod fuzz_tests {
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn fuzz_dutch_auction_decay(
                starting in 100i128..10_000i128,
                delta in 1i128..1_000i128,
                duration in 10u64..10_000u64,
                pct in 0u64..100u64,
            ) {
                let reserve = starting.saturating_sub(delta).max(1);
                if starting > reserve && duration > 0 {
                    let elapsed = (duration * pct) / 100;
                    let drop = (starting - reserve) * elapsed as i128 / duration as i128;
                    let price = starting - drop;
                    prop_assert!(price >= reserve);
                    prop_assert!(price <= starting);
                }
            }

            #[test]
            fn fuzz_royalty_split_invariant(
                amount in 1i128..1_000_000i128,
                price in 1i128..100_000i128,
                bps in 0u32..2_000u32,
            ) {
                let total = amount.saturating_mul(price);
                let royalty = (total as u128 * bps as u128 / 10_000) as i128;
                let seller_net = total - royalty;
                prop_assert_eq!(seller_net + royalty, total);
                prop_assert!(seller_net >= 0);
                prop_assert!(royalty >= 0);
            }

            #[test]
            fn fuzz_partial_fill_invariant(
                total in 1i128..100_000i128,
                fill1 in 0i128..50_000i128,
                fill2 in 0i128..50_000i128,
            ) {
                let f1 = fill1.min(total);
                let remaining_after_f1 = total - f1;
                let f2 = fill2.min(remaining_after_f1);
                let remaining_final = remaining_after_f1 - f2;
                prop_assert!(remaining_final >= 0);
                prop_assert_eq!(f1 + f2 + remaining_final, total);
            }
        }
    }
}