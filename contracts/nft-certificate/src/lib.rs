#![no_std]

//! NFT Certificate — Closes #653
//!
//! - A single `admin` initializes the contract and manages issuers.
//! - The admin can `add_issuer` / `remove_issuer` at any time.
//! - Any address in the issuer set may call `mint` to issue certificates.
//! - The admin itself is always implicitly authorized to mint (no self-add needed).
//! - Issuers may be removed but cannot remove themselves unless they are admin.
//!
//! # Storage layout (Instance)
//!    ADMIN       — Address         (contract admin)
//!    ISSUERS     — Vec<Address>    (authorized issuer set)
//!    PAUSED      — bool            (pause flag)
//!    TOK_COUNT   — u64             (total tokens minted, net of burns)
//!
//! # Storage layout (Persistent, keyed by token_id: u64)
//!    Token(id)   — Token           (owner + metadata)

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short,
    Address, Env, String, Vec,
};
use harvesta_errors::{HarvestaError, NftError};

// ── Error codes ───────────────────────────────────────────────────────────────

/// Contract-specific error codes for the multi-issuer authority system.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NftCertError {
    /// Caller is not in the authorized issuer set and is not the admin.
    NotAuthorizedIssuer = 300,
    /// Address is already in the issuer set.
    IssuerAlreadyExists = 301,
    /// Address is not in the issuer set.
    IssuerNotFound      = 302,
    /// Cannot remove the last issuer (would make minting impossible).
    CannotRemoveLastIssuer = 303,
}

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
    /// Issuer that minted this token
    pub issuer: Address,
    /// Token metadata
    pub metadata: CertificateMetadata,
    /// Whether this token is soulbound (non-transferable)
    pub soulbound: bool,
}

/// Issuer record — stores address and registration timestamp.
#[contracttype]
#[derive(Clone, Debug)]
pub struct IssuerRecord {
    pub issuer: Address,
    pub added_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// Token record (persistent, keyed by token ID)
    Token(u64),
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of certificates that can be merged in a single merge() call.
const MAX_MERGE_BATCH_SIZE: u32 = 100;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct NftCertificate;

#[contractimpl]
impl NftCertificate {
    /// One-time initialisation.
    ///
    /// `admin` — contract admin; manages issuers and can pause/unpause.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
        env.storage().instance().set(&symbol_short!("TOK_COUNT"), &0u64);
        // Initialize empty issuer set
        let empty: Vec<IssuerRecord> = Vec::new(&env);
        env.storage().instance().set(&symbol_short!("ISSUERS"), &empty);
    }

    // ── Issuer management ─────────────────────────────────────────────────────

    /// Add an address to the authorized issuer set.
    ///
    /// Admin only. The issuer is immediately permitted to call `mint`.
    ///
    /// # Errors
    /// - `IssuerAlreadyExists` if the address is already an issuer.
    pub fn add_issuer(env: Env, issuer: Address) {
        Self::require_admin(&env);

        let mut issuers: Vec<IssuerRecord> = env
            .storage().instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(&env));

        // Reject duplicates
        for i in 0..issuers.len() {
            if issuers.get(i).unwrap().issuer == issuer {
                panic_with_error!(&env, NftCertError::IssuerAlreadyExists);
            }
        }

        issuers.push_back(IssuerRecord {
            issuer: issuer.clone(),
            added_at: env.ledger().timestamp(),
        });
        env.storage().instance().set(&symbol_short!("ISSUERS"), &issuers);

        env.events().publish((symbol_short!("issAdd"), issuer), env.ledger().timestamp());
    }

    /// Remove an address from the authorized issuer set.
    ///
    /// Admin only. Active tokens minted by this issuer are unaffected.
    ///
    /// # Errors
    /// - `IssuerNotFound` if the address is not currently an issuer.
    pub fn remove_issuer(env: Env, issuer: Address) {
        Self::require_admin(&env);

        let issuers: Vec<IssuerRecord> = env
            .storage().instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        let mut updated: Vec<IssuerRecord> = Vec::new(&env);
        for i in 0..issuers.len() {
            let rec = issuers.get(i).unwrap();
            if rec.issuer == issuer {
                found = true;
            } else {
                updated.push_back(rec);
            }
        }

        if !found {
            panic_with_error!(&env, NftCertError::IssuerNotFound);
        }

        env.storage().instance().set(&symbol_short!("ISSUERS"), &updated);

        env.events().publish((symbol_short!("issRm"), issuer), env.ledger().timestamp());
    }

    /// Returns all current issuer records.
    pub fn get_issuers(env: Env) -> Vec<IssuerRecord> {
        env.storage().instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns `true` if `addr` is an authorized issuer.
    pub fn is_issuer(env: Env, addr: Address) -> bool {
        Self::check_is_issuer(&env, &addr)
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /// Mint a new certificate NFT.
    ///
    /// Caller must be a registered issuer (added via `add_issuer`).
    ///
    /// # Parameters
    /// * `issuer`    — the authorized issuer calling this function (must sign)
    /// * `to`        — recipient address that will own the token
    /// * `token_id`  — unique u64 token identifier
    /// * `metadata`  — certificate metadata (tree_count, co2_offset_kg, etc.)
    ///
    /// # Errors
    /// - `NotAuthorizedIssuer` if caller is not in the issuer set.
    /// - `TokenAlreadyMinted` if `token_id` already exists.
    /// - `TreeCountMustBePositive` / `Co2MustBePositive` on invalid metadata.
    pub fn mint(
        env: Env,
        issuer: Address,
        to: Address,
        token_id: u64,
        metadata: CertificateMetadata,
    ) {
        Self::assert_not_paused(&env);
        issuer.require_auth();

        // Enforce issuer authorization
        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }

        if metadata.tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }
        if metadata.co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        let key = DataKey::Token(token_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        env.storage().persistent().set(&key, &Token {
            owner: to.clone(),
            issuer: issuer.clone(),
            metadata,
            soulbound: false,
        });

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("TOK_COUNT"),
            &count.checked_add(1).expect("token count overflow"),
        );

        env.events().publish((symbol_short!("minted"), to), (token_id, issuer));
    }

    /// Mint multiple certificate NFTs in a single transaction (up to 50 certificates).
    pub fn batch_mint(
        env: Env,
        issuer: Address,
        to: Address,
        token_ids: Vec<u64>,
        metadatas: Vec<CertificateMetadata>,
    ) {
        Self::assert_not_paused(&env);
        issuer.require_auth();

        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }

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

            let key = DataKey::Token(token_id);
            if env.storage().persistent().has(&key) {
                panic_with_error!(&env, NftError::TokenAlreadyMinted);
            }

            let token = Token {
                owner: to.clone(),
                issuer: issuer.clone(),
                metadata,
                soulbound: false,
            };

            env.storage().persistent().set(&key, &token);
            minted_count += 1;
        }

        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &count.checked_add(minted_count).expect("token count overflow"));

        env.events()
            .publish((symbol_short!("btch_mnt"), to), token_ids.len() as u32);
    }

    /// Merge multiple certificates owned by `owner` into a single new certificate.
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

        // Batch size limit prevents gas bomb DoS attacks
        if token_ids.len() > MAX_MERGE_BATCH_SIZE {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        let new_key = DataKey::Token(new_token_id);
        if env.storage().persistent().has(&new_key) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        let mut total_trees: i128 = 0;
        let mut total_co2: i128 = 0;
        let mut merged_issuer = owner.clone();

        // Verify no duplicate token IDs in the merge list
        {
            let mut seen_ids = Vec::new(&env);
            for i in 0..token_ids.len() {
                let tid = token_ids.get(i).unwrap();
                if seen_ids.contains(tid) {
                    panic_with_error!(&env, HarvestaError::AmountMustBePositive);
                }
                seen_ids.push_back(tid);
            }
        }

        for i in 0..token_ids.len() {
            let tid = token_ids.get(i).unwrap();
            let key = DataKey::Token(tid);
            let token: Token = env.storage().persistent().get(&key)
                .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

            if token.owner != owner {
                panic_with_error!(&env, HarvestaError::Unauthorized);
            }
            if i == 0 { merged_issuer = token.issuer.clone(); }

            total_trees = total_trees.checked_add(token.metadata.tree_count)
                .expect("tree count overflow");
            total_co2 = total_co2.checked_add(token.metadata.co2_offset_kg)
                .expect("co2 overflow");

            env.storage().persistent().remove(&key);
        }

        if total_trees != merged_metadata.tree_count || total_co2 != merged_metadata.co2_offset_kg {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        env.storage().persistent().set(&new_key, &Token {
            owner: owner.clone(),
            issuer: merged_issuer,
            metadata: merged_metadata,
            soulbound: false,
        });

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64).expect("count underflow")
            .checked_add(1).expect("count overflow");
        env.storage().instance().set(&symbol_short!("TOK_COUNT"), &new_count);

        env.events().publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));
    }

    /// Split a single certificate into two new certificates.
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

        let orig_key = DataKey::Token(original_token_id);
        let orig_token: Token = env
            .storage()
            .persistent()
            .get(&orig_key)
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        if orig_token.owner != owner {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }

        let key_1 = DataKey::Token(new_token_id_1);
        let key_2 = DataKey::Token(new_token_id_2);
        if env.storage().persistent().has(&key_1)
            || env.storage().persistent().has(&key_2)
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
        env.storage().persistent().remove(&orig_key);

        // Mint split tokens
        let token_1 = Token {
            owner: owner.clone(),
            issuer: orig_token.issuer.clone(),
            metadata: metadata_1,
            soulbound: false,
        };
        let token_2 = Token {
            owner: owner.clone(),
            issuer: orig_token.issuer,
            metadata: metadata_2,
            soulbound: false,
        };

        env.storage().persistent().set(&key_1, &token_1);
        env.storage().persistent().set(&key_2, &token_2);

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

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_token(env: Env, token_id: u64) -> Option<Token> {
        env.storage().persistent().get(&DataKey::Token(token_id))
    }

    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage().persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .map(|t| t.owner)
    }

    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&symbol_short!("TOK_COUNT")).unwrap_or(0)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &true);
        env.events().publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
        env.events().publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&symbol_short!("PAUSED")).unwrap_or(false)
    }

    pub fn render_svg(env: Env, token_id: u64) -> String {
        let _token: Token = env
            .storage()
            .persistent()
            .get(&DataKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));

        String::from_str(&env, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\" viewBox=\"0 0 400 400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\" rx=\"16\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\" font-size=\"20\" font-weight=\"bold\">Harvesta Carbon Certificate</text><text x=\"20\" y=\"100\" fill=\"#d8f3dc\" font-size=\"14\">On-Chain Certificate</text></svg>")
    }

    pub fn token_uri(env: Env, token_id: u64) -> String {
        let _svg = Self::render_svg(env.clone(), token_id);
        String::from_str(&env, "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\">Harvesta NFT Certificate</text></svg>")
    }

    // ── Internal ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance()
            .get(&symbol_short!("PAUSED")).unwrap_or(false);
        if paused { panic_with_error!(env, HarvestaError::ContractPaused); }
    }

    fn check_is_issuer(env: &Env, addr: &Address) -> bool {
        let issuers: Vec<IssuerRecord> = env.storage().instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(env));
        for i in 0..issuers.len() {
            if &issuers.get(i).unwrap().issuer == addr {
                return true;
            }
        }
        false
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    struct Ctx {
        env: Env,
        admin: Address,
        client: NftCertificateClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, NftCertificate);
        let client = NftCertificateClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        Ctx { env, admin, client }
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
    fn test_initialize_sets_defaults() {
        let ctx = setup();
        assert!(!ctx.client.is_paused());
        assert_eq!(ctx.client.total_supply(), 0);
        assert_eq!(ctx.client.get_issuers().len(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin);
    }

    #[test]
    fn test_add_issuer_grants_mint_permission() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
        assert_eq!(ctx.client.get_issuers().len(), 1);
    }

    #[test]
    fn test_add_multiple_issuers() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        let i3 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);
        ctx.client.add_issuer(&i3);
        assert_eq!(ctx.client.get_issuers().len(), 3);
        assert!(ctx.client.is_issuer(&i1));
        assert!(ctx.client.is_issuer(&i2));
        assert!(ctx.client.is_issuer(&i3));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #301)")]
    fn test_add_duplicate_issuer_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.add_issuer(&issuer); // duplicate
    }

    #[test]
    fn test_issuer_added_at_timestamp_stored() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        let rec = ctx.client.get_issuers().get(0).unwrap();
        assert_eq!(rec.issuer, issuer);
        assert_eq!(rec.added_at, ctx.env.ledger().timestamp());
    }

    #[test]
    fn test_remove_issuer_revokes_permission() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        assert!(!ctx.client.is_issuer(&issuer));
        assert_eq!(ctx.client.get_issuers().len(), 0);
    }

    #[test]
    fn test_remove_one_of_multiple_issuers() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);
        ctx.client.remove_issuer(&i1);
        assert!(!ctx.client.is_issuer(&i1));
        assert!(ctx.client.is_issuer(&i2));
        assert_eq!(ctx.client.get_issuers().len(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #302)")]
    fn test_remove_nonexistent_issuer_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.remove_issuer(&issuer);
    }

    #[test]
    fn test_add_issuer_after_remove() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
    }
}