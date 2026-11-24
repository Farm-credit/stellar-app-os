#![no_std]

//! NFT Certificate — Closes #653, #762, #1815
//!
//! SEP-41-style NFT contract for CO2 certificates with merge functionality,
//! a 5% secondary-market royalty and non-transferable impact badges for
//! verified stewards (issue #1815).
//!
//! # Royalty (#762)
//!
//! Every secondary-market `trade` pays exactly 5% of the trade price to the
//! **original tree planter** recorded at mint time. The royalty is enforced
//! at the smart-contract level and cannot be bypassed. When the original
//! planter is the seller, no royalty is deducted (self-sale). The original
//! planter address is immutable for the lifetime of the certificate.
//!
//! # Soulbound impact badges (#1815)
//!
//! Impact certificates awarded to **verified stewards** (farmers, urban
//! planters, community schools, verifiers) can be permanently bound to their
//! owner. A bound certificate is a non-transferable Soulbound Token (SBT):
//!
//! - [`Self::mint_soulbound`] / [`Self::batch_mint_soulbound`] issue badges
//!   directly in a bound state.
//! - [`Self::make_soulbound`] irreversibly binds an already minted
//!   certificate. Only the contract admin or the certificate's issuer may do
//!   so; the operation is one-way and emits a `soulbond` event.
//! - [`Self::trade`] rejects a bound certificate with
//!   [`NftError::TokenIsSoulbound`] before any payment is moved.
//! - `merge` / `split` also reject bound certificates because burning a badge
//!   and re-minting it would otherwise be a transfer loophole.
//! - [`Self::is_soulbound`] exposes the status to clients and UIs so a
//!   "non-transferable" notice can be shown before a trade is attempted.
//!
//! # Authority
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
//!    Token(id)   — Token           (owner + metadata + soulbound flag)

use harvesta_errors::{HarvestaError, NftError};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env,
    String, Symbol, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Royalty basis points: 500 = 5.00 % of every secondary-market trade price.
const ROYALTY_BPS: u32 = 500;

/// Basis-point denominator (10 000).
const BPS_DENOMINATOR: i128 = 10_000;

/// Maximum number of certificates that can be merged in a single `merge()` call.
const MAX_MERGE_BATCH_SIZE: u32 = 100;

/// Maximum number of certificates that can be minted in a single batch call.
const MAX_BATCH_MINT_SIZE: u32 = 50;

/// Sponsored-tree ownership NFT metadata keys (sponsor ownership certificates).
/// Minted automatically on sponsorship confirmation; carries species,
/// GPS coordinates and planting date so it is viewable in Stellar wallets.
const SPONSOR_NFT_NAME_PREFIX: &str = "Tree Ownership";
/// Renew dynamic metadata at least every day and retain it for another 30 days.
const GROWTH_TTL_THRESHOLD: u32 = 17_280;
const GROWTH_TTL_EXTEND_TO: u32 = 518_400;

// ── Error codes ───────────────────────────────────────────────────────────────

/// Contract-specific error codes for the multi-issuer authority system,
/// protocol verification and soulbound badges.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NftCertError {
    /// Caller is not in the authorized issuer set and is not the admin.
    NotAuthorizedIssuer = 300,
    /// Address is already in the issuer set.
    IssuerAlreadyExists = 301,
    /// Address is not in the issuer set.
    IssuerNotFound = 302,
    /// Cannot remove the last issuer (would make minting impossible).
    CannotRemoveLastIssuer = 303,
    /// Registered protocol project not found.
    ProtocolProjectNotFound = 304,
    /// Protocol project is already registered.
    ProtocolProjectAlreadyExists = 305,
    /// Protocol project is inactive or paused.
    ProtocolProjectNotActive = 306,
    /// Insufficient registered credits remaining on the protocol project.
    InsufficientRegisteredCredits = 307,
    /// Invalid parameters for protocol verification.
    InvalidProtocolParameters = 308,
    /// Certificate is already permanently bound to its owner.
    AlreadySoulbound = 309,
    /// Caller is neither the contract admin nor the issuer of the certificate.
    NotAuthorizedForSoulbound = 310,
    /// Growth metadata update did not use the next sequential update number.
    InvalidGrowthUpdateSequence = 311,
    /// Growth stage must advance by exactly one stage.
    InvalidGrowthStageTransition = 312,
    /// Metadata URI is empty or exceeds the supported length.
    InvalidMetadataUri = 313,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Certificate metadata attributes.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CertificateMetadata {
    pub tree_count: i128,
    pub co2_offset_kg: i128,
    pub planting_date: String,
    pub region: String,
}

/// Verification standard protocol (Verra or Gold Standard) — Issue #1383.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VerificationProtocol {
    VerraVcs = 1,
    GoldStandard = 2,
}

/// A registered Verra or Gold Standard carbon project for automated validation (issue #1383).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolProject {
    pub project_id: Symbol,
    pub protocol: VerificationProtocol,
    pub registry_id: String,      // e.g. "VCS-984" or "GS-1124"
    pub standard_version: String, // e.g. "v4.4" or "GS4GG"
    pub methodology: String,      // e.g. "VM0042" or "AR-ACM0003"
    pub total_approved_credits_tonnes: u64,
    pub issued_credits_tonnes: u64,
    pub active: bool,
    pub registered_at: u64,
}

/// On-chain audit record for an automatically validated and issued NFT certificate (issue #1383).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolValidationRecord {
    pub token_id: u64,
    pub project_id: Symbol,
    pub protocol: VerificationProtocol,
    pub registry_id: String,
    pub credits_tonnes: u64,
    pub recipient: Address,
    pub serial_number_start: String,
    pub serial_number_end: String,
    pub registry_url: String,
    pub verified_at: u64,
}

/// Verified lifecycle stage for a planted-tree certificate.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GrowthStage {
    Seeded = 0,
    Planted = 1,
    Sprout = 2,
    Sapling = 3,
    Mature = 4,
}

/// Separately stored evolution state; avoids changing the existing `Token` ABI.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct GrowthState {
    pub stage: GrowthStage,
    /// Monotonic update sequence, starting at zero on mint.
    pub update_sequence: u64,
    /// Content-addressed or otherwise immutable metadata reference.
    pub metadata_uri: String,
}

/// On-chain data stored for each certificate NFT.
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
    /// Whether this token is soulbound (non-transferable), issue #1815
    pub soulbound: bool,
}

/// Issuer record — stores address and registration timestamp.
#[contracttype]
#[derive(Clone, Debug)]
pub struct IssuerRecord {
    pub issuer: Address,
    pub added_at: u64,
}

/// Storage keys.
#[contracttype]
#[derive(Clone, Debug)]
enum DataKey {
    /// Token record (persistent, keyed by token ID)
    Token(u64),
    /// Protocol project registered under Verra or Gold Standard
    ProtocolProject(Symbol),
    /// Validation and issuance audit record, keyed by token ID
    ProtocolValidation(u64),
    /// Growth and dynamic metadata state, keyed by token ID
    Growth(u64),
}

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
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &0u64);
        let empty: Vec<IssuerRecord> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("ISSUERS"), &empty);
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
            .storage()
            .instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(&env));

        for i in 0..issuers.len() {
            if issuers.get(i).unwrap().issuer == issuer {
                panic_with_error!(&env, NftCertError::IssuerAlreadyExists);
            }
        }

        issuers.push_back(IssuerRecord {
            issuer: issuer.clone(),
            added_at: env.ledger().timestamp(),
        });
        env.storage()
            .instance()
            .set(&symbol_short!("ISSUERS"), &issuers);

        env.events()
            .publish((symbol_short!("issAdd"), issuer), env.ledger().timestamp());
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
            .storage()
            .instance()
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

        env.storage()
            .instance()
            .set(&symbol_short!("ISSUERS"), &updated);

        env.events()
            .publish((symbol_short!("issRm"), issuer), env.ledger().timestamp());
    }

    /// Returns all current issuer records.
    pub fn get_issuers(env: Env) -> Vec<IssuerRecord> {
        env.storage()
            .instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns `true` if `addr` is an authorized issuer.
    pub fn is_issuer(env: Env, addr: Address) -> bool {
        Self::check_is_issuer(&env, &addr)
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /// Mint an ownership NFT for a sponsored tree.
    ///
    /// Called automatically upon sponsorship confirmation. The NFT metadata
    /// records species, GPS coordinates and planting date so sponsors can view
    /// the certificate in their connected Stellar wallet. The token is minted to
    /// the sponsor, and the original planter is recorded for royalties.
    ///
    /// Issuer or admin only.
    pub fn mint_sponsor_nft(
        env: Env,
        issuer: Address,
        sponsor: Address,
        original_planter: Address,
        species: String,
        gps_lat: String,
        gps_lng: String,
        planting_date: String,
    ) -> u64 {
        issuer.require_auth();
        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }

        // Encode species and GPS coordinates into the region descriptor so the
        // metadata is carried on-chain without changing the Token ABI.
        let mut region = species.clone();
        region.append(&String::from_str(&env, "|"));
        region.append(&gps_lat);
        region.append(&String::from_str(&env, ","));
        region.append(&gps_lng);

        let metadata = CertificateMetadata {
            tree_count: 1,
            co2_offset_kg: 0,
            planting_date,
            region,
        };

        let token_id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0u64)
            + 1;

        let token = Token {
            owner: sponsor.clone(),
            original_planter,
            issuer: issuer.clone(),
            metadata,
            soulbound: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Token(token_id), &token);
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &token_id);

        env.events().publish(
            (symbol_short!("sponNft"), sponsor),
            (token_id, env.ledger().timestamp()),
        );

        token_id
    }

    /// Mint a transferable certificate NFT.
    ///
    /// `to` is recorded as both the initial owner and the **original tree
    /// planter** — the permanent royalty recipient for all future trades.
    ///
    /// # Errors
    /// - `NotAuthorizedIssuer` if `issuer` is not in the issuer set.
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
        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }
        Self::mint_internal(&env, &issuer, &to, token_id, metadata, false);
    }

    /// Mint a non-transferable (soulbound) impact badge for a verified steward.
    ///
    /// The badge is permanently bound to `to` at creation time: it cannot be
    /// traded, merged or split. This is the direct implementation of #1815.
    pub fn mint_soulbound(
        env: Env,
        issuer: Address,
        to: Address,
        token_id: u64,
        metadata: CertificateMetadata,
    ) {
        Self::assert_not_paused(&env);
        issuer.require_auth();
        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }
        Self::mint_internal(&env, &issuer, &to, token_id, metadata, true);
    }

    /// Mint multiple transferable certificate NFTs in a single transaction.
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
        Self::batch_mint_internal(&env, &issuer, &to, &token_ids, &metadatas, false);
    }

    /// Mint multiple non-transferable impact badges in a single transaction.
    pub fn batch_mint_soulbound(
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
        Self::batch_mint_internal(&env, &issuer, &to, &token_ids, &metadatas, true);
    }

    /// Merge multiple certificates owned by `owner` into a single new certificate.
    ///
    /// The merged certificate inherits the `original_planter` of the first
    /// certificate in the list. Ownership of all merged certificates is
    /// verified before burning. Soulbound certificates cannot be merged.
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

        // Batch size limit prevents gas-bomb DoS attacks.
        if token_ids.len() > MAX_MERGE_BATCH_SIZE {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        let new_key = DataKey::Token(new_token_id);
        if env.storage().persistent().has(&new_key) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        // Reject duplicate input IDs (otherwise the same token would be
        // counted twice and a double-spend style bug would be possible).
        let mut seen_ids: Vec<u64> = Vec::new(&env);
        for i in 0..token_ids.len() {
            let tid = token_ids.get(i).unwrap();
            if seen_ids.contains(&tid) {
                panic_with_error!(&env, HarvestaError::AmountMustBePositive);
            }
            seen_ids.push_back(tid);
        }

        let mut total_trees: i128 = 0;
        let mut total_co2: i128 = 0;
        let mut merged_issuer: Option<Address> = None;
        let mut merged_planter: Option<Address> = None;

        for i in 0..token_ids.len() {
            let token_id = token_ids.get(i).unwrap();
            let key = DataKey::Token(token_id);
            let token = Self::load_token(&env, token_id);

            if token.owner != owner {
                panic_with_error!(&env, HarvestaError::Unauthorized);
            }
            if token.soulbound {
                panic_with_error!(&env, NftError::TokenIsSoulbound);
            }
            if merged_issuer.is_none() {
                merged_issuer = Some(token.issuer.clone());
                merged_planter = Some(token.original_planter.clone());
            }

            total_trees = total_trees
                .checked_add(token.metadata.tree_count)
                .expect("tree count overflow");
            total_co2 = total_co2
                .checked_add(token.metadata.co2_offset_kg)
                .expect("co2 overflow");

            env.storage().persistent().remove(&key);
        }

        if total_trees != merged_metadata.tree_count || total_co2 != merged_metadata.co2_offset_kg {
            panic_with_error!(&env, NftError::MetadataMismatch);
        }

        env.storage().persistent().set(
            &new_key,
            &Token {
                owner: owner.clone(),
                original_planter: merged_planter.expect("merged planter"),
                issuer: merged_issuer.expect("merged issuer"),
                metadata: merged_metadata,
                soulbound: false,
            },
        );

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        let new_count = count
            .checked_sub(token_ids.len() as u64)
            .expect("count underflow")
            .checked_add(1)
            .expect("count overflow");
        env.storage()
            .instance()
            .set(&symbol_short!("TOK_COUNT"), &new_count);

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("merged"), owner),
            (new_token_id, token_ids.len()),
        );
    }

    /// Split a single certificate into two new certificates.
    ///
    /// Soulbound certificates cannot be split: burning a badge would destroy
    /// the verified stewardship record.
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
        let orig_token = Self::load_token(&env, original_token_id);

        if orig_token.owner != owner {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }
        if orig_token.soulbound {
            panic_with_error!(&env, NftError::TokenIsSoulbound);
        }

        let key_1 = DataKey::Token(new_token_id_1);
        let key_2 = DataKey::Token(new_token_id_2);
        if env.storage().persistent().has(&key_1) || env.storage().persistent().has(&key_2) {
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

        env.storage().persistent().remove(&orig_key);

        let token_1 = Token {
            owner: owner.clone(),
            original_planter: orig_token.original_planter.clone(),
            issuer: orig_token.issuer.clone(),
            metadata: metadata_1,
            soulbound: false,
        };
        let token_2 = Token {
            owner: owner.clone(),
            original_planter: orig_token.original_planter,
            issuer: orig_token.issuer,
            metadata: metadata_2,
            soulbound: false,
        };

        env.storage().persistent().set(&key_1, &token_1);
        env.storage().persistent().set(&key_2, &token_2);

        // Net change: -1 + 2 = +1.
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("TOK_COUNT"),
            &count.checked_add(1).expect("token count overflow"),
        );

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("split"), owner),
            (original_token_id, new_token_id_1, new_token_id_2),
        );
    }

    /// Trade a certificate from `seller` to `buyer` for `price` units of
    /// `payment_token`.
    ///
    /// # Soulbound (issue #1815)
    ///
    /// Bound certificates are rejected with `NftError::TokenIsSoulbound`
    /// **before** any payment is moved or ownership is changed.
    ///
    /// # Royalty (5 %)
    ///
    /// 5 % of `price` is automatically transferred to the **original tree
    /// planter** recorded at mint time. The remaining 95 % is transferred to
    /// the seller. When the seller is the original planter, no royalty is
    /// deducted (self-sale).
    ///
    /// # Panics
    ///
    /// - `NftError::TokenIsSoulbound` — certificate is non-transferable
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

        let mut token = Self::load_token(&env, token_id);

        // SBT guard (#1815): fail fast, no tokens move and no state changes.
        if token.soulbound {
            panic_with_error!(&env, NftError::TokenIsSoulbound);
        }

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

        if royalty_amount > 0 {
            token_client.transfer(&buyer, &token.original_planter, &royalty_amount);
        }
        if seller_amount > 0 {
            token_client.transfer(&buyer, &seller, &seller_amount);
        }

        // Update ownership — the original planter never changes.
        token.owner = buyer.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Token(token_id), &token);

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("traded"), token_id),
            (seller, buyer, price, royalty_amount),
        );
    }

    // ── Soulbound management (issue #1815) ───────────────────────────────────

    /// Permanently bind an existing certificate to its current owner.
    ///
    /// Only the contract admin or the certificate's issuing authority may
    /// call this. The operation is **irreversible**: there is deliberately no
    /// unbind path, so a verified steward's badge can never be detached.
    ///
    /// # Errors
    /// - `NftError::TokenNotFound` if `token_id` does not exist.
    /// - `NftCertError::AlreadySoulbound` if the token is already bound.
    /// - `NftCertError::NotAuthorizedForSoulbound` if the caller is neither
    ///   admin nor the token's issuer.
    pub fn make_soulbound(env: Env, authority: Address, token_id: u64) {
        Self::assert_not_paused(&env);
        authority.require_auth();

        let key = DataKey::Token(token_id);
        let mut token = Self::load_token(&env, token_id);

        if token.soulbound {
            panic_with_error!(&env, NftCertError::AlreadySoulbound);
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        if authority != admin && authority != token.issuer {
            panic_with_error!(&env, NftCertError::NotAuthorizedForSoulbound);
        }

        token.soulbound = true;
        env.storage().persistent().set(&key, &token);

        contract_utils::ttl::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("soulbond"), token_id),
            (authority, token.owner),
        );
    }

    /// Advance verified planting progress and replace the token metadata URI.
    ///
    /// The certificate issuer or contract admin must authenticate. Updates are
    /// replay-protected by `update_sequence` and may advance only one stage at a
    /// time; stages are never accepted directly from an untrusted planter.
    /// `metadata_uri` must be non-empty and at most 512 bytes. The sequence
    /// starts at 1 for the first update (minted state is sequence 0).
    pub fn update_growth(
        env: Env,
        authority: Address,
        token_id: u64,
        update_sequence: u64,
        stage: GrowthStage,
        metadata_uri: String,
    ) {
        Self::assert_not_paused(&env);
        authority.require_auth();
        let token = Self::load_token(&env, token_id);
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        if authority != admin && authority != token.issuer {
            panic_with_error!(&env, NftCertError::NotAuthorizedForSoulbound);
        }
        if metadata_uri.is_empty() || metadata_uri.len() > 512 {
            panic_with_error!(&env, NftCertError::InvalidMetadataUri);
        }
        let key = DataKey::Growth(token_id);
        let current = env
            .storage()
            .persistent()
            .get::<DataKey, GrowthState>(&key)
            .unwrap_or_else(|| GrowthState {
                stage: GrowthStage::Seeded,
                update_sequence: 0,
                metadata_uri: String::from_str(&env, ""),
            });
        if current.update_sequence.checked_add(1) != Some(update_sequence) {
            panic_with_error!(&env, NftCertError::InvalidGrowthUpdateSequence);
        }
        let expected = match current.stage {
            GrowthStage::Seeded => GrowthStage::Planted,
            GrowthStage::Planted => GrowthStage::Sprout,
            GrowthStage::Sprout => GrowthStage::Sapling,
            GrowthStage::Sapling => GrowthStage::Mature,
            GrowthStage::Mature => {
                panic_with_error!(&env, NftCertError::InvalidGrowthStageTransition)
            }
        };
        if stage != expected {
            panic_with_error!(&env, NftCertError::InvalidGrowthStageTransition);
        }
        env.storage().persistent().set(
            &key,
            &GrowthState {
                stage,
                update_sequence,
                metadata_uri: metadata_uri.clone(),
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, GROWTH_TTL_THRESHOLD, GROWTH_TTL_EXTEND_TO);
        contract_utils::ttl::bump_instance_ttl(&env);
        env.events().publish(
            (symbol_short!("growth"), token_id),
            (current.stage, stage, update_sequence, metadata_uri),
        );
    }

    /// Return the stored growth state, or the initial seeded state for a token.
    pub fn get_growth_state(env: Env, token_id: u64) -> Option<GrowthState> {
        if !env.storage().persistent().has(&DataKey::Token(token_id)) {
            return None;
        }
        let key = DataKey::Growth(token_id);
        if let Some(state) = env.storage().persistent().get(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, GROWTH_TTL_THRESHOLD, GROWTH_TTL_EXTEND_TO);
            return Some(state);
        }
        Some(GrowthState {
            stage: GrowthStage::Seeded,
            update_sequence: 0,
            metadata_uri: String::from_str(&env, ""),
        })
    }

    /// Returns `true` when the certificate is a non-transferable impact badge.
    ///
    /// Missing certificates return `false` so front-ends can render a neutral
    /// state instead of failing on a stale token ID.
    pub fn is_soulbound(env: Env, token_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .map(|token| token.soulbound)
            .unwrap_or(false)
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_token(env: Env, token_id: u64) -> Option<Token> {
        env.storage().persistent().get(&DataKey::Token(token_id))
    }

    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .map(|t| t.owner)
    }

    /// Get the original planter of a token (permanent royalty recipient).
    pub fn original_planter_of(env: Env, token_id: u64) -> Option<Address> {
        env.storage()
            .persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .map(|token| token.original_planter)
    }

    /// Get the total number of tokens.
    pub fn total_supply(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    pub fn render_svg(env: Env, token_id: u64) -> String {
        Self::load_token(&env, token_id);
        String::from_str(&env, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\" viewBox=\"0 0 400 400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\" rx=\"16\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\" font-size=\"20\" font-weight=\"bold\">Harvesta Carbon Certificate</text><text x=\"20\" y=\"100\" fill=\"#d8f3dc\" font-size=\"14\">On-Chain Certificate</text></svg>")
    }

    pub fn token_uri(env: Env, token_id: u64) -> String {
        Self::load_token(&env, token_id);
        let growth_key = DataKey::Growth(token_id);
        if let Some(state) = env
            .storage()
            .persistent()
            .get::<DataKey, GrowthState>(&growth_key)
        {
            if !state.metadata_uri.is_empty() {
                env.storage().persistent().extend_ttl(
                    &growth_key,
                    GROWTH_TTL_THRESHOLD,
                    GROWTH_TTL_EXTEND_TO,
                );
                return state.metadata_uri;
            }
        }
        String::from_str(&env, "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\"><rect width=\"100%\" height=\"100%\" fill=\"#1b4332\"/><text x=\"20\" y=\"40\" fill=\"#ffffff\">Harvesta NFT Certificate</text></svg>")
    }

    // ── Protocol Verification: Verra & Gold Standard (issue #1383) ────────────

    /// Register a verified Verra or Gold Standard carbon project. Admin only.
    pub fn register_protocol_project(
        env: Env,
        project_id: Symbol,
        protocol: VerificationProtocol,
        registry_id: String,
        standard_version: String,
        methodology: String,
        total_approved_credits_tonnes: u64,
    ) {
        Self::require_admin(&env);

        if total_approved_credits_tonnes == 0 {
            panic_with_error!(&env, NftCertError::InvalidProtocolParameters);
        }

        let key = DataKey::ProtocolProject(project_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, NftCertError::ProtocolProjectAlreadyExists);
        }

        let project = ProtocolProject {
            project_id: project_id.clone(),
            protocol,
            registry_id,
            standard_version,
            methodology,
            total_approved_credits_tonnes,
            issued_credits_tonnes: 0,
            active: true,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("proto_reg"), project_id),
            total_approved_credits_tonnes,
        );
    }

    /// Automatically validate carbon credits against a registered Verra or Gold Standard
    /// project and issue the corresponding NFT certificate.
    ///
    /// Protocol certificates represent tradeable carbon credits and are
    /// therefore minted as transferable (non-soulbound) tokens. Verified
    /// steward badges should be created via `mint_soulbound` instead.
    pub fn validate_and_issue_protocol_nft(
        env: Env,
        issuer: Address,
        project_id: Symbol,
        to: Address,
        token_id: u64,
        credits_tonnes: u64,
        serial_number_start: String,
        serial_number_end: String,
        registry_url: String,
        metadata: CertificateMetadata,
    ) -> u64 {
        Self::assert_not_paused(&env);
        issuer.require_auth();

        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, NftCertError::NotAuthorizedIssuer);
        }
        if credits_tonnes == 0 {
            panic_with_error!(&env, NftCertError::InvalidProtocolParameters);
        }
        if metadata.tree_count <= 0 || metadata.co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        let proj_key = DataKey::ProtocolProject(project_id.clone());
        let mut project: ProtocolProject = env
            .storage()
            .persistent()
            .get(&proj_key)
            .unwrap_or_else(|| panic_with_error!(&env, NftCertError::ProtocolProjectNotFound));

        if !project.active {
            panic_with_error!(&env, NftCertError::ProtocolProjectNotActive);
        }

        let remaining = project
            .total_approved_credits_tonnes
            .checked_sub(project.issued_credits_tonnes)
            .unwrap_or(0);

        if credits_tonnes > remaining {
            panic_with_error!(&env, NftCertError::InsufficientRegisteredCredits);
        }

        let token_key = DataKey::Token(token_id);
        if env.storage().persistent().has(&token_key) {
            panic_with_error!(&env, NftError::TokenAlreadyMinted);
        }

        project.issued_credits_tonnes = project
            .issued_credits_tonnes
            .checked_add(credits_tonnes)
            .expect("overflow in issued credits");
        env.storage().persistent().set(&proj_key, &project);

        env.storage().persistent().set(
            &token_key,
            &Token {
                owner: to.clone(),
                original_planter: to.clone(),
                issuer: issuer.clone(),
                metadata,
                soulbound: false,
            },
        );

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("TOK_COUNT"),
            &count.checked_add(1).expect("token count overflow"),
        );

        let validation_record = ProtocolValidationRecord {
            token_id,
            project_id: project_id.clone(),
            protocol: project.protocol,
            registry_id: project.registry_id.clone(),
            credits_tonnes,
            recipient: to.clone(),
            serial_number_start,
            serial_number_end,
            registry_url,
            verified_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProtocolValidation(token_id), &validation_record);

        env.events().publish(
            (symbol_short!("proto_nft"), project_id),
            (token_id, to, credits_tonnes),
        );

        token_id
    }

    /// Check if credits are valid and available under a registered project.
    pub fn validate_protocol_credits(env: Env, project_id: Symbol, credits_tonnes: u64) -> bool {
        let proj_key = DataKey::ProtocolProject(project_id);
        if let Some(project) = env
            .storage()
            .persistent()
            .get::<DataKey, ProtocolProject>(&proj_key)
        {
            if !project.active {
                return false;
            }
            let remaining = project
                .total_approved_credits_tonnes
                .saturating_sub(project.issued_credits_tonnes);
            credits_tonnes > 0 && credits_tonnes <= remaining
        } else {
            false
        }
    }

    /// Retrieve the registered Verra/Gold Standard project.
    pub fn get_protocol_project(env: Env, project_id: Symbol) -> ProtocolProject {
        env.storage()
            .persistent()
            .get(&DataKey::ProtocolProject(project_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftCertError::ProtocolProjectNotFound))
    }

    /// Retrieve the validation audit record for an issued NFT.
    pub fn get_protocol_validation(env: Env, token_id: u64) -> ProtocolValidationRecord {
        env.storage()
            .persistent()
            .get(&DataKey::ProtocolValidation(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound))
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

    fn check_is_issuer(env: &Env, addr: &Address) -> bool {
        let issuers: Vec<IssuerRecord> = env
            .storage()
            .instance()
            .get(&symbol_short!("ISSUERS"))
            .unwrap_or_else(|| Vec::new(env));
        for i in 0..issuers.len() {
            if &issuers.get(i).unwrap().issuer == addr {
                return true;
            }
        }
        false
    }

    fn load_token(env: &Env, token_id: u64) -> Token {
        env.storage()
            .persistent()
            .get::<DataKey, Token>(&DataKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(env, NftError::TokenNotFound))
    }

    fn mint_internal(
        env: &Env,
        issuer: &Address,
        to: &Address,
        token_id: u64,
        metadata: CertificateMetadata,
        soulbound: bool,
    ) {
        if metadata.tree_count <= 0 {
            panic_with_error!(env, HarvestaError::TreeCountMustBePositive);
        }
        if metadata.co2_offset_kg <= 0 {
            panic_with_error!(env, HarvestaError::Co2MustBePositive);
        }

        let key = DataKey::Token(token_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(env, NftError::TokenAlreadyMinted);
        }

        env.storage().persistent().set(
            &key,
            &Token {
                owner: to.clone(),
                original_planter: to.clone(),
                issuer: issuer.clone(),
                metadata,
                soulbound,
            },
        );

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOK_COUNT"))
            .unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("TOK_COUNT"),
            &count.checked_add(1).expect("token count overflow"),
        );

        if soulbound {
            // Informative event so indexers/front-ends can show the
            // "non-transferable impact badge" notice (issue #1815).
            env.events()
                .publish((symbol_short!("soulMint"), to.clone()), token_id);
        } else {
            env.events().publish(
                (symbol_short!("minted"), to.clone()),
                (token_id, issuer.clone()),
            );
        }
    }

    fn batch_mint_internal(
        env: &Env,
        issuer: &Address,
        to: &Address,
        token_ids: &Vec<u64>,
        metadatas: &Vec<CertificateMetadata>,
        soulbound: bool,
    ) {
        if token_ids.is_empty() {
            panic_with_error!(env, HarvestaError::BatchEmpty);
        }
        if token_ids.len() > MAX_BATCH_MINT_SIZE {
            panic_with_error!(env, HarvestaError::BatchTooLarge);
        }
        if token_ids.len() != metadatas.len() {
            panic_with_error!(env, NftError::MetadataMismatch);
        }

        let mut seen_ids: Vec<u64> = Vec::new(env);
        for i in 0..token_ids.len() {
            let token_id = token_ids.get(i).unwrap();
            if seen_ids.contains(&token_id) {
                panic_with_error!(env, NftError::TokenAlreadyMinted);
            }
            seen_ids.push_back(token_id);

            let metadata = metadatas.get(i).unwrap();
            Self::mint_internal(env, issuer, to, token_id, metadata, soulbound);
        }

        contract_utils::ttl::bump_instance_ttl(env);

        if soulbound {
            env.events().publish(
                (symbol_short!("soulBtch"), to.clone()),
                token_ids.len() as u32,
            );
        } else {
            env.events().publish(
                (symbol_short!("btch_mnt"), to.clone()),
                token_ids.len() as u32,
            );
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token};

    struct Ctx {
        env: Env,
        admin: Address,
        issuer: Address,
        client: NftCertificateClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, NftCertificate);
        let client = NftCertificateClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let issuer = Address::generate(&env);
        client.initialize(&admin);
        client.add_issuer(&issuer);
        Ctx {
            env,
            admin,
            issuer,
            client,
        }
    }

    fn metadata(env: &Env, tree_count: i128, co2_offset: i128) -> CertificateMetadata {
        CertificateMetadata {
            tree_count,
            co2_offset_kg: co2_offset,
            planting_date: String::from_str(env, "2025-01-01"),
            region: String::from_str(env, "Northern Nigeria"),
        }
    }

    fn deploy_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    fn mint_token(env: &Env, token_addr: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_addr).mint(to, &amount);
    }

    fn balance(env: &Env, token_addr: &Address, account: &Address) -> i128 {
        token::Client::new(env, token_addr).balance(account)
    }

    // ------------------------------------------------------------------
    // Initialisation & mint
    // ------------------------------------------------------------------

    #[test]
    fn test_initialize() {
        let ctx = setup();
        assert!(!ctx.client.is_paused());
    }

    #[test]
    fn test_initialize_sets_defaults() {
        let ctx = setup();
        assert!(!ctx.client.is_paused());
        assert_eq!(ctx.client.total_supply(), 0);
        // One issuer registered by setup().
        assert_eq!(ctx.client.get_issuers().len(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin);
    }

    #[test]
    fn test_mint() {
        let ctx = setup();
        let to = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &to, &1, &metadata(&ctx.env, 100, 4800));

        let token = ctx.client.get_token(&1).unwrap();
        assert_eq!(token.owner, to);
        assert_eq!(token.original_planter, to);
        assert_eq!(token.metadata.tree_count, 100);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    fn test_mint_sets_original_planter() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 50, 2400));

        let token = ctx.client.get_token(&1).unwrap();
        assert_eq!(token.original_planter, planter);
        assert_eq!(ctx.client.original_planter_of(&1).unwrap(), planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_zero_tree_count_rejected() {
        let ctx = setup();
        let to = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &to, &1, &metadata(&ctx.env, 0, 4800));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_zero_co2_offset_rejected() {
        let ctx = setup();
        let to = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &to, &1, &metadata(&ctx.env, 100, 0));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #300)")]
    fn test_mint_by_unauthorized_issuer_rejected() {
        let ctx = setup();
        let outsider = Address::generate(&ctx.env);
        let to = Address::generate(&ctx.env);
        ctx.client
            .mint(&outsider, &to, &1, &metadata(&ctx.env, 100, 4800));
    }

    // ------------------------------------------------------------------
    // Issuer management
    // ------------------------------------------------------------------

    #[test]
    fn test_add_issuer_grants_mint_permission() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
        assert_eq!(ctx.client.get_issuers().len(), 2);
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
        assert_eq!(ctx.client.get_issuers().len(), 4);
        assert!(ctx.client.is_issuer(&i1));
        assert!(ctx.client.is_issuer(&i2));
        assert!(ctx.client.is_issuer(&i3));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #301)")]
    fn test_add_duplicate_issuer_rejected() {
        let ctx = setup();
        ctx.client.add_issuer(&ctx.issuer);
    }

    #[test]
    fn test_issuer_added_at_timestamp_stored() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        let rec = ctx.client.get_issuers().get(1).unwrap();
        assert_eq!(rec.issuer, issuer);
        assert_eq!(rec.added_at, ctx.env.ledger().timestamp());
    }

    #[test]
    fn test_remove_issuer_revokes_permission() {
        let ctx = setup();
        ctx.client.remove_issuer(&ctx.issuer);
        assert!(!ctx.client.is_issuer(&ctx.issuer));
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
        assert_eq!(ctx.client.get_issuers().len(), 2);
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
        ctx.client.remove_issuer(&ctx.issuer);
        ctx.client.add_issuer(&ctx.issuer);
        assert!(ctx.client.is_issuer(&ctx.issuer));
    }

    // ------------------------------------------------------------------
    // Soulbound impact badges (#1815)
    // ------------------------------------------------------------------

    #[test]
    fn test_mint_soulbound_sets_flag() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint_soulbound(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        let token = ctx.client.get_token(&1).unwrap();
        assert_eq!(token.owner, steward);
        assert!(token.soulbound);
        assert!(ctx.client.is_soulbound(&1));
    }

    #[test]
    fn test_regular_mint_is_not_soulbound() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 10, 480));

        assert!(!ctx.client.get_token(&1).unwrap().soulbound);
        assert!(!ctx.client.is_soulbound(&1));
    }

    #[test]
    fn test_is_soulbound_missing_token_is_false() {
        let ctx = setup();
        assert!(!ctx.client.is_soulbound(&999));
    }

    #[test]
    fn test_batch_mint_soulbound_sets_all_flags() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        let ids = Vec::from_array(&ctx.env, [1u64, 2, 3]);
        let metas = Vec::from_array(
            &ctx.env,
            [
                metadata(&ctx.env, 10, 480),
                metadata(&ctx.env, 20, 960),
                metadata(&ctx.env, 30, 1440),
            ],
        );

        ctx.client
            .batch_mint_soulbound(&ctx.issuer, &steward, &ids, &metas);

        assert_eq!(ctx.client.total_supply(), 3);
        for id in [1u64, 2, 3] {
            assert!(ctx.client.is_soulbound(&id));
        }
    }

    #[test]
    fn test_make_soulbound_by_issuer() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        ctx.client.make_soulbound(&ctx.issuer, &1);

        assert!(ctx.client.is_soulbound(&1));
        assert!(ctx.client.get_token(&1).unwrap().soulbound);
    }

    #[test]
    fn test_make_soulbound_by_admin() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        ctx.client.make_soulbound(&ctx.admin, &1);

        assert!(ctx.client.is_soulbound(&1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #310)")]
    fn test_make_soulbound_unauthorized_rejected() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        let stranger = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        ctx.client.make_soulbound(&stranger, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #309)")]
    fn test_make_soulbound_twice_rejected() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        ctx.client.make_soulbound(&ctx.issuer, &1);
        ctx.client.make_soulbound(&ctx.issuer, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_make_soulbound_missing_token_rejected() {
        let ctx = setup();
        ctx.client.make_soulbound(&ctx.issuer, &42);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_trade_soulbound_rejected() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .mint_soulbound(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        ctx.client
            .trade(&steward, &buyer, &1, &payment_token, &1_000i128);
    }

    #[test]
    fn test_rejected_soulbound_trade_moves_no_funds_or_ownership() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .mint_soulbound(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));

        let buyer_before = balance(&ctx.env, &payment_token, &buyer);
        let result = ctx
            .client
            .try_trade(&steward, &buyer, &1, &payment_token, &1_000i128);

        assert!(
            result.is_err(),
            "trade of a soulbound certificate must fail"
        );
        assert_eq!(ctx.client.owner_of(&1).unwrap(), steward);
        assert_eq!(balance(&ctx.env, &payment_token, &buyer), buyer_before);
        assert!(ctx.client.is_soulbound(&1));
    }

    #[test]
    fn test_make_soulbound_blocks_later_resale() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .mint(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));
        ctx.client.make_soulbound(&ctx.issuer, &1);

        let result = ctx
            .client
            .try_trade(&steward, &buyer, &1, &payment_token, &1_000i128);
        assert!(result.is_err());
        assert_eq!(ctx.client.owner_of(&1).unwrap(), steward);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_merge_soulbound_rejected() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint_soulbound(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 10, 480));
        ctx.client
            .mint(&ctx.issuer, &steward, &2, &metadata(&ctx.env, 20, 960));

        let ids = Vec::from_array(&ctx.env, [1u64, 2]);
        ctx.client
            .merge(&steward, &ids, &3, &metadata(&ctx.env, 30, 1440));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_split_soulbound_rejected() {
        let ctx = setup();
        let steward = Address::generate(&ctx.env);
        ctx.client
            .mint_soulbound(&ctx.issuer, &steward, &1, &metadata(&ctx.env, 100, 4800));

        ctx.client.split(
            &steward,
            &1,
            &2,
            &3,
            &metadata(&ctx.env, 50, 2400),
            &metadata(&ctx.env, 50, 2400),
        );
    }

    // ------------------------------------------------------------------
    // Merge / split — transferable certificates (regression coverage)
    // ------------------------------------------------------------------

    #[test]
    fn test_merge_two_certificates() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);

        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 50, 2400));
        ctx.client
            .mint(&ctx.issuer, &owner, &2, &metadata(&ctx.env, 75, 3600));

        let token_ids = Vec::from_array(&ctx.env, [1, 2]);
        ctx.client
            .merge(&owner, &token_ids, &3, &metadata(&ctx.env, 125, 6000));

        assert!(ctx.client.get_token(&1).is_none());
        assert!(ctx.client.get_token(&2).is_none());

        let merged_token = ctx.client.get_token(&3).unwrap();
        assert_eq!(merged_token.owner, owner);
        assert_eq!(merged_token.metadata.tree_count, 125);
        assert_eq!(merged_token.metadata.co2_offset_kg, 6000);
        assert!(!merged_token.soulbound);
        assert_eq!(ctx.client.total_supply(), 1);
    }

    #[test]
    fn test_merge_preserves_original_planter() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 50, 2400));
        ctx.client
            .mint(&ctx.issuer, &planter, &2, &metadata(&ctx.env, 25, 1200));

        let token_ids = Vec::from_array(&ctx.env, [1, 2]);
        ctx.client
            .merge(&planter, &token_ids, &3, &metadata(&ctx.env, 75, 3600));

        assert_eq!(ctx.client.get_token(&3).unwrap().original_planter, planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_unauthorized_owner_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let other = Address::generate(&ctx.env);

        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 50, 2400));

        let token_ids = Vec::from_array(&ctx.env, [1]);
        ctx.client
            .merge(&other, &token_ids, &2, &metadata(&ctx.env, 50, 2400));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_merge_empty_list_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let token_ids = Vec::new(&ctx.env);
        ctx.client
            .merge(&owner, &token_ids, &2, &metadata(&ctx.env, 50, 2400));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_merge_metadata_mismatch_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 50, 2400));

        let token_ids = Vec::from_array(&ctx.env, [1]);
        ctx.client
            .merge(&owner, &token_ids, &2, &metadata(&ctx.env, 100, 4800));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_merge_while_paused_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 50, 2400));

        ctx.client.pause();

        let token_ids = Vec::from_array(&ctx.env, [1]);
        ctx.client
            .merge(&owner, &token_ids, &2, &metadata(&ctx.env, 50, 2400));
    }

    #[test]
    fn test_split_preserves_planter_and_supply() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &owner, &1, &metadata(&ctx.env, 100, 4800));

        ctx.client.split(
            &owner,
            &1,
            &2,
            &3,
            &metadata(&ctx.env, 50, 2400),
            &metadata(&ctx.env, 50, 2400),
        );

        assert!(ctx.client.get_token(&1).is_none());
        assert_eq!(ctx.client.get_token(&2).unwrap().original_planter, owner);
        assert_eq!(ctx.client.get_token(&3).unwrap().owner, owner);
        assert_eq!(ctx.client.total_supply(), 2);
    }

    // ------------------------------------------------------------------
    // Trade — success cases
    // ------------------------------------------------------------------

    #[test]
    fn test_trade_transfers_ownership_and_pays_royalty() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer1 = Address::generate(&ctx.env);
        let buyer2 = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer1, 1_000_000);

        // Primary sale (seller == original planter, no royalty).
        ctx.client
            .trade(&planter, &buyer1, &1, &payment_token, &1_000i128);
        assert_eq!(ctx.client.owner_of(&1).unwrap(), buyer1);

        mint_token(&ctx.env, &payment_token, &buyer2, 1_000_000);
        let before = balance(&ctx.env, &payment_token, &planter);
        ctx.client
            .trade(&buyer1, &buyer2, &1, &payment_token, &1_000i128);
        let after = balance(&ctx.env, &payment_token, &planter);

        assert_eq!(after - before, 50i128);
        assert_eq!(ctx.client.owner_of(&1).unwrap(), buyer2);
        assert_eq!(ctx.client.original_planter_of(&1).unwrap(), planter);
    }

    #[test]
    fn test_trade_seller_receives_95_percent() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer1 = Address::generate(&ctx.env);
        let buyer2 = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer1, 1_000_000);
        ctx.client
            .trade(&planter, &buyer1, &1, &payment_token, &1_000i128);

        mint_token(&ctx.env, &payment_token, &buyer2, 1_000_000);
        let before = balance(&ctx.env, &payment_token, &buyer1);
        ctx.client
            .trade(&buyer1, &buyer2, &1, &payment_token, &1_000i128);
        let after = balance(&ctx.env, &payment_token, &buyer1);
        assert_eq!(after - before, 950i128);
    }

    #[test]
    fn test_trade_no_royalty_when_planter_is_seller() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer, 1_000_000);

        let before = balance(&ctx.env, &payment_token, &planter);
        ctx.client
            .trade(&planter, &buyer, &1, &payment_token, &1_000i128);
        let after = balance(&ctx.env, &payment_token, &planter);
        assert_eq!(after - before, 1_000i128);
    }

    #[test]
    fn test_multiple_sequential_trades_each_pay_royalty() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        let c = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));

        mint_token(&ctx.env, &payment_token, &a, 1_000_000);
        ctx.client
            .trade(&planter, &a, &1, &payment_token, &1_000i128);

        let before = balance(&ctx.env, &payment_token, &planter);
        mint_token(&ctx.env, &payment_token, &b, 1_000_000);
        ctx.client.trade(&a, &b, &1, &payment_token, &1_000i128);
        assert_eq!(balance(&ctx.env, &payment_token, &planter) - before, 50i128);

        let before2 = balance(&ctx.env, &payment_token, &planter);
        mint_token(&ctx.env, &payment_token, &c, 1_000_000);
        ctx.client.trade(&b, &c, &1, &payment_token, &1_000i128);
        assert_eq!(
            balance(&ctx.env, &payment_token, &planter) - before2,
            50i128
        );

        assert_eq!(ctx.client.owner_of(&1).unwrap(), c);
        assert_eq!(ctx.client.original_planter_of(&1).unwrap(), planter);
    }

    #[test]
    fn test_trade_small_amount_royalty_rounds_down() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer1 = Address::generate(&ctx.env);
        let buyer2 = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer1, 1_000);
        ctx.client
            .trade(&planter, &buyer1, &1, &payment_token, &100i128);

        mint_token(&ctx.env, &payment_token, &buyer2, 1_000);
        let before = balance(&ctx.env, &payment_token, &planter);
        ctx.client
            .trade(&buyer1, &buyer2, &1, &payment_token, &10i128);
        assert_eq!(balance(&ctx.env, &payment_token, &planter) - before, 0i128);
    }

    #[test]
    fn test_trade_original_planter_never_changes() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);

        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &a, 1_000_000);
        ctx.client
            .trade(&planter, &a, &1, &payment_token, &1_000i128);
        mint_token(&ctx.env, &payment_token, &b, 1_000_000);
        ctx.client.trade(&a, &b, &1, &payment_token, &1_000i128);

        assert_eq!(ctx.client.original_planter_of(&1).unwrap(), planter);
        assert_eq!(ctx.client.owner_of(&1).unwrap(), b);
    }

    // ------------------------------------------------------------------
    // Trade — failure cases
    // ------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_trade_self_trade_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &planter, 1_000);

        ctx.client
            .trade(&planter, &planter, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_zero_price_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .trade(&planter, &buyer, &1, &payment_token, &0i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_negative_price_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .trade(&planter, &buyer, &1, &payment_token, &-1i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_trade_token_not_found_rejected() {
        let ctx = setup();
        let seller = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .trade(&seller, &buyer, &99, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_trade_not_owner_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let impostor = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client
            .trade(&impostor, &buyer, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_trade_while_paused_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));
        mint_token(&ctx.env, &payment_token, &buyer, 1_000);

        ctx.client.pause();
        ctx.client
            .trade(&planter, &buyer, &1, &payment_token, &1_000i128);
    }

    #[test]
    #[should_panic]
    fn test_trade_insufficient_payment_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let buyer = Address::generate(&ctx.env);
        let buyer2 = Address::generate(&ctx.env);
        let payment_token = deploy_token(&ctx.env, &ctx.admin);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 100, 4800));

        mint_token(&ctx.env, &payment_token, &buyer, 1_000);
        ctx.client
            .trade(&planter, &buyer, &1, &payment_token, &1_000i128);

        mint_token(&ctx.env, &payment_token, &buyer2, 10);
        ctx.client
            .trade(&buyer, &buyer2, &1, &payment_token, &100i128);
    }

    // ------------------------------------------------------------------
    #[test]
    fn growth_updates_uri_and_advances_one_stage_at_a_time() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        let uri1 = String::from_str(&ctx.env, "ipfs://cid-planted");
        ctx.client
            .update_growth(&ctx.issuer, &1, &1, &GrowthStage::Planted, &uri1);
        assert_eq!(ctx.client.token_uri(&1), uri1);
        let state = ctx.client.get_growth_state(&1).unwrap();
        assert_eq!(state.stage, GrowthStage::Planted);
        assert_eq!(state.update_sequence, 1);
        ctx.client.update_growth(
            &ctx.admin,
            &1,
            &2,
            &GrowthStage::Sprout,
            &String::from_str(&ctx.env, "ipfs://cid-sprout"),
        );
        assert_eq!(
            ctx.client.get_growth_state(&1).unwrap().stage,
            GrowthStage::Sprout
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #311)")]
    fn growth_replay_or_skipped_sequence_rejected() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        ctx.client.update_growth(
            &ctx.issuer,
            &1,
            &2,
            &GrowthStage::Planted,
            &String::from_str(&ctx.env, "ipfs://x"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #312)")]
    fn growth_cannot_skip_stages_or_regress() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        ctx.client.update_growth(
            &ctx.issuer,
            &1,
            &1,
            &GrowthStage::Sprout,
            &String::from_str(&ctx.env, "ipfs://x"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #312)")]
    fn growth_cannot_regress_after_valid_advance() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        ctx.client.update_growth(
            &ctx.issuer,
            &1,
            &1,
            &GrowthStage::Planted,
            &String::from_str(&ctx.env, "ipfs://planted"),
        );
        ctx.client.update_growth(
            &ctx.issuer,
            &1,
            &2,
            &GrowthStage::Seeded,
            &String::from_str(&ctx.env, "ipfs://regressed"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #313)")]
    fn growth_rejects_uri_over_512_bytes() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        let bytes = [b'x'; 513];
        let uri = String::from_bytes(&ctx.env, &bytes);
        ctx.client
            .update_growth(&ctx.issuer, &1, &1, &GrowthStage::Planted, &uri);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #310)")]
    fn growth_rejects_unauthorized_caller() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        let stranger = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        ctx.client.update_growth(
            &stranger,
            &1,
            &1,
            &GrowthStage::Planted,
            &String::from_str(&ctx.env, "ipfs://x"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #313)")]
    fn growth_rejects_empty_uri() {
        let ctx = setup();
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        ctx.client.update_growth(
            &ctx.issuer,
            &1,
            &1,
            &GrowthStage::Planted,
            &String::from_str(&ctx.env, ""),
        );
    }

    #[test]
    fn unknown_growth_state_is_none_and_missing_state_has_seeded_default() {
        let ctx = setup();
        assert!(ctx.client.get_growth_state(&99).is_none());
        let planter = Address::generate(&ctx.env);
        ctx.client
            .mint(&ctx.issuer, &planter, &1, &metadata(&ctx.env, 1, 10));
        assert_eq!(
            ctx.client.get_growth_state(&1).unwrap().stage,
            GrowthStage::Seeded
        );
    }

    // Protocol verification (regression coverage)
    // ------------------------------------------------------------------

    #[test]
    fn test_protocol_nft_is_transferable() {
        let ctx = setup();
        let project_id = Symbol::new(&ctx.env, "VCS984");
        let recipient = Address::generate(&ctx.env);

        ctx.client.register_protocol_project(
            &project_id,
            &VerificationProtocol::VerraVcs,
            &String::from_str(&ctx.env, "VCS-984"),
            &String::from_str(&ctx.env, "v4.4"),
            &String::from_str(&ctx.env, "VM0042"),
            &1_000u64,
        );

        ctx.client.validate_and_issue_protocol_nft(
            &ctx.issuer,
            &project_id,
            &recipient,
            &1,
            &10u64,
            &String::from_str(&ctx.env, "SN-1"),
            &String::from_str(&ctx.env, "SN-10"),
            &String::from_str(&ctx.env, "https://example.org/vcs-984"),
            &metadata(&ctx.env, 100, 4800),
        );

        assert!(!ctx.client.is_soulbound(&1));
        assert_eq!(ctx.client.get_protocol_validation(&1).recipient, recipient);
    }
}
