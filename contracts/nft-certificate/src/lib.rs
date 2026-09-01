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

// ── Constants ─────────────────────────────────────────────────────────────────

/// Royalty basis points: 500 = 5.00 % of every secondary-market trade price.
const ROYALTY_BPS: u32 = 500;

/// Basis-point denominator (10 000).
const BPS_DENOMINATOR: i128 = 10_000;
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

/// On-chain data stored for each certificate NFT.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TokenData {
    /// Current owner of the certificate
    pub owner: Address,
    /// Approved operator, if any
    pub approved: Option<Address>,
    /// URI pointing to the off-chain JSON metadata
    pub uri: String,
}

/// Storage keys.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Token {
    /// Current owner of the token
    pub owner: Address,
    /// Original tree planter — immutable royalty recipient
    pub original_planter: Address,
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
    /// The `to` address is recorded as both the initial owner and the
    /// **original tree planter** — the permanent royalty recipient for
    /// all future secondary-market trades of this certificate.
    ///
    /// `to` — recipient address (also becomes the original planter)
    /// `token_id` — unique identifier for the token
    /// `metadata` — certificate metadata
    pub fn mint(env: Env, to: Address, token_id: u64, metadata: CertificateMetadata) {
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
            original_planter: to.clone(),
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
            .set(
                &symbol_short!("TOK_COUNT"),
                &count.checked_add(1).expect("token count overflow"),
            );

        contract_utils::ttl::bump_instance_ttl(&env);
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
    /// The merged certificate inherits the `original_planter` of the first
    /// certificate in the list. Ownership of all merged certificates is
    /// verified before burning.
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
            original_planter: merged_original_planter,
            metadata: merged_metadata,
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
            .persistent()
            .set(&DataKey::Token(token_id.clone()), &token);

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

    /// Get the original planter of a token (permanent royalty recipient).
    pub fn original_planter_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .instance()
            .get::<u64, Token>(&token_id)
            .map(|token| token.original_planter)
    }

    /// Get the total number of tokens.
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
    fn test_zero_tree_count_rejected() {
        let (env, _, recipient, client) = setup();

        let id = token_id(&env);
        let metadata = uri(&env);
        let now = env.ledger().timestamp();

        client.mint(&recipient, &id, &metadata, &0, &4800, &now);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_zero_co2_offset_rejected() {
        let (env, _, recipient, client) = setup();

        let id = token_id(&env);
        let metadata = uri(&env);
        let now = env.ledger().timestamp();

        client.mint(&to, &token_id, &meta);
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