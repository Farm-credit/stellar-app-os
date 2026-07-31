#![no_std]

//! Farmer Registry Contract — Closes #637
//!
//! Upgrades the registry to store SHA-256 hashes of encrypted farmer identity
//! documents rather than plain-text records, enforces on-chain SHA-256
//! integrity checks, and gates all read/write operations behind an
//! admin-managed validator set.
//!
//! # Design
//!
//! ## SHA-256 integrity
//! `land_doc_hash` is always a `BytesN<32>` (32-byte SHA-256 digest).  On every
//! write (`register_farmer`, `update_profile`) the contract re-hashes the
//! supplied bytes with `env.crypto().sha256()` and asserts that the result
//! equals the caller-supplied hash.  This guarantees the on-chain value is a
//! valid SHA-256 digest of _something_, and lets any observer independently
//! verify document integrity without ever storing the raw document on-chain.
//!
//! ## Validator-gated access
//! Only addresses registered as validators (via `register_validator`) may:
//! - call `register_farmer` / `update_profile` on behalf of a farmer, or
//! - call the privileged `get_farmer_verified` read that returns the full
//!   profile.
//!
//! The unprivileged `get_farmer` public read returns only the hash and
//! region — never the wallet address — so PII stays off public paths.
//!
//! Validator management (`register_validator` / `revoke_validator`) is
//! restricted to the admin address set at `initialize`.

use admin_controls::AdminControlsClient;
use harvesta_errors::{FarmerError, HarvestaError};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Bytes, BytesN,
    Env, IntoVal, String, Vec,
};

/// Persistent co-operative records are renewed before their remaining lifetime
/// becomes short.  This keeps long-lived group accounts discoverable without
/// requiring every read to mutate storage.
const COOP_TTL_THRESHOLD: u32 = 518_400;
const COOP_TTL_EXTEND_TO: u32 = 1_036_800;
/// A deliberately bounded signer list keeps one co-operative record small.
const MAX_COOP_SIGNERS: u32 = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Full farmer profile stored under the validator-gated key.
///
/// `land_doc_hash` is the SHA-256 digest of the farmer's encrypted identity
/// document.  The raw document is kept off-chain; only this 32-byte fingerprint
/// lives on the ledger.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerProfile {
    pub wallet_address: Address,
    /// SHA-256 hash of the encrypted off-chain identity/land document.
    pub land_doc_hash: BytesN<32>,
    /// Geohash for the farmer's region (Northern Nigeria s0–s8 prefix scheme).
    pub region_geohash: String,
    pub registered_at: u64,
}

/// Publicly-visible subset of a profile — no wallet address exposed.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PublicFarmerView {
    /// SHA-256 hash of the encrypted identity document.
    pub land_doc_hash: BytesN<32>,
    pub region_geohash: String,
    pub registered_at: u64,
}

/// Snapshot of a profile at a given version, stored for audit history.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProfileHistoryEntry {
    pub version: u32,
    pub profile: FarmerProfile,
    pub updated_at: u64,
}

/// Represents a geographical farm plot registered by a farmer.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmPlot {
    pub plot_id: BytesN<32>,
    pub farmer_id: Address,
    pub coordinates: soroban_sdk::Vec<(i64, i64)>,
    pub area_sqm: u64,
    pub registered_at: u64,
}

/// A farming co-operative controlled by a shared Stellar multisig account.
///
/// `multisig_account` is the authoritative account used for authorization.
/// Calling `multisig_account.require_auth()` delegates threshold enforcement to
/// Stellar/Soroban, so this contract never stores private keys or attempts to
/// reproduce Stellar's signature rules. `signers` and `threshold` are a
/// bounded, public declaration of the co-operative's expected configuration
/// for indexers and auditors; changes to the Stellar account must be reflected
/// by registering a new account.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CoopProfile {
    /// Shared Stellar account whose configured multisig policy authorizes use.
    pub multisig_account: Address,
    /// Publicly declared co-operative signers, limited to `MAX_COOP_SIGNERS`.
    pub signers: Vec<Address>,
    /// Number of declared signers required by the co-operative policy.
    pub threshold: u32,
    pub registered_at: u64,
}
/// Land tenure verification record storing hash of legal land title and validation signatures.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LandTenureVerification {
    pub title_id: BytesN<32>,
    pub land_title_hash: BytesN<32>,
    pub farmer_id: Address,
    pub validator_signature: Bytes,
    pub verified_at: u64,
    pub is_verified: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

/// Errors specific to co-operative multisig registration.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    /// A co-operative record already exists for this shared account.
    CoopAlreadyRegistered = 1,
    /// A co-operative must declare between two and `MAX_COOP_SIGNERS` signers.
    InvalidCoopSignerCount = 2,
    /// The threshold must be non-zero and no larger than the signer count.
    InvalidCoopThreshold = 3,
    /// Each declared signer must occur only once.
    DuplicateCoopSigner = 4,
    /// The shared multisig account cannot also be a declared signer.
    MultisigAccountCannotBeSigner = 5,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FarmerRegistry;

#[contractimpl]
impl FarmerRegistry {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// One-time initialisation — stores the admin address and admin-controls address.
    pub fn initialize(env: Env, admin: Address, admin_controls: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("ADMC"), &admin_controls);
    }

    // ── Validator management (admin-only) ─────────────────────────────────────

    /// Register `validator` as an authorised read/write validator.
    ///
    /// Only the contract admin may call this.
    /// Emits `(ValidReg, validator)`.
    pub fn register_validator(env: Env, admin: Address, validator: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = Self::validator_key(&env, &validator);
        env.storage().instance().set(&key, &true);

        env.events().publish(
            (symbol_short!("ValidReg"), validator.clone()),
            env.ledger().timestamp(),
        );
    }

    /// Revoke a previously-registered validator.
    ///
    /// Only the contract admin may call this.
    /// Emits `(ValidRev, validator)`.
    pub fn revoke_validator(env: Env, admin: Address, validator: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = Self::validator_key(&env, &validator);
        env.storage().instance().remove(&key);

        env.events().publish(
            (symbol_short!("ValidRev"), validator.clone()),
            env.ledger().timestamp(),
        );
    }

    /// Returns `true` if `validator` is currently registered.
    pub fn is_validator(env: Env, validator: Address) -> bool {
        Self::_is_validator(&env, &validator)
    }

    // ── Emergency Freeze Authority (admin-only) ───────────────────────────────

    /// Freeze a compromised farmer address pending audit.
    ///
    /// Only the contract admin may call this.
    /// Emits `(Frozen, wallet_address, true)`.
    pub fn freeze_farmer(env: Env, admin: Address, wallet_address: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = Self::frozen_key(&env, &wallet_address);
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, 518400, 1036800);

        env.events()
            .publish((symbol_short!("Frozen"), wallet_address.clone()), true);
    }

    /// Unfreeze a farmer address.
    ///
    /// Only the contract admin may call this.
    /// Emits `(Frozen, wallet_address, false)`.
    pub fn unfreeze_farmer(env: Env, admin: Address, wallet_address: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = Self::frozen_key(&env, &wallet_address);
        env.storage().persistent().remove(&key);

        env.events()
            .publish((symbol_short!("Frozen"), wallet_address.clone()), false);
    }

    /// Returns `true` if `wallet_address` is frozen.
    pub fn is_frozen(env: Env, wallet_address: Address) -> bool {
        Self::_is_frozen(&env, &wallet_address)
    }

    // ── Write operations (validator-gated) ───────────────────────────────────

    /// Register a new farmer.
    ///
    /// # Access
    /// The farmer's wallet must sign the transaction **and** the `validator`
    /// must be a registered validator.  Both `require_auth` and the validator
    /// check are enforced.
    ///
    /// # SHA-256 integrity
    /// `land_doc_hash` must equal `SHA-256(doc_preimage)`.  The contract
    /// re-hashes `doc_preimage` with `env.crypto().sha256()` and panics with
    /// `HashMismatch` if the digests differ.  `doc_preimage` is the raw bytes
    /// of the encrypted document; it is **not** stored on-chain.
    ///
    /// # Errors
    /// - `NotValidator`           — `validator` is not registered
    /// - `FarmerAlreadyRegistered` — farmer's wallet is already in the registry
    /// - `InvalidRegion`          — `region_geohash` has no valid `s0`–`s8` prefix
    /// - `HashMismatch`           — SHA-256(`doc_preimage`) ≠ `land_doc_hash`
    pub fn register_farmer(
        env: Env,
        validator: Address,
        wallet_address: Address,
        land_doc_hash: BytesN<32>,
        doc_preimage: Bytes,
        region_geohash: String,
    ) -> FarmerProfile {
        Self::assert_not_paused(&env);
        validator.require_auth();
        wallet_address.require_auth();

        Self::require_validator(&env, &validator);
        Self::assert_valid_region(&env, &region_geohash);
        Self::assert_sha256_integrity(&env, &doc_preimage, &land_doc_hash);

        let key = Self::farmer_key(&env, &wallet_address);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, FarmerError::FarmerAlreadyRegistered);
        }

        let profile = FarmerProfile {
            wallet_address: wallet_address.clone(),
            land_doc_hash: land_doc_hash.clone(),
            region_geohash,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &profile);

        // Store initial history entry at version 0
        let version: u32 = 0;
        env.storage().persistent().set(
            &Self::history_key(&env, &wallet_address, version),
            &ProfileHistoryEntry {
                version,
                profile: profile.clone(),
                updated_at: env.ledger().timestamp(),
            },
        );
        env.storage()
            .persistent()
            .set(&Self::version_counter_key(&env, &wallet_address), &version);

        env.events().publish(
            (symbol_short!("FarmerReg"), wallet_address.clone()),
            land_doc_hash,
        );

        profile
    }

    /// Update an existing farmer's profile.
    ///
    /// # Access
    /// The farmer's wallet must sign **and** the `validator` must be registered.
    ///
    /// # SHA-256 integrity
    /// Same pre-image check as `register_farmer`.
    ///
    /// # Errors
    /// - `NotValidator`       — `validator` is not registered
    /// - `FarmerNotRegistered` — no profile exists for `wallet_address`
    /// - `InvalidRegion`      — invalid region prefix
    /// - `HashMismatch`       — digest mismatch
    pub fn update_profile(
        env: Env,
        validator: Address,
        wallet_address: Address,
        new_land_doc_hash: BytesN<32>,
        new_doc_preimage: Bytes,
        new_region_geohash: String,
    ) -> FarmerProfile {
        Self::assert_not_paused(&env);
        validator.require_auth();
        wallet_address.require_auth();
        Self::assert_not_frozen(&env, &wallet_address);

        Self::require_validator(&env, &validator);
        Self::assert_valid_region(&env, &new_region_geohash);
        Self::assert_sha256_integrity(&env, &new_doc_preimage, &new_land_doc_hash);

        let key = Self::farmer_key(&env, &wallet_address);
        let old_profile: FarmerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerError::FarmerNotRegistered));

        // Increment version counter and archive previous profile
        let version_key = Self::version_counter_key(&env, &wallet_address);
        let old_version: u32 = env.storage().persistent().get(&version_key).unwrap_or(0u32);
        let new_version = old_version.checked_add(1).expect("version overflow");
        env.storage().persistent().set(&version_key, &new_version);

        env.storage().persistent().set(
            &Self::history_key(&env, &wallet_address, old_version),
            &ProfileHistoryEntry {
                version: old_version,
                profile: old_profile.clone(),
                updated_at: env.ledger().timestamp(),
            },
        );

        let new_profile = FarmerProfile {
            wallet_address: wallet_address.clone(),
            land_doc_hash: new_land_doc_hash.clone(),
            region_geohash: new_region_geohash,
            registered_at: old_profile.registered_at,
        };

        env.storage().persistent().set(&key, &new_profile);

        env.events().publish(
            (symbol_short!("ProfUpd"), wallet_address.clone()),
            (old_profile.land_doc_hash, new_land_doc_hash, new_version),
        );

        new_profile
    }

    // ── Co-operative multisig accounts ───────────────────────────────────────

    /// Register a farming co-operative's shared multisig account.
    ///
    /// The registered `validator` and the `multisig_account` must both
    /// authorize the invocation. The latter authorization is evaluated by the
    /// Stellar/Soroban authorization system, which enforces the account's real
    /// multisig threshold. This contract stores no signing material.
    ///
    /// `signers` and `threshold` are validated, bounded public metadata for
    /// auditors and indexers. They are not a replacement for the multisig
    /// configuration held by the shared Stellar account.
    ///
    /// # Errors
    /// - `NotValidator` — `validator` is not registered
    /// - `CoopAlreadyRegistered` — the shared account is already registered
    /// - `InvalidCoopSignerCount` — fewer than two or more than twenty signers
    /// - `InvalidCoopThreshold` — threshold is zero or exceeds signer count
    /// - `DuplicateCoopSigner` — a signer occurs more than once
    /// - `MultisigAccountCannotBeSigner` — account appears in its signer list
    pub fn register_coop(
        env: Env,
        validator: Address,
        multisig_account: Address,
        signers: Vec<Address>,
        threshold: u32,
    ) -> CoopProfile {
        Self::assert_not_paused(&env);
        validator.require_auth();
        // This is the critical authorization: for a Stellar multisig account,
        // the host verifies the account's configured signer weights/threshold.
        multisig_account.require_auth();
        Self::require_validator(&env, &validator);
        Self::assert_not_frozen(&env, &multisig_account);
        Self::assert_valid_coop_policy(&env, &multisig_account, &signers, threshold);

        let key = Self::coop_key(&env, &multisig_account);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::CoopAlreadyRegistered);
        }

        let profile = CoopProfile {
            multisig_account: multisig_account.clone(),
            signers,
            threshold,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &profile);
        Self::extend_coop_ttl(&env, &key);

        env.events().publish(
            (symbol_short!("CoopReg"), multisig_account),
            (profile.threshold, profile.registered_at),
        );

        profile
    }

    // ── Read operations ───────────────────────────────────────────────────────

    /// Return a co-operative multisig record, if the shared account is registered.
    ///
    /// This read exposes only the co-operative's public account policy metadata.
    pub fn get_coop(env: Env, multisig_account: Address) -> Option<CoopProfile> {
        env.storage()
            .persistent()
            .get(&Self::coop_key(&env, &multisig_account))
    }

    /// Return `true` when `multisig_account` is registered as a co-operative.
    pub fn is_coop(env: Env, multisig_account: Address) -> bool {
        env.storage()
            .persistent()
            .has(&Self::coop_key(&env, &multisig_account))
    }

    /// Public read — returns a privacy-safe view (hash + region, no wallet).
    ///
    /// Available to anyone; does not expose the wallet address or any PII.
    pub fn get_farmer(env: Env, wallet_address: Address) -> Option<PublicFarmerView> {
        env.storage()
            .persistent()
            .get::<_, FarmerProfile>(&Self::farmer_key(&env, &wallet_address))
            .map(|p| PublicFarmerView {
                land_doc_hash: p.land_doc_hash,
                region_geohash: p.region_geohash,
                registered_at: p.registered_at,
            })
    }

    /// Validator-gated read — returns the full profile including wallet address.
    ///
    /// # Access
    /// `validator` must be a registered validator and must sign the call.
    ///
    /// # Errors
    /// - `NotValidator`       — caller is not a registered validator
    /// - `FarmerNotRegistered` — no profile found for `wallet_address`
    pub fn get_farmer_verified(
        env: Env,
        validator: Address,
        wallet_address: Address,
    ) -> FarmerProfile {
        validator.require_auth();
        Self::require_validator(&env, &validator);

        env.storage()
            .persistent()
            .get(&Self::farmer_key(&env, &wallet_address))
            .unwrap_or_else(|| panic_with_error!(&env, FarmerError::FarmerNotRegistered))
    }

    /// Returns a specific history entry for a farmer by version number.
    ///
    /// # Access
    /// `validator` must be a registered validator.
    pub fn get_profile_history(
        env: Env,
        validator: Address,
        wallet_address: Address,
        version: u32,
    ) -> Option<ProfileHistoryEntry> {
        validator.require_auth();
        Self::require_validator(&env, &validator);

        env.storage()
            .persistent()
            .get(&Self::history_key(&env, &wallet_address, version))
    }

    /// Returns the current version counter for a farmer (public).
    pub fn get_version(env: Env, wallet_address: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&Self::version_counter_key(&env, &wallet_address))
            .unwrap_or(0u32)
    }

    /// Returns `true` if a profile exists for `wallet_address` (public).
    pub fn is_registered(env: Env, wallet_address: Address) -> bool {
        env.storage()
            .persistent()
            .has(&Self::farmer_key(&env, &wallet_address))
    }

    // ── Availability toggle (farmer-only, unchanged) ──────────────────────────

    /// Toggle farmer availability — farmers can pause accepting new jobs
    /// without being removed from the registry.
    ///
    /// Only the farmer's own wallet may call this.
    pub fn set_available(env: Env, wallet_address: Address, available: bool) {
        Self::assert_not_paused(&env);
        wallet_address.require_auth();
        Self::assert_not_frozen(&env, &wallet_address);

        if !env
            .storage()
            .persistent()
            .has(&Self::farmer_key(&env, &wallet_address))
        {
            panic_with_error!(&env, FarmerError::FarmerNotRegistered);
        }

        let key = Self::availability_key(&env, &wallet_address);
        env.storage().persistent().set(&key, &available);

        env.events().publish(
            (symbol_short!("AvailSet"), wallet_address.clone()),
            available,
        );
    }

    /// Returns `true` if the farmer is currently accepting jobs.
    /// Defaults to `true` — availability is opt-out.
    pub fn is_available(env: Env, wallet_address: Address) -> bool {
        env.storage()
            .persistent()
            .get(&Self::availability_key(&env, &wallet_address))
            .unwrap_or(true)
    }

    // ── Farm Plots ────────────────────────────────────────────────────────────

    /// Register a new geographical farm plot.
    ///
    /// # Access
    /// The farmer's wallet must sign the transaction (`farmer.require_auth()`).
    ///
    /// # Errors
    /// - `InvalidCoordinatesCount` — must have between 3 and 50 coordinates.
    /// - `PlotAlreadyExists` — `plot_id` already registered.
    pub fn register_plot(
        env: Env,
        farmer: Address,
        plot_id: BytesN<32>,
        coordinates: soroban_sdk::Vec<(i64, i64)>,
        area_sqm: u64,
    ) {
        farmer.require_auth();
        Self::assert_not_frozen(&env, &farmer);

        let len = coordinates.len();
        if len < 3 || len > 50 {
            panic_with_error!(&env, FarmerError::InvalidCoordinatesCount);
        }

        let plot_key = Self::plot_key(&env, &plot_id);
        if env.storage().persistent().has(&plot_key) {
            panic_with_error!(&env, FarmerError::PlotAlreadyExists);
        }

        let plot = FarmPlot {
            plot_id: plot_id.clone(),
            farmer_id: farmer.clone(),
            coordinates,
            area_sqm,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&plot_key, &plot);

        let farmer_plots_key = Self::farmer_plots_key(&env, &farmer);
        let mut farmer_plots: soroban_sdk::Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&farmer_plots_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        farmer_plots.push_back(plot_id.clone());
        env.storage()
            .persistent()
            .set(&farmer_plots_key, &farmer_plots);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "PlotRegistered"), farmer),
            (plot_id, area_sqm),
        );
    }

    /// Retrieve all farm plots registered by a specific farmer.
    pub fn get_plots_by_farmer(env: Env, farmer_id: Address) -> soroban_sdk::Vec<FarmPlot> {
        let farmer_plots_key = Self::farmer_plots_key(&env, &farmer_id);
        let plot_ids: soroban_sdk::Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&farmer_plots_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        let mut plots = soroban_sdk::Vec::new(&env);
        for i in 0..plot_ids.len() {
            let id = plot_ids.get(i).unwrap();
            if let Some(plot) = env
                .storage()
                .persistent()
                .get::<_, FarmPlot>(&Self::plot_key(&env, &id))
            {
                plots.push_back(plot);
            }
        }
        plots
    }

    /// Register and verify land tenure ownership for a farmer's plot/title.
    ///
    /// # Access
    /// Both `validator` and `farmer` must sign the transaction (`require_auth()`).
    /// `validator` must be a registered validator in the system.
    ///
    /// # Errors
    /// - `NotValidator` — caller is not a registered validator
    /// - `FarmerFrozen` — farmer is frozen
    /// - `LandTenureAlreadyExists` — title_id is already registered
    pub fn verify_land_tenure(
        env: Env,
        validator: Address,
        farmer: Address,
        title_id: BytesN<32>,
        land_title_hash: BytesN<32>,
        validator_signature: Bytes,
    ) -> LandTenureVerification {
        Self::assert_not_paused(&env);
        validator.require_auth();
        farmer.require_auth();

        Self::require_validator(&env, &validator);
        Self::assert_not_frozen(&env, &farmer);

        let tenure_key = Self::land_tenure_key(&env, &title_id);
        if env.storage().persistent().has(&tenure_key) {
            panic_with_error!(&env, FarmerError::LandTenureAlreadyExists);
        }

        let verification = LandTenureVerification {
            title_id: title_id.clone(),
            land_title_hash: land_title_hash.clone(),
            farmer_id: farmer.clone(),
            validator_signature,
            verified_at: env.ledger().timestamp(),
            is_verified: true,
        };

        env.storage().persistent().set(&tenure_key, &verification);
        env.storage().persistent().extend_ttl(&tenure_key, 518400, 1036800);

        let farmer_tenures_key = Self::farmer_tenures_key(&env, &farmer);
        let mut farmer_tenures: soroban_sdk::Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&farmer_tenures_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        farmer_tenures.push_back(title_id.clone());
        env.storage().persistent().set(&farmer_tenures_key, &farmer_tenures);
        env.storage().persistent().extend_ttl(&farmer_tenures_key, 518400, 1036800);

        env.events().publish(
            (symbol_short!("LandTen"), farmer),
            (title_id, land_title_hash),
        );

        verification
    }

    /// Retrieve a land tenure verification record by title ID.
    pub fn get_land_tenure(env: Env, title_id: BytesN<32>) -> Option<LandTenureVerification> {
        let tenure_key = Self::land_tenure_key(&env, &title_id);
        env.storage().persistent().get(&tenure_key)
    }

    /// Retrieve all verified land tenures for a specific farmer.
    pub fn get_farmer_land_tenures(env: Env, farmer: Address) -> soroban_sdk::Vec<LandTenureVerification> {
        let farmer_tenures_key = Self::farmer_tenures_key(&env, &farmer);
        let title_ids: soroban_sdk::Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&farmer_tenures_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        let mut tenures = soroban_sdk::Vec::new(&env);
        for i in 0..title_ids.len() {
            let id = title_ids.get(i).unwrap();
            if let Some(tenure) = env.storage().persistent().get::<_, LandTenureVerification>(&Self::land_tenure_key(&env, &id)) {
                tenures.push_back(tenure);
            }
        }
        tenures
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMC"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let admin_controls_addr = Self::admin_controls(env);
        let admin_controls_client = AdminControlsClient::new(env, &admin_controls_addr);
        admin_controls_client.assert_not_paused();
    }

    fn require_validator(env: &Env, caller: &Address) {
        if !Self::_is_validator(env, caller) {
            panic_with_error!(env, FarmerError::NotValidator);
        }
    }

    fn assert_not_frozen(env: &Env, wallet: &Address) {
        if Self::_is_frozen(env, wallet) {
            panic_with_error!(env, FarmerError::FarmerFrozen);
        }
    }

    fn _is_frozen(env: &Env, wallet: &Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&Self::frozen_key(env, wallet))
            .unwrap_or(false)
    }

    fn _is_validator(env: &Env, addr: &Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&Self::validator_key(env, addr))
            .unwrap_or(false)
    }

    /// SHA-256 integrity gate.
    ///
    /// Re-hashes `preimage` with the host's crypto primitive and asserts the
    /// result equals `expected_hash`.  Panics with `HashMismatch` on failure.
    fn assert_sha256_integrity(env: &Env, preimage: &Bytes, expected_hash: &BytesN<32>) {
        let computed: BytesN<32> = env.crypto().sha256(preimage).into();
        if computed != *expected_hash {
            panic_with_error!(env, FarmerError::HashMismatch);
        }
    }

    /// Northern Nigeria geohash validation (2-char prefixes s0–s8).
    fn assert_valid_region(env: &Env, region: &String) {
        const VALID: [&str; 9] = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
        for prefix in VALID {
            if *region == String::from_str(env, prefix) {
                return;
            }
        }
        panic_with_error!(env, FarmerError::InvalidRegion);
    }

    /// Validate the bounded, public declaration accompanying a co-op account.
    fn assert_valid_coop_policy(
        env: &Env,
        multisig_account: &Address,
        signers: &Vec<Address>,
        threshold: u32,
    ) {
        let signer_count = signers.len();
        if !(2..=MAX_COOP_SIGNERS).contains(&signer_count) {
            panic_with_error!(env, Error::InvalidCoopSignerCount);
        }
        if threshold == 0 || threshold > signer_count {
            panic_with_error!(env, Error::InvalidCoopThreshold);
        }

        for i in 0..signer_count {
            let signer = signers.get(i).unwrap();
            if signer == *multisig_account {
                panic_with_error!(env, Error::MultisigAccountCannotBeSigner);
            }
            for j in (i + 1)..signer_count {
                if signer == signers.get(j).unwrap() {
                    panic_with_error!(env, Error::DuplicateCoopSigner);
                }
            }
        }
    }

    fn extend_coop_ttl(env: &Env, key: &soroban_sdk::Val) {
        env.storage()
            .persistent()
            .extend_ttl(key, COOP_TTL_THRESHOLD, COOP_TTL_EXTEND_TO);
    }

    fn farmer_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("FARMER"), wallet.clone()).into_val(env)
    }

    fn coop_key(env: &Env, multisig_account: &Address) -> soroban_sdk::Val {
        (symbol_short!("COOP"), multisig_account.clone()).into_val(env)
    }

    fn validator_key(env: &Env, addr: &Address) -> soroban_sdk::Val {
        (symbol_short!("VALID"), addr.clone()).into_val(env)
    }

    fn frozen_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("FROZEN"), wallet.clone()).into_val(env)
    }

    fn version_counter_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("VER"), wallet.clone()).into_val(env)
    }

    fn history_key(env: &Env, wallet: &Address, version: u32) -> soroban_sdk::Val {
        (symbol_short!("HIST"), wallet.clone(), version).into_val(env)
    }

    fn availability_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("AVAIL"), wallet.clone()).into_val(env)
    }

    fn plot_key(env: &Env, plot_id: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("PLOT"), plot_id.clone()).into_val(env)
    }

    fn farmer_plots_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("FPLOTS"), farmer.clone()).into_val(env)
    }

    fn land_tenure_key(env: &Env, title_id: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("TENURE"), title_id.clone()).into_val(env)
    }

    fn farmer_tenures_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("FTENURE"), farmer.clone()).into_val(env)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, String};

    // ── helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, FarmerRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy admin-controls contract
        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client =
            admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, FarmerRegistry);
        let client = FarmerRegistryClient::new(&env, &contract_id);

        let validator = Address::generate(&env);

        client.initialize(&admin, &admin_controls_id);
        client.register_validator(&admin, &validator);

        (env, admin, validator, client)
    }

    /// Build a deterministic SHA-256 pre-image and its digest from a seed byte.
    fn doc(env: &Env, seed: u8) -> (Bytes, BytesN<32>) {
        // Use 64 bytes so the hash is non-trivial to eyeball
        let mut raw = [0u8; 64];
        raw[0] = seed;
        raw[63] = seed.wrapping_add(1);
        let preimage = Bytes::from_slice(env, &raw);
        let hash: BytesN<32> = env.crypto().sha256(&preimage).into();
        (preimage, hash)
    }

    fn region(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    fn coop_signers(env: &Env) -> soroban_sdk::Vec<Address> {
        let mut signers = soroban_sdk::Vec::new(env);
        signers.push_back(Address::generate(env));
        signers.push_back(Address::generate(env));
        signers.push_back(Address::generate(env));
        signers
    }

    // ── validator management ──────────────────────────────────────────────────

    #[test]
    fn test_register_and_is_validator() {
        let (env, admin, _, client) = setup();
        let new_val = Address::generate(&env);

        assert!(!client.is_validator(&new_val));
        client.register_validator(&admin, &new_val);
        assert!(client.is_validator(&new_val));
    }

    #[test]
    fn test_revoke_validator() {
        let (_env, admin, validator, client) = setup();

        assert!(client.is_validator(&validator));
        client.revoke_validator(&admin, &validator);
        assert!(!client.is_validator(&validator));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_register_validator_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let target = Address::generate(&env);

        client.register_validator(&attacker, &target);
    }

    // ── registration ─────────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get_public_view() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &hash, &preimage, &region(&env, "s1"));

        assert!(client.is_registered(&farmer));

        let view = client.get_farmer(&farmer).unwrap();
        assert_eq!(view.land_doc_hash, hash);
        assert_eq!(view.region_geohash, region(&env, "s1"));
    }

    #[test]
    fn test_get_farmer_verified_returns_full_profile() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 2);

        client.register_farmer(&validator, &farmer, &hash, &preimage, &region(&env, "s2"));

        let full = client.get_farmer_verified(&validator, &farmer);
        assert_eq!(full.wallet_address, farmer);
        assert_eq!(full.land_doc_hash, hash);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_get_farmer_verified_non_validator_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 3);

        client.register_farmer(&validator, &farmer, &hash, &preimage, &region(&env, "s1"));

        let attacker = Address::generate(&env);
        client.get_farmer_verified(&attacker, &farmer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_registration_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);
        let (p2, h2) = doc(&env, 2);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.register_farmer(&validator, &farmer, &h2, &p2, &region(&env, "s2"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_invalid_region_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &hash, &preimage, &region(&env, "e7"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_register_farmer_non_validator_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 1);

        client.register_farmer(&attacker, &farmer, &hash, &preimage, &region(&env, "s1"));
    }

    // ── Co-operative multisig accounts ───────────────────────────────────────

    #[test]
    fn test_register_and_get_coop_multisig_account() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let signers = coop_signers(&env);

        let profile = client.register_coop(&validator, &shared_account, &signers, &2);

        assert_eq!(profile.multisig_account, shared_account);
        assert_eq!(profile.signers, signers);
        assert_eq!(profile.threshold, 2);
        assert!(client.is_coop(&shared_account));
        assert_eq!(client.get_coop(&shared_account), Some(profile));
    }

    #[test]
    fn test_coop_and_individual_farmer_records_are_independent() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let signers = coop_signers(&env);
        let (preimage, hash) = doc(&env, 21);

        client.register_coop(&validator, &shared_account, &signers, &2);
        client.register_farmer(
            &validator,
            &shared_account,
            &hash,
            &preimage,
            &region(&env, "s1"),
        );

        assert!(client.is_coop(&shared_account));
        assert!(client.is_registered(&shared_account));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_duplicate_coop_registration_rejected() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let signers = coop_signers(&env);

        client.register_coop(&validator, &shared_account, &signers, &2);
        client.register_coop(&validator, &shared_account, &signers, &2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_coop_requires_at_least_two_signers() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let mut signers = soroban_sdk::Vec::new(&env);
        signers.push_back(Address::generate(&env));

        client.register_coop(&validator, &shared_account, &signers, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_coop_rejects_zero_or_excessive_threshold() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let signers = coop_signers(&env);

        client.register_coop(&validator, &shared_account, &signers, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_coop_rejects_duplicate_signers() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let duplicate = Address::generate(&env);
        let mut signers = soroban_sdk::Vec::new(&env);
        signers.push_back(duplicate.clone());
        signers.push_back(duplicate);

        client.register_coop(&validator, &shared_account, &signers, &2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_coop_rejects_shared_account_in_signer_list() {
        let (env, _, validator, client) = setup();
        let shared_account = Address::generate(&env);
        let mut signers = soroban_sdk::Vec::new(&env);
        signers.push_back(shared_account.clone());
        signers.push_back(Address::generate(&env));

        client.register_coop(&validator, &shared_account, &signers, &2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_coop_registration_requires_registered_validator() {
        let (env, _, _, client) = setup();
        let unregistered_validator = Address::generate(&env);
        let shared_account = Address::generate(&env);

        client.register_coop(
            &unregistered_validator,
            &shared_account,
            &coop_signers(&env),
            &2,
        );
    }

    // ── SHA-256 integrity ─────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_hash_mismatch_on_register_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, _real_hash) = doc(&env, 1);
        // Supply a hash that does NOT match the preimage
        let wrong_hash = BytesN::from_array(&env, &[0xdeu8; 32]);

        client.register_farmer(
            &validator,
            &farmer,
            &wrong_hash,
            &preimage,
            &region(&env, "s1"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_hash_mismatch_on_update_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));

        let (p2, _real_h2) = doc(&env, 2);
        let wrong_hash = BytesN::from_array(&env, &[0xadu8; 32]);

        client.update_profile(&validator, &farmer, &wrong_hash, &p2, &region(&env, "s2"));
    }

    #[test]
    fn test_valid_hash_accepted() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 5);

        // Should not panic
        client.register_farmer(&validator, &farmer, &hash, &preimage, &region(&env, "s5"));
        assert!(client.is_registered(&farmer));
    }

    // ── update_profile ────────────────────────────────────────────────────────

    #[test]
    fn test_update_profile_changes_current_data() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);
        let (p2, h2) = doc(&env, 2);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.update_profile(&validator, &farmer, &h2, &p2, &region(&env, "s2"));

        let view = client.get_farmer(&farmer).unwrap();
        assert_eq!(view.land_doc_hash, h2);
        assert_eq!(view.region_geohash, region(&env, "s2"));
    }

    #[test]
    fn test_update_profile_increments_version() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);
        let (p2, h2) = doc(&env, 2);
        let (p3, h3) = doc(&env, 3);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        assert_eq!(client.get_version(&farmer), 0);

        client.update_profile(&validator, &farmer, &h2, &p2, &region(&env, "s2"));
        assert_eq!(client.get_version(&farmer), 1);

        client.update_profile(&validator, &farmer, &h3, &p3, &region(&env, "s3"));
        assert_eq!(client.get_version(&farmer), 2);
    }

    #[test]
    fn test_profile_history_accessible_to_validator() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);
        let (p2, h2) = doc(&env, 2);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.update_profile(&validator, &farmer, &h2, &p2, &region(&env, "s2"));

        let h = client
            .get_profile_history(&validator, &farmer, &0u32)
            .unwrap();
        assert_eq!(h.version, 0u32);
        assert_eq!(h.profile.land_doc_hash, h1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_profile_history_non_validator_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));

        let attacker = Address::generate(&env);
        client.get_profile_history(&attacker, &farmer, &0u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_update_profile_unregistered_farmer_rejected() {
        let (env, _, validator, client) = setup();
        let stranger = Address::generate(&env);
        let (p, h) = doc(&env, 1);

        client.update_profile(&validator, &stranger, &h, &p, &region(&env, "s1"));
    }

    // ── availability ──────────────────────────────────────────────────────────

    #[test]
    fn test_default_availability_is_true() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p, h) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h, &p, &region(&env, "s1"));
        assert!(client.is_available(&farmer));
    }

    #[test]
    fn test_set_available_false() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p, h) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h, &p, &region(&env, "s1"));
        client.set_available(&farmer, &false);
        assert!(!client.is_available(&farmer));
    }

    #[test]
    fn test_set_available_true_resumes() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p, h) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h, &p, &region(&env, "s1"));
        client.set_available(&farmer, &false);
        client.set_available(&farmer, &true);
        assert!(client.is_available(&farmer));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_set_available_unregistered_panics() {
        let (env, _, _, client) = setup();
        let stranger = Address::generate(&env);
        client.set_available(&stranger, &false);
    }

    #[test]
    fn test_multiple_farmers_independent_availability() {
        let (env, _, validator, client) = setup();
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);
        let (pa, ha) = doc(&env, 1);
        let (pb, hb) = doc(&env, 2);

        client.register_farmer(&validator, &farmer_a, &ha, &pa, &region(&env, "s1"));
        client.register_farmer(&validator, &farmer_b, &hb, &pb, &region(&env, "s2"));

        client.set_available(&farmer_a, &false);
        assert!(!client.is_available(&farmer_a));
        assert!(client.is_available(&farmer_b));
    }

    // ── all valid regions ─────────────────────────────────────────────────────

    #[test]
    fn test_all_valid_regions_accepted() {
        let (env, _, validator, client) = setup();
        let prefixes = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

        for (i, prefix) in prefixes.iter().enumerate() {
            let farmer = Address::generate(&env);
            let (p, h) = doc(&env, i as u8);
            client.register_farmer(&validator, &farmer, &h, &p, &region(&env, prefix));
            assert!(client.is_registered(&farmer));
        }
    }

    // ── farm plots ────────────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get_plots() {
        let (env, _, _, client) = setup();
        let farmer = Address::generate(&env);
        let plot_id = BytesN::from_array(&env, &[1u8; 32]);

        let mut coords = soroban_sdk::Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));
        coords.push_back((1000001, 2000000));

        client.register_plot(&farmer, &plot_id, &coords, &1000);

        let plots = client.get_plots_by_farmer(&farmer);
        assert_eq!(plots.len(), 1);

        let plot = plots.get(0).unwrap();
        assert_eq!(plot.plot_id, plot_id);
        assert_eq!(plot.farmer_id, farmer);
        assert_eq!(plot.area_sqm, 1000);
        assert_eq!(plot.coordinates.len(), 3);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_invalid_coordinates_count_low() {
        let (env, _, _, client) = setup();
        let farmer = Address::generate(&env);
        let plot_id = BytesN::from_array(&env, &[2u8; 32]);

        let mut coords = soroban_sdk::Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));

        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_invalid_coordinates_count_high() {
        let (env, _, _, client) = setup();
        let farmer = Address::generate(&env);
        let plot_id = BytesN::from_array(&env, &[3u8; 32]);

        let mut coords = soroban_sdk::Vec::new(&env);
        for i in 0..51 {
            coords.push_back((i as i64, i as i64));
        }

        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_duplicate_plot_id() {
        let (env, _, _, client) = setup();
        let farmer = Address::generate(&env);
        let plot_id = BytesN::from_array(&env, &[4u8; 32]);

        let mut coords = soroban_sdk::Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));
        coords.push_back((1000001, 2000000));

        client.register_plot(&farmer, &plot_id, &coords, &1000);
        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    // ── Emergency Freeze Authority ───────────────────────────────────────────

    #[test]
    fn test_freeze_and_unfreeze() {
        let (env, admin, _, client) = setup();
        let farmer = Address::generate(&env);

        assert!(!client.is_frozen(&farmer));

        client.freeze_farmer(&admin, &farmer);
        assert!(client.is_frozen(&farmer));

        client.unfreeze_farmer(&admin, &farmer);
        assert!(!client.is_frozen(&farmer));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_freeze_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.freeze_farmer(&attacker, &farmer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_frozen_farmer_cannot_update_profile() {
        let (env, admin, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.freeze_farmer(&admin, &farmer);

        let (p2, h2) = doc(&env, 2);
        client.update_profile(&validator, &farmer, &h2, &p2, &region(&env, "s2"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_frozen_farmer_cannot_set_available() {
        let (env, admin, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.freeze_farmer(&admin, &farmer);

        client.set_available(&farmer, &false);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_frozen_farmer_cannot_register_plot() {
        let (env, admin, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (p1, h1) = doc(&env, 1);

        client.register_farmer(&validator, &farmer, &h1, &p1, &region(&env, "s1"));
        client.freeze_farmer(&admin, &farmer);

        let plot_id = BytesN::from_array(&env, &[5u8; 32]);
        let mut coords = soroban_sdk::Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));
        coords.push_back((1000001, 2000000));

        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    // ── Land Tenure Verification Tests ─────────────────────────────────────────

    #[test]
    fn test_verify_land_tenure_success() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let title_id = BytesN::from_array(&env, &[10u8; 32]);
        let land_title_hash = BytesN::from_array(&env, &[20u8; 32]);
        let signature = Bytes::from_array(&env, &[1, 2, 3, 4]);

        let verification = client.verify_land_tenure(&validator, &farmer, &title_id, &land_title_hash, &signature);
        assert!(verification.is_verified);
        assert_eq!(verification.farmer_id, farmer);
        assert_eq!(verification.land_title_hash, land_title_hash);

        let retrieved = client.get_land_tenure(&title_id).unwrap();
        assert_eq!(retrieved.title_id, title_id);

        let farmer_tenures = client.get_farmer_land_tenures(&farmer);
        assert_eq!(farmer_tenures.len(), 1);
    }
}
