#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env, String,
};
use harvesta_errors::HarvestaError;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    Admin,
    Owner(String),
    Metadata(String),
}

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
    /// One-time initialization. Sets the contract admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Mints a new Certificate_NFT assigned to the recipient with the provided token_id.
    /// If token_id already exists, panics with TOKEN_ALREADY_MINTED.
    pub fn mint(env: Env, recipient: Address, token_id: String, metadata_uri: String) {
        // Enforce uniqueness across all minted Certificate_NFTs
        let owner_key = DataKey::Owner(token_id.clone());
        if env.storage().persistent().has(&owner_key) {
            panic_with_error!(&env, HarvestaError::TokenAlreadyMinted);
        }

        // Store recipient as the owner and metadata_uri as the metadata for the token_id
        env.storage().persistent().set(&owner_key, &recipient);
        
        let metadata_key = DataKey::Metadata(token_id.clone());
        env.storage().persistent().set(&metadata_key, &metadata_uri);

        // Emit events for transparency / indexers
        env.events().publish(
            (symbol_short!("mint"), recipient.clone()),
            (token_id.clone(), metadata_uri),
        );
    }

    /// Returns the owner of the given token_id.
    pub fn owner_of(env: Env, token_id: String) -> Option<Address> {
        let key = DataKey::Owner(token_id);
        env.storage().persistent().get(&key)
    }

    /// Returns the metadata URI of the given token_id.
    pub fn metadata(env: Env, token_id: String) -> Option<String> {
        let key = DataKey::Metadata(token_id);
        env.storage().persistent().get(&key)
    }

    /// Transfers the ownership of the given token_id to a new recipient.
    /// Only the current owner can initiate this.
    pub fn transfer(env: Env, from: Address, to: Address, token_id: String) {
        from.require_auth();

        let owner_key = DataKey::Owner(token_id.clone());
        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or_else(|| panic!("Token does not exist"));

        if current_owner != from {
            panic!("Sender is not the owner of this token");
        }

        env.storage().persistent().set(&owner_key, &to);

        // Emit transfer event
        env.events().publish(
            (symbol_short!("transfer"), from, to),
            token_id,
        );
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

    /// Split a single certificate into two new certificates with custom tree counts and CO2 offsets.
    ///
    /// `owner` — address that owns the certificate being split
    /// `original_token_id` — token ID to split
    /// `new_token_id_1` — token ID for the first split certificate
    /// `new_token_id_2` — token ID for the second split certificate
    /// `metadata_1` — metadata for the first split certificate
    /// `metadata_2` — metadata for the second split certificate
    pub fn split(
        env: Env,
        owner: Address,
        original_token_id: u64,
        new_token_id_1: u64,
        new_token_id_2: u64,
        metadata_1: CertificateMetadata,
        metadata_2: CertificateMetadata,
    ) {
        Self::assert_not_paused(&env);
        owner.require_auth();

        if new_token_id_1 == new_token_id_2 {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        if metadata_1.tree_count <= 0 || metadata_2.tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }

        if metadata_1.co2_offset_kg <= 0 || metadata_2.co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        let orig_token: Token = env
            .storage()
            .instance()
            .get(&original_token_id)
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        if orig_token.owner != owner {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }

        if env.storage().instance().has(&new_token_id_1)
            || env.storage().instance().has(&new_token_id_2)
        {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        let split_tree_sum = metadata_1
            .tree_count
            .checked_add(metadata_2.tree_count)
            .expect("tree count overflow");
        let split_co2_sum = metadata_1
            .co2_offset_kg
            .checked_add(metadata_2.co2_offset_kg)
            .expect("co2 offset overflow");

        if split_tree_sum != orig_token.metadata.tree_count
            || split_co2_sum != orig_token.metadata.co2_offset_kg
        {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        // Burn original token
        env.storage().instance().remove(&original_token_id);

        // Mint split tokens
        let token_1 = Token {
            owner: owner.clone(),
            metadata: metadata_1,
        };
        let token_2 = Token {
            owner: owner.clone(),
            metadata: metadata_2,
        };

        env.storage().instance().set(&new_token_id_1, &token_1);
        env.storage().instance().set(&new_token_id_2, &token_2);

        // Update token count (net change: -1 + 2 = +1)
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        let new_count = count.checked_add(1).expect("token count overflow");
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &new_count);

        env.events().publish(
            (symbol_short!("split"), owner),
            (original_token_id, new_token_id_1, new_token_id_2),
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

    #[test]
    fn test_initialize() {
        let (_env, admin, client) = setup();
        // Try double initialization
        let res = client.try_initialize(&admin);
        assert!(res.is_err());
    }

    #[test]
    fn test_mint_and_query() {
        let (env, _, client) = setup();
        let recipient = Address::generate(&env);
        let token_id = String::from_str(&env, "abcdef123456");
        let metadata_uri = String::from_str(&env, "ipfs://some-hash");

        client.mint(&recipient, &token_id, &metadata_uri);

        assert_eq!(client.owner_of(&token_id), Some(recipient.clone()));
        assert_eq!(client.metadata(&token_id), Some(metadata_uri));
    }

    #[test]
    fn test_cannot_mint_duplicate() {
        let (env, _, client) = setup();
        let recipient = Address::generate(&env);
        let token_id = String::from_str(&env, "abcdef123456");
        let metadata_uri = String::from_str(&env, "ipfs://some-hash");

        client.mint(&recipient, &token_id, &metadata_uri);

        let res = client.try_mint(&recipient, &token_id, &metadata_uri);
        assert!(res.is_err());
    }

    #[test]
    fn test_transfer() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token_id = String::from_str(&env, "abcdef123456");
        let metadata_uri = String::from_str(&env, "ipfs://some-hash");

        client.mint(&owner, &token_id, &metadata_uri);
        client.transfer(&owner, &recipient, &token_id);

        assert_eq!(client.owner_of(&token_id), Some(recipient));
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
    fn test_split_success() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);

        let meta_orig = metadata(&env, 100, 5000);
        client.mint(&owner, &100, &meta_orig);

        let meta_split1 = metadata(&env, 50, 2500);
        let meta_split2 = metadata(&env, 50, 2500);

        client.split(&owner, &100, &101, &102, &meta_split1, &meta_split2);

        assert!(client.get_token(&100).is_none());
        let tok1 = client.get_token(&101).unwrap();
        let tok2 = client.get_token(&102).unwrap();

        assert_eq!(tok1.owner, owner);
        assert_eq!(tok1.metadata.tree_count, 50);
        assert_eq!(tok1.metadata.co2_offset_kg, 2500);

        assert_eq!(tok2.owner, owner);
        assert_eq!(tok2.metadata.tree_count, 50);
        assert_eq!(tok2.metadata.co2_offset_kg, 2500);
    }
}
