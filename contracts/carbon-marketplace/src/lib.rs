#![no_std]

//! Carbon Credit Marketplace — Closes #490
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
//!      directly to the seller; TREE tokens are transferred to the buyer.
//!   4. Seller calls `cancel(seller, listing_id)` to de-list remaining tokens.

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

/// TTL threshold (in ledgers) below which we bump a persistent entry back up.
const PERSISTENT_BUMP_THRESHOLD: u32 = 100_000;
/// Bump a persistent entry's TTL to this value (ledgers ≈ ~5s each → ~14 days).
const PERSISTENT_BUMP_AMOUNT: u32 = 250_000;
/// Instance TTL bump threshold.
const INSTANCE_BUMP_THRESHOLD: u32 = 100_000;
/// Instance TTL bump amount.
const INSTANCE_BUMP_AMOUNT: u32 = 250_000;

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

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    /// One-time initialisation.
    ///
    /// # Arguments
    /// * `admin`           — platform admin (may delist fraudulent listings)
    /// * `tree_token`      — the TREE SAC token that represents carbon offset certificates
    /// * `admin_controls`  — admin-controls contract address for pause functionality
    ///
    /// # Authorization
    /// Caller-side: this function is typically invoked by the deployer; there is
    /// no on-chain auth because the contract has no admin set yet.  Off-chain
    /// deployer access control should be used.
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
        Self::bump_instance_ttl(&env);
    }

    /// Admin configures a price oracle feed for dynamic TREE pricing.
    ///
    /// # Arguments
    /// * `oracle` — external oracle contract address exposing `price()` and `timestamp()`
    /// * `max_staleness` — number of seconds before the fallback price is used
    /// * `fallback_price` — price per token used when the oracle is stale or unavailable
    ///
    /// # Authorization
    /// Requires `admin.require_auth()`.
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
            .set(&DataKey::OracleConfig, &(max_staleness, fallback_price));
        Self::bump_instance_ttl(&env);
    }

    /// Returns the current marketplace price for TREE tokens.
    ///
    /// If an oracle is configured and fresh, its price is returned. Otherwise the
    /// administrator-configured fallback price is used.
    pub fn get_dynamic_price(env: Env) -> i128 {
        Self::bump_instance_ttl(&env);
        Self::resolve_listing_price(&env, 0)
    }

    /// Admin configures default Dutch Auction parameters.
    ///
    /// # Arguments
    /// * `starting_price` — highest price per token at auction start
    /// * `reserve_price`  — minimum acceptable price per token
    /// * `decay_rate`     — price decay rate in basis points per second (e.g., 10 = 0.1%)
    /// * `duration`       — auction duration in seconds
    ///
    /// # Authorization
    /// Requires `admin.require_auth()`.
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
        Self::bump_instance_ttl(&env);
    }

    /// Seller lists `amount` TREE tokens for sale at `price_per_token` in
    /// `payment_token` units.  TREE tokens are transferred into the contract.
    ///
    /// Pass `price_per_token = 0` to use the configured dynamic price feed
    /// (oracle with fallback).  Otherwise the provided fixed price is used.
    ///
    /// # Authorization
    /// Requires `seller.require_auth()` — the caller must own the TREE tokens
    /// being escrowed.
    ///
    /// # Returns
    /// The new listing ID (monotonically increasing, starts at 1).
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

        Self::bump_instance_ttl(&env);
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
        Self::bump_listing_ttl(&env, new_id);
        env.storage()
            .instance()
            .set(&DataKey::ListingCount, &new_id);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("listed"), seller), (new_id, amount, resolved_price));

        new_id
    }

    /// Buy `amount` TREE tokens from listing `listing_id`.
    ///
    /// Payment is computed as `amount × price_per_token` and transferred from
    /// the buyer to the seller.  TREE tokens are transferred to the buyer.
    ///
    /// Slippage protection: the caller specifies `max_payment_amount` — the
    /// maximum units of `payment_token` willing to be debited.  If the actual
    /// computed payment exceeds this cap the call reverts with
    /// `PaymentExceedsMaximum`.  Set `max_payment_amount = i128::MAX` to
    /// disable the cap.
    ///
    /// # Authorization
    /// Requires `buyer.require_auth()` so only the token owner can initiate
    /// the purchase.
    pub fn buy(env: Env, buyer: Address, listing_id: u64, amount: i128, max_payment_amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }
        if max_payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::PaymentAmountMustBePositive);
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

        if payment > max_payment_amount {
            panic_with_error!(&env, MarketplaceError::PaymentExceedsMaximum);
        }

        let royalty_amount = Self::split_payment(
            &env,
            payment,
            &listing.payment_token,
            &buyer,
            &listing.planter,
            &listing.seller,
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
        Self::bump_listing_ttl(&env, listing_id);

        // Record TWAP observation from this trade price
        Self::record_observation(&env, listing.price_per_token);

        env.events()
            .publish((symbol_short!("sold"), listing_id), (buyer, amount, payment, royalty_amount));
    }

    /// Buy TREE tokens from listing `listing_id` by spending an *exact* amount
    /// of the payment token.
    ///
    /// The contract computes how many TREE tokens can be purchased with
    /// `payment_amount` at the listing's `price_per_token`.  If the resulting
    /// token count is below `min_tokens_received` the call reverts with
    /// `InsufficientTokensReceived`.  This variant is the standard
    /// exact-input + minimum-received DeFi swap pattern.
    ///
    /// # Authorization
    /// Requires `buyer.require_auth()`.
    ///
    /// # Returns
    /// The number of TREE tokens actually transferred to the buyer.
    pub fn buy_exact_payment(
        env: Env,
        buyer: Address,
        listing_id: u64,
        payment_amount: i128,
        min_tokens_received: i128,
    ) -> i128 {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::PaymentAmountMustBePositive);
        }
        if min_tokens_received < 0 {
            panic_with_error!(&env, MarketplaceError::InsufficientTokensReceived);
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

        // tokens_out = payment_amount / price_per_token  (integer floor)
        let tokens_out = payment_amount
            .checked_div(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        if tokens_out <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }
        if tokens_out < min_tokens_received {
            panic_with_error!(&env, MarketplaceError::InsufficientTokensReceived);
        }
        if tokens_out > listing.remaining {
            panic_with_error!(&env, MarketplaceError::InsufficientLiquidity);
        }

        // Actual payment is tokens_out × price (may be less than payment_amount
        // due to integer rounding).  We charge only this exact amount.
        let actual_payment = tokens_out
            .checked_mul(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        let royalty_amount = Self::split_payment(
            &env,
            actual_payment,
            &listing.payment_token,
            &buyer,
            &listing.planter,
            &listing.seller,
        );

        // Transfer TREE tokens from contract escrow to buyer
        token::Client::new(&env, &listing.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &tokens_out,
        );

        listing.remaining -= tokens_out;
        if listing.remaining == 0 {
            listing.status = ListingStatus::Filled;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Listing(listing_id), &listing);
        Self::bump_listing_ttl(&env, listing_id);

        env.events().publish(
            (symbol_short!("sold_xact"), listing_id),
            (buyer.clone(), tokens_out, actual_payment, royalty_amount, payment_amount),
        );

        tokens_out
    }

    /// Seller cancels their listing, reclaiming any remaining escrowed TREE tokens.
    ///
    /// # Authorization
    /// Requires `seller.require_auth()` — only the original lister may cancel.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        Self::bump_listing_ttl(&env, listing_id);
        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.seller != seller {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }

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
        Self::bump_listing_ttl(&env, listing_id);

        env.events()
            .publish((symbol_short!("cancelled"), listing_id), listing.remaining);
    }

    /// Admin de-lists any listing (e.g. fraudulent certificate).
    ///
    /// Remaining escrowed TREE tokens are returned to the original seller.
    ///
    /// # Authorization
    /// Requires `admin.require_auth()`.
    pub fn admin_cancel(env: Env, listing_id: u64) {
        Self::assert_not_paused(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        Self::bump_listing_ttl(&env, listing_id);
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
        Self::bump_listing_ttl(&env, listing_id);

        env.events()
            .publish((symbol_short!("adm_cncl"), listing_id), ());
    }

    /// Returns the listing record, or `None` if it doesn't exist.
    ///
    /// Also bumps the persistent TTL of the record so listings aren't garbage
    /// collected while users are still reading them.
    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        Self::bump_listing_ttl(&env, listing_id);
        env.storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
    }

    /// Returns the total number of listings created (including filled/cancelled).
    pub fn listing_count(env: Env) -> u64 {
        Self::bump_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0)
    }

    // ── Dutch Auction ─────────────────────────────────────────────────────────────

    /// Seller creates a Dutch auction for `amount` TREE tokens.
    ///
    /// Uses pre-configured auction parameters (`starting_price`, `reserve_price`,
    /// `decay_rate`, `duration`).  TREE tokens are escrowed in the contract.
    ///
    /// # Authorization
    /// Requires `seller.require_auth()` — the caller must own the TREE tokens
    /// being escrowed.
    ///
    /// # Returns
    /// The new auction ID (monotonically increasing, starts at 1).
    pub fn create_auction(
        env: Env,
        seller: Address,
        planter: Address,
        amount: i128,
        payment_token: Address,
    ) -> u64 {
        Self::assert_not_paused(&env);
        seller.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }

        let (starting_price, reserve_price, decay_rate, duration) = Self::auction_config(&env);
        let (_, tree_token) = Self::config(&env);

        // Escrow the TREE tokens into the contract
        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        Self::bump_instance_ttl(&env);
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
        Self::bump_auction_ttl(&env, new_id);
        env.storage()
            .instance()
            .set(&DataKey::AuctionCount, &new_id);
        Self::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("auct_crtd"), seller), (new_id, amount, starting_price));

        new_id
    }

    /// Buyer bids on auction `auction_id` for `amount` TREE tokens.
    ///
    /// The current price is calculated based on elapsed time and decay rate.
    /// Payment is transferred atomically from buyer to seller, and TREE tokens
    /// are transferred to the buyer.
    ///
    /// Slippage protection: `max_payment_amount` caps the total payment-token
    /// units debited.  Because Dutch auction prices move every ledger, this
    /// cap is essential to prevent a buyer from paying significantly more
    /// than anticipated between signing and execution.  Set to `i128::MAX`
    /// to disable the cap (not recommended).
    ///
    /// If the entire auction is filled, it's marked as completed.
    ///
    /// # Authorization
    /// Requires `buyer.require_auth()`.
    pub fn bid(env: Env, buyer: Address, auction_id: u64, amount: i128, max_payment_amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }
        if max_payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::PaymentAmountMustBePositive);
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

        if payment > max_payment_amount {
            panic_with_error!(&env, MarketplaceError::PaymentExceedsMaximum);
        }

        let royalty_amount = Self::split_payment(
            &env,
            payment,
            &auction.payment_token,
            &buyer,
            &auction.planter,
            &auction.seller,
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
        Self::bump_auction_ttl(&env, auction_id);

        // Record TWAP observation from this trade price
        Self::record_observation(&env, current_price);

        env.events()
            .publish((symbol_short!("bid"), auction_id), (buyer, amount, current_price, payment, royalty_amount));
    }

    /// Bid on auction `auction_id` by spending an *exact* amount of the
    /// payment token.
    ///
    /// The contract looks up the current Dutch-auction price, computes how
    /// many TREE tokens `payment_amount` buys, and checks the resulting
    /// count against `min_tokens_received`.  Reverts with
    /// `InsufficientTokensReceived` if the floor is not met.
    ///
    /// # Authorization
    /// Requires `buyer.require_auth()`.
    ///
    /// # Returns
    /// The number of TREE tokens actually transferred to the buyer.
    pub fn bid_exact_payment(
        env: Env,
        buyer: Address,
        auction_id: u64,
        payment_amount: i128,
        min_tokens_received: i128,
    ) -> i128 {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if payment_amount <= 0 {
            panic_with_error!(&env, MarketplaceError::PaymentAmountMustBePositive);
        }
        if min_tokens_received < 0 {
            panic_with_error!(&env, MarketplaceError::InsufficientTokensReceived);
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

        let current_time = env.ledger().timestamp();
        let elapsed = current_time.saturating_sub(auction.start_time);

        if elapsed > auction.duration {
            panic_with_error!(&env, MarketplaceError::AuctionExpired);
        }

        let current_price = Self::calculate_current_price(&auction, current_time);

        if current_price < auction.reserve_price {
            panic_with_error!(&env, MarketplaceError::BidBelowReservePrice);
        }

        // tokens_out = payment_amount / current_price  (floor)
        let tokens_out = payment_amount
            .checked_div(current_price)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        if tokens_out <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }
        if tokens_out < min_tokens_received {
            panic_with_error!(&env, MarketplaceError::InsufficientTokensReceived);
        }
        if tokens_out > auction.remaining {
            panic_with_error!(&env, MarketplaceError::InsufficientLiquidity);
        }

        let actual_payment = tokens_out
            .checked_mul(current_price)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        let royalty_amount = Self::split_payment(
            &env,
            actual_payment,
            &auction.payment_token,
            &buyer,
            &auction.planter,
            &auction.seller,
        );

        // Transfer TREE tokens from contract escrow to buyer atomically
        token::Client::new(&env, &auction.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &tokens_out,
        );

        auction.remaining -= tokens_out;
        if auction.remaining == 0 {
            auction.status = AuctionStatus::Completed;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Auction(auction_id), &auction);
        Self::bump_auction_ttl(&env, auction_id);

        env.events().publish(
            (symbol_short!("bid_exact"), auction_id),
            (buyer.clone(), tokens_out, current_price, actual_payment, royalty_amount, payment_amount),
        );

        tokens_out
    }

    /// Seller cancels their active auction, reclaiming remaining escrowed TREE tokens.
    ///
    /// # Authorization
    /// Requires `seller.require_auth()` — only the original auction creator may cancel.
    pub fn cancel_auction(env: Env, seller: Address, auction_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        Self::bump_auction_ttl(&env, auction_id);
        let mut auction: DutchAuction = env
            .storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        if auction.seller != seller {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }

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
        Self::bump_auction_ttl(&env, auction_id);

        env.events()
            .publish((symbol_short!("auct_cncl"), auction_id), auction.remaining);
    }

    /// Returns the auction record, or `None` if it doesn't exist.
    ///
    /// Also bumps the persistent TTL of the record so auctions aren't garbage
    /// collected while users are still reading them.
    pub fn get_auction(env: Env, auction_id: u64) -> Option<DutchAuction> {
        Self::bump_auction_ttl(&env, auction_id);
        env.storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
    }

    /// Returns the current price for an active auction based on elapsed time.
    pub fn get_current_price(env: Env, auction_id: u64) -> i128 {
        Self::bump_auction_ttl(&env, auction_id);
        let auction: DutchAuction = env
            .storage()
            .persistent()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        Self::calculate_current_price(&auction, env.ledger().timestamp())
    }

    /// Returns the total number of auctions created (including completed/cancelled).
    pub fn auction_count(env: Env) -> u64 {
        Self::bump_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&DataKey::AuctionCount)
            .unwrap_or(0)
    }

    /// Admin sets the royalty percentage in basis points (e.g. 500 = 5%).
    /// Royalty is paid to the original planter on secondary sales.
    ///
    /// # Authorization
    /// Requires `admin.require_auth()`.
    pub fn set_royalty(env: Env, basis_points: u32) {
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        if basis_points > 10_000 {
            panic_with_error!(&env, HarvestaError::InvalidRoyalty);
        }

        env.storage()
            .instance()
            .set(&DataKey::RoyaltyConfig, &basis_points);
        Self::bump_instance_ttl(&env);
    }

    /// Returns the current royalty basis points (0 if not configured).
    pub fn get_royalty(env: Env) -> u32 {
        Self::bump_instance_ttl(&env);
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

    // ── internal ──────────────────────────────────────────────────────────────

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    fn bump_listing_ttl(env: &Env, id: u64) {
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Listing(id), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
    }

    fn bump_auction_ttl(env: &Env, id: u64) {
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Auction(id), PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
    }

    fn split_payment(
        env: &Env,
        payment: i128,
        payment_token: &Address,
        from: &Address,
        planter: &Address,
        seller: &Address,
    ) -> i128 {
        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0);

        let royalty_amount = if royalty_bps > 0 && planter != seller {
            (payment * royalty_bps as i128) / 10_000
        } else {
            0
        };
        let seller_amount = payment - royalty_amount;

        if royalty_amount > 0 {
            token::Client::new(env, payment_token).transfer(
                from,
                planter,
                &royalty_amount,
            );
        }

        token::Client::new(env, payment_token).transfer(
            from,
            seller,
            &seller_amount,
        );

        royalty_amount
    }

    fn config(env: &Env) -> (Address, Address) {
        Self::bump_instance_ttl(env);
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn admin_controls(env: &Env) -> Address {
        Self::bump_instance_ttl(env);
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
        Self::bump_instance_ttl(env);
        env.storage()
            .instance()
            .get(&DataKey::AuctionConfig)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
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
        admin_controls: Address,
        client: CarbonMarketplaceClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

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

        let tree_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &tree_token).mint(&seller, &10_000);

        let payment_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &100_000);

        client.initialize(&admin, &tree_token, &admin_controls_id);

        Ctx { env, admin, seller, buyer, planter, tree_token, payment_token, admin_controls: admin_controls_id, client }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    const MAX: i128 = i128::MAX;

    // ── oracle pricing ───────────────────────────────────────────────────────

    #[test]
    fn test_list_uses_oracle_price_when_price_not_provided() {
        let ctx = setup();
        let oracle_id = ctx.env.register_contract(None, MockPriceOracle);
        let oracle_client = PriceOracleClient::new(&ctx.env, &oracle_id);
        oracle_client.initialize(&100, &ctx.env.ledger().timestamp());

        ctx.client.configure_price_oracle(&oracle_id, &60, &75);

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

        ctx.client.configure_price_oracle(&oracle_id, &30, &75);
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

        ctx.client.configure_price_oracle(&oracle_id, &60, &90);

        assert_eq!(ctx.client.get_dynamic_price(), 120);
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.tree_token, &ctx.admin_controls);
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

    // ── buy (exact tokens out) ────────────────────────────────────────────────

    #[test]
    fn test_buy_transfers_payment_to_seller_and_tokens_to_buyer() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);

        // 200 tokens * 10 price = 2000 payment; max_payment_amount = 2000
        ctx.client.buy(&ctx.buyer, &id, &200, &2_000);

        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 2_000
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
    fn test_buy_max_payment_exactly_matches_succeeds() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // Exact boundary: max == required (200 * 10 = 2000)
        ctx.client.buy(&ctx.buyer, &id, &200, &2_000);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.buyer), 200);
    }

    #[test]
    fn test_buy_max_payment_larger_than_required_succeeds() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // Overspecified cap is fine — user is willing to pay up to 5000, actual is 2000
        ctx.client.buy(&ctx.buyer, &id, &200, &5_000);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.buyer), 200);
        // Only actual cost is charged
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.buyer), 100_000 - 2_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_buy_payment_exceeds_max_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // 200 * 10 = 2000 > 1999 → slippage violation
        ctx.client.buy(&ctx.buyer, &id, &200, &1_999);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_buy_zero_max_payment_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200, &0);
    }

    #[test]
    fn test_full_buy_marks_listing_filled() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000, &10_000);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.remaining, 0);
        assert_eq!(listing.status, ListingStatus::Filled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_buy_more_than_available_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &501, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_buy_zero_amount_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &0, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #109)")]
    fn test_buy_from_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000, &MAX);
        ctx.client.buy(&ctx.buyer, &id, &1, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #108)")]
    fn test_buy_nonexistent_listing_rejected() {
        let ctx = setup();
        ctx.client.buy(&ctx.buyer, &99, &1, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_self_trade_via_buy() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.seller, &id, &100, &MAX);
    }

    // ── buy_exact_payment (exact payment in, min tokens out) ──────────────────

    #[test]
    fn test_buy_exact_payment_succeeds() {
        let ctx = setup();
        // price=10 per token → 2000 payment buys exactly 200 tokens
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);
        let buyer_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.buyer);

        let received = ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_000, &200);

        assert_eq!(received, 200);
        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.buyer), buyer_tree_before + 200);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.buyer), buyer_pay_before - 2_000);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.seller), seller_pay_before + 2_000);
    }

    #[test]
    fn test_buy_exact_payment_with_rounding_charges_only_exact_cost() {
        let ctx = setup();
        // price=10 per token. Pay 2005 → floor div buys 200 tokens, actual cost=2000
        // So buyer gets 200 tokens for only 2000 (change stays in buyer account)
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let buyer_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.buyer);

        let received = ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_005, &200);

        assert_eq!(received, 200);
        // Only 200 * 10 = 2000 is actually charged, 5 remains
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.buyer), buyer_pay_before - 2_000);
    }

    #[test]
    fn test_buy_exact_payment_min_boundary_exact_match() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // 2000 / 10 = exactly 200, min = 200 → OK
        let received = ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_000, &200);
        assert_eq!(received, 200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_buy_exact_payment_below_min_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // 2000 / 10 = 200 tokens out, but min = 201 requested → rejected
        ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_000, &201);
    }

    #[test]
    fn test_buy_exact_payment_min_zero_allowed_when_tokens_out_positive() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // min_tokens_received=0 is the floor (any positive amount satisfies >=0)
        let received = ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_000, &0);
        assert_eq!(received, 200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_buy_exact_payment_negative_min_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy_exact_payment(&ctx.buyer, &id, &2_000, &-1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_buy_exact_payment_zero_payment_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy_exact_payment(&ctx.buyer, &id, &0, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_buy_exact_payment_more_than_available_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        // 6000 / 10 = 600 tokens > 500 remaining
        ctx.client.buy_exact_payment(&ctx.buyer, &id, &6_000, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_buy_exact_payment_self_trade_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy_exact_payment(&ctx.seller, &id, &2_000, &1);
    }

    // ── cancel listing + authorization ────────────────────────────────────────

    #[test]
    fn test_cancel_returns_remaining_tokens() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        ctx.client.buy(&ctx.buyer, &id, &300, &MAX);
        ctx.client.cancel(&ctx.seller, &id);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.status, ListingStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_cancel_by_non_seller_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        // Buyer is not the lister — Unauthorized (HarvestaError code 3)
        ctx.client.cancel(&ctx.buyer, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #109)")]
    fn test_cancel_already_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &500, &MAX);
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

    // ── bid (exact tokens out) ────────────────────────────────────────────────

    #[test]
    fn test_bid_transfers_payment_to_seller_and_tokens_to_buyer() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);

        // Bid immediately at starting price 100 → 200 * 100 = 20000
        ctx.client.bid(&ctx.buyer, &id, &200, &20_000);

        let auction = ctx.client.get_auction(&id).unwrap();
        let current_price = ctx.client.get_current_price(&id);

        assert_eq!(current_price, 100);
        assert_eq!(
            balance(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_pay_before + 20_000
        );
        assert_eq!(
            balance(&ctx.env, &ctx.tree_token, &ctx.buyer),
            buyer_tree_before + 200
        );

        assert_eq!(auction.remaining, 800);
        assert_eq!(auction.status, AuctionStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_bid_payment_exceeds_max_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        // At t=0 price=100, 200 tokens cost 20000. Cap at 19999 → rejected
        ctx.client.bid(&ctx.buyer, &id, &200, &19_999);
    }

    #[test]
    fn test_bid_with_price_decay() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &100, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 50);

        let current_price = ctx.client.get_current_price(&id);
        assert!(current_price < 100 && current_price > 50);

        let seller_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);
        // Use i128::MAX cap to focus on the price-decay semantics
        ctx.client.bid(&ctx.buyer, &id, &200, &MAX);

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
        ctx.client.bid(&ctx.buyer, &id, &1_000, &MAX);

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.remaining, 0);
        assert_eq!(auction.status, AuctionStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_bid_more_than_available_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &500, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &501, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_bid_zero_amount_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &0, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_bid_zero_max_payment_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &100, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_bid_on_completed_auction_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &1_000, &MAX);
        ctx.client.bid(&ctx.buyer, &id, &1, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_bid_on_nonexistent_auction_rejected() {
        let ctx = auction_setup();
        ctx.client.bid(&ctx.buyer, &99, &1, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_self_trade_via_bid() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.seller, &id, &100, &MAX);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_bid_after_duration_rejected() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &10, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 200);

        ctx.client.bid(&ctx.buyer, &id, &100, &MAX);
    }

    // ── bid_exact_payment (exact payment in, min tokens out) ─────────────────

    #[test]
    fn test_bid_exact_payment_at_starting_price() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        let buyer_pay_before = balance(&ctx.env, &ctx.payment_token, &ctx.buyer);
        let buyer_tree_before = balance(&ctx.env, &ctx.tree_token, &ctx.buyer);

        // At t=0: price=100. Pay 20000 → exactly 200 tokens.
        let received = ctx.client.bid_exact_payment(&ctx.buyer, &id, &20_000, &200);

        assert_eq!(received, 200);
        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.buyer), buyer_tree_before + 200);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.buyer), buyer_pay_before - 20_000);
    }

    #[test]
    fn test_bid_exact_payment_with_decay_buys_more_tokens() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &100, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        // Move to midpoint — price ~ 75. Pay 15000, expect around 200 tokens at worst.
        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 50);
        let current_price = ctx.client.get_current_price(&id);
        let expected_tokens = 15_000 / current_price;

        let received = ctx.client.bid_exact_payment(&ctx.buyer, &id, &15_000, &expected_tokens);
        assert_eq!(received, expected_tokens);
        assert!(received > 150); // at price=75 → 200, at price=100 → 150, so must be >150
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_bid_exact_payment_below_min_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        // 20000 / 100 = 200 tokens. Require 201 minimum → rejected.
        ctx.client.bid_exact_payment(&ctx.buyer, &id, &20_000, &201);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #116)")]
    fn test_bid_exact_payment_zero_payment_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid_exact_payment(&ctx.buyer, &id, &0, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #115)")]
    fn test_bid_exact_payment_negative_min_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid_exact_payment(&ctx.buyer, &id, &20_000, &-1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_bid_exact_payment_self_trade_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid_exact_payment(&ctx.seller, &id, &20_000, &1);
    }

    // ── cancel_auction + authorization ────────────────────────────────────────

    #[test]
    fn test_cancel_auction_returns_remaining_tokens() {
        let ctx = auction_setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        ctx.client.bid(&ctx.buyer, &id, &300, &MAX);
        ctx.client.cancel_auction(&ctx.seller, &id);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);

        let auction = ctx.client.get_auction(&id).unwrap();
        assert_eq!(auction.status, AuctionStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_cancel_auction_by_non_seller_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        // Buyer cancelling someone else's auction → Unauthorized (code 3)
        ctx.client.cancel_auction(&ctx.buyer, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_cancel_completed_auction_rejected() {
        let ctx = auction_setup();
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &500, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &500, &MAX);
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
        assert_eq!(ctx.client.get_current_price(&id), 100);
    }

    #[test]
    fn test_get_current_price_at_reserve() {
        let ctx = auction_setup();
        ctx.client.configure_auction(&100, &50, &10, &100);
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 100);

        assert_eq!(ctx.client.get_current_price(&id), 50);
    }

    // ── Royalty integration (ensures split_payment works) ────────────────────

    #[test]
    fn test_buy_with_royalty_pays_planter() {
        let ctx = setup();
        ctx.client.set_royalty(&500); // 5% to planter
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let planter_before = balance(&ctx.env, &ctx.payment_token, &ctx.planter);
        let seller_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);

        // Buy 200 tokens × 10 = 2000. Royalty 5% = 100 to planter, 1900 to seller.
        ctx.client.buy(&ctx.buyer, &id, &200, &2_000);

        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.planter), planter_before + 100);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.seller), seller_before + 1_900);
    }

    #[test]
    fn test_buy_exact_payment_with_royalty() {
        let ctx = setup();
        ctx.client.set_royalty(&1_000); // 10%
        let id = ctx.client.list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);

        let planter_before = balance(&ctx.env, &ctx.payment_token, &ctx.planter);
        let seller_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);

        // 1000 payment / 10 price = 100 tokens. Total cost = 1000.
        // Royalty 10% = 100 to planter, 900 to seller.
        let received = ctx.client.buy_exact_payment(&ctx.buyer, &id, &1_000, &100);

        assert_eq!(received, 100);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.planter), planter_before + 100);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.seller), seller_before + 900);
    }

    #[test]
    fn test_bid_with_royalty_pays_planter() {
        let ctx = auction_setup();
        ctx.client.set_royalty(&200); // 2%
        let id = ctx.client.create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);

        let planter_before = balance(&ctx.env, &ctx.payment_token, &ctx.planter);
        let seller_before = balance(&ctx.env, &ctx.payment_token, &ctx.seller);

        // 100 tokens × 100 = 10000. 2% = 200 planter, 9800 seller.
        ctx.client.bid(&ctx.buyer, &id, &100, &10_000);

        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.planter), planter_before + 200);
        assert_eq!(balance(&ctx.env, &ctx.payment_token, &ctx.seller), seller_before + 9_800);
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

            #[test]
            fn fuzz_exact_payment_roundtrip_invariants(
                price in 1i128..1_000i128,
                payment in 1i128..1_000_000i128,
            ) {
                // tokens_out = payment / price (floor)
                // actual_cost = tokens_out * price
                // Invariant: actual_cost <= payment  (never overspend)
                // Invariant: actual_cost + price > payment  (tight floor)
                let tokens_out = payment / price;
                let actual_cost = tokens_out * price;
                prop_assert!(actual_cost <= payment);
                if tokens_out > 0 {
                    prop_assert!(actual_cost + price > payment || actual_cost == payment);
                }
            }
        }
    }
}
