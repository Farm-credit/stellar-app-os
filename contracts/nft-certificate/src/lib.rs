#![no_std]

//! NFT Certificate Contract — Multi-Issuer Authority System (#754)
//!
//! SEP-41 NFT contract for CO2 certificates. Supports a set of authorized
//! issuers that can mint certificates independently, with the admin managing
//! the issuer set.
//!
//! # Multi-Issuer Authority Design
//! NFT Certificate — Closes #653
//!
//! - A single `admin` initializes the contract and manages issuers.
//! - The admin can `add_issuer` / `remove_issuer` at any time.
//! - Any address in the issuer set may call `mint` to issue certificates.
//! - The admin itself is always implicitly authorized to mint (no self-add needed).
//! - Issuers may be removed but cannot remove themselves unless they are admin.
//!
//! # Storage layout (Instance)
//!   ADMIN       — Address         (contract admin)
//!   ISSUERS     — Vec<Address>    (authorized issuer set)
//!   PAUSED      — bool            (pause flag)
//!   TOK_COUNT   — u64             (total tokens minted, net of burns)
//!
//!
//! # Storage layout (Instance)
//!   ADMIN       — Address         (contract admin)
//!   ISSUERS     — Vec<Address>    (authorized issuer set)
//!   PAUSED      — bool            (pause flag)
//!   TOK_COUNT   — u64             (total tokens minted, net of burns)
//!
//! # Storage layout (Persistent, keyed by token_id: u64)
//!   Token(id)   — Token           (owner + metadata)

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
    ///
    /// The admin is NOT automatically added to the issuer set. Call
    /// `add_issuer` to grant the admin minting rights, or use a dedicated
    /// issuer address for minting.
    /// `admin` — multi-sig admin address for contract management
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
    /// The admin may also mint without being in the issuer set by calling
    /// `add_issuer` for themselves first, keeping the permission model explicit.
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
        });

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("TOK_COUNT"),
            &count.checked_add(1).expect("token count overflow"),
        );

        env.events().publish((symbol_short!("minted"), to), (token_id, issuer));
    }

    /// Merge multiple certificates owned by `owner` into a single new certificate.
    ///
    /// The caller must be the owner of all tokens being merged. This does NOT
    /// require issuer authority — any token owner may merge their own tokens.
    ///
    ///
    /// The caller must be the owner of all tokens being merged. This does NOT
    /// require issuer authority — any token owner may merge their own tokens.
    ///
    /// # Parameters
    /// * `owner`          — address that owns all input tokens (must sign)
    /// * `token_ids`      — list of token IDs to merge (must all belong to `owner`)
    /// * `new_token_id`   — token ID for the merged output
    /// * `merged_metadata` — must match the exact sum of input tree_count and co2_offset_kg
    ///
    ///
    /// The caller must be the owner of all tokens being merged. This does NOT
    /// require issuer authority — any token owner may merge their own tokens.
    ///
    /// # Parameters
    /// * `owner`          — address that owns all input tokens (must sign)
    /// * `token_ids`      — list of token IDs to merge (must all belong to `owner`)
    /// * `new_token_id`   — token ID for the merged output
    /// * `merged_metadata` — must match the exact sum of input tree_count and co2_offset_kg
    ///
    /// # Errors
    /// - `Unauthorized`       if any input token is not owned by `owner`.
    /// - `TokenNotFound`      if any token ID does not exist.
    /// - `TokenAlreadyMinted` if `new_token_id` already exists.
    /// - `MetadataMismatch`   if merged sums don't match provided metadata.
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

        let new_key = DataKey::Token(new_token_id);
        if env.storage().persistent().has(&new_key) {
        // Batch size limit prevents gas bomb DoS attacks
        if token_ids.len() > (MAX_MERGE_BATCH_SIZE as u64) {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        // Check if new token ID already exists
        if env.storage().instance().has(&new_token_id) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        let mut total_trees: i128 = 0;
        let mut total_co2: i128 = 0;
        // Use the issuer of the first token for the merged token
        let mut merged_issuer = owner.clone();

        // Verify no duplicate token IDs in the merge list
        {
            let mut seen_ids = soroban_sdk::Vec::new(&env);
            for i in 0..token_ids.len() {
                let tid = token_ids.get(i).unwrap();
                if seen_ids.contains(&tid) {
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


            env.storage().persistent().remove(&key);
        }

        if total_trees != merged_metadata.tree_count || total_co2 != merged_metadata.co2_offset_kg {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        env.storage().persistent().set(&new_key, &Token {
            owner: owner.clone(),
            issuer: merged_issuer,
            metadata: merged_metadata,
        });

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64).expect("count underflow")
            .checked_add(1).expect("count overflow");
        env.storage().instance().set(&symbol_short!("TOK_COUNT"), &new_count);

        env.events().publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));

            env.storage().persistent().remove(&key);
        }

        if total_trees != merged_metadata.tree_count || total_co2 != merged_metadata.co2_offset_kg {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        env.storage().persistent().set(&new_key, &Token {
            owner: owner.clone(),
            issuer: merged_issuer,
            metadata: merged_metadata,
        });

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64).expect("count underflow")
            .checked_add(1).expect("count overflow");
        env.storage().instance().set(&symbol_short!("TOK_COUNT"), &new_count);

        env.events().publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));

        let count: u64 = env.storage().instance()
            .get(&symbol_short!("TOK_COUNT")).unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64).expect("count underflow")
            .checked_add(1).expect("count overflow");
        env.storage().instance().set(&symbol_short!("TOK_COUNT"), &new_count);

        env.events().publish((symbol_short!("merged"), owner), (new_token_id, token_ids.len()));
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

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Returns the token record for `token_id`, or `None`.
    pub fn get_token(env: Env, token_id: u64) -> Option<Token> {
        env.storage().persistent().get(&DataKey::Token(token_id))
    }

    /// Returns the owner of `token_id`, or `None`.
    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage().persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .map(|t| t.owner)
    }

    /// Returns the total number of live tokens.
    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&symbol_short!("TOK_COUNT")).unwrap_or(0)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Pause all state-changing functions. Admin only.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &true);
        env.events().publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause the contract. Admin only.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
        env.events().publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Returns `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&symbol_short!("PAUSED")).unwrap_or(false)
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
    use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

    // ── Helpers ───────────────────────────────────────────────────────────────
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

    fn meta(env: &Env, trees: i128, co2: i128) -> CertificateMetadata {
        CertificateMetadata {
            tree_count: trees,
            co2_offset_kg: co2,
            planting_date: String::from_str(env, "2025-01-01"),
            region: String::from_str(env, "Northern Nigeria"),
        }
    }

    // ── initialize ────────────────────────────────────────────────────────────

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

    // ── add_issuer ────────────────────────────────────────────────────────────

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

    // ── remove_issuer ─────────────────────────────────────────────────────────

    #[test]
    fn test_remove_issuer_revokes_permission() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        assert!(!ctx.client.is_issuer(&issuer));
        assert_eq!(ctx.client.get_issuers().len(), 0);
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
    fn metadata(env: &Env, tree_count: i128, co2_offset: i128) -> CertificateMetadata {
        CertificateMetadata {
            tree_count,
            co2_offset_kg: co2_offset,
            planting_date: String::from_str(env, "2025-01-01"),
            region: String::from_str(env, "Northern Nigeria"),
        }
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
        // Can add again after removal
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
    }

    // ── mint with issuer auth ─────────────────────────────────────────────────

    #[test]
    fn test_authorized_issuer_can_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 50, 2400));
        let tok = ctx.client.get_token(&1).unwrap();
        assert_eq!(tok.owner, recipient);
        assert_eq!(tok.issuer, issuer);
        assert_eq!(tok.metadata.tree_count, 50);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    fn test_multiple_issuers_can_mint_independently() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        let r1 = Address::generate(&ctx.env);
        let r2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);

        ctx.client.mint(&i1, &r1, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&i2, &r2, &2, &meta(&ctx.env, 20, 960));

        assert_eq!(ctx.client.get_token(&1).unwrap().issuer, i1);
        assert_eq!(ctx.client.get_token(&2).unwrap().issuer, i2);
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_unauthorized_address_cannot_mint() {
        let ctx = setup();
        let non_issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.mint(&non_issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_removed_issuer_cannot_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        // Permission revoked — must fail
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_admin_without_issuer_role_cannot_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        // Admin has not added themselves to the issuer set
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    fn test_admin_added_as_issuer_can_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&ctx.admin);
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.owner_of(&1).unwrap(), recipient);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]  // NftError::TokenAlreadyMinted = 1
    fn test_duplicate_token_id_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_mint_zero_tree_count_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 0, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_mint_zero_co2_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 0));
    }

    // ── merge ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_merge_two_certificates() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);

        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));
        ctx.client.mint(&issuer, &owner, &2, &meta(&ctx.env, 75, 3600));

        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64];
        ctx.client.merge(&owner, &ids, &3, &meta(&ctx.env, 125, 6000));

        assert!(ctx.client.get_token(&1).is_none());
        assert!(ctx.client.get_token(&2).is_none());
        let merged = ctx.client.get_token(&3).unwrap();
        assert_eq!(merged.owner, owner);
        assert_eq!(merged.metadata.tree_count, 125);
        assert_eq!(merged.metadata.co2_offset_kg, 6000);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_tokens_not_owned_by_caller_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        let other = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        ctx.client.merge(&other, &ids, &2, &meta(&ctx.env, 50, 2400));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]  // NftError::MetadataMismatch = 3
    fn test_merge_metadata_mismatch_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        // Sums say 50/2400 but we claim 100/4800
        ctx.client.merge(&owner, &ids, &2, &meta(&ctx.env, 100, 4800));
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    #[test]
    fn test_pause_blocks_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        assert!(ctx.client.is_paused());
        let result = ctx.client.try_mint(
            &issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_restores_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        ctx.client.unpause();
        assert!(!ctx.client.is_paused());
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.total_supply(), 1);
    }

    // ── is_issuer / get_issuers ───────────────────────────────────────────────

    #[test]
    fn test_unknown_address_is_not_issuer() {
        let ctx = setup();
        let random = Address::generate(&ctx.env);
        assert!(!ctx.client.is_issuer(&random));
    }

    // ── remove_issuer ─────────────────────────────────────────────────────────

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
        // Can add again after removal
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
    }

    // ── mint with issuer auth ─────────────────────────────────────────────────

    #[test]
    fn test_authorized_issuer_can_mint() {
    fn test_multiple_issuers_can_mint_independently() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        let r1 = Address::generate(&ctx.env);
        let r2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);

        ctx.client.mint(&i1, &r1, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&i2, &r2, &2, &meta(&ctx.env, 20, 960));

        assert_eq!(ctx.client.get_token(&1).unwrap().issuer, i1);
        assert_eq!(ctx.client.get_token(&2).unwrap().issuer, i2);
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_unauthorized_address_cannot_mint() {
        let ctx = setup();
        let non_issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.mint(&non_issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_removed_issuer_cannot_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        // Permission revoked — must fail
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_admin_without_issuer_role_cannot_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        // Admin has not added themselves to the issuer set
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    fn test_admin_added_as_issuer_can_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&ctx.admin);
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.owner_of(&1).unwrap(), recipient);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]  // NftError::TokenAlreadyMinted = 1
    fn test_duplicate_token_id_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 50, 2400));
        let tok = ctx.client.get_token(&1).unwrap();
        assert_eq!(tok.owner, recipient);
        assert_eq!(tok.issuer, issuer);
        assert_eq!(tok.metadata.tree_count, 50);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    fn test_multiple_issuers_can_mint_independently() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        let r1 = Address::generate(&ctx.env);
        let r2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);

        ctx.client.mint(&i1, &r1, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&i2, &r2, &2, &meta(&ctx.env, 20, 960));

        assert_eq!(ctx.client.get_token(&1).unwrap().issuer, i1);
        assert_eq!(ctx.client.get_token(&2).unwrap().issuer, i2);
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_unauthorized_address_cannot_mint() {
        let ctx = setup();
        let non_issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.mint(&non_issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_removed_issuer_cannot_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
        // Permission revoked — must fail
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_admin_without_issuer_role_cannot_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        // Admin has not added themselves to the issuer set
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    fn test_admin_added_as_issuer_can_mint() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&ctx.admin);
        ctx.client.mint(&ctx.admin, &recipient, &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.owner_of(&1).unwrap(), recipient);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]  // NftError::TokenAlreadyMinted = 1
    fn test_duplicate_token_id_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_mint_zero_tree_count_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 0, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_mint_zero_co2_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 0));
    }

    // ── merge ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_merge_two_certificates() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);

        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));
        ctx.client.mint(&issuer, &owner, &2, &meta(&ctx.env, 75, 3600));

        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64];
        ctx.client.merge(&owner, &ids, &3, &meta(&ctx.env, 125, 6000));

        assert!(ctx.client.get_token(&1).is_none());
        assert!(ctx.client.get_token(&2).is_none());
        let merged = ctx.client.get_token(&3).unwrap();
        assert_eq!(merged.owner, owner);
        assert_eq!(merged.metadata.tree_count, 125);
        assert_eq!(merged.metadata.co2_offset_kg, 6000);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_tokens_not_owned_by_caller_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        let other = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        ctx.client.merge(&other, &ids, &2, &meta(&ctx.env, 50, 2400));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]  // NftError::MetadataMismatch = 3
    fn test_merge_metadata_mismatch_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        // Sums say 50/2400 but we claim 100/4800
        ctx.client.merge(&owner, &ids, &2, &meta(&ctx.env, 100, 4800));
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    #[test]
    fn test_pause_blocks_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        assert!(ctx.client.is_paused());
        let result = ctx.client.try_mint(
            &issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_restores_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        ctx.client.unpause();
        assert!(!ctx.client.is_paused());
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.total_supply(), 1);
    }

    // ── is_issuer / get_issuers ───────────────────────────────────────────────

    #[test]
    fn test_unknown_address_is_not_issuer() {
        let ctx = setup();
        let random = Address::generate(&ctx.env);
        assert!(!ctx.client.is_issuer(&random));
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
        ctx.client.mint(&issuer, &recipient, &1, &meta(&ctx.env, 10, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_mint_zero_tree_count_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 0, 480));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_mint_zero_co2_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 0));
    }

    // ── merge ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_merge_two_certificates() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);

        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));
        ctx.client.mint(&issuer, &owner, &2, &meta(&ctx.env, 75, 3600));

        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64];
        ctx.client.merge(&owner, &ids, &3, &meta(&ctx.env, 125, 6000));

        assert!(ctx.client.get_token(&1).is_none());
        assert!(ctx.client.get_token(&2).is_none());
        let merged = ctx.client.get_token(&3).unwrap();
        assert_eq!(merged.owner, owner);
        assert_eq!(merged.metadata.tree_count, 125);
        assert_eq!(merged.metadata.co2_offset_kg, 6000);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_tokens_not_owned_by_caller_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        let other = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        ctx.client.merge(&other, &ids, &2, &meta(&ctx.env, 50, 2400));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]  // NftError::MetadataMismatch = 3
    fn test_merge_metadata_mismatch_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &owner, &1, &meta(&ctx.env, 50, 2400));

        let ids = soroban_sdk::vec![&ctx.env, 1u64];
        // Sums say 50/2400 but we claim 100/4800
        ctx.client.merge(&owner, &ids, &2, &meta(&ctx.env, 100, 4800));
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    #[test]
    fn test_pause_blocks_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        assert!(ctx.client.is_paused());
        let result = ctx.client.try_mint(
            &issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_restores_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.pause();
        ctx.client.unpause();
        assert!(!ctx.client.is_paused());
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 10, 480));
        assert_eq!(ctx.client.total_supply(), 1);
    }

    // ── is_issuer / get_issuers ───────────────────────────────────────────────

    #[test]
    fn test_unknown_address_is_not_issuer() {
        let ctx = setup();
        let random = Address::generate(&ctx.env);
        assert!(!ctx.client.is_issuer(&random));
    }

    #[test]
    fn test_get_issuers_returns_all_current_issuers() {
        let ctx = setup();
        assert_eq!(ctx.client.get_issuers().len(), 0);
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);
        let list = ctx.client.get_issuers();
        assert_eq!(list.len(), 2);
    }

    // ── owner_of / get_token ──────────────────────────────────────────────────

    #[test]
    fn test_owner_of_returns_correct_owner() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &42, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.owner_of(&42).unwrap(), recipient);
    }

    #[test]
    fn test_owner_of_returns_none_for_unknown_token() {
        let ctx = setup();
        assert!(ctx.client.owner_of(&999).is_none());
    }

    // ── total_supply ──────────────────────────────────────────────────────────

    #[test]
    fn test_total_supply_increments_on_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert_eq!(ctx.client.total_supply(), 0);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 1);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &2, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    fn test_total_supply_decreases_by_net_on_merge() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        for id in 1u64..=4 {
            ctx.client.mint(&issuer, &owner, &id, &meta(&ctx.env, 10, 480));
        }
        assert_eq!(ctx.client.total_supply(), 4);
        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64, 3u64, 4u64];
        ctx.client.merge(&owner, &ids, &5, &meta(&ctx.env, 40, 1920));
        // 4 burned + 1 minted = net -3
        assert_eq!(ctx.client.total_supply(), 1);
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

    // ── Merge Enhancement Tests ──────────────────────────────────────────────
    #[test]
    fn test_get_issuers_returns_all_current_issuers() {
        let ctx = setup();
        assert_eq!(ctx.client.get_issuers().len(), 0);
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);
        let list = ctx.client.get_issuers();
        assert_eq!(list.len(), 2);
    }

    // ── owner_of / get_token ──────────────────────────────────────────────────

    #[test]
    fn test_owner_of_returns_correct_owner() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let recipient = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.mint(&issuer, &recipient, &42, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.owner_of(&42).unwrap(), recipient);
    }

    #[test]
    fn test_owner_of_returns_none_for_unknown_token() {
        let ctx = setup();
        assert!(ctx.client.owner_of(&999).is_none());
    }

    // ── total_supply ──────────────────────────────────────────────────────────

    #[test]
    fn test_total_supply_increments_on_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert_eq!(ctx.client.total_supply(), 0);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 1);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &2, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    fn test_total_supply_decreases_by_net_on_merge() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        for id in 1u64..=4 {
            ctx.client.mint(&issuer, &owner, &id, &meta(&ctx.env, 10, 480));
        }
        assert_eq!(ctx.client.total_supply(), 4);
        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64, 3u64, 4u64];
        ctx.client.merge(&owner, &ids, &5, &meta(&ctx.env, 40, 1920));
        // 4 burned + 1 minted = net -3
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    fn test_owner_of_returns_none_for_unknown_token() {
        let ctx = setup();
        assert!(ctx.client.owner_of(&999).is_none());
    }

    // ── total_supply ──────────────────────────────────────────────────────────

    #[test]
    fn test_total_supply_increments_on_mint() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert_eq!(ctx.client.total_supply(), 0);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &1, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 1);
        ctx.client.mint(&issuer, &Address::generate(&ctx.env), &2, &meta(&ctx.env, 5, 240));
        assert_eq!(ctx.client.total_supply(), 2);
    }

    #[test]
    fn test_total_supply_decreases_by_net_on_merge() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        let owner = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        for id in 1u64..=4 {
            ctx.client.mint(&issuer, &owner, &id, &meta(&ctx.env, 10, 480));
        }
        assert_eq!(ctx.client.total_supply(), 4);
        let ids = soroban_sdk::vec![&ctx.env, 1u64, 2u64, 3u64, 4u64];
        ctx.client.merge(&owner, &ids, &5, &meta(&ctx.env, 40, 1920));
        // 4 burned + 1 minted = net -3
        assert_eq!(ctx.client.total_supply(), 1);
    fn test_merge_duplicate_token_ids_rejected() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        let meta1 = metadata(&env, 50, 2400);
        client.mint(&owner.clone(), &1, &meta1);
        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, [1, 1]);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.merge(&owner, &token_ids, &3, &merged_meta);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn test_merge_six_certificates() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        for i in 0..6 {
            let meta = metadata(&env, 10, 480);
            client.mint(&owner.clone(), &(i + 1), &meta);
        }
        let merged_meta = metadata(&env, 60, 2880);
        let mut token_ids = Vec::new(&env);
        for i in 0..6 {
            token_ids.push_back(i + 1);
        }
        client.merge(&owner, &token_ids, &100, &merged_meta);
        let token = client.get_token(&100).unwrap();
        assert_eq!(token.metadata.tree_count, 60);
        assert_eq!(token.metadata.co2_offset_kg, 2880);
        assert_eq!(client.total_supply(), 1);
    }

    #[test]
    fn test_get_token_returns_none_for_burned() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        let meta = metadata(&env, 50, 2400);
        client.mint(&owner.clone(), &1, &meta);
        assert!(client.get_token(&1).is_some());
        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, [1]);
        client.merge(&owner, &token_ids, &2, &merged_meta);
        assert!(client.get_token(&1).is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_with_wrong_owner_rejected() {
        let (env, _, client) = setup();
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let meta1 = metadata(&env, 50, 2400);
        client.mint(&owner, &1, &meta1);
        let merged_meta = metadata(&env, 50, 2400);
        let token_ids = Vec::from_array(&env, [1]);
        client.merge(&other, &token_ids, &2, &merged_meta);
    }
}
