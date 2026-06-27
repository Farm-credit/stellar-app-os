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
    contract, contractimpl, contracttype, symbol_short, token, Address, Env,
};
use harvesta_errors::HarvestaError;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingStatus {
    Active,
    Filled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller: Address,
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

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token)
    Config,
    /// Global listing counter
    ListingCount,
    /// Per-listing record
    Listing(u64),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    /// One-time initialisation.
    ///
    /// * `admin`      — platform admin (may delist fraudulent listings)
    /// * `tree_token` — the TREE SAC token that represents carbon offset certificates
    pub fn initialize(env: Env, admin: Address, tree_token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token));
        env.storage()
            .instance()
            .set(&DataKey::ListingCount, &0u64);
    }

    /// Seller lists `amount` TREE tokens for sale at `price_per_token` in
    /// `payment_token` units.  TREE tokens are transferred into the contract.
    ///
    /// Returns the new listing ID.
    pub fn list(
        env: Env,
        seller: Address,
        amount: i128,
        price_per_token: i128,
        payment_token: Address,
    ) -> u64 {
        seller.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::ListingAmountMustBePositive);
        }
        if price_per_token <= 0 {
            panic_with_error!(&env, HarvestaError::PriceMustBePositive);
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
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::BuyAmountMustBePositive);
        }

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, HarvestaError::ListingNotActive);
        }

        if buyer == listing.seller {
            panic_with_error!(&env, HarvestaError::SelfTrade);
        }

        if amount > listing.remaining {
            panic_with_error!(&env, HarvestaError::InsufficientLiquidity);
        }

        let payment = amount
            .checked_mul(listing.price_per_token)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::AmountMustBePositive));

        // Transfer payment from buyer to seller
        token::Client::new(&env, &listing.payment_token).transfer(
            &buyer,
            &listing.seller,
            &payment,
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
            .publish((symbol_short!("sold"), listing_id), (buyer, amount, payment));
    }

    /// Seller cancels their listing, reclaiming any remaining escrowed TREE tokens.
    pub fn cancel(env: Env, seller: Address, listing_id: u64) {
        seller.require_auth();

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, HarvestaError::ListingNotActive);
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
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let mut listing: Listing = env
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::ListingNotFound));

        if listing.status != ListingStatus::Active {
            panic_with_error!(&env, HarvestaError::ListingNotActive);
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

    // ── internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    struct Ctx {
        env: Env,
        admin: Address,
        seller: Address,
        buyer: Address,
        tree_token: Address,
        payment_token: Address,
        client: CarbonMarketplaceClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, CarbonMarketplace);
        let client = CarbonMarketplaceClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

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

        client.initialize(&admin, &tree_token);

        Ctx { env, admin, seller, buyer, tree_token, payment_token, client }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.tree_token);
    }

    // ── list ───────────────────────────────────────────────────────────────────

    #[test]
    fn test_list_escrows_tokens_and_returns_id() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);

        assert_eq!(id, 1);
        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 1_000);
        assert_eq!(ctx.client.listing_count(), 1);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.total_amount, 1_000);
        assert_eq!(listing.remaining, 1_000);
        assert_eq!(listing.price_per_token, 10);
        assert_eq!(listing.status, ListingStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_list_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.list(&ctx.seller, &0, &10, &ctx.payment_token);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_list_zero_price_rejected() {
        let ctx = setup();
        ctx.client.list(&ctx.seller, &1_000, &0, &ctx.payment_token);
    }

    // ── buy ────────────────────────────────────────────────────────────────────

    #[test]
    fn test_buy_transfers_payment_to_seller_and_tokens_to_buyer() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);

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
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.remaining, 0);
        assert_eq!(listing.status, ListingStatus::Filled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_buy_more_than_available_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &501);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #107)")]
    fn test_buy_zero_amount_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_buy_from_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &1_000);
        ctx.client.buy(&ctx.buyer, &id, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_buy_nonexistent_listing_rejected() {
        let ctx = setup();
        ctx.client.buy(&ctx.buyer, &99, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #107)")]
    fn test_self_trade_via_zero_buy_amount() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.seller, &id, &0);
    }

    // ── cancel ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_returns_remaining_tokens() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.tree_token, &ctx.seller);
        let id = ctx.client.list(&ctx.seller, &1_000, &10, &ctx.payment_token);

        ctx.client.buy(&ctx.buyer, &id, &300);
        ctx.client.cancel(&ctx.seller, &id);

        assert_eq!(balance(&ctx.env, &ctx.tree_token, &ctx.seller), pre - 300);

        let listing = ctx.client.get_listing(&id).unwrap();
        assert_eq!(listing.status, ListingStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_cancel_already_filled_listing_rejected() {
        let ctx = setup();
        let id = ctx.client.list(&ctx.seller, &500, &10, &ctx.payment_token);
        ctx.client.buy(&ctx.buyer, &id, &500);
        ctx.client.cancel(&ctx.seller, &id);
    }

    // ── listing_count ──────────────────────────────────────────────────────────

    #[test]
    fn test_listing_count_increments() {
        let ctx = setup();
        assert_eq!(ctx.client.listing_count(), 0);
        ctx.client.list(&ctx.seller, &100, &1, &ctx.payment_token);
        ctx.client.list(&ctx.seller, &200, &2, &ctx.payment_token);
        assert_eq!(ctx.client.listing_count(), 2);
    }
}
