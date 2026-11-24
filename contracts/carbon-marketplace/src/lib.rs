#![no_std]

//! Carbon Credit Marketplace — Closes #490, #760, #780, #810, #1811
//!
//! On-chain orderbook for TREE carbon credit certificates plus a
//! constant-product AMM (xy = k) liquidity pool for Carbon DEX swaps.
//!
//! # Flow
//!   1. Admin calls `initialize(admin, tree_token, payment_token)`.
//!   2. Seller calls `list(seller, planter, amount, price_per_token, payment_token)`
//!      to create an ask. The `amount` of TREE tokens are escrowed.
//!   3. Buyer calls `buy(buyer, listing_id, amount)`. Payment is split between
//!      the planter royalty, the protocol fee and the seller; TREE tokens go
//!      to the buyer.
//!   4. Seller calls `cancel(seller, listing_id)` to de-list remaining tokens.
//!
//! # Automated Protocol Fee Siphon (issue #1811)
//!
//! Every secondary credit trade — `buy`, `bid`, and each fill produced by
//! `place_buy_order` / `place_sell_order` — deducts an automatic **1 %**
//! protocol fee (`PROTOCOL_FEE_BPS = 100`) from the post-royalty payment.
//!
//!   fee = (payment - royalty) * 100 / 10_000
//!
//! The fee is collected by this contract and immediately routed to the
//! Community Maintenance Treasury contract (`contracts/treasury`):
//!   1. the payment token is transferred from the payer to the treasury address;
//!   2. `Treasury::record_protocol_fee(payment_token, amount)` is invoked so the
//!      treasury keeps a per-asset ledger of siphoned protocol fees.
//!
//! If no treasury has been configured yet, the fee is accrued inside this
//! contract (`get_accrued_fees(token)`) and can be flushed at any time with
//! `siphon_protocol_fees(token)` once `set_treasury` has been called.
//!
//! # Partial order matching (issue #760)
//!   1. `place_buy_order(buyer, payment_token, amount, max_price_per_token)`
//!      escrows `amount * max_price_per_token` of payment tokens, then places an
//!      open buy order and immediately matches it against existing sell orders
//!      in price-ascending order. Unspent escrow (including price improvement)
//!      is refunded to the buyer when the order fills or is cancelled.
//!   2. `place_sell_order(seller, planter, payment_token, amount, min_price_per_token)`
//!      escrows TREE tokens and immediately matches against existing buy orders
//!      in price-descending order.
//!   3. `cancel_order(caller, order_id)` cancels an open (partially filled) order
//!      and refunds escrowed TREE tokens (sell) or payment tokens (buy).
//!
//! # Constant-Product AMM — Carbon DEX (issue #780)
//!   1. `amm_add_liquidity(provider, tree_amount, payment_amount)`
//!   2. `amm_remove_liquidity(provider, lp_shares)`
//!   3. `amm_swap_exact_in(caller, token_in, amount_in, min_amount_out)`
//!   4. `amm_get_quote(token_in, amount_in)`
//!
//! AMM swap fees stay inside the pool (they accrue to LPs), so the treasury
//! siphon only applies to orderbook and auction trades.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, token, Address, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Instance TTL bump threshold.
const INSTANCE_BUMP_THRESHOLD: u32 = 100_000;
/// Instance TTL bump amount.
const INSTANCE_BUMP_AMOUNT: u32 = 250_000;

/// Automated protocol fee applied to every secondary credit trade: 1.00 %.
pub const PROTOCOL_FEE_BPS: u32 = 100;
/// Basis-point denominator.
const BPS_DENOMINATOR: i128 = 10_000;

/// AMM swap fee numerator (30 bps = 0.30 %) for the base volume tier.
const AMM_FEE_NUMERATOR: i128 = 30;
/// AMM swap fee denominator.
const AMM_FEE_DENOMINATOR: i128 = 10_000;
/// LP share precision factor (1e12).
const LP_PRECISION: i128 = 1_000_000_000_000;

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketplaceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
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
    InvalidRoyalty = 114,
    OrderNotFound = 115,
    OrderNotOpen = 116,
    OrderAmountExceeded = 117,
    TwapPeriodMustBePositive = 118,
    MaxObservationsMustBePositive = 119,
    AmmNotInitialized = 200,
    AmmAmountMustBePositive = 201,
    AmmInsufficientLiquidity = 202,
    AmmSlippageExceeded = 203,
    AmmInvalidTokenIn = 204,
    AmmZeroShares = 205,
    AmmInsufficientShares = 206,
}

// ── Treasury ledger client ────────────────────────────────────────────────────

/// Minimal view of the Community Maintenance Treasury (`contracts/treasury`).
///
/// Only the fee-accounting entry point is required by the marketplace. The
/// token transfer itself is performed here, so the treasury never needs to
/// pull funds from the marketplace.
#[contractclient(name = "TreasuryLedgerClient")]
pub trait TreasuryLedger {
    fn record_protocol_fee(env: Env, payment_token: Address, amount: i128);
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

/// Status of a partial-match order.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderStatus {
    Open,
    Filled,
    Cancelled,
}

/// Side of an order in the partial-matching orderbook.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller: Address,
    /// Original planter who planted the trees for these carbon credits.
    pub planter: Address,
    /// TREE token address.
    pub tree_token: Address,
    /// Payment token (USDC / XLM).
    pub payment_token: Address,
    /// Payment token units per TREE token.
    pub price_per_token: i128,
    pub amount: i128,
    pub filled: i128,
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

/// An open order in the partial-match orderbook.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: u64,
    pub side: OrderSide,
    pub owner: Address,
    /// Original planter (receives the royalty on a sell order).
    pub planter: Address,
    pub tree_token: Address,
    pub payment_token: Address,
    pub total_amount: i128,
    pub remaining: i128,
    /// Buy: max price per token willing to pay. Sell: min acceptable price.
    pub price_limit: i128,
    /// Payment-token escrow held for a buy order (`remaining * price_limit`).
    pub escrowed: i128,
    pub status: OrderStatus,
    pub created_at: u64,
}

// ── AMM / TWAP types ──────────────────────────────────────────────────────────

/// AMM pool state. Invariant: `reserve_tree * reserve_payment = k`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AmmPool {
    pub reserve_tree: i128,
    pub reserve_payment: i128,
    pub total_lp_shares: i128,
    /// Cumulative trading fees retained for LPs, in payment-token units.
    pub fees_collected: i128,
}

/// Time-Weighted Average Price observation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CumulativeObservation {
    /// Σ(price_i × Δt_i) — cumulative price accumulator.
    pub price_cumulative: i128,
    /// Ledger timestamp of the last observation update.
    pub timestamp: u64,
    /// The price observed at this update.
    pub price: i128,
}

/// Configuration for the TWAP oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TwapConfig {
    /// Time window (in seconds) for the TWAP computation.
    pub period_seconds: u64,
    /// Maximum number of historical observations to retain.
    pub max_observations: u32,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token, default payment_token)
    Config,
    NextListingId,
    Listing(u64),
    AuctionConfig,
    NextAuctionId,
    Auction(u64),
    /// Royalty basis points (e.g. 500 = 5 %).
    RoyaltyConfig,
    /// Global emergency pause flag.
    Paused,
    /// Community Maintenance Treasury contract address.
    Treasury,
    /// Fees accrued per payment token, awaiting a treasury.
    AccruedFees(Address),
    /// Lifetime total of fees routed to the treasury.
    TotalFeesSiphoned,
    /// Global order counter (buy + sell).
    NextOrderId,
    Order(u64),
    BuyOrderIndex,
    SellOrderIndex,
    AmmPool,
    LpShares(Address),
    TwapConfig,
    CurrentObservation,
    HistoricalObservation(u64),
    NextObservationSlot,
    TotalObservations,
}

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
    /// * `payment_token` — default payment token (USDC / XLM) for the AMM pool.
    pub fn initialize(env: Env, admin: Address, tree_token: Address, payment_token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, MarketplaceError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token, payment_token));
        env.storage().instance().set(&DataKey::NextListingId, &0u64);
        env.storage().instance().set(&DataKey::NextAuctionId, &0u64);
        env.storage().instance().set(&DataKey::NextOrderId, &0u64);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .set(&DataKey::TotalFeesSiphoned, &0i128);
    }

    /// Pause contract operations. Admin only.
    pub fn pause(env: Env) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause contract operations. Admin only.
    pub fn unpause(env: Env) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Returns true when the marketplace is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Royalty basis points applied to secondary trades (max 10 000).
    pub fn set_royalty(env: Env, basis_points: u32) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        if basis_points > 10_000 {
            panic_with_error!(&env, MarketplaceError::InvalidRoyalty);
        }
        env.storage()
            .instance()
            .set(&DataKey::RoyaltyConfig, &basis_points);
    }

    /// Returns the configured royalty in basis points.
    pub fn get_royalty(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0)
    }

    // ── Community Maintenance Treasury ────────────────────────────────────────

    /// Admin points the marketplace at the Community Maintenance Treasury.
    ///
    /// Once set, every trade's 1 % protocol fee is routed to this contract and
    /// recorded in its fee ledger. Re-configurable so the treasury can be
    /// migrated (e.g. through governance).
    pub fn set_treasury(env: Env, treasury: Address) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.events()
            .publish((symbol_short!("trsry_set"),), treasury);
    }

    /// Returns the configured treasury address, if any.
    pub fn get_treasury(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Treasury)
    }

    /// The automated protocol fee, in basis points (always 100 = 1 %).
    pub fn protocol_fee_bps(env: Env) -> u32 {
        let _ = &env;
        PROTOCOL_FEE_BPS
    }

    /// Quotes the 1 % protocol fee on a gross trade payment.
    pub fn quote_protocol_fee(env: Env, gross_amount: i128) -> i128 {
        let _ = &env;
        Self::compute_protocol_fee(gross_amount)
    }

    /// Protocol fees collected in `payment_token` but not yet routed.
    pub fn get_accrued_fees(env: Env, payment_token: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::AccruedFees(payment_token))
            .unwrap_or(0)
    }

    /// Lifetime total of protocol fees routed to the treasury.
    pub fn get_total_fees_siphoned(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalFeesSiphoned)
            .unwrap_or(0)
    }

    /// Flush accrued fees in `payment_token` to the treasury.
    ///
    /// Permissionless: anyone may push already-collected fees into the
    /// Community Maintenance Treasury. Returns the amount routed (0 when
    /// there is nothing to route or no treasury configured).
    pub fn siphon_protocol_fees(env: Env, payment_token: Address) -> i128 {
        Self::siphon_token_fees(&env, &payment_token)
    }

    // ── Orderbook: fixed-price listings ──────────────────────────────────────

    /// List TREE tokens for sale at a fixed price. Escrows `amount` tokens.
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
        if price_per_token <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

        let (_, tree_token, _) = Self::config(&env);

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
        env.storage()
            .instance()
            .set(&DataKey::Listing(id), &listing);
        env.storage()
            .instance()
            .set(&DataKey::NextListingId, &(id + 1));
        Self::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("listed"),),
            (id, seller, amount, price_per_token),
        );

        id
    }

    /// Buy TREE tokens from an active listing.
    ///
    /// Payment is split as: planter royalty → 1 % protocol fee (siphoned to the
    /// treasury) → remainder to the seller.
    pub fn buy(env: Env, buyer: Address, listing_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
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

        let payment = amount
            .checked_mul(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive));

        let (_royalty, protocol_fee, _seller_amount) = Self::distribute_payment(
            &env,
            &buyer,
            &listing.planter,
            &listing.seller,
            &listing.payment_token,
            payment,
        );

        token::Client::new(&env, &listing.tree_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        listing.filled += amount;
        if listing.filled >= listing.amount {
            listing.status = ListingStatus::Filled;
        }
        env.storage()
            .instance()
            .set(&DataKey::Listing(listing_id), &listing);
        Self::bump_instance_ttl(&env);

        Self::record_observation(&env, listing.price_per_token);

        env.events().publish(
            (symbol_short!("sold"), listing_id),
            (buyer, amount, payment, protocol_fee),
        );
    }

    /// Cancel an active listing and reclaim remaining escrowed TREE tokens.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.seller != seller {
            panic_with_error!(&env, MarketplaceError::Unauthorized);
        }
        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        Self::refund_tree(
            &env,
            &listing.tree_token,
            &seller,
            listing.amount - listing.filled,
        );

        listing.status = ListingStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Listing(listing_id), &listing);

        env.events()
            .publish((symbol_short!("cancl"),), (listing_id,));
    }

    /// Admin de-lists any active listing.
    pub fn admin_cancel(env: Env, listing_id: u64) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, MarketplaceError::ListingNotActive);
        }

        let remaining = listing.amount - listing.filled;
        Self::refund_tree(&env, &listing.tree_token, &listing.seller, remaining);

        listing.status = ListingStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Listing(listing_id), &listing);

        env.events()
            .publish((symbol_short!("adm_cncl"),), (listing_id,));
    }

    /// Return a listing by id.
    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        env.storage().instance().get(&DataKey::Listing(listing_id))
    }

    // ── Dutch auction ─────────────────────────────────────────────────────────

    /// Admin configures default Dutch Auction parameters.
    pub fn configure_auction(
        env: Env,
        starting_price: i128,
        reserve_price: i128,
        decay_rate: u64,
        duration: u64,
    ) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();
        if starting_price <= 0 || reserve_price <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }
        if reserve_price >= starting_price {
            panic_with_error!(&env, MarketplaceError::InvalidPriceRange);
        }
        if decay_rate == 0 || decay_rate > 10_000 {
            panic_with_error!(&env, MarketplaceError::InvalidDecayRate);
        }
        if duration == 0 {
            panic_with_error!(&env, MarketplaceError::InvalidDuration);
        }
        env.storage().instance().set(
            &DataKey::AuctionConfig,
            &(starting_price, reserve_price, decay_rate, duration),
        );
    }

    /// Seller creates a Dutch auction. TREE tokens are escrowed.
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
        let (_, tree_token, _) = Self::config(&env);

        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextAuctionId)
            .unwrap_or(0u64);

        let auction = DutchAuction {
            id,
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
            .instance()
            .set(&DataKey::Auction(id), &auction);
        env.storage()
            .instance()
            .set(&DataKey::NextAuctionId, &(id + 1));

        env.events().publish(
            (symbol_short!("auct_crtd"),),
            (id, seller, amount, starting_price),
        );

        id
    }

    /// Buyer takes `amount` TREE tokens from an active Dutch auction.
    pub fn bid(env: Env, buyer: Address, auction_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
        }

        let mut auction: DutchAuction = env
            .storage()
            .instance()
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

        let now = env.ledger().timestamp();
        if now.saturating_sub(auction.start_time) > auction.duration {
            panic_with_error!(&env, MarketplaceError::AuctionExpired);
        }

        let current_price = Self::calculate_current_price(&auction, now);
        if current_price < auction.reserve_price {
            panic_with_error!(&env, MarketplaceError::BidBelowReservePrice);
        }

        let payment = amount
            .checked_mul(current_price)
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive));

        let (_royalty, protocol_fee, _seller_amount) = Self::distribute_payment(
            &env,
            &buyer,
            &auction.planter,
            &auction.seller,
            &auction.payment_token,
            payment,
        );

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
            .instance()
            .set(&DataKey::Auction(auction_id), &auction);

        Self::record_observation(&env, current_price);

        env.events().publish(
            (symbol_short!("bid"), auction_id),
            (buyer, amount, current_price, payment, protocol_fee),
        );
    }

    /// Seller cancels an active auction, reclaiming remaining TREE tokens.
    pub fn cancel_auction(env: Env, seller: Address, auction_id: u64) {
        Self::assert_not_paused(&env);
        seller.require_auth();

        let mut auction: DutchAuction = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));

        if auction.seller != seller {
            panic_with_error!(&env, MarketplaceError::Unauthorized);
        }
        if auction.status != AuctionStatus::Active {
            panic_with_error!(&env, MarketplaceError::AuctionNotActive);
        }

        Self::refund_tree(&env, &auction.tree_token, &seller, auction.remaining);

        auction.status = AuctionStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Auction(auction_id), &auction);

        env.events()
            .publish((symbol_short!("auct_cncl"),), auction_id);
    }

    /// Return an auction by id.
    pub fn get_auction(env: Env, auction_id: u64) -> Option<DutchAuction> {
        env.storage().instance().get(&DataKey::Auction(auction_id))
    }

    /// Current decaying price of an auction.
    pub fn get_current_price(env: Env, auction_id: u64) -> i128 {
        let auction: DutchAuction = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::AuctionNotFound));
        Self::calculate_current_price(&auction, env.ledger().timestamp())
    }

    // ── Partial order matching (issue #760) ──────────────────────────────────

    /// Place a buy order and immediately match it against existing sell orders.
    ///
    /// Sell orders are matched in ascending price order. Unmatched quantity
    /// stays open for future sell orders.
    pub fn place_buy_order(
        env: Env,
        buyer: Address,
        payment_token: Address,
        amount: i128,
        max_price_per_token: i128,
    ) -> u64 {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }
        if max_price_per_token <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

        let (_, tree_token, _) = Self::config(&env);

        // Escrow payment up-front so a resting buy order can be matched by a
        // seller-initiated `place_sell_order` without the buyer's signature.
        let escrow_total = amount
            .checked_mul(max_price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive));
        token::Client::new(&env, &payment_token).transfer(
            &buyer,
            &env.current_contract_address(),
            &escrow_total,
        );

        let order_id = Self::next_order_id(&env);

        let mut order = Order {
            id: order_id,
            side: OrderSide::Buy,
            owner: buyer.clone(),
            planter: buyer.clone(),
            tree_token: tree_token.clone(),
            payment_token: payment_token.clone(),
            total_amount: amount,
            remaining: amount,
            price_limit: max_price_per_token,
            escrowed: escrow_total,
            status: OrderStatus::Open,
            created_at: env.ledger().timestamp(),
        };

        let mut eligible = Self::open_sell_orders(&env, &payment_token, max_price_per_token);
        Self::sort_by_price(&env, &mut eligible, true);

        let mut matched_total: i128 = 0;

        for i in 0..eligible.len() {
            if order.remaining == 0 {
                break;
            }
            let sid = eligible.get(i).unwrap();
            let mut sell_order: Order = match env.storage().instance().get(&DataKey::Order(sid)) {
                Some(o) => o,
                None => continue,
            };
            if sell_order.status != OrderStatus::Open || sell_order.remaining == 0 {
                continue;
            }
            if sell_order.owner == buyer {
                panic_with_error!(&env, MarketplaceError::SelfTrade);
            }

            let fill_qty = if order.remaining < sell_order.remaining {
                order.remaining
            } else {
                sell_order.remaining
            };
            let exec_price = sell_order.price_limit;
            let payment = fill_qty.checked_mul(exec_price).unwrap_or_else(|| {
                panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive)
            });

            // Refund the price improvement (max price - execution price).
            let improvement = fill_qty * (max_price_per_token - exec_price);
            if improvement > 0 {
                token::Client::new(&env, &payment_token).transfer(
                    &env.current_contract_address(),
                    &buyer,
                    &improvement,
                );
            }
            order.escrowed -= fill_qty * max_price_per_token;

            let (_royalty, protocol_fee, _seller_amount) = Self::distribute_from_escrow(
                &env,
                &sell_order.planter,
                &sell_order.owner,
                &payment_token,
                payment,
            );

            token::Client::new(&env, &tree_token).transfer(
                &env.current_contract_address(),
                &buyer,
                &fill_qty,
            );

            matched_total += fill_qty;
            order.remaining -= fill_qty;
            sell_order.remaining -= fill_qty;
            if sell_order.remaining == 0 {
                sell_order.status = OrderStatus::Filled;
            }
            env.storage()
                .instance()
                .set(&DataKey::Order(sid), &sell_order);

            env.events().publish(
                (symbol_short!("matched"), order_id),
                (sid, fill_qty, exec_price, payment, protocol_fee),
            );
        }

        if order.remaining == 0 {
            order.status = OrderStatus::Filled;
            if order.escrowed > 0 {
                token::Client::new(&env, &payment_token).transfer(
                    &env.current_contract_address(),
                    &buyer,
                    &order.escrowed,
                );
                order.escrowed = 0;
            }
        } else {
            let mut buy_ids: Vec<u64> = env
                .storage()
                .instance()
                .get(&DataKey::BuyOrderIndex)
                .unwrap_or_else(|| Vec::new(&env));
            buy_ids.push_back(order_id);
            env.storage()
                .instance()
                .set(&DataKey::BuyOrderIndex, &buy_ids);
        }

        env.storage()
            .instance()
            .set(&DataKey::Order(order_id), &order);
        Self::compact_sell_index(&env);

        env.events().publish(
            (symbol_short!("buy_ordr"),),
            (order_id, buyer, amount, max_price_per_token, matched_total),
        );

        order_id
    }

    /// Place a sell order and immediately match it against existing buy orders.
    ///
    /// TREE tokens are escrowed. Buy orders are matched in descending price
    /// order; unmatched quantity stays open.
    pub fn place_sell_order(
        env: Env,
        seller: Address,
        planter: Address,
        payment_token: Address,
        amount: i128,
        min_price_per_token: i128,
    ) -> u64 {
        Self::assert_not_paused(&env);
        seller.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::ListingAmountMustBePositive);
        }
        if min_price_per_token <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

        let (_, tree_token, _) = Self::config(&env);

        token::Client::new(&env, &tree_token).transfer(
            &seller,
            &env.current_contract_address(),
            &amount,
        );

        let order_id = Self::next_order_id(&env);

        let mut order = Order {
            id: order_id,
            side: OrderSide::Sell,
            owner: seller.clone(),
            planter: planter.clone(),
            tree_token: tree_token.clone(),
            payment_token: payment_token.clone(),
            total_amount: amount,
            remaining: amount,
            price_limit: min_price_per_token,
            escrowed: 0,
            status: OrderStatus::Open,
            created_at: env.ledger().timestamp(),
        };

        let mut eligible = Self::open_buy_orders(&env, &payment_token, min_price_per_token);
        Self::sort_by_price(&env, &mut eligible, false);

        let mut matched_total: i128 = 0;

        for i in 0..eligible.len() {
            if order.remaining == 0 {
                break;
            }
            let bid = eligible.get(i).unwrap();
            let mut buy_order: Order = match env.storage().instance().get(&DataKey::Order(bid)) {
                Some(o) => o,
                None => continue,
            };
            if buy_order.status != OrderStatus::Open || buy_order.remaining == 0 {
                continue;
            }
            if buy_order.owner == seller {
                panic_with_error!(&env, MarketplaceError::SelfTrade);
            }

            let fill_qty = if order.remaining < buy_order.remaining {
                order.remaining
            } else {
                buy_order.remaining
            };
            let exec_price = buy_order.price_limit;
            let payment = fill_qty.checked_mul(exec_price).unwrap_or_else(|| {
                panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive)
            });

            let (_royalty, protocol_fee, _seller_amount) =
                Self::distribute_from_escrow(&env, &planter, &seller, &payment_token, payment);

            token::Client::new(&env, &tree_token).transfer(
                &env.current_contract_address(),
                &buy_order.owner,
                &fill_qty,
            );

            matched_total += fill_qty;
            order.remaining -= fill_qty;
            buy_order.remaining -= fill_qty;
            buy_order.escrowed -= fill_qty * buy_order.price_limit;
            if buy_order.remaining == 0 {
                buy_order.status = OrderStatus::Filled;
                if buy_order.escrowed > 0 {
                    token::Client::new(&env, &payment_token).transfer(
                        &env.current_contract_address(),
                        &buy_order.owner,
                        &buy_order.escrowed,
                    );
                    buy_order.escrowed = 0;
                }
            }
            env.storage()
                .instance()
                .set(&DataKey::Order(bid), &buy_order);

            env.events().publish(
                (symbol_short!("matched"), order_id),
                (bid, fill_qty, exec_price, payment, protocol_fee),
            );
        }

        if order.remaining == 0 {
            order.status = OrderStatus::Filled;
        } else {
            let mut sell_ids: Vec<u64> = env
                .storage()
                .instance()
                .get(&DataKey::SellOrderIndex)
                .unwrap_or_else(|| Vec::new(&env));
            sell_ids.push_back(order_id);
            env.storage()
                .instance()
                .set(&DataKey::SellOrderIndex, &sell_ids);
        }

        env.storage()
            .instance()
            .set(&DataKey::Order(order_id), &order);
        Self::compact_buy_index(&env);

        env.events().publish(
            (symbol_short!("sel_ordr"),),
            (order_id, seller, amount, min_price_per_token, matched_total),
        );

        order_id
    }

    /// Cancel an open order. Sell orders reclaim their escrowed TREE tokens.
    pub fn cancel_order(env: Env, caller: Address, order_id: u64) {
        Self::assert_not_paused(&env);
        caller.require_auth();

        let mut order: Order = env
            .storage()
            .instance()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, MarketplaceError::OrderNotFound));

        if order.status != OrderStatus::Open {
            panic_with_error!(&env, MarketplaceError::OrderNotOpen);
        }
        if order.owner != caller {
            panic_with_error!(&env, MarketplaceError::Unauthorized);
        }

        if order.side == OrderSide::Sell && order.remaining > 0 {
            token::Client::new(&env, &order.tree_token).transfer(
                &env.current_contract_address(),
                &caller,
                &order.remaining,
            );
        }
        if order.side == OrderSide::Buy && order.escrowed > 0 {
            token::Client::new(&env, &order.payment_token).transfer(
                &env.current_contract_address(),
                &caller,
                &order.escrowed,
            );
            order.escrowed = 0;
        }

        order.status = OrderStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Order(order_id), &order);

        match order.side {
            OrderSide::Buy => Self::compact_buy_index(&env),
            OrderSide::Sell => Self::compact_sell_index(&env),
        }

        env.events()
            .publish((symbol_short!("ord_cncl"),), (order_id, caller));
    }

    /// Returns the order record, or `None` if it does not exist.
    pub fn get_order(env: Env, order_id: u64) -> Option<Order> {
        env.storage().instance().get(&DataKey::Order(order_id))
    }

    /// Returns the total number of orders created (buy + sell, all statuses).
    pub fn order_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextOrderId)
            .unwrap_or(0)
    }

    // ── TWAP oracle ───────────────────────────────────────────────────────────

    /// Admin configures the TWAP oracle parameters.
    pub fn configure_twap(env: Env, period_seconds: u64, max_observations: u32) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();

        if period_seconds == 0 {
            panic_with_error!(&env, MarketplaceError::TwapPeriodMustBePositive);
        }
        if max_observations < 2 {
            panic_with_error!(&env, MarketplaceError::MaxObservationsMustBePositive);
        }

        env.storage().instance().set(
            &DataKey::TwapConfig,
            &TwapConfig {
                period_seconds,
                max_observations,
            },
        );

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

        env.events().publish(
            (symbol_short!("twap_cfg"),),
            (period_seconds, max_observations),
        );
    }

    /// Returns the current cumulative observation, if any.
    pub fn get_cumulative_observation(env: Env) -> Option<CumulativeObservation> {
        env.storage().instance().get(&DataKey::CurrentObservation)
    }

    /// Returns the Time-Weighted Average Price over the recorded observations.
    pub fn get_twap(env: Env, observation_count: u32) -> Option<i128> {
        let cfg: TwapConfig = env.storage().instance().get(&DataKey::TwapConfig)?;
        let current: CumulativeObservation =
            env.storage().instance().get(&DataKey::CurrentObservation)?;
        let total: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalObservations)
            .unwrap_or(0);
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
        // `count` observations back from the most recent one.
        let steps_back = count.min(total.saturating_sub(1));
        let target_slot = next_slot.saturating_sub(1).saturating_sub(steps_back);
        let ring_index = target_slot % cfg.max_observations as u64;

        let old: CumulativeObservation = env
            .storage()
            .persistent()
            .get(&DataKey::HistoricalObservation(ring_index))?;

        let time_diff = current.timestamp.saturating_sub(old.timestamp);
        if time_diff == 0 {
            return Some(current.price);
        }

        Some((current.price_cumulative - old.price_cumulative) / time_diff as i128)
    }

    /// Returns the TWAP configuration, or `None` if not configured.
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

    // ── Constant-product AMM (issue #780) ────────────────────────────────────

    /// Add liquidity to the constant-product pool, minting LP shares.
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

        let (_, tree_token, payment_token) = Self::config(&env);

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
            Self::isqrt(tree_amount * payment_amount) * LP_PRECISION
        } else {
            let shares_by_tree = tree_amount * pool.total_lp_shares / pool.reserve_tree;
            let shares_by_payment = payment_amount * pool.total_lp_shares / pool.reserve_payment;
            if shares_by_tree < shares_by_payment {
                shares_by_tree
            } else {
                shares_by_payment
            }
        };
        if new_shares <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmZeroShares);
        }

        pool.reserve_tree += tree_amount;
        pool.reserve_payment += payment_amount;
        pool.total_lp_shares += new_shares;
        Self::save_pool(&env, &pool);

        let lp_key = DataKey::LpShares(provider.clone());
        let existing: i128 = env.storage().persistent().get(&lp_key).unwrap_or(0i128);
        env.storage()
            .persistent()
            .set(&lp_key, &(existing + new_shares));

        env.events().publish(
            (symbol_short!("amm_add"),),
            (provider, tree_amount, payment_amount, new_shares),
        );

        new_shares
    }

    /// Remove liquidity by burning LP shares.
    pub fn amm_remove_liquidity(env: Env, provider: Address, lp_shares: i128) -> (i128, i128) {
        Self::assert_not_paused(&env);
        provider.require_auth();
        if lp_shares <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmAmountMustBePositive);
        }

        let lp_key = DataKey::LpShares(provider.clone());
        let existing: i128 = env.storage().persistent().get(&lp_key).unwrap_or(0i128);
        if existing < lp_shares {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientShares);
        }

        let mut pool = Self::pool(&env);
        if pool.total_lp_shares == 0 {
            panic_with_error!(&env, MarketplaceError::AmmNotInitialized);
        }

        let tree_out = lp_shares * pool.reserve_tree / pool.total_lp_shares;
        let payment_out = lp_shares * pool.reserve_payment / pool.total_lp_shares;
        if tree_out <= 0 || payment_out <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }

        pool.reserve_tree -= tree_out;
        pool.reserve_payment -= payment_out;
        pool.total_lp_shares -= lp_shares;
        Self::save_pool(&env, &pool);

        let remaining = existing - lp_shares;
        if remaining == 0 {
            env.storage().persistent().remove(&lp_key);
        } else {
            env.storage().persistent().set(&lp_key, &remaining);
        }

        let (_, tree_token, payment_token) = Self::config(&env);
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

    /// Swap an exact input for at least `min_amount_out` of the other token.
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

        let (_, tree_token, payment_token) = Self::config(&env);
        let tree_to_payment = token_in == tree_token;
        let payment_to_tree = token_in == payment_token;
        if !tree_to_payment && !payment_to_tree {
            panic_with_error!(&env, MarketplaceError::AmmInvalidTokenIn);
        }

        let mut pool = Self::pool(&env);
        if pool.total_lp_shares == 0 || pool.reserve_tree == 0 || pool.reserve_payment == 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }

        let fee_bps = Self::get_fee_bps(env.clone(), amount_in);
        let (reserve_in, reserve_out) = if tree_to_payment {
            (pool.reserve_tree, pool.reserve_payment)
        } else {
            (pool.reserve_payment, pool.reserve_tree)
        };

        let amount_in_with_fee = amount_in * (AMM_FEE_DENOMINATOR - fee_bps);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * AMM_FEE_DENOMINATOR + amount_in_with_fee;
        let amount_out = numerator / denominator;

        if amount_out <= 0 {
            panic_with_error!(&env, MarketplaceError::AmmInsufficientLiquidity);
        }
        if amount_out < min_amount_out {
            panic_with_error!(&env, MarketplaceError::AmmSlippageExceeded);
        }

        let (token_out, fee_in_payment_units) = if tree_to_payment {
            pool.reserve_tree += amount_in;
            pool.reserve_payment -= amount_out;
            let fee = amount_in * fee_bps / AMM_FEE_DENOMINATOR;
            let fee_payment = fee * pool.reserve_payment / pool.reserve_tree;
            (payment_token.clone(), fee_payment)
        } else {
            pool.reserve_payment += amount_in;
            pool.reserve_tree -= amount_out;
            let fee = amount_in * fee_bps / AMM_FEE_DENOMINATOR;
            (tree_token.clone(), fee)
        };
        pool.fees_collected += fee_in_payment_units;
        Self::save_pool(&env, &pool);

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

    /// View-only price quote for the AMM.
    pub fn amm_get_quote(env: Env, token_in: Address, amount_in: i128) -> i128 {
        if amount_in <= 0 {
            return 0;
        }
        let (_, tree_token, payment_token) = Self::config(&env);
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
        let amount_in_with_fee = amount_in * (AMM_FEE_DENOMINATOR - fee_bps);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * AMM_FEE_DENOMINATOR + amount_in_with_fee;
        numerator / denominator
    }

    /// Return the current AMM pool state.
    pub fn amm_pool_info(env: Env) -> AmmPool {
        Self::pool(&env)
    }

    /// Return the LP share balance of a provider.
    pub fn amm_lp_balance(env: Env, provider: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LpShares(provider))
            .unwrap_or(0i128)
    }

    /// Dynamic AMM fee tier in basis points, based on trade size.
    pub fn get_fee_bps(env: Env, amount_in: i128) -> i128 {
        let _ = &env;
        if amount_in >= 100_000 {
            10
        } else if amount_in >= 10_000 {
            20
        } else {
            AMM_FEE_NUMERATOR
        }
    }

    /// Extend the contract instance storage TTL.
    pub fn extend_instance_ttl(env: Env, threshold: u32, extend_to: u32) {
        env.storage().instance().extend_ttl(threshold, extend_to);
    }

    // ── Internal: protocol fee ────────────────────────────────────────────────

    /// 1 % of the supplied amount (floor), or 0 for dust amounts.
    fn compute_protocol_fee(gross_amount: i128) -> i128 {
        if gross_amount <= 0 {
            return 0;
        }
        gross_amount * PROTOCOL_FEE_BPS as i128 / BPS_DENOMINATOR
    }

    /// Split `gross` into `(royalty, protocol_fee, seller_amount)`.
    /// The 1 % fee is taken from the post-royalty amount.
    fn split_payment(
        env: &Env,
        gross: i128,
        planter: &Address,
        seller: &Address,
    ) -> (i128, i128, i128) {
        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoyaltyConfig)
            .unwrap_or(0);

        let royalty = if royalty_bps > 0 && planter != seller {
            gross * royalty_bps as i128 / BPS_DENOMINATOR
        } else {
            0
        };
        let post_royalty = gross - royalty;
        let fee = Self::compute_protocol_fee(post_royalty);
        (royalty, fee, post_royalty - fee)
    }

    fn accrue_fee(env: &Env, payer: &Address, payment_token: &Address, fee: i128) {
        if fee <= 0 {
            return;
        }
        let accrued: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccruedFees(payment_token.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::AccruedFees(payment_token.clone()),
            &(accrued + fee),
        );

        env.events().publish(
            (symbol_short!("fee_accr"),),
            (payer.clone(), payment_token.clone(), fee),
        );
    }

    /// Settle a trade paid directly by `payer` (buyer is the invoker).
    ///
    /// Returns `(royalty, protocol_fee, seller_amount)`.
    fn distribute_payment(
        env: &Env,
        payer: &Address,
        planter: &Address,
        seller: &Address,
        payment_token: &Address,
        gross: i128,
    ) -> (i128, i128, i128) {
        let (royalty, fee, seller_amount) = Self::split_payment(env, gross, planter, seller);

        let token_client = token::Client::new(env, payment_token);
        if royalty > 0 {
            token_client.transfer(payer, planter, &royalty);
        }
        if fee > 0 {
            token_client.transfer(payer, &env.current_contract_address(), &fee);
            Self::accrue_fee(env, payer, payment_token, fee);
        }
        if seller_amount > 0 {
            token_client.transfer(payer, seller, &seller_amount);
        }

        // Route the fee to the Community Maintenance Treasury if configured.
        Self::siphon_token_fees(env, payment_token);

        (royalty, fee, seller_amount)
    }

    /// Settle a trade from funds already escrowed in this contract (resting
    /// buy orders). The protocol fee simply stays in the contract balance.
    fn distribute_from_escrow(
        env: &Env,
        planter: &Address,
        seller: &Address,
        payment_token: &Address,
        gross: i128,
    ) -> (i128, i128, i128) {
        let (royalty, fee, seller_amount) = Self::split_payment(env, gross, planter, seller);

        let token_client = token::Client::new(env, payment_token);
        if royalty > 0 {
            token_client.transfer(&env.current_contract_address(), planter, &royalty);
        }
        if seller_amount > 0 {
            token_client.transfer(&env.current_contract_address(), seller, &seller_amount);
        }
        Self::accrue_fee(env, &env.current_contract_address(), payment_token, fee);

        Self::siphon_token_fees(env, payment_token);

        (royalty, fee, seller_amount)
    }

    /// Route everything accrued in `payment_token` to the treasury.
    ///
    /// No-op when nothing is accrued or no treasury is configured.
    fn siphon_token_fees(env: &Env, payment_token: &Address) -> i128 {
        let accrued: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccruedFees(payment_token.clone()))
            .unwrap_or(0);
        if accrued <= 0 {
            return 0;
        }
        let treasury: Address = match env.storage().instance().get(&DataKey::Treasury) {
            Some(t) => t,
            None => return 0,
        };

        token::Client::new(env, payment_token).transfer(
            &env.current_contract_address(),
            &treasury,
            &accrued,
        );
        env.storage()
            .instance()
            .set(&DataKey::AccruedFees(payment_token.clone()), &0i128);

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFeesSiphoned)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalFeesSiphoned, &(total + accrued));

        // Inform the treasury's own fee ledger.
        TreasuryLedgerClient::new(env, &treasury).record_protocol_fee(payment_token, &accrued);

        env.events().publish(
            (symbol_short!("fee_sip"),),
            (payment_token.clone(), accrued, treasury),
        );

        accrued
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, MarketplaceError::NotInitialized))
    }

    fn auction_config(env: &Env) -> (i128, i128, u64, u64) {
        env.storage()
            .instance()
            .get(&DataKey::AuctionConfig)
            .unwrap_or_else(|| panic_with_error!(env, MarketplaceError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, MarketplaceError::ContractPaused);
        }
    }

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    fn refund_tree(env: &Env, tree_token: &Address, to: &Address, amount: i128) {
        if amount > 0 {
            token::Client::new(env, tree_token).transfer(
                &env.current_contract_address(),
                to,
                &amount,
            );
        }
    }

    fn calculate_current_price(auction: &DutchAuction, now: u64) -> i128 {
        let elapsed = now.saturating_sub(auction.start_time);
        if elapsed >= auction.duration {
            return auction.reserve_price;
        }
        let frac = elapsed as i128 * BPS_DENOMINATOR / auction.duration as i128;
        let decay = (auction.starting_price - auction.reserve_price) * frac / BPS_DENOMINATOR;
        auction.starting_price - decay
    }

    fn next_order_id(env: &Env) -> u64 {
        let current: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextOrderId)
            .unwrap_or(0);
        let next = current + 1;
        env.storage().instance().set(&DataKey::NextOrderId, &next);
        next
    }

    fn open_sell_orders(env: &Env, payment_token: &Address, max_price: i128) -> Vec<u64> {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::SellOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut eligible = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env
                .storage()
                .instance()
                .get::<DataKey, Order>(&DataKey::Order(id))
            {
                if o.status == OrderStatus::Open
                    && o.payment_token == *payment_token
                    && o.price_limit <= max_price
                    && o.remaining > 0
                {
                    eligible.push_back(id);
                }
            }
        }
        eligible
    }

    fn open_buy_orders(env: &Env, payment_token: &Address, min_price: i128) -> Vec<u64> {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::BuyOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut eligible = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env
                .storage()
                .instance()
                .get::<DataKey, Order>(&DataKey::Order(id))
            {
                if o.status == OrderStatus::Open
                    && o.payment_token == *payment_token
                    && o.price_limit >= min_price
                    && o.remaining > 0
                {
                    eligible.push_back(id);
                }
            }
        }
        eligible
    }

    /// Insertion-sort order IDs by price limit (ascending when `ascending`).
    fn sort_by_price(env: &Env, ids: &mut Vec<u64>, ascending: bool) {
        let n = ids.len();
        if n < 2 {
            return;
        }
        for i in 1..n {
            let mut j = i;
            while j > 0 {
                let a = ids.get(j - 1).unwrap();
                let b = ids.get(j).unwrap();
                let pa = Self::order_price(env, a);
                let pb = Self::order_price(env, b);
                let swap = if ascending { pa > pb } else { pa < pb };
                if swap {
                    ids.set(j - 1, b);
                    ids.set(j, a);
                    j -= 1;
                } else {
                    break;
                }
            }
        }
    }

    fn order_price(env: &Env, id: u64) -> i128 {
        env.storage()
            .instance()
            .get::<DataKey, Order>(&DataKey::Order(id))
            .map(|o| o.price_limit)
            .unwrap_or(i128::MAX)
    }

    fn compact_buy_index(env: &Env) {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::BuyOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut live: Vec<u64> = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env
                .storage()
                .instance()
                .get::<DataKey, Order>(&DataKey::Order(id))
            {
                if o.status == OrderStatus::Open {
                    live.push_back(id);
                }
            }
        }
        env.storage().instance().set(&DataKey::BuyOrderIndex, &live);
    }

    fn compact_sell_index(env: &Env) {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::SellOrderIndex)
            .unwrap_or_else(|| Vec::new(env));
        let mut live: Vec<u64> = Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(o) = env
                .storage()
                .instance()
                .get::<DataKey, Order>(&DataKey::Order(id))
            {
                if o.status == OrderStatus::Open {
                    live.push_back(id);
                }
            }
        }
        env.storage()
            .instance()
            .set(&DataKey::SellOrderIndex, &live);
    }

    fn record_observation(env: &Env, price: i128) {
        if price <= 0 {
            return;
        }
        let twap_config: TwapConfig = match env.storage().instance().get(&DataKey::TwapConfig) {
            Some(cfg) => cfg,
            None => return,
        };

        let now = env.ledger().timestamp();
        let mut current: CumulativeObservation = env
            .storage()
            .instance()
            .get(&DataKey::CurrentObservation)
            .unwrap_or(CumulativeObservation {
                price_cumulative: 0,
                timestamp: now,
                price,
            });

        let elapsed = now.saturating_sub(current.timestamp);
        if elapsed > 0 && current.price > 0 {
            current.price_cumulative = current
                .price_cumulative
                .checked_add(
                    current
                        .price
                        .checked_mul(elapsed as i128)
                        .unwrap_or(i128::MAX),
                )
                .unwrap_or(i128::MAX);
        }
        current.price = price;
        current.timestamp = now;
        env.storage()
            .instance()
            .set(&DataKey::CurrentObservation, &current);

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
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env, Vec,
    };

    struct Ctx {
        env: Env,
        client: CarbonMarketplaceClient<'static>,
        treasury: Address,
        admin: Address,
        seller: Address,
        buyer: Address,
        planter: Address,
        tree_token: Address,
        payment_token: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let planter = Address::generate(&env);

        let tree_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let payment_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &tree_token).mint(&seller, &1_000_000);
        token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &10_000_000);

        let contract = env.register(CarbonMarketplace, ());
        let client = CarbonMarketplaceClient::new(&env, &contract);
        client.initialize(&admin, &tree_token, &payment_token);

        // Community Maintenance Treasury with 7 signers
        let treasury = env.register(treasury::Treasury, ());
        let mut signers = Vec::new(&env);
        for _ in 0..7 {
            signers.push_back(Address::generate(&env));
        }
        treasury::TreasuryClient::new(&env, &treasury).initialize(&signers, &payment_token);

        Ctx {
            env,
            client,
            treasury,
            admin,
            seller,
            buyer,
            planter,
            tree_token,
            payment_token,
        }
    }

    fn bal(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Protocol fee siphon (issue #1811) ─────────────────────────────────────

    #[test]
    fn test_protocol_fee_is_one_percent() {
        let ctx = setup();
        assert_eq!(ctx.client.protocol_fee_bps(), 100);
        assert_eq!(ctx.client.quote_protocol_fee(&20_000), 200);
        assert_eq!(ctx.client.quote_protocol_fee(&1), 0); // dust rounds down
    }

    #[test]
    fn test_buy_siphons_one_percent_to_treasury() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);

        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);

        let treasury_before = bal(&ctx.env, &ctx.payment_token, &ctx.treasury);
        let seller_before = bal(&ctx.env, &ctx.payment_token, &ctx.seller);

        ctx.client.buy(&ctx.buyer, &id, &200);

        // payment = 200 * 100 = 20_000; fee = 1 % = 200; seller = 19_800
        let expected_fee = 200i128;
        assert_eq!(
            bal(&ctx.env, &ctx.payment_token, &ctx.treasury),
            treasury_before + expected_fee
        );
        assert_eq!(
            bal(&ctx.env, &ctx.payment_token, &ctx.seller),
            seller_before + 19_800
        );
        assert_eq!(
            treasury::TreasuryClient::new(&ctx.env, &ctx.treasury)
                .protocol_fees(&ctx.payment_token),
            expected_fee
        );
        assert_eq!(ctx.client.get_total_fees_siphoned(), expected_fee);
        assert_eq!(ctx.client.get_accrued_fees(&ctx.payment_token), 0);
    }

    #[test]
    fn test_fee_applies_after_royalty() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);
        ctx.client.set_royalty(&1_000); // 10 %

        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        // payment 20_000, royalty 2_000, post 18_000, fee 180
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.planter), 2_000);
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.treasury), 180);
        assert_eq!(
            bal(&ctx.env, &ctx.payment_token, &ctx.seller),
            20_000 - 2_000 - 180
        );
    }

    #[test]
    fn test_bid_siphons_fee_to_treasury() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);
        ctx.client.configure_auction(&100, &50, &10, &3_600);

        let id = ctx
            .client
            .create_auction(&ctx.seller, &ctx.planter, &1_000, &ctx.payment_token);
        ctx.client.bid(&ctx.buyer, &id, &200);

        // price starts at 100 -> payment 20_000 -> fee 200
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.treasury), 200);
        assert_eq!(ctx.client.get_total_fees_siphoned(), 200);
    }

    #[test]
    fn test_order_matching_siphons_fee() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);

        let sell_id =
            ctx.client
                .place_sell_order(&ctx.seller, &ctx.planter, &ctx.payment_token, &500, &10);
        let buy_id = ctx
            .client
            .place_buy_order(&ctx.buyer, &ctx.payment_token, &500, &10);

        // payment 5_000 -> fee 50
        assert_eq!(
            ctx.client.get_order(&buy_id).unwrap().status,
            OrderStatus::Filled
        );
        assert_eq!(
            ctx.client.get_order(&sell_id).unwrap().status,
            OrderStatus::Filled
        );
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.treasury), 50);
        assert_eq!(ctx.client.get_total_fees_siphoned(), 50);
    }

    #[test]
    fn test_fee_accrues_without_treasury_then_siphons() {
        let ctx = setup();
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        // No treasury configured: fee held by the marketplace.
        assert_eq!(ctx.client.get_accrued_fees(&ctx.payment_token), 200);
        assert_eq!(ctx.client.get_total_fees_siphoned(), 0);

        ctx.client.set_treasury(&ctx.treasury);
        let routed = ctx.client.siphon_protocol_fees(&ctx.payment_token);

        assert_eq!(routed, 200);
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.treasury), 200);
        assert_eq!(ctx.client.get_accrued_fees(&ctx.payment_token), 0);
    }

    #[test]
    fn test_siphon_with_nothing_accrued_is_noop() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);
        assert_eq!(ctx.client.siphon_protocol_fees(&ctx.payment_token), 0);
        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.treasury), 0);
    }

    #[test]
    fn test_multiple_trades_accumulate_lifetime_siphoned() {
        let ctx = setup();
        ctx.client.set_treasury(&ctx.treasury);
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &100, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &100);
        ctx.client.buy(&ctx.buyer, &id, &100);
        assert_eq!(ctx.client.get_total_fees_siphoned(), 200);
    }

    // ── Listing lifecycle ────────────────────────────────────────────────────

    #[test]
    fn test_list_and_buy() {
        let ctx = setup();
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.filled, 200);
        assert_eq!(listing.status, ListingStatus::Active);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.buyer), 200);
    }

    #[test]
    fn test_full_fill_marks_listing_filled() {
        let ctx = setup();
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);
        assert_eq!(
            ctx.client.get_listing(&id).unwrap().status,
            ListingStatus::Filled
        );
    }

    #[test]
    fn test_cancel_listing_refunds_tree() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.cancel(&ctx.seller, &id);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), before);
        assert_eq!(
            ctx.client.get_listing(&id).unwrap().status,
            ListingStatus::Cancelled
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_buy_above_remaining_rejected() {
        let ctx = setup();
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &501);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_pause_blocks_listing() {
        let ctx = setup();
        ctx.client.pause();
        assert!(ctx.client.is_paused());
        ctx.client
            .list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
    }

    // ── Order matching ───────────────────────────────────────────────────────

    #[test]
    fn test_sell_order_matches_buy_order() {
        let ctx = setup();
        let buy_id = ctx
            .client
            .place_buy_order(&ctx.buyer, &ctx.payment_token, &400, &12);
        let sell_id =
            ctx.client
                .place_sell_order(&ctx.seller, &ctx.planter, &ctx.payment_token, &400, &12);

        assert_eq!(
            ctx.client.get_order(&buy_id).unwrap().status,
            OrderStatus::Filled
        );
        assert_eq!(
            ctx.client.get_order(&sell_id).unwrap().status,
            OrderStatus::Filled
        );
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.buyer), 400);
    }

    #[test]
    fn test_unmatched_buy_order_stays_open() {
        let ctx = setup();
        let buy_id = ctx
            .client
            .place_buy_order(&ctx.buyer, &ctx.payment_token, &500, &10);
        let order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(order.status, OrderStatus::Open);
        assert_eq!(order.remaining, 500);
        assert_eq!(order.escrowed, 5_000);
    }

    #[test]
    fn test_cancel_buy_order_refunds_escrow() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.payment_token, &ctx.buyer);
        let buy_id = ctx
            .client
            .place_buy_order(&ctx.buyer, &ctx.payment_token, &300, &10);
        assert_eq!(
            bal(&ctx.env, &ctx.payment_token, &ctx.buyer),
            before - 3_000
        );

        ctx.client.cancel_order(&ctx.buyer, &buy_id);

        assert_eq!(bal(&ctx.env, &ctx.payment_token, &ctx.buyer), before);
        let order = ctx.client.get_order(&buy_id).unwrap();
        assert_eq!(order.status, OrderStatus::Cancelled);
        assert_eq!(order.escrowed, 0);
    }

    #[test]
    fn test_cancel_sell_order_refunds_escrow() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.tree_token, &ctx.seller);
        let sell_id =
            ctx.client
                .place_sell_order(&ctx.seller, &ctx.planter, &ctx.payment_token, &300, &10);
        ctx.client.cancel_order(&ctx.seller, &sell_id);
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.seller), before);
    }

    // ── AMM / TWAP ───────────────────────────────────────────────────────────

    #[test]
    fn test_amm_add_and_remove_liquidity() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.tree_token).mint(&lp, &4_000);
        token::StellarAssetClient::new(&ctx.env, &ctx.payment_token).mint(&lp, &4_000);

        let shares = ctx.client.amm_add_liquidity(&lp, &4_000, &4_000);
        assert_eq!(shares, 4_000 * LP_PRECISION);

        let (tree_out, payment_out) = ctx.client.amm_remove_liquidity(&lp, &(shares / 2));
        assert_eq!(tree_out, 2_000);
        assert_eq!(payment_out, 2_000);
    }

    #[test]
    fn test_amm_swap_returns_quote() {
        let ctx = setup();
        let lp = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.tree_token).mint(&lp, &10_000_000);
        token::StellarAssetClient::new(&ctx.env, &ctx.payment_token).mint(&lp, &10_000_000);
        ctx.client.amm_add_liquidity(&lp, &10_000_000, &10_000_000);

        let trader = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.tree_token).mint(&trader, &100_000);

        let quote = ctx.client.amm_get_quote(&ctx.tree_token, &100_000);
        let out = ctx
            .client
            .amm_swap_exact_in(&trader, &ctx.tree_token, &100_000, &1);
        assert_eq!(quote, out);
        assert!(out > 0);
    }

    #[test]
    fn test_buy_records_twap_observation() {
        let ctx = setup();
        ctx.client.configure_twap(&3_600, &10);
        let id = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &200);

        let obs = ctx.client.get_cumulative_observation().unwrap();
        assert_eq!(obs.price, 10);
        assert_eq!(ctx.client.get_total_observations(), 1);

        ctx.env
            .ledger()
            .set_timestamp(ctx.env.ledger().timestamp() + 60);
        let id2 = ctx
            .client
            .list(&ctx.seller, &ctx.planter, &1_000, &20, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id2, &200);

        let twap = ctx.client.get_twap(&1).unwrap();
        assert_eq!(twap, 10);
    }
}
