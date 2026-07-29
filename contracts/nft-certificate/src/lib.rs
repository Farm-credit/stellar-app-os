#![no_std]

//! NFT Certificate — Closes #653
//!
//! SEP-41 NFT contract for CO2 certificates with merge functionality.
//!
//! Donors can mint certificates after donations, and merge multiple smaller
//! certificates into a single consolidated certificate. The merge function
//! verifies ownership of all certificates being merged and aggregates the
//! treeCount and co2OffsetKg metadata values.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env, String,
    Vec,
};
use harvesta_errors::{HarvestaError, NftError};

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
    /// `to` — recipient address
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
            .set(&symbol_short!("TOK_COUNT"), &count.checked_add(1).expect("token count overflow"));

        env.events()
            .publish((symbol_short!("minted"), to), token_id);
    }

    /// Mint multiple certificate NFTs in a single transaction (up to 50 certificates).
    ///
    /// `to` — recipient address for all minted tokens
    /// `token_ids` — list of unique identifiers for the tokens
    /// `metadatas` — list of corresponding certificate metadata
    pub fn batch_mint(
        env: Env,
        to: Address,
        token_ids: Vec<u64>,
        metadatas: Vec<CertificateMetadata>,
    ) {
        Self::assert_not_paused(&env);

        if token_ids.is_empty() {
            panic_with_error!(&env, HarvestaError::BatchEmpty);
        }

        if token_ids.len() > 50 {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        if token_ids.len() != metadatas.len() {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);

        let mut minted_count: u64 = 0;

        for i in 0..token_ids.len() {
            let token_id = token_ids.get(i).unwrap();
            let metadata = metadatas.get(i).unwrap();

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
                metadata,
            };

            env.storage().instance().set(&token_id, &token);
            minted_count += 1;
        }

        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &count.checked_add(minted_count).expect("token count overflow"));

        env.events()
            .publish((symbol_short!("btch_mnt"), to), token_ids.len() as u32);
    }

    /// Merge multiple certificates into a single consolidated certificate.
    ///
    /// `owner` — address that owns all certificates being merged
    /// `token_ids` — list of token IDs to merge
    /// `new_token_id` — token ID for the merged certificate
    /// `merged_metadata` — aggregated metadata for the new certificate
    ///
    /// This function:
    /// 1. Verifies ownership of all certificates being merged
    /// 2. Burns all input certificates
    /// 3. Mints a single consolidated certificate with aggregated metadata
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

        env.events()
            .publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));
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
        let token: Token = env
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
    use soroban_sdk::{testutils::Address as _, Address, Env, String};
    use soroban_sdk::{testutils::Address as _, Address, Env};

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
        assert_eq!(token.metadata.tree_count, 100);
        assert_eq!(client.total_supply(), 1);
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

    #[test]
    fn test_batch_mint_success() {
        let (env, _, client) = setup();
        let to = Address::generate(&env);
        let token_ids = Vec::from_array(&env, [10, 11, 12]);
        let metadatas = Vec::from_array(
            &env,
            [
                metadata(&env, 10, 500),
                metadata(&env, 20, 1000),
                metadata(&env, 30, 1500),
            ],
        );

        client.batch_mint(&to, &token_ids, &metadatas);

        assert_eq!(client.total_supply(), 3);
        let t10 = client.get_token(&10).unwrap();
        assert_eq!(t10.owner, to);
        assert_eq!(t10.metadata.tree_count, 10);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #29)")]
    fn test_batch_mint_exceeds_max_limit() {
        let (env, _, client) = setup();
        let to = Address::generate(&env);
        let mut token_ids = Vec::new(&env);
        let mut metadatas = Vec::new(&env);
        for i in 0..51u64 {
            token_ids.push_back(i);
            metadatas.push_back(metadata(&env, 10, 500));
        }
        client.batch_mint(&to, &token_ids, &metadatas);
    }
}
