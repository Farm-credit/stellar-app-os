#![no_std]

//! Carbon Credit Marketplace — Closes #490, #810
//! Carbon Credit Marketplace — Closes #490, #760, #780
//!
//! Simple on-chain orderbook that lets sponsors list their TREE token carbon
//! credit certificates for sale, and buyers purchase them with a payment token
//! (e.g. USDC or XLM).
//!
//! # Flow
//!   1. Admin calls `initialize(admin, tree_token)`.
//!   2. Seller calls `list(seller, amount, price_per_token, payment_token)` to
//!      create an ask. The `amount` of TREE tokens are escrowed in the contract.
//!   3. Buyer calls `buy(buyer, listing_id, amount)`.  Payment is transferred
//!      to seller (minus royalty & protocol fee); TREE tokens to buyer.
//!   4. Seller calls `cancel(seller, listing_id)` to de-list remaining tokens.
//!
//! # Treasury Reserve Swap (#810)
//!   A configurable protocol fee is deducted on every `buy` and `bid`.  Fees
//!   accumulate inside the contract.  Admin may call `swap_fees_to_usdc` to
//!   sweep accumulated fees into a designated USDC reserve address, enabling
//!   automated conversion of trading revenue into the protocol's USDC reserve.
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
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env,
};
use harvesta_errors::HarvestaError;
use admin_controls::AdminControlsClient;

#[contractclient(name = "PriceOracleClient")]
trait PriceOracleTrait {
    fn initialize(env: Env, price: i128, timestamp: u64);
    fn set_price(env: Env, price: i128, timestamp: u64);
    fn price(env: Env) -> i128;
    fn timestamp(env: Env) -> u64;
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
    ProtocolFeeTooHigh = 114,
    TreasuryNotConfigured = 115,
    InsufficientFeesToSwap = 116,
    TreasuryAlreadyConfigured = 117,
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
#[contracttype]
#[derive(Clone, Debug)]
pub struct TwapConfig {
    /// Time window (in seconds) for the TWAP computation
    pub period_seconds: u64,
    /// Maximum number of historical observations to retain
    pub max_observations: u32,
}

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
    /// Total TREE tokens listed (base units)
    pub total_amount: i128,
    /// Remaining TREE tokens available for purchase
    pub remaining: i128,
    /// Price per single TREE token base unit, denominated in payment_token base units
    pub price_per_token: i128,
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

/// Configuration for the protocol treasury reserve swap mechanism (#810).
///
/// Accumulated protocol fees are held in this contract and may be swept to
/// the USDC reserve address by an admin via `swap_fees_to_usdc`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TreasuryReserveConfig {
    /// The payment token used for fee collection (expected to be USDC).
    pub fee_token: Address,
    /// Address where swapped fees are deposited (the USDC reserve).
    pub usdc_reserve: Address,
    /// Protocol fee in basis points applied to every trade (e.g. 250 = 2.5%).
    pub fee_bps: u32,
    /// Running total of fees collected but not yet swept to the reserve.
    pub accumulated_fees: i128,
    /// Lifetime total of fees already swept to the USDC reserve.
    pub total_swapped: i128,
}

// ── Storage keys ──────────────────────────────────────────────────────────────
/// Per-provider LP share record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct DutchAuction {
    pub id: u64,
    pub seller: Address,
    /// Original planter who planted the trees for these carbon credits
    pub planter: Address,
    /// TREE token address
    pub tree_token: Address,
    /// Payment token (USDC / XLM)
    pub payment_token: Address,
    /// Total TREE tokens in auction (base units)
    pub total_amount: i128,
    /// Remaining TREE tokens available
    pub remaining: i128,
    /// Starting price per token (highest price)
    pub starting_price: i128,
    /// Reserve price per token (lowest acceptable price)
    pub reserve_price: i128,
    /// Price decay rate per second (in basis points, e.g., 10 = 0.1% per second)
    pub decay_rate: u64,
    /// Auction start timestamp
    pub start_time: u64,
    /// Auction duration in seconds
    pub duration: u64,
    pub status: AuctionStatus,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token)
    Config,
    /// Admin controls contract address
    AdminControls,
    /// Price oracle contract address
    Oracle,
    /// (max_staleness_seconds, fallback_price)
    OracleConfig,
    /// Global listing counter
    ListingCount,
    /// Per-listing record
    Listing(u64),
    /// Global auction counter
    AuctionCount,
    /// Per-auction record
    Auction(u64),
    /// Auction configuration (starting_price, reserve_price, decay_rate, duration)
    AuctionConfig,
    /// Royalty basis points (e.g. 500 = 5%)
    RoyaltyConfig,
    /// Protocol treasury reserve configuration
    TreasuryReserve,
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
    /// Global emergency pause flag
    Paused,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    /// One-time initialisation.
    ///
    /// * `admin`           — platform admin (may delist fraudulent listings)
    /// * `tree_token`      — the TREE SAC token that represents carbon offset certificates
    /// * `admin_controls`  — admin-controls contract address for pause functionality
    pub fn initialize(env: Env, admin: Address, tree_token: Address, admin_controls: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token));
        env.storage()
            .instance()
            .set(&DataKey::AdminControls, &admin_controls);
        env.storage()
            .instance()
            .set(&DataKey::ListingCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::AuctionCount, &0u64);
    }

    /// Admin configures a price oracle feed for dynamic TREE pricing.
    ///
    /// * `oracle` — external oracle contract address exposing `price()` and `timestamp()`
    /// * `max_staleness` — number of seconds before the fallback price is used
    /// * `fallback_price` — price per token used when the oracle is stale or unavailable
    pub fn configure_price_oracle(env: Env, oracle: Address, max_staleness: u64, fallback_price: i128) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if fallback_price <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token, payment_token));
        env.storage().instance().set(&DataKey::NextListingId, &0u64);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Pause contract operations. Admin only.
    pub fn pause(env: Env) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause contract operations. Admin only.
    pub fn unpause(env: Env) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Returns true if the marketplace is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    /// Calculate dynamic swap fee in basis points based on trade volume (`amount_in`).
    ///
    /// Tiers:
    /// - Tier 1 (< 10,000 units): 30 bps (0.30%)
    /// - Tier 2 (10,000 to 100,000 units): 20 bps (0.20%)
    /// - Tier 3 (>= 100,000 units): 10 bps (0.10%)
    pub fn get_fee_bps(env: Env, amount_in: i128) -> i128 {
        let _ = &env;
        if amount_in >= 100_000 {
            10
        } else if amount_in >= 10_000 {
            20
        } else {
            30
        }
    }

    fn assert_not_paused(env: &Env) {
        if Self::is_paused(env.clone()) {
            panic_with_error!(env, HarvestaError::ContractPaused);
        }
    }

    /// Returns the current marketplace price for TREE tokens.
    ///
    /// If an oracle is configured and fresh, its price is returned. Otherwise the
    /// administrator-configured fallback price is used.
    pub fn get_dynamic_price(env: Env) -> i128 {
        Self::resolve_listing_price(&env, 0)
    }

    /// Admin configures default Dutch Auction parameters.
    ///
    /// * `starting_price` — highest price per token at auction start
    /// * `reserve_price`  — minimum acceptable price per token
    /// * `decay_rate`     — price decay rate in basis points per second (e.g., 10 = 0.1%)
    /// * `duration`       — auction duration in seconds
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

        if starting_price <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }
        if reserve_price <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }
        if reserve_price >= starting_price {
            panic_with_error!(&env, MarketplaceError::InvalidPriceRange);
        }
        if decay_rate == 0 || decay_rate > 10000 {
            panic_with_error!(&env, MarketplaceError::InvalidDecayRate);
        }
        if duration == 0 {
            panic_with_error!(&env, MarketplaceError::InvalidDuration);
        }

        env.storage()
            .instance()
            .set(&DataKey::AuctionConfig, &(starting_price, reserve_price, decay_rate, duration));
    }

    /// Seller lists `amount` TREE tokens for sale at `price_per_token` in
    /// `payment_token` units.  TREE tokens are transferred into the contract.
    ///
    /// Returns the new listing ID.
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

        let resolved_price = Self::resolve_listing_price(&env, price_per_token);

        let (_, tree_token) = Self::config(&env);

        // Escrow the TREE tokens into the contract
        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0);
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

        env.storage()
            .persistent()
            .set(&DataKey::Listing(new_id), &listing);
        env.storage()
            .instance()
            .set(&DataKey::ListingCount, &new_id);

        env.events()
            .publish((symbol_short!("listed"), seller), (new_id, amount, resolved_price));

        new_id
    }

    /// Buy `amount` TREE tokens from listing `listing_id`.
    ///
    /// Payment is computed as `amount × price_per_token` and transferred from
    /// the buyer to the seller.  TREE tokens are transferred to the buyer.
    pub fn buy(env: Env, buyer: Address, listing_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        if buyer == listing.seller {
            panic_with_error!(&env, MarketplaceError::SelfTrade);
        }

        if amount > listing.remaining {
            panic_with_error!(&env, MarketplaceError::InsufficientLiquidity);
        }

        let payment = amount
            .checked_mul(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        // Split payment: royalty to planter, remainder to seller
        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0);

        let royalty_amount = if royalty_bps > 0 && listing.planter != listing.seller {
            (payment * royalty_bps as i128) / 10_000
        } else {
            0
        };
        let post_royalty = payment - royalty_amount;

        // Protocol fee (after royalty)
        let protocol_fee = Self::compute_protocol_fee(&env, post_royalty);
        let seller_amount = post_royalty - protocol_fee;

        if royalty_amount > 0 {
            token::Client::new(&env, &listing.payment_token).transfer(
                &buyer,
                &listing.planter,
                &royalty_amount,
            );
        }

        Self::deposit_protocol_fee(&env, &buyer, &listing.payment_token, protocol_fee);

        let total_cost = amount * listing.price_per_token / 1_000_0000; // price scaled
        // Transfer payment from buyer to seller
        token::Client::new(&env, &listing.payment_token).transfer(
            &buyer,
            &listing.seller,
            &seller_amount,
        );

        // Transfer TREE tokens from contract escrow to buyer
        token::Client::new(&env, &listing.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        listing.remaining -= amount;
        if listing.remaining == 0 {
            listing.status = ListingStatus::Filled;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Listing(listing_id), &listing);

        // Record TWAP observation from this trade price
        Self::record_observation(&env, listing.price_per_token);

        env.events()
            .publish((symbol_short!("sold"), listing_id), (buyer, amount, payment, royalty_amount, protocol_fee));
            .publish((symbol_short!("bought"),), (listing_id, buyer, amount));
    }

    /// Seller cancels their listing, reclaiming any remaining escrowed TREE tokens.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        if listing.remaining > 0 {
            token::Client::new(&env, &listing.tree_token).transfer(
                &env.current_contract_address(),
                &seller,
                &listing.remaining,
            );
        }

        listing.status = ListingStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Listing(listing_id), &listing);

        env.events()
            .publish((symbol_short!("cancelled"), listing_id), listing.remaining);
    }

    /// Admin de-lists any listing (e.g. fraudulent certificate).
    pub fn admin_cancel(env: Env, listing_id: u64) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        if listing.remaining > 0 {
            token::Client::new(&env, &listing.tree_token).transfer(
                &env.current_contract_address(),
                &listing.seller,
                &listing.remaining,
            );
        }

        listing.status = ListingStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Listing(listing_id), &listing);

        env.events()
            .publish((symbol_short!("adm_cncl"), listing_id), ());
    }

    /// Returns the listing record, or None.
    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        env.storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
    }

    /// Returns the total number of listings created (including filled/cancelled).
    pub fn listing_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0)
    }

    // ── Dutch Auction ─────────────────────────────────────────────────────────────

    /// Seller creates a Dutch auction for `amount` TREE tokens.
    ///
    /// Uses configured auction parameters (starting_price, reserve_price, decay_rate, duration).
    /// TREE tokens are escrowed in the contract.
    ///
    /// Transfers both tokens from `provider` into this contract.
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
        Self::assert_not_paused(&env);
        provider.require_auth();
        if tree_amount <= 0 || payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }

        let (starting_price, reserve_price, decay_rate, duration) = Self::auction_config(&env);
        let (_, tree_token) = Self::config(&env);

        // Escrow the TREE tokens into the contract
        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::AuctionCount)
            .unwrap_or(0);
        let new_id = id + 1;

        let auction = DutchAuction {
            id: new_id,
            seller: seller.clone(),
            planter,
            tree_token,
            payment_token,
            total_amount: amount,
            remaining: amount,
            starting_price,
            reserve_price,
            decay_rate,
            start_time: env.ledger().timestamp(),
            duration,
            status: AuctionStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Auction(new_id), &auction);
        env.storage()
            .instance()
            .set(&DataKey::AuctionCount, &new_id);

        env.events()
            .publish((symbol_short!("auct_crtd"), seller), (new_id, amount, starting_price));

        new_id
    }

    /// Buyer bids on auction `auction_id` for `amount` TREE tokens.
    ///
    /// Returns proportional amounts of both tokens to `provider`.
    pub fn amm_remove_liquidity(
        env: Env,
        provider: Address,
        lp_shares: i128,
    ) -> (i128, i128) {
        Self::assert_not_paused(&env);
        provider.require_auth();
        if lp_shares <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }
        if max_payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::PaymentAmountMustBePositive);
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
    /// Fee tier (30 bps / 20 bps / 10 bps based on volume) is deducted from
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
        Self::assert_not_paused(&env);
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

        // Compute amount out using constant-product formula with dynamic fee:
        let fee_bps = Self::get_fee_bps(env.clone(), amount_in);
        let (reserve_in, reserve_out) = if tree_to_payment {
            (pool.reserve_tree, pool.reserve_payment)
        } else {
            (pool.reserve_payment, pool.reserve_tree)
        };

        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - fee_bps);
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
            let fee = amount_in * fee_bps / FEE_DENOMINATOR;
            let fee_payment = fee * pool.reserve_payment / pool.reserve_tree;
            (payment_token.clone(), fee_payment)
        } else {
            pool.reserve_payment += amount_in;
            pool.reserve_tree -= amount_out;
            let fee = amount_in * fee_bps / FEE_DENOMINATOR;
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

        let fee_bps = Self::get_fee_bps(env.clone(), amount_in);
        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - fee_bps);
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

        let mut auction: DutchAuction = env
            .storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        if auction.status != AuctionStatus::Active {
            panic_with_error!(&env, MarketplaceError::AuctionNotActive);
        }

        if buyer == auction.seller {
            panic_with_error!(&env, MarketplaceError::SelfTrade);
        }

        if amount > auction.remaining {
            panic_with_error!(&env, MarketplaceError::InsufficientLiquidity);
        }

        let current_time = env.ledger().timestamp();
        let elapsed = current_time.saturating_sub(auction.start_time);

        if elapsed > auction.duration {
            panic_with_error!(&env, MarketplaceError::AuctionExpired);
        }

        let current_price = Self::calculate_current_price(&auction, current_time);

        if current_price < auction.reserve_price {
            panic_with_error!(&env, MarketplaceError::BidBelowReservePrice);
        }

        let payment = amount
            .checked_mul(current_price)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        // Split payment: royalty to planter, remainder to seller
        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0);

        let royalty_amount = if royalty_bps > 0 && auction.planter != auction.seller {
            (payment * royalty_bps as i128) / 10_000
        } else {
            0
        };
        let post_royalty = payment - royalty_amount;

        // Protocol fee (after royalty)
        let protocol_fee = Self::compute_protocol_fee(&env, post_royalty);
        let seller_amount = post_royalty - protocol_fee;

        if royalty_amount > 0 {
            token::Client::new(&env, &auction.payment_token).transfer(
                &buyer,
                &auction.planter,
                &royalty_amount,
            );
        }

        Self::deposit_protocol_fee(&env, &buyer, &auction.payment_token, protocol_fee);

        token::Client::new(&env, &auction.payment_token).transfer(
            &buyer,
            &auction.seller,
            &seller_amount,
        );
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

        // Transfer TREE tokens from contract escrow to buyer atomically
        token::Client::new(&env, &auction.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        auction.remaining -= amount;
        if auction.remaining == 0 {
            auction.status = AuctionStatus::Completed;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Auction(auction_id), &auction);

        // Record TWAP observation from this trade price
        Self::record_observation(&env, current_price);

        env.events()
            .publish((symbol_short!("bid"), auction_id), (buyer, amount, current_price, payment, royalty_amount, protocol_fee));
    }

    /// Seller cancels their active auction, reclaiming remaining escrowed TREE tokens.
    pub fn cancel_auction(env: Env, seller: Address, auction_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        let mut auction: DutchAuction = env
            .storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        if auction.status != AuctionStatus::Active {
            panic_with_error!(&env, MarketplaceError::AuctionNotActive);
        }

        if auction.remaining > 0 {
            token::Client::new(&env, &auction.tree_token).transfer(
                &env.current_contract_address(),
                &seller,
                &auction.remaining,
            );
        }

        auction.status = AuctionStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Auction(auction_id), &auction);

        env.events()
            .publish((symbol_short!("auct_cncl"), auction_id), auction.remaining);
    }

    /// Returns the auction record, or None.
    pub fn get_auction(env: Env, auction_id: u64) -> Option<DutchAuction> {
        env.storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
    }

    /// Returns the current price for an active auction.
    pub fn get_current_price(env: Env, auction_id: u64) -> i128 {
        let auction: DutchAuction = env
            .storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        Self::calculate_current_price(&auction, env.ledger().timestamp())
    }

    /// Returns the total number of auctions created (including completed/cancelled).
    pub fn auction_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::AuctionCount)
            .unwrap_or(0)
    }

    /// Admin sets the royalty percentage in basis points (e.g. 500 = 5%).
    /// Royalty is paid to the original planter on secondary sales.
    pub fn set_royalty(env: Env, basis_points: u32) {
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if basis_points > 10_000 {
            panic_with_error!(&env, HarvestaError::InvalidRoyalty);
        }

        env.storage()
            .instance()
            .set(&DataKey::RoyaltyConfig, &basis_points);
    }

    /// Returns the current royalty basis points (0 if not configured).
    pub fn get_royalty(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0)
    }

    // ── TWAP Oracle ────────────────────────────────────────────────────────────

    /// Admin configures the TWAP oracle parameters.
    ///
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
            env.storage()
                .instance()
                .set(&DataKey::NextObservationSlot, &0u64);
        }
        if !env.storage().instance().has(&DataKey::TotalObservations) {
            env.storage()
                .instance()
                .set(&DataKey::TotalObservations, &0u64);
        }

        env.events()
            .publish((symbol_short!("twap_cfg"),), (period_seconds, max_observations));
    }

    /// Internal: record a new price observation and update the cumulative accumulator.
    ///
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
            .instance()
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
        env.storage()
            .instance()
            .set(&DataKey::CurrentObservation, &current);

        // Append to the historical ring buffer
        let next_slot: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextObservationSlot)
            .unwrap_or(0);
        let ring_index = next_slot % twap_config.max_observations as u64;

        env.storage()
            .persistent()
            .set(&DataKey::HistoricalObservation(ring_index), &current);

        env.storage()
            .instance()
            .set(&DataKey::NextObservationSlot, &(next_slot + 1));

        let total: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalObservations)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalObservations, &(total + 1));
    }

    /// Returns the current cumulative observation.
    pub fn get_cumulative_observation(env: Env) -> Option<CumulativeObservation> {
        env.storage()
            .instance()
            .get(&DataKey::CurrentObservation)
    }

    /// Returns the Time-Weighted Average Price over the configured TWAP period.
    ///
    /// Uses the cumulative price accumulator to compute:
    ///   `twap = (cumulative_now - cumulative_old) / (timestamp_now - timestamp_old)`
    ///
    /// If fewer than 2 observations are available, returns `None`.
    /// The observation is taken from the ring buffer at `(current_slot - count)`
    /// where `count` should be <= total observations recorded.
    pub fn get_twap(env: Env, observation_count: u32) -> Option<i128> {
        let twap_config: TwapConfig = match env.storage().instance().get(&DataKey::TwapConfig) {
            Some(cfg) => cfg,
            None => return None,
        };

        let current: CumulativeObservation = match env
            .storage()
            .instance()
            .get(&DataKey::CurrentObservation)
        {
            Some(obs) => obs,
            None => return None,
        };

        let total: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalObservations)
            .unwrap_or(0);

        // Ensure we have enough observations
        if total < 2 {
            return None;
        }

        let count = if observation_count == 0 || observation_count as u64 >= total {
            total - 1
        } else {
            observation_count as u64
        };

        let next_slot: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextObservationSlot)
            .unwrap_or(0);

        if next_slot < count {
            return None;
        }

        let target_slot = next_slot.saturating_sub(count);
        let ring_index = target_slot % twap_config.max_observations as u64;

        let old_observation: CumulativeObservation = match env
            .storage()
            .persistent()
            .get(&DataKey::HistoricalObservation(ring_index))
        {
            Some(obs) => obs,
            None => return None,
        };

        let time_diff = current.timestamp.saturating_sub(old_observation.timestamp);
        if time_diff == 0 {
            // If no time elapsed, return the current price directly
            return Some(current.price);
        }

        let price_diff = current
            .price_cumulative
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
        env.storage()
            .instance()
            .get(&DataKey::TotalObservations)
            .unwrap_or(0)
    }

    // ── Treasury Reserve Swap (#810) ──────────────────────────────────────────

    /// Admin configures the protocol treasury reserve.
    ///
    /// * `fee_token`    — payment token accepted for fee collection (USDC)
    /// * `usdc_reserve` — address that receives swapped fees (the USDC reserve)
    /// * `fee_bps`      — protocol fee in basis points (e.g. 250 = 2.5%).
    ///                     Must be > 0 and ≤ 1_000 (max 10%).
    ///
    /// Once configured, every `buy` and `bid` deducts `fee_bps` from the
    /// seller's payout and accumulates it in this contract.  Admin then calls
    /// `swap_fees_to_usdc` to sweep accumulated fees to the reserve.
    pub fn configure_treasury_reserve(
        env: Env,
        fee_token: Address,
        usdc_reserve: Address,
        fee_bps: u32,
    ) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if env.storage().instance().has(&DataKey::TreasuryReserve) {
            panic_with_error!(&env, MarketplaceError::TreasuryAlreadyConfigured);
        }
        if fee_bps == 0 || fee_bps > 1_000 {
            panic_with_error!(&env, MarketplaceError::ProtocolFeeTooHigh);
        }

        let config = TreasuryReserveConfig {
            fee_token,
            usdc_reserve,
            fee_bps,
            accumulated_fees: 0,
            total_swapped: 0,
        };
        env.storage()
            .instance()
            .set(&DataKey::TreasuryReserve, &config);
    }

    /// Admin sweeps accumulated protocol fees to the configured USDC reserve.
    ///
    /// Transfers the full `accumulated_fees` balance from this contract to the
    /// `usdc_reserve` address and resets the accumulator.  If no fees have
    /// accumulated, the call is rejected.
    pub fn swap_fees_to_usdc(env: Env) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let mut config: TreasuryReserveConfig = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryReserve)
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::TreasuryNotConfigured));

        if config.accumulated_fees <= 0 {
            panic_with_error!(&env, MarketplaceError::InsufficientFeesToSwap);
        }

        let amount = config.accumulated_fees;

        token::Client::new(&env, &config.fee_token).transfer(
            &env.current_contract_address(),
            &config.usdc_reserve,
            &amount,
        );

        config.total_swapped += amount;
        config.accumulated_fees = 0;
        env.storage()
            .instance()
            .set(&DataKey::TreasuryReserve, &config);

        env.events()
            .publish((symbol_short!("fee_swap"),), (amount, config.usdc_reserve));
    }

    /// Returns the current treasury reserve configuration, or `None` if
    /// the reserve has not been configured yet.
    pub fn get_treasury_reserve(env: Env) -> Option<TreasuryReserveConfig> {
        env.storage()
            .instance()
            .get(&DataKey::TreasuryReserve)
    }

    /// Returns the amount of protocol fees accumulated in the contract but
    /// not yet swept to the USDC reserve.  Returns 0 if not configured.
    pub fn get_accumulated_fees(env: Env) -> i128 {
        let config: TreasuryReserveConfig = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryReserve)
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::TreasuryNotConfigured));
        config.accumulated_fees
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::AdminControls)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let admin_controls_addr = Self::admin_controls(env);
        let admin_controls_client = AdminControlsClient::new(env, &admin_controls_addr);
        admin_controls_client.assert_not_paused();
    }

    fn auction_config(env: &Env) -> (i128, i128, u64, u64) {
        env.storage()
            .instance()
            .get(&DataKey::AuctionConfig)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    /// Returns the protocol fee amount for a given `gross_amount`, or 0 if no
    /// treasury reserve is configured.  The fee is `gross_amount * fee_bps / 10_000`.
    fn compute_protocol_fee(env: &Env, gross_amount: i128) -> i128 {
        let config_opt: Option<TreasuryReserveConfig> =
            env.storage().instance().get(&DataKey::TreasuryReserve);

        let config = match config_opt {
            Some(c) => c,
            None => return 0,
        };

        let fee = (gross_amount * config.fee_bps as i128) / 10_000;
        if fee <= 0 {
            0
        } else {
            fee
        }
    }

    /// Transfers `fee` of `payment_token` from `payer` into this contract and
    /// updates the treasury accumulator.  No-op when `fee <= 0` or when
    /// `payment_token` does not match the configured `fee_token`.
    fn deposit_protocol_fee(
        env: &Env,
        payer: &Address,
        payment_token: &Address,
        fee: i128,
    ) {
        if fee <= 0 {
            return;
        }

        // Only collect fees in the configured fee_token (USDC).
        let config: TreasuryReserveConfig = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryReserve)
            .expect("treasury must be configured when fee > 0");

        if *payment_token != config.fee_token {
            return;
        }

        token::Client::new(env, payment_token).transfer(
            payer,
            &env.current_contract_address(),
            &fee,
        );
        let mut cfg = config;
        cfg.accumulated_fees += fee;
        env.storage()
            .instance()
            .set(&DataKey::TreasuryReserve, &cfg);
    }

    fn resolve_listing_price(env: &Env, provided_price_per_token: i128) -> i128 {
        if provided_price_per_token > 0 {
            return provided_price_per_token;
        }

        let oracle_opt: Option<Address> = env.storage().instance().get(&DataKey::Oracle);
        if let Some(oracle) = oracle_opt {
            let (max_staleness, fallback_price) = env
                .storage()
                .instance()
                .get(&DataKey::OracleConfig)
                .unwrap_or((0u64, 0i128));

            let oracle_client = PriceOracleClient::new(env, &oracle);
            let price = oracle_client.price();
            let timestamp = oracle_client.timestamp();
            let is_fresh = env.ledger().timestamp().saturating_sub(timestamp) <= max_staleness;

            if is_fresh && price > 0 {
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

        let oracle_opt: Option<Address> = env.storage().instance().get(&DataKey::Oracle);
        if let Some(oracle) = oracle_opt {
            let (max_staleness, fallback_price) = env
                .storage()
                .instance()
                .get(&DataKey::OracleConfig)
                .unwrap_or((0u64, 0i128));

            let oracle_client = PriceOracleClient::new(env, &oracle);
            let price = oracle_client.price();
            let timestamp = oracle_client.timestamp();
            let is_fresh = env.ledger().timestamp().saturating_sub(timestamp) <= max_staleness;

            if is_fresh && price > 0 {
                return price;
            }

            if fallback_price > 0 {
                return fallback_price;
            }
        }

        panic_with_error!(env, MarketplaceError::PriceMustBePositive);
    }

    /// Calculate current price based on elapsed time and decay rate.
    /// Price decays linearly from starting_price to reserve_price over duration.
    fn calculate_current_price(auction: &DutchAuction, current_time: u64) -> i128 {
        let elapsed = current_time.saturating_sub(auction.start_time);
        if elapsed >= auction.duration {
            return auction.reserve_price;
        }

        // Calculate decay factor: (elapsed / duration) * (starting_price - reserve_price)
        let time_fraction = elapsed as i128 * 10_000 / auction.duration as i128;
        let price_diff = auction.starting_price - auction.reserve_price;
        let decay_amount = price_diff * time_fraction / 10_000;

        auction.starting_price - decay_amount
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env};

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

        // Deploy admin-controls contract
        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client = admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, CarbonMarketplace);
        let client = CarbonMarketplaceClient::new(&env, &contract_id);

        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let planter = Address::generate(&env);

        // TREE token: seller starts with supply
        let tree_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &tree_token).mint(&seller, &10_000);

        // Payment token: buyer starts with supply
        let payment_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &100_000);

        client.initialize(&admin, &tree_token, &admin_controls_id);

        Ctx { env, admin, seller, buyer, planter, tree_token, payment_token, client }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── oracle pricing ───────────────────────────────────────────────────────

    #[test]
    fn test_list_uses_oracle_price_when_price_not_provided() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        let oracle_client = PriceOracleClient::new(&ctx.env, &oracle_id);
        oracle_client.initialize(&100, &ctx.env.ledger().timestamp());

        ctx.client.configure_price_oracle(&ctx.admin, &oracle_id, &60, &75);

        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &0, &ctx.payment_token);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.price_per_token, 100);
    }

    #[test]
    fn test_list_uses_fallback_price_when_oracle_is_stale() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        let oracle_client = PriceOracleClient::new(&ctx.env, &oracle_id);
        oracle_client.initialize(&100, &ctx.env.ledger().timestamp());

        ctx.client.configure_price_oracle(&ctx.admin, &oracle_id, &30, &75);
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 60);

        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &0, &ctx.payment_token);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.price_per_token, 75);
    }

    #[test]
    fn test_get_dynamic_price_returns_oracle_price_when_fresh() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        let oracle_client = PriceOracleClient::new(&ctx.env, &oracle_id);
        oracle_client.initialize(&120, &ctx.env.ledger().timestamp());

        ctx.client.configure_price_oracle(&ctx.admin, &oracle_id, &60, &90);

        assert_eq!(ctx.client.get_dynamic_price(), 120);
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.tree_token, &ctx.tree_token);
    }

    // ── list ───────────────────────────────────────────────────────────────────

    #[test]
    fn test_list_escrows_tokens_and_returns_id() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        assert_eq!(id, 1);
        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 1_000);
        assert_eq!(ctx.client.listing_count(), 1);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.total_amount, 1_000);
        assert_eq!(listing.remaining, 1_000);
        assert_eq!(listing.price_per_token, 10);
        assert_eq!(listing.planter, ctx.planter);
        assert_eq!(listing.status, ListingStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_list_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.list(&ctx.seller, &ctx.planter, &0, &10, &ctx.payment_token);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #113)")]
    fn test_list_zero_price_rejected() {
        let ctx = setup();
        ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &0, &ctx.payment_token);
    }

    // ── buy ────────────────────────────────────────────────────────────────────

    #[test]
    fn test_buy_transfers_payment_to_seller_and_tokens_to_buyer() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);

        ctx.client.buy(&ctx.buyer, &id, &200);

        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 200 * 10
        );
        assert_eq!(
            balance(&ctx.env, &ctx.tree_token, &ctx.buyer),
            buyer_tree_before + 200
        );

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.remaining, 800);
        assert_eq!(listing.status, ListingStatus::Active);
    }

    #[test]
    fn test_full_buy_marks_listing_filled() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.remaining, 0);
        assert_eq!(listing.status, ListingStatus::Filled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_buy_more_than_available_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &501);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_buy_zero_amount_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #109)")]
    fn test_buy_from_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);
        ctx.client.buy(&ctx.buyer, &id, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #108)")]
    fn test_buy_nonexistent_listing_rejected() {
        let ctx = setup();
        ctx.client.buy(&ctx.buyer, &99, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_self_trade_via_zero_buy_amount() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.seller, &id, &0);
    }

    // ── cancel ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_returns_remaining_tokens() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        ctx.client.buy(&ctx.buyer, &id, &300);
        ctx.client.cancel(&ctx.seller, &id);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.status, ListingStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #109)")]
    fn test_cancel_already_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &500);
        ctx.client.cancel(&ctx.seller, &id);
    }

    // ── listing_count ──────────────────────────────────────────────────────────

    #[test]
    fn test_listing_count_increments() {
        let ctx = setup();
        assert_eq!(ctx.client.listing_count(), 0);
        ctx.client.list(&ctx.seller, &ctx.planter, &100, &1, &ctx.payment_token);
        ctx.client.list(&ctx.seller, &ctx.planter, &200, &2, &ctx.payment_token);
        assert_eq!(ctx.client.listing_count(), 2);
    }

    // ── configure_auction ─────────────────────────────────────────────────────

    #[test]
    fn test_configure_auction_sets_parameters() {
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &10, &3600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #110)")]
    fn test_configure_auction_reserve_ge_starting_rejected() {
        let ctx = setup();
        ctx.client.configure_auction(&100, &100, &10, &3600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #111)")]
    fn test_configure_auction_invalid_decay_rate_rejected() {
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &0, &3600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #112)")]
    fn test_configure_auction_zero_duration_rejected() {
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &10, &0);
    }

    // ── create_auction ────────────────────────────────────────────────────────

    fn auction_setup() -> Ctx {
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &10, &3600);
        ctx
    }

    #[test]
    fn test_create_auction_escrows_tokens_and_returns_id() {
        let ctx = auction_setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        assert_eq!(id, 1);
        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 1_000);
        assert_eq!(ctx.client.auction_count(), 1);

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.total_amount, 1_000);
        assert_eq!(auction.remaining, 1_000);
        assert_eq!(auction.starting_price, 100);
        assert_eq!(auction.reserve_price, 50);
        assert_eq!(auction.decay_rate, 10);
        assert_eq!(auction.duration, 3600);
        assert_eq!(auction.planter, ctx.planter);
        assert_eq!(auction.status, AuctionStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_create_auction_zero_amount_rejected() {
        let ctx = auction_setup();
        ctx.client.create_auction(&ctx.seller, &ctx.planter, &0, &ctx.payment_token);
    }

    // ── bid ────────────────────────────────────────────────────────────────────

    #[test]
    fn test_bid_transfers_payment_to_seller_and_tokens_to_buyer() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);

        // Bid immediately at starting price
        ctx.client.bid(&ctx.buyer, &id, &200);

        let auction = ctx.client.get_auction(&id).unwrap();
        let current_price = ctx.client.get_current_price(&id);

        assert_eq!(current_price, 100); // Starting price
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 200 * 100
        );
        assert_eq!(
            balance(&ctx.env, &ctx.tree_token, &ctx.buyer),
            buyer_tree_before + 200
        );

        assert_eq!(auction.remaining, 800);
        assert_eq!(auction.status, AuctionStatus::Active);
    }

    #[test]
    fn test_bid_with_price_decay() {
        let ctx = auction_setup();
        // Configure short duration for testing
        ctx.client.configure_auction(&100, &50, &100, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        // Advance time to trigger price decay
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 50);

        let current_price = ctx.client.get_current_price(&id);
        // After 50% of duration, price should be halfway between start and reserve
        assert!(current_price < 100 && current_price > 50);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        ctx.client.bid(&ctx.buyer, &id, &200);

        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 200 * current_price
        );

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.remaining, 800);
    }

    #[test]
    fn test_full_bid_marks_auction_completed() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &1_000);

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.remaining, 0);
        assert_eq!(auction.status, AuctionStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_bid_more_than_available_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &500, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &501);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_bid_zero_amount_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_bid_on_completed_auction_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &1_000);
        ctx.client.bid(&ctx.buyer, &id, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_bid_on_nonexistent_auction_rejected() {
        let ctx = auction_setup();
        ctx.client.bid(&ctx.buyer, &99, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_self_trade_via_bid() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.seller, &id, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_bid_after_duration_rejected() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &10, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        // Advance time beyond duration
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 200);

        ctx.client.bid(&ctx.buyer, &id, &100);
    }

    // ── cancel_auction ────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_auction_returns_remaining_tokens() {
        let ctx = auction_setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        ctx.client.bid(&ctx.buyer, &id, &300);
        ctx.client.cancel_auction(&ctx.seller, &id);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.status, AuctionStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_cancel_completed_auction_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &500, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &500);
        ctx.client.cancel_auction(&ctx.seller, &id);
    }

    // ── auction_count ─────────────────────────────────────────────────────────

    #[test]
    fn test_auction_count_increments() {
        let ctx = auction_setup();
        assert_eq!(ctx.client.auction_count(), 0);
        ctx.client.create_auction(&ctx.seller, &ctx.planter, &100, &ctx.payment_token);
        ctx.client.create_auction(&ctx.seller, &ctx.planter, &200, &ctx.payment_token);
        assert_eq!(ctx.client.auction_count(), 2);
    }

    // ── get_current_price ─────────────────────────────────────────────────────

    #[test]
    fn test_get_current_price_at_start() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        assert_eq!(ctx.client.get_current_price(&id), 100); // Starting price
    }

    #[test]
    fn test_get_current_price_at_reserve() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &10, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        // Advance time to duration
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 100);

        assert_eq!(ctx.client.get_current_price(&id), 50); // Reserve price
    }

    // ── TWAP Oracle Tests ───────────────────────────────────────────────────────

    fn twap_setup() -> Ctx {
        let ctx = setup();
        ctx.client.configure_twap(&3600, &100);
        ctx
    }

    #[test]
    fn test_configure_twap_sets_parameters() {
        let ctx = setup();
        ctx.client.configure_twap(&3600, &100);
        let cfg = ctx.client.get_twap_config().unwrap();
        assert_eq!(cfg.period_seconds, 3600);
        assert_eq!(cfg.max_observations, 100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_configure_twap_zero_period_rejected() {
        let ctx = setup();
        ctx.client.configure_twap(&0, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_configure_twap_max_obs_below_2_rejected() {
        let ctx = setup();
        ctx.client.configure_twap(&3600, &1);
    }

    #[test]
    fn test_get_twap_config_not_configured_returns_none() {
        let ctx = setup();
        assert!(ctx.client.get_twap_config().is_none());
    }

    #[test]
    fn test_get_twap_no_observations_returns_none() {
        let ctx = twap_setup();
        assert!(ctx.client.get_twap(&1).is_none());
    }

    #[test]
    fn test_get_cumulative_observation_not_configured_returns_none() {
        let ctx = setup();
        assert!(ctx.client.get_cumulative_observation().is_none());
    }

    #[test]
    fn test_buy_records_twap_observation() {
        let ctx = twap_setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        let obs = ctx.client.get_cumulative_observation().unwrap();
        assert_eq!(obs.price, 10);
        assert!(obs.price_cumulative >= 0);
        assert_eq!(ctx.client.get_total_observations(), 1);
    }

    #[test]
    fn test_multiple_buys_accumulate_observations() {
        let ctx = twap_setup();

        // First buy at price 10
        let id1 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id1, &200);

        // Advance time so accumulator has meaningful delta
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 60);

        // Second buy at price 15
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &15, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id2, &300);

        let obs = ctx.client.get_cumulative_observation().unwrap();
        assert_eq!(obs.price, 15);
        // First observation at t=0 had no elapsed time, second at t=60
        // Accumulator should be: 10 * 60 = 600
        assert!(obs.price_cumulative >= 600);
        assert_eq!(ctx.client.get_total_observations(), 2);
    }

    #[test]
    fn test_get_twap_returns_reasonable_price() {
        let ctx = twap_setup();

        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        // Advance time by 60 seconds to get a meaningful TWAP
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 60);

        // Second buy creates second observation
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &20, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id2, &300);

        // TWAP with observation_count=1 should give us the price between obs 0 and 1
        let twap = ctx.client.get_twap(&1);
        assert!(twap.is_some());
        // The cumulative accumulator grew by 10 (price) * 60 (seconds) = 600
        // TWAP = 600 / 60 = 10 for the period between the two observations
        assert_eq!(twap.unwrap(), 10);
    }

    #[test]
    fn test_bid_records_twap_observation() {
        let ctx = twap_setup();
        ctx.client.configure_auction(&100, &50, &10, &3600);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &200);

        let obs = ctx.client.get_cumulative_observation().unwrap();
        assert_eq!(obs.price, 100);
        assert_eq!(ctx.client.get_total_observations(), 1);
    }

    #[test]
    fn test_twap_not_configured_still_works_normally() {
        // Verify that TWAP not being configured doesn't break existing functionality
        let ctx = setup();
        ctx.client.configure_auction(&100, &50, &10, &3600);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &500);

        // TWAP queries should return None since not configured
        assert!(ctx.client.get_twap_config().is_none());
        assert!(ctx.client.get_cumulative_observation().is_none());
        assert_eq!(ctx.client.get_total_observations(), 0);
        assert!(ctx.client.get_twap(&1).is_none());
    }

    #[test]
    fn test_twap_ring_buffer_overwrites_old_observations() {
        let ctx = setup();
        // Configure with only 3 max observations
        ctx.client.configure_twap(&3600, &3);

        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        // Record 5 observations to overflow the ring buffer
        for i in 0..5u64 {
            ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 10);
            ctx.client.buy(&ctx.buyer, &id, &100);
        }

        // Total should be 5, but ring buffer only keeps latest 3
        assert_eq!(ctx.client.get_total_observations(), 5);

        // TWAP should still work with recent observations
        let twap = ctx.client.get_twap(&2);
        assert!(twap.is_some());
    }

    // ── Treasury Reserve Swap (#810) ──────────────────────────────────────────

    fn treasury_setup() -> Ctx {
        let ctx = setup();
        let usdc_reserve = Address::generate(&ctx.env);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &250); // 2.5%
        ctx
    }

    #[test]
    fn test_configure_treasury_reserve_sets_config() {
        let ctx = setup();
        let usdc_reserve = Address::generate(&ctx.env);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &250);

        let config = ctx.client.get_treasury_reserve().unwrap();
        assert_eq!(config.fee_token, ctx.payment_token);
        assert_eq!(config.usdc_reserve, usdc_reserve);
        assert_eq!(config.fee_bps, 250);
        assert_eq!(config.accumulated_fees, 0);
        assert_eq!(config.total_swapped, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #117)")]
    fn test_configure_treasury_reserve_double_config_rejected() {
        let ctx = setup();
        let usdc_reserve = Address::generate(&ctx.env);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &250);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_configure_treasury_reserve_zero_fee_rejected() {
        let ctx = setup();
        let usdc_reserve = Address::generate(&ctx.env);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_configure_treasury_reserve_fee_too_high_rejected() {
        let ctx = setup();
        let usdc_reserve = Address::generate(&ctx.env);
        ctx.client.configure_treasury_reserve(&ctx.payment_token, &usdc_reserve, &1_001);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_get_accumulated_fees_not_configured_rejected() {
        let ctx = setup();
        ctx.client.get_accumulated_fees();
    }

    #[test]
    fn test_get_accumulated_fees_zero_initially() {
        let ctx = treasury_setup();
        assert_eq!(ctx.client.get_accumulated_fees(), 0);
    }

    #[test]
    fn test_buy_collects_protocol_fee() {
        let ctx = treasury_setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);

        let buyer_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.buyer);
        let contract_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.client.address);

        ctx.client.buy(&ctx.buyer, &id, &200);

        // payment = 200 * 100 = 20_000
        // royalty = 0 (planter == seller by default in setup)
        // protocol_fee = 20_000 * 250 / 10_000 = 500
        // seller gets = 20_000 - 500 = 19_500
        let expected_fee = 20_000 * 250 / 10_000;
        assert_eq!(ctx.client.get_accumulated_fees(), expected_fee);

        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.buyer),
            buyer_pay_before - 20_000
        );
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.client.address),
            contract_pay_before + expected_fee
        );
    }

    #[test]
    fn test_buy_protocol_fee_split_with_royalty() {
        let ctx = treasury_setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.set_royalty(&1_000); // 10% royalty

        ctx.client.buy(&ctx.buyer, &id, &200);

        // payment = 200 * 100 = 20_000
        // royalty = 20_000 * 1_000 / 10_000 = 2_000 (to planter)
        // post_royalty = 18_000
        // protocol_fee = 18_000 * 250 / 10_000 = 450
        // seller = 18_000 - 450 = 17_550
        let expected_royalty = 20_000 * 1_000 / 10_000;
        let post_royalty = 20_000 - expected_royalty;
        let expected_fee = post_royalty * 250 / 10_000;

        assert_eq!(ctx.client.get_accumulated_fees(), expected_fee);
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.planter),
            expected_royalty
        );
    }

    #[test]
    fn test_bid_collects_protocol_fee() {
        let ctx = treasury_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        let contract_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.client.address);

        ctx.client.bid(&ctx.buyer, &id, &200);

        // starting_price = 100, payment = 200 * 100 = 20_000
        // royalty = 0
        // protocol_fee = 20_000 * 250 / 10_000 = 500
        let expected_fee = 20_000 * 250 / 10_000;
        assert_eq!(ctx.client.get_accumulated_fees(), expected_fee);
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.client.address),
            contract_pay_before + expected_fee
        );
    }

    #[test]
    fn test_multiple_trades_accumulate_fees() {
        let ctx = treasury_setup();
        let id1 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &500, &200, &ctx.payment_token);

        ctx.client.buy(&ctx.buyer, &id1, &100); // fee = 10_000 * 250/10_000 = 250
        ctx.client.buy(&ctx.buyer, &id2, &50);  // fee = 10_000 * 250/10_000 = 250

        assert_eq!(ctx.client.get_accumulated_fees(), 500);
    }

    #[test]
    fn test_swap_fees_to_usdc_transfers_and_resets() {
        let ctx = treasury_setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        let expected_fee = 20_000 * 250 / 10_000;
        let config = ctx.client.get_treasury_reserve().unwrap();
        let reserve_before = balance(&ctx.env, &ctx.payment_token, &config.usdc_reserve);

        ctx.client.swap_fees_to_usdc();

        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &config.usdc_reserve),
            reserve_before + expected_fee
        );
        assert_eq!(ctx.client.get_accumulated_fees(), 0);

        let config_after = ctx.client.get_treasury_reserve().unwrap();
        assert_eq!(config_after.total_swapped, expected_fee);
        assert_eq!(config_after.accumulated_fees, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_swap_fees_zero_rejected() {
        let ctx = treasury_setup();
        ctx.client.swap_fees_to_usdc();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_swap_fees_not_configured_rejected() {
        let ctx = setup();
        ctx.client.swap_fees_to_usdc();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_get_treasury_reserve_not_configured_returns_none() {
        let ctx = setup();
        let config = ctx.client.get_treasury_reserve();
        // get_treasury_reserve returns Option, but get_accumulated_fees panics
        assert!(config.is_none());
        ctx.client.get_accumulated_fees(); // this should panic
    }

    #[test]
    fn test_no_protocol_fee_when_not_configured() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);

        ctx.client.buy(&ctx.buyer, &id, &200);

        // No treasury configured — seller gets full payment
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 200 * 10
        );
    }

    #[test]
    fn test_accumulated_fees_track_total_swapped_after_multiple_swaps() {
        let ctx = treasury_setup();

        // First trade + swap
        let id1 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id1, &200);
        ctx.client.swap_fees_to_usdc();
        let config1 = ctx.client.get_treasury_reserve().unwrap();
        assert_eq!(config1.total_swapped, 500);
        assert_eq!(config1.accumulated_fees, 0);

        // Second trade + swap
        let id2 = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id2, &200);
        ctx.client.swap_fees_to_usdc();
        let config2 = ctx.client.get_treasury_reserve().unwrap();
        assert_eq!(config2.total_swapped, 1_000);
        assert_eq!(config2.accumulated_fees, 0);
    }

    // ── Fuzz Tests (Proptest) ──────────────────────────────────────────────────

    #[cfg(test)]
    mod fuzz_tests {
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn fuzz_dutch_auction_decay_calculation(
                starting_price in 100i128..10_000i128,
                price_delta in 1i128..1_000i128,
                duration in 10u64..10_000u64,
                elapsed_pct in 0u64..100u64,
            ) {
                let reserve_price = starting_price.saturating_sub(price_delta).max(1);
                if starting_price > reserve_price && duration > 0 {
                    let elapsed = (duration * elapsed_pct) / 100;
                    let price_drop = (starting_price - reserve_price) * elapsed as i128 / duration as i128;
                    let calculated_price = starting_price - price_drop;

                    prop_assert!(calculated_price >= reserve_price);
                    prop_assert!(calculated_price <= starting_price);
                }
            }

            #[test]
            fn fuzz_listing_trade_payout_invariants(
                amount in 1i128..1_000_000i128,
                price_per_token in 1i128..100_000i128,
                royalty_bps in 0u32..2_000u32,
            ) {
                let total_cost = amount.saturating_mul(price_per_token);
                let royalty_amount = (total_cost as u128 * royalty_bps as u128 / 10_000) as i128;
                let seller_net = total_cost - royalty_amount;

                prop_assert_eq!(seller_net + royalty_amount, total_cost);
                prop_assert!(seller_net >= 0);
                prop_assert!(royalty_amount >= 0);
            }
        }
    }

    #[test]
    fn test_dynamic_fee_tier_system() {
        let env = Env::default();
        assert_eq!(CarbonMarketplace::get_fee_bps(env.clone(), 500), 30);
        assert_eq!(CarbonMarketplace::get_fee_bps(env.clone(), 15_000), 20);
        assert_eq!(CarbonMarketplace::get_fee_bps(env.clone(), 200_000), 10);
    }

    #[test]
    fn test_emergency_pause_lifecycle() {
        let ctx = TestContext::setup();
        assert!(!ctx.client.is_paused());
        ctx.client.pause();
        assert!(ctx.client.is_paused());
        ctx.client.unpause();
        assert!(!ctx.client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_list_blocked_when_paused() {
        let ctx = TestContext::setup();
        ctx.client.pause();
        ctx.client.list(&ctx.seller, &ctx.planter, &100i128, &10i128, &ctx.payment_token);
    }
}
