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
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env,
};
use harvesta_errors::HarvestaError;
use admin_controls::AdminControlsClient;

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
        if price_per_token <= 0 {
            panic_with_error!(&env, MarketplaceError::PriceMustBePositive);
        }

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
            price_per_token,
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
            .publish((symbol_short!("listed"), seller), (new_id, amount, price_per_token));

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
        let seller_amount = payment - royalty_amount;

        if royalty_amount > 0 {
            token::Client::new(&env, &listing.payment_token).transfer(
                &buyer,
                &listing.planter,
                &royalty_amount,
            );
        }

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

        env.events()
            .publish((symbol_short!("sold"), listing_id), (buyer, amount, payment, royalty_amount));
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
    /// Returns the new auction ID.
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
    /// The current price is calculated based on elapsed time and decay rate.
    /// Payment is transferred atomically from buyer to seller, and TREE tokens
    /// are transferred to the buyer.
    ///
    /// If the entire auction is filled, it's marked as completed.
    pub fn bid(env: Env, buyer: Address, auction_id: u64, amount: i128) {
        Self::assert_not_paused(&env);
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, MarketplaceError::BuyAmountMustBePositive);
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
        let seller_amount = payment - royalty_amount;

        if royalty_amount > 0 {
            token::Client::new(&env, &auction.payment_token).transfer(
                &buyer,
                &auction.planter,
                &royalty_amount,
            );
        }

        token::Client::new(&env, &auction.payment_token).transfer(
            &buyer,
            &auction.seller,
            &seller_amount,
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

        env.events()
            .publish((symbol_short!("bid"), auction_id), (buyer, amount, current_price, payment, royalty_amount));
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
}
