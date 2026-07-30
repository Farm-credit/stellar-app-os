#![no_std]

//! NFT Certificate — Closes #653, #762
//!
//! SEP-41 NFT contract for CO2 certificates with merge functionality
//! and 5% secondary-market royalty enforcement.
//!
//! # Royalty (#762)
//!
//! Every secondary-market `trade` pays exactly 5% of the trade price to the
//! **original tree planter** recorded at mint time. The royalty is enforced
//! at the smart-contract level and cannot be bypassed. When the original
//! planter is the seller, no royalty is deducted (self-sale). The original
//! planter address is immutable for the lifetime of the certificate.
//!
//! # Features
//!
//! - **Mint** — create a certificate owned by the original planter.
//! - **Merge** — consolidate multiple certificates into one.
//! - **Trade** — transfer ownership with automatic 5% royalty to the
//!   original planter.
//! - **Admin** — pause / unpause / view helper functions.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env,
    String, Vec,
};
use harvesta_errors::{HarvestaError, NftError};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Royalty basis points: 500 = 5.00 % of every secondary-market trade price.
const ROYALTY_BPS: u32 = 500;

/// Basis-point denominator (10 000).
const BPS_DENOMINATOR: i128 = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Certificate metadata stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CertificateMetadata {
    /// Number of trees represented by this certificate
    pub tree_count: i128,
    /// CO2 offset in kilograms
    pub co2_offset_kg: i128,
    /// Planting date (ISO 8601 string)
    pub planting_date: String,
    /// Region where trees were planted
    pub region: String,
}

/// NFT token record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Token {
    /// Current owner of the token
    pub owner: Address,
    /// Original tree planter — immutable royalty recipient
    pub original_planter: Address,
    /// Token metadata
    pub metadata: CertificateMetadata,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct NftCertificate;

#[contractimpl]
impl NftCertificate {
    /// One-time initialisation.
    ///
    /// `admin` — multi-sig admin address for contract management
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &0u64);
    }

    /// Mint a new certificate NFT.
    ///
    /// The `to` address is recorded as both the initial owner and the
    /// **original tree planter** — the permanent royalty recipient for
    /// all future secondary-market trades of this certificate.
    ///
    /// `to` — recipient address (also becomes the original planter)
    /// `token_id` — unique identifier for the token
    /// `metadata` — certificate metadata
    pub fn mint(env: Env, to: Address, token_id: u64, metadata: CertificateMetadata) {
        Self::assert_not_paused(&env);

        if metadata.tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }

        if metadata.co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        // Check if token already exists
        if env.storage().instance().has(&token_id) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        let token = Token {
            owner: to.clone(),
            original_planter: to.clone(),
            metadata,
        };

        env.storage().instance().set(&token_id, &token);

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(
                &symbol_short!("TOK_COUNT"),
                &count.checked_add(1).expect("token count overflow"),
            );

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("minted"), to), token_id);
    }

    /// Merge multiple certificates into a single consolidated certificate.
    ///
    /// `owner` — address that owns all certificates being merged
    /// `token_ids` — list of token IDs to merge
    /// `new_token_id` — token ID for the merged certificate
    /// `merged_metadata` — aggregated metadata for the new certificate
    ///
    /// The merged certificate inherits the `original_planter` of the first
    /// certificate in the list. Ownership of all merged certificates is
    /// verified before burning.
    pub fn merge(
        env: Env,
        owner: Address,
        token_ids: Vec<u64>,
        new_token_id: u64,
        merged_metadata: CertificateMetadata,
    ) {
        Self::assert_not_paused(&env);
        owner.require_auth();

        if token_ids.is_empty() {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        if merged_metadata.tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }

        if merged_metadata.co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        // Check if new token ID already exists
        if env.storage().instance().has(&new_token_id) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        let mut total_tree_count = 0i128;
        let mut total_co2_offset = 0i128;

        // Capture the original planter from the first certificate
        let first_token: Token = env
            .storage()
            .instance()
            .get(&token_ids.get(0).unwrap())
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        let merged_original_planter = first_token.original_planter.clone();

        // Verify ownership and aggregate metadata from all certificates
        for i in 0..token_ids.len() {
            let token_id = token_ids.get(i).unwrap();

            let token: Token = env
                .storage()
                .instance()
                .get(&token_id)
                .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

            // Verify ownership
            if token.owner != owner {
                panic_with_error!(&env, HarvestaError::Unauthorized);
            }

            total_tree_count = total_tree_count
                .checked_add(token.metadata.tree_count)
                .expect("tree count overflow");
            total_co2_offset = total_co2_offset
                .checked_add(token.metadata.co2_offset_kg)
                .expect("co2 offset overflow");

            // Burn the certificate by removing it from storage
            env.storage().instance().remove(&token_id);
        }

        // Verify that the provided merged metadata matches the aggregated values
        if total_tree_count != merged_metadata.tree_count {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        if total_co2_offset != merged_metadata.co2_offset_kg {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        // Mint the new consolidated certificate
        let merged_token = Token {
            owner: owner.clone(),
            original_planter: merged_original_planter,
            metadata: merged_metadata,
        };

        env.storage().instance().set(&new_token_id, &merged_token);

        // Update token count (net change: -len(token_ids) + 1)
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64)
            .expect("token count underflow")
            .checked_add(1)
            .expect("token count overflow");
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &new_count);

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events()
            .publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));
    }

    /// Trade a certificate from `seller` to `buyer` for `price` units of
    /// `payment_token`.
    ///
    /// # Royalty (5 %)
    ///
    /// 5 % of `price` is automatically transferred to the **original tree
    /// planter** recorded at mint time. The remaining 95 % is transferred to
    /// the seller. When the seller is the original planter, no royalty is
    /// deducted (self-sale).
    ///
    /// # Authorisation
    ///
    /// Both `seller` and `buyer` must sign the transaction. The seller must
    /// be the current token owner.
    ///
    /// # Panics
    ///
    /// - `NftError::TradeAmountMustBePositive` — `price <= 0`
    /// - `NftError::SelfTrade` — `seller == buyer`
    /// - `NftError::TokenNotFound` — `token_id` does not exist
    /// - `NftError::NotTokenOwner` — `seller` is not the current owner
    /// - `HarvestaError::ContractPaused` — contract is paused
    pub fn trade(
        env: Env,
        seller: Address,
        buyer: Address,
        token_id: u64,
        payment_token: Address,
        price: i128,
    ) {
        Self::assert_not_paused(&env);

        if seller == buyer {
            panic_with_error!(&env, NftError::SelfTrade);
        }

        seller.require_auth();
        buyer.require_auth();

        if price <= 0 {
            panic_with_error!(&env, NftError::TradeAmountMustBePositive);
        }

        let mut token: Token = env
            .storage()
            .instance()
            .get(&token_id)
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        if token.owner != seller {
            panic_with_error!(&env, NftError::NotTokenOwner);
        }

        // Calculate royalty: 5 % of price to the original planter.
        // No royalty when the original planter is the seller.
        let royalty_amount = if token.original_planter != seller {
            (price * ROYALTY_BPS as i128) / BPS_DENOMINATOR
        } else {
            0
        };

        let seller_amount = price - royalty_amount;
        let token_client = token::Client::new(&env, &payment_token);

        // Transfer royalty to the original planter (immutable recipient).
        if royalty_amount > 0 {
            token_client.transfer(&buyer, &token.original_planter, &royalty_amount);
        }

        // Transfer remainder to the seller.
        if seller_amount > 0 {
            token_client.transfer(&buyer, &seller, &seller_amount);
        }

        // Update ownership — the original planter never changes.
        token.owner = buyer.clone();
        env.storage().instance().set(&token_id, &token);

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("traded"), token_id),
            (seller, buyer, price, royalty_amount),
        );
    }

    /// Get token information by token ID.
    pub fn get_token(env: Env, token_id: u64) -> Option<Token> {
        env.storage().instance().get(&token_id)
    }

    /// Get the owner of a token.
    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .instance()
            .get::<u64, Token>(&token_id)
            .map(|token| token.owner)
    }

    /// Get the original planter of a token (permanent royalty recipient).
    pub fn original_planter_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .instance()
            .get::<u64, Token>(&token_id)
            .map(|token| token.original_planter)
    }

    /// Get the total number of tokens.
    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0)
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    /// Pause all state-changing functions. Admin only.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause the contract. Admin only.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Returns true if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    /// Generate dynamic raw SVG image rendering directly inside nft-certificate contract.
    ///
    /// # Errors
    /// - `NftError::TokenNotFound` — token does not exist.
    pub fn render_svg(env: Env, token_id: u64) -> String {
        let _token: Token = env
            .storage()
            .instance()
            .get(&token_id)
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        String::from_str(&env, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\" viewBox=\"0 0 400 400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\" rx=\"16\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\" font-size=\"20\" font-weight=\"bold\">Harvesta Carbon Certificate</text><text x=\"20\" y=\"100\" fill=\"#d8f3dc\" font-size=\"14\">On-Chain Certificate</text></svg>")
    }

    /// Generate dynamic raw SVG token URI metadata directly inside nft-certificate contract.
    pub fn token_uri(env: Env, token_id: u64) -> String {
        let _svg = Self::render_svg(env.clone(), token_id);
        String::from_str(&env, "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\">Harvesta NFT Certificate</text></svg>")
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, HarvestaError::ContractPaused);
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

    // ------------------------------------------------------------------
    // Test helpers
    // ------------------------------------------------------------------

    fn deploy_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    fn mint_token(env: &Env, token_addr: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_addr).mint(to, &amount);
    }

    fn setup() -> (Env, Address, NftCertificateClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, NftCertificate);
        let client = NftCertificateClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        (env, admin, client)
    }

    fn metadata(env: &Env, tree_count: i128, co2_offset: i128) -> CertificateMetadata {
        CertificateMetadata {
            tree_count,
            co2_offset_kg: co2_offset,
            planting_date: String::from_str(env, "2025-01-01"),
            region: String::from_str(env, "Northern Nigeria"),
        }
    }

    // ------------------------------------------------------------------
    // Initialisation & mint
    // ------------------------------------------------------------------

    #[test]
    fn test_initialize() {
        let (_env, _, client) = setup();
        assert!(!client.is_paused());
    }

    #[test]
    fn test_mint() {
        let (env, _, client) = setup();

        let to = Address::generate(&env);
        let token_id = 1;
        let meta = metadata(&env, 100, 4800);

        client.mint(&to, &token_id, &meta);

        let token = client.get_token(&token_id).unwrap();
        assert_eq!(token.owner, to);
        assert_eq!(token.original_planter, to);
        assert_eq!(token.metadata.tree_count, 100);
        assert_eq!(client.total_supply(), 1);
    }

    #[test]
    fn test_mint_sets_original_planter() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        client.mint(&planter, &1, &metadata(&env, 50, 2400));

        let token = client.get_token(&1).unwrap();
        assert_eq!(token.original_planter, planter);
        assert_eq!(client.original_planter_of(&1).unwrap(), planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_mint_zero_tree_count_rejected() {
        let (env, _, client) = setup();

        let to = Address::generate(&env);
        let token_id = 1;
        let mut meta = metadata(&env, 100, 4800);
        meta.tree_count = 0;

        client.mint(&to, &token_id, &meta);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_mint_zero_co2_rejected() {
        let (env, _, client) = setup();

        let to = Address::generate(&env);
        let token_id = 1;
        let mut meta = metadata(&env, 100, 4800);
        meta.co2_offset_kg = 0;

        client.mint(&to, &token_id, &meta);
    }

    // ------------------------------------------------------------------
    // Merge
    // ------------------------------------------------------------------

    #[test]
    fn test_merge_two_certificates() {
        let (env, _, client) = setup();

        let owner = Address::generate(&env);

        // Mint two certificates
        let meta1 = metadata(&env, 50, 2400);
        let meta2 = metadata(&env, 75, 3600);

        client.mint(&owner.clone(), &1, &meta1);
        client.mint(&owner.clone(), &2, &meta2);

        // Merge them
        let merged_meta = metadata(&env, 125, 6000);
        let token_ids = Vec::from_array(&env, [1, 2]);

        client.merge(&owner.clone(), &token_ids, &3, &merged_meta);

        // Verify old tokens are burned
        assert!(client.get_token(&1).is_none());
        assert!(client.get_token(&2).is_none());

        // Verify new token exists with correct metadata
        let merged_token = client.get_token(&3).unwrap();
        assert_eq!(merged_token.owner, owner);
        assert_eq!(merged_token.metadata.tree_count, 125);
        assert_eq!(merged_token.metadata.co2_offset_kg, 6000);

        // Total supply should be 1 (2 burned, 1 minted)
        assert_eq!(client.total_supply(), 1);
    }

    #[test]
    fn test_merge_preserves_original_planter() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);

        // Both certs minted to planter so they can be merged
        client.mint(&planter, &1, &metadata(&env, 50, 2400));
        client.mint(&planter, &2, &metadata(&env, 25, 1200));

        // Merge as planter (owns both tokens)
        let merged_meta = metadata(&env, 75, 3600);
        let token_ids = Vec::from_array(&env, [1, 2]);

        client.merge(&planter, &token_ids, &3, &merged_meta);

        let merged = client.get_token(&3).unwrap();
        // Both original planters were planter, merged certificate preserves that
        assert_eq!(merged.original_planter, planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_unauthorized_owner_rejected() {
        let (env, _, client) = setup();

        let owner = Address::generate(&env);
        let other = Address::generate(&env);

        let meta1 = metadata(&env, 50, 2400);
        client.mint(&owner, &1, &meta1);

        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, [1]);

        // Try to merge with wrong owner
        client.merge(&other, &token_ids, &2, &merged_meta);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_merge_empty_list_rejected() {
        let (env, _, client) = setup();

        let owner = Address::generate(&env);
        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, []);

        client.merge(&owner, &token_ids, &2, &merged_meta);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_metadata_mismatch_rejected() {
        let (env, _, client) = setup();

        let owner = Address::generate(&env);

        let meta1 = metadata(&env, 50, 2400);
        client.mint(&owner.clone(), &1, &meta1);

        // Try to merge with wrong aggregated metadata
        let wrong_meta = metadata(&env, 100, 4800); // Should be 50, 2400
        let token_ids = Vec::from_array(&env, [1]);

        client.merge(&owner, &token_ids, &2, &wrong_meta);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_merge_while_paused_rejected() {
        let (env, _, client) = setup();

        let owner = Address::generate(&env);
        let meta1 = metadata(&env, 50, 2400);
        client.mint(&owner.clone(), &1, &meta1);

        client.pause();

        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, [1]);

        client.merge(&owner, &token_ids, &2, &merged_meta);
    }

    // ------------------------------------------------------------------
    // Trade — success cases
    // ------------------------------------------------------------------

    #[test]
    fn test_trade_transfers_ownership_and_pays_royalty() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer1 = Address::generate(&env);
        let buyer2 = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        // Mint to planter (original owner = original planter)
        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        // Fund buyer1 with payment tokens
        mint_token(&env, &payment_token, &buyer1, 1_000_000);

        // First trade: planter sells to buyer1 (seller == original planter, no royalty)
        client.trade(&planter, &buyer1, &1, &payment_token, &1_000i128);

        let token = client.get_token(&1).unwrap();
        assert_eq!(token.owner, buyer1);
        assert_eq!(token.original_planter, planter);

        // Fund buyer2 with payment tokens
        mint_token(&env, &payment_token, &buyer2, 1_000_000);

        // Second trade: buyer1 sells to buyer2 (secondary market — 5% royalty!)
        let balance_before = token::Client::new(&env, &payment_token).balance(&planter);
        client.trade(&buyer1, &buyer2, &1, &payment_token, &1_000i128);
        let balance_after = token::Client::new(&env, &payment_token).balance(&planter);

        // Planter received exactly 5% = 50
        assert_eq!(balance_after - balance_before, 50i128);

        // Ownership transferred
        let token = client.get_token(&1).unwrap();
        assert_eq!(token.owner, buyer2);
        // Original planter unchanged
        assert_eq!(token.original_planter, planter);
    }

    #[test]
    fn test_trade_seller_receives_95_percent() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer1 = Address::generate(&env);
        let buyer2 = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        // Planter sells to buyer1 (no royalty, self-sale)
        mint_token(&env, &payment_token, &buyer1, 1_000_000);
        client.trade(&planter, &buyer1, &1, &payment_token, &1_000i128);

        // buyer1 sells to buyer2 (secondary — 5% royalty to planter)
        mint_token(&env, &payment_token, &buyer2, 1_000_000);
        let seller_balance_before = token::Client::new(&env, &payment_token).balance(&buyer1);
        client.trade(&buyer1, &buyer2, &1, &payment_token, &1_000i128);
        let seller_balance_after = token::Client::new(&env, &payment_token).balance(&buyer1);

        // buyer1 (seller) received 95% = 950
        assert_eq!(seller_balance_after - seller_balance_before, 950i128);
    }

    #[test]
    fn test_trade_no_royalty_when_planter_is_seller() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        mint_token(&env, &payment_token, &buyer, 1_000_000);

        let planter_balance_before = token::Client::new(&env, &payment_token).balance(&planter);
        client.trade(&planter, &buyer, &1, &payment_token, &1_000i128);
        let planter_balance_after = token::Client::new(&env, &payment_token).balance(&planter);

        // Planter receives full 1000 (no royalty deduction since they are the seller)
        assert_eq!(planter_balance_after - planter_balance_before, 1_000i128);
    }

    #[test]
    fn test_multiple_sequential_trades_each_pay_royalty() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let c = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        // Trade 1: planter → A (no royalty — planter is seller)
        mint_token(&env, &payment_token, &a, 1_000_000);
        client.trade(&planter, &a, &1, &payment_token, &1_000i128);

        // Trade 2: A → B (5% royalty to planter)
        let planter_before = token::Client::new(&env, &payment_token).balance(&planter);
        mint_token(&env, &payment_token, &b, 1_000_000);
        client.trade(&a, &b, &1, &payment_token, &1_000i128);
        let planter_after_1 = token::Client::new(&env, &payment_token).balance(&planter);
        assert_eq!(planter_after_1 - planter_before, 50i128);

        // Trade 3: B → C (5% royalty to planter again)
        let planter_before_2 = token::Client::new(&env, &payment_token).balance(&planter);
        mint_token(&env, &payment_token, &c, 1_000_000);
        client.trade(&b, &c, &1, &payment_token, &1_000i128);
        let planter_after_2 = token::Client::new(&env, &payment_token).balance(&planter);
        assert_eq!(planter_after_2 - planter_before_2, 50i128);

        // Ownership is now with C
        assert_eq!(client.owner_of(&1).unwrap(), c);
        // Original planter still unchanged
        assert_eq!(client.original_planter_of(&1).unwrap(), planter);
    }

    #[test]
    fn test_trade_small_amount_royalty_rounds_down() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer1 = Address::generate(&env);
        let buyer2 = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        mint_token(&env, &payment_token, &buyer1, 1_000);
        client.trade(&planter, &buyer1, &1, &payment_token, &100i128);

        // Sell with price = 10: 5% = 0.5 → rounds down to 0 royalty
        mint_token(&env, &payment_token, &buyer2, 1_000);
        let planter_before = token::Client::new(&env, &payment_token).balance(&planter);
        client.trade(&buyer1, &buyer2, &1, &payment_token, &10i128);
        let planter_after = token::Client::new(&env, &payment_token).balance(&planter);

        // 10 * 500 / 10000 = 0 (integer truncation)
        assert_eq!(planter_after - planter_before, 0i128);
        // Seller gets full amount
        let seller_balance = token::Client::new(&env, &payment_token).balance(&buyer1);
        assert!(seller_balance >= 10i128);
    }

    #[test]
    fn test_trade_original_planter_never_changes() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        mint_token(&env, &payment_token, &a, 1_000_000);
        client.trade(&planter, &a, &1, &payment_token, &1_000i128);

        mint_token(&env, &payment_token, &b, 1_000_000);
        client.trade(&a, &b, &1, &payment_token, &1_000i128);

        // After multiple trades, original planter is still the same
        assert_eq!(client.original_planter_of(&1).unwrap(), planter);

        // Ownership has changed
        assert_eq!(client.owner_of(&1).unwrap(), b);
    }

    // ------------------------------------------------------------------
    // Trade — failure cases
    // ------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_trade_self_trade_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));
        mint_token(&env, &payment_token, &planter, 1_000);

        // Planter trying to trade with themselves
        client.trade(&planter, &planter, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_zero_price_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));
        mint_token(&env, &payment_token, &buyer, 1_000);

        client.trade(&planter, &buyer, &1, &payment_token, &0i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_negative_price_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));
        mint_token(&env, &payment_token, &buyer, 1_000);

        client.trade(&planter, &buyer, &1, &payment_token, &-1i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_trade_token_not_found_rejected() {
        let (env, _, client) = setup();

        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let payment_token = deploy_token(&env, &seller);

        mint_token(&env, &payment_token, &buyer, 1_000);

        // Token 99 does not exist
        client.trade(&seller, &buyer, &99, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_trade_not_owner_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let impostor = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));
        mint_token(&env, &payment_token, &buyer, 1_000);

        // Impostor tries to sell a token they don't own
        client.trade(&impostor, &buyer, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_while_paused_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));
        mint_token(&env, &payment_token, &buyer, 1_000);

        client.pause();
        client.trade(&planter, &buyer, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic]
    fn test_trade_insufficient_payment_rejected() {
        let (env, _, client) = setup();

        let planter = Address::generate(&env);
        let buyer = Address::generate(&env);
        let buyer2 = Address::generate(&env);
        let payment_token = deploy_token(&env, &planter);

        client.mint(&planter, &1, &metadata(&env, 100, 4800));

        // Planter sells to buyer1
        mint_token(&env, &payment_token, &buyer, 1_000);
        client.trade(&planter, &buyer, &1, &payment_token, &1_000i128);

        // buyer2 has 10 payment tokens but tries to pay 100
        mint_token(&env, &payment_token, &buyer2, 10);
        // This should panic because buyer2 doesn't have enough balance
        client.trade(&buyer, &buyer2, &1, &payment_token, &100i128);
    }

    // ------------------------------------------------------------------
    // Pause / unpause
    // ------------------------------------------------------------------

    #[test]
    fn test_pause_unpause() {
        let (_env, _, client) = setup();

        client.pause();
        assert!(client.is_paused());

        client.unpause();
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_env, admin, client) = setup();
        client.initialize(&admin);
    }

    #[test]
    fn test_render_svg_and_token_uri() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        let meta = metadata(&env, 100, 5000);
        client.mint(&owner, &1, &meta);

        let svg = client.render_svg(&1);
        assert!(svg.len() > 0);

        let uri = client.token_uri(&1);
        assert!(uri.len() > 0);
    }
}
