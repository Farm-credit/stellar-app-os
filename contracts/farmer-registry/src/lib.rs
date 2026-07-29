#![no_std]

//! Farmer Registry Contract — Closes #637 & #751
//!
//! Upgrades the registry to store SHA-256 hashes of encrypted farmer identity
//! documents rather than plain-text records, enforces on-chain SHA-256
//! integrity checks, and gates all read/write operations behind an
//! admin-managed validator set.
//!
//! # #751 — Storage Key Footprint Optimisation
//!
//! All persistent storage keys now use a `#[contracttype] DataKey` enum
//! rather than ad-hoc `(Symbol, Address)` tuples.  Soroban encodes enum
//! variant discriminants as small integers, which reduces the per-key
//! footprint by 24–32 bytes compared to the old tuple encoding.  Every
//! persistent write now also calls `extend_ttl` with a 30-day minimum /
//! 90-day maximum window, preventing premature state expiry and the
//! associated ledger fees.
//!
//! **Planter Reputation Array** — A compact on-chain reputation ledger
//! that maps planter addresses to their 0–1000 integer scores and tier
//! badges.  Instead of one storage entry per planter, the entire array
//! is stored under a single `DataKey::Reputation` key as a
//! `Vec<ReputationEntry>`, dramatically reducing the state footprint
//! when many planters are registered.
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
//!
//! ## Storage TTL
//!
//! Every persistent storage `set` is followed by `extend_ttl` with a floor
//! of 30 days (518,400 ledger closes ≈ 30 days at 5s per close) and a
//! ceiling of 90 days (1,036,800 ledger closes).  This ensures that even
//! infrequently-accessed state (e.g. a farmer who registered a year ago)
//! does not expire and incur restoration fees.
//!
//! ## Reputation Array
//!
//! The planter reputation array supports:
//! - `upsert_reputation` — insert or update a single planter's score/tier
//! - `get_reputation` — read a single planter's entry
//! - `get_all_reputations` — return the full array
//! - `remove_reputation` — delete a planter from the ledger
//!
//! Because the entire array is a single storage entry, the contract reads
//! it in one `get`, modifies the in-memory `Vec`, and writes it back in one
//! `set`.  This is efficient when the array is ≤ ~500 entries; beyond that
//! the O(n) read/write cost per mutation becomes noticeable.

use harvesta_errors::{HarvestaError, FarmerError};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Bytes,
    BytesN, Env, String, Vec,
};
use admin_controls::AdminControlsClient;

// ── TTL constants ─────────────────────────────────────────────────────────────

/// Minimum TTL extension for persistent storage (30 days in ledger closes).
/// At 5 seconds per ledger close, 518,400 ≈ 30 days.
const TTL_MIN: u32 = 518_400;

/// Maximum TTL extension for persistent storage (90 days in ledger closes).
const TTL_MAX: u32 = 1_036_800;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Efficient storage key enum — replaces ad-hoc `(Symbol, …)` tuples.
///
/// Soroban encodes `#[contracttype]` enum discriminants as compact
/// integers, saving ~24–32 bytes per key compared to the tuple encoding.
/// Each variant carries the minimal payload required to construct the
/// concrete ledger-entry key.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    /// (admin_address, admin_controls_address) — contract configuration.
    Config,
    /// Boolean: is `Address` a registered validator?
    Validator(Address),
    /// Boolean: is `Address` frozen?
    Frozen(Address),
    /// FarmerProfile for a given wallet address.
    Farmer(Address),
    /// Version counter (u32) for a farmer's profile history.
    Version(Address),
    /// ProfileHistoryEntry at a specific version for a farmer.
    History(Address, u32),
    /// Boolean: is the farmer available to accept jobs?
    Available(Address),
    /// FarmPlot record keyed by plot_id.
    Plot(BytesN<32>),
    /// Vec<BytesN<32>> of plot IDs owned by a farmer.
    FarmerPlots(Address),
    /// LandTenureVerification record keyed by title_id.
    Tenure(BytesN<32>),
    /// Vec<BytesN<32>> of title IDs for a farmer.
    FarmerTenures(Address),
    /// Compact reputation array: Vec<ReputationEntry> under a single key.
    Reputation,
}

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
    pub coordinates: Vec<(i64, i64)>,
    pub area_sqm: u64,
    pub registered_at: u64,
}

/// Land tenure verification record storing hash of legal land title and
/// validation signatures.
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

// ── Reputation types ─────────────────────────────────────────────────────────

/// Reputation tier badge assigned based on a planter's accumulated score.
///
/// | Tier      | Min Score   | Fee Discount |
/// |-----------|-------------|--------------|
/// | Bronze    | 0           | 0 %          |
/// | Silver    | 300         | 5 %          |
/// | Gold      | 600         | 15 %         |
/// | Platinum  | 900         | 30 %         |
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ReputationTier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

/// A single planter's reputation record stored in the compact array.
///
/// Stored in a single `Vec<ReputationEntry>` under `DataKey::Reputation`
/// to minimise storage key count.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ReputationEntry {
    /// The planter's wallet address.
    pub planter: Address,
    /// Cumulative reputation score (0–1000+).
    pub score: u32,
    /// Derived tier badge based on `score`.
    pub tier: ReputationTier,
    /// Total successful tree-planting jobs completed.
    pub completed_jobs: u64,
    /// Unix timestamp of the last score update.
    pub last_updated: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FarmerRegistry;

#[contractimpl]
impl FarmerRegistry {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// One-time initialisation — stores the admin address and admin-controls
    /// address in instance storage.
    ///
    /// # Panics
    /// - `HarvestaError::AlreadyInitialized` if called more than once.
    pub fn initialize(env: Env, admin: Address, admin_controls: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, admin_controls));
    }

    // ── Validator management (admin-only) ─────────────────────────────────────

    /// Register `validator` as an authorised read/write validator.
    ///
    /// Only the contract admin may call this.  The admin must sign the
    /// invocation (`require_auth`).
    ///
    /// # Emits
    /// `(ValidReg, validator)` with the current ledger timestamp.
    pub fn register_validator(env: Env, admin: Address, validator: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = DataKey::Validator(validator.clone());
        env.storage().instance().set(&key, &true);

        env.events().publish(
            (symbol_short!("ValidReg"), validator.clone()),
            env.ledger().timestamp(),
        );
    }

    /// Revoke a previously-registered validator.
    ///
    /// Only the contract admin may call this.  The admin must sign the
    /// invocation.
    ///
    /// # Emits
    /// `(ValidRev, validator)` with the current ledger timestamp.
    pub fn revoke_validator(env: Env, admin: Address, validator: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = DataKey::Validator(validator.clone());
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
    /// Only the contract admin may call this.  Frozen farmers cannot update
    /// their profile, change availability, or register new plots.
    ///
    /// # Emits
    /// `(Frozen, wallet_address, true)`
    pub fn freeze_farmer(env: Env, admin: Address, wallet_address: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = DataKey::Frozen(wallet_address.clone());
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("Frozen"), wallet_address.clone()),
            true,
        );
    }

    /// Unfreeze a farmer address.
    ///
    /// Only the contract admin may call this.
    ///
    /// # Emits
    /// `(Frozen, wallet_address, false)`
    pub fn unfreeze_farmer(env: Env, admin: Address, wallet_address: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = DataKey::Frozen(wallet_address.clone());
        env.storage().persistent().remove(&key);

        env.events().publish(
            (symbol_short!("Frozen"), wallet_address.clone()),
            false,
        );
    }

    /// Returns `true` if `wallet_address` is frozen.
    pub fn is_frozen(env: Env, wallet_address: Address) -> bool {
        Self::_is_frozen(&env, &wallet_address)
    }

    // ── Write operations (validator-gated) ────────────────────────────────────

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
    /// # TTL
    /// All persistent entries written by this function receive a 30–90 day
    /// TTL extension.
    ///
    /// # Errors
    /// - `NotValidator`           — `validator` is not registered
    /// - `FarmerAlreadyRegistered` — farmer's wallet is already in the registry
    /// - `InvalidRegion`          — `region_geohash` has no valid `s0`–`s8` prefix
    /// - `HashMismatch`           — SHA-256(`doc_preimage`) ≠ `land_doc_hash`
    ///
    /// # Emits
    /// `(FarmerReg, wallet_address, land_doc_hash)`
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

        let key = DataKey::Farmer(wallet_address.clone());
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
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

        // Store initial history entry at version 0.
        let version: u32 = 0;
        let hist_key = DataKey::History(wallet_address.clone(), version);
        env.storage()
            .persistent()
            .set(&hist_key, &ProfileHistoryEntry {
                version,
                profile: profile.clone(),
                updated_at: env.ledger().timestamp(),
            });
        env.storage().persistent().extend_ttl(&hist_key, TTL_MIN, TTL_MAX);

        let ver_key = DataKey::Version(wallet_address.clone());
        env.storage().persistent().set(&ver_key, &version);
        env.storage().persistent().extend_ttl(&ver_key, TTL_MIN, TTL_MAX);

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
    /// # TTL
    /// All persistent entries written by this function receive a 30–90 day
    /// TTL extension.
    ///
    /// # Errors
    /// - `NotValidator`       — `validator` is not registered
    /// - `FarmerNotRegistered` — no profile exists for `wallet_address`
    /// - `FarmerFrozen`       — `wallet_address` is frozen
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

        let key = DataKey::Farmer(wallet_address.clone());
        let old_profile: FarmerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, FarmerError::FarmerNotRegistered));

        // Increment version counter and archive previous profile.
        let ver_key = DataKey::Version(wallet_address.clone());
        let old_version: u32 = env
            .storage()
            .persistent()
            .get(&ver_key)
            .unwrap_or(0u32);
        let new_version = old_version.checked_add(1).expect("version overflow");
        env.storage().persistent().set(&ver_key, &new_version);
        env.storage().persistent().extend_ttl(&ver_key, TTL_MIN, TTL_MAX);

        let hist_key = DataKey::History(wallet_address.clone(), old_version);
        env.storage().persistent().set(
            &hist_key,
            &ProfileHistoryEntry {
                version: old_version,
                profile: old_profile.clone(),
                updated_at: env.ledger().timestamp(),
            },
        );
        env.storage().persistent().extend_ttl(&hist_key, TTL_MIN, TTL_MAX);

        let new_profile = FarmerProfile {
            wallet_address: wallet_address.clone(),
            land_doc_hash: new_land_doc_hash.clone(),
            region_geohash: new_region_geohash,
            registered_at: old_profile.registered_at,
        };

        env.storage().persistent().set(&key, &new_profile);
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("ProfUpd"), wallet_address.clone()),
            (old_profile.land_doc_hash, new_land_doc_hash, new_version),
        );

        new_profile
    }

    // ── Read operations ───────────────────────────────────────────────────────

    /// Public read — returns a privacy-safe view (hash + region, no wallet).
    ///
    /// Available to anyone; does not expose the wallet address or any PII.
    pub fn get_farmer(env: Env, wallet_address: Address) -> Option<PublicFarmerView> {
        env.storage()
            .persistent()
            .get::<_, FarmerProfile>(&DataKey::Farmer(wallet_address))
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
            .get(&DataKey::Farmer(wallet_address))
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
            .get(&DataKey::History(wallet_address, version))
    }

    /// Returns the current version counter for a farmer (public).
    pub fn get_version(env: Env, wallet_address: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Version(wallet_address))
            .unwrap_or(0u32)
    }

    /// Returns `true` if a profile exists for `wallet_address` (public).
    pub fn is_registered(env: Env, wallet_address: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Farmer(wallet_address))
    }

    // ── Availability toggle (farmer-only, unchanged) ──────────────────────────

    /// Toggle farmer availability — farmers can pause accepting new jobs
    /// without being removed from the registry.
    ///
    /// Only the farmer's own wallet may call this.
    ///
    /// # Panics
    /// - `FarmerNotRegistered` if no profile exists.
    ///
    /// # Emits
    /// `(AvailSet, wallet_address, available)`
    pub fn set_available(env: Env, wallet_address: Address, available: bool) {
        Self::assert_not_paused(&env);
        wallet_address.require_auth();
        Self::assert_not_frozen(&env, &wallet_address);

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Farmer(wallet_address.clone()))
        {
            panic_with_error!(&env, FarmerError::FarmerNotRegistered);
        }

        let key = DataKey::Available(wallet_address.clone());
        env.storage().persistent().set(&key, &available);
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

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
            .get(&DataKey::Available(wallet_address))
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
    /// - `FarmerFrozen` — farmer is frozen.
    ///
    /// # Emits
    /// `(PlotRegistered, farmer, (plot_id, area_sqm))`
    pub fn register_plot(
        env: Env,
        farmer: Address,
        plot_id: BytesN<32>,
        coordinates: Vec<(i64, i64)>,
        area_sqm: u64,
    ) {
        farmer.require_auth();
        Self::assert_not_frozen(&env, &farmer);

        let len = coordinates.len();
        if len < 3 || len > 50 {
            panic_with_error!(&env, FarmerError::InvalidCoordinatesCount);
        }

        let plot_key = DataKey::Plot(plot_id.clone());
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
        env.storage().persistent().extend_ttl(&plot_key, TTL_MIN, TTL_MAX);

        let fplots_key = DataKey::FarmerPlots(farmer.clone());
        let mut farmer_plots: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&fplots_key)
            .unwrap_or_else(|| Vec::new(&env));

        farmer_plots.push_back(plot_id.clone());
        env.storage().persistent().set(&fplots_key, &farmer_plots);
        env.storage().persistent().extend_ttl(&fplots_key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("PlotReg"), farmer),
            (plot_id, area_sqm),
        );
    }

    /// Retrieve all farm plots registered by a specific farmer.
    pub fn get_plots_by_farmer(env: Env, farmer_id: Address) -> Vec<FarmPlot> {
        let fplots_key = DataKey::FarmerPlots(farmer_id);
        let plot_ids: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&fplots_key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut plots = Vec::new(&env);
        for i in 0..plot_ids.len() {
            let id = plot_ids.get(i).unwrap();
            if let Some(plot) = env
                .storage()
                .persistent()
                .get::<_, FarmPlot>(&DataKey::Plot(id))
            {
                plots.push_back(plot);
            }
        }
        plots
    }

    /// Register and verify land tenure ownership for a farmer's plot/title.
    ///
    /// # Access
    /// Both `validator` and `farmer` must sign the transaction
    /// (`require_auth()`).  `validator` must be a registered validator.
    ///
    /// # Errors
    /// - `NotValidator` — caller is not a registered validator
    /// - `FarmerFrozen` — farmer is frozen
    /// - `LandTenureAlreadyExists` — title_id is already registered
    ///
    /// # Emits
    /// `(LandTen, farmer, (title_id, land_title_hash))`
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

        let tenure_key = DataKey::Tenure(title_id.clone());
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
        env.storage().persistent().extend_ttl(&tenure_key, TTL_MIN, TTL_MAX);

        let ftenures_key = DataKey::FarmerTenures(farmer.clone());
        let mut farmer_tenures: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&ftenures_key)
            .unwrap_or_else(|| Vec::new(&env));

        farmer_tenures.push_back(title_id.clone());
        env.storage().persistent().set(&ftenures_key, &farmer_tenures);
        env.storage().persistent().extend_ttl(&ftenures_key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("LandTen"), farmer),
            (title_id, land_title_hash),
        );

        verification
    }

    /// Retrieve a land tenure verification record by title ID.
    pub fn get_land_tenure(env: Env, title_id: BytesN<32>) -> Option<LandTenureVerification> {
        env.storage().persistent().get(&DataKey::Tenure(title_id))
    }

    /// Retrieve all verified land tenures for a specific farmer.
    pub fn get_farmer_land_tenures(
        env: Env,
        farmer: Address,
    ) -> Vec<LandTenureVerification> {
        let ftenures_key = DataKey::FarmerTenures(farmer);
        let title_ids: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&ftenures_key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut tenures = Vec::new(&env);
        for i in 0..title_ids.len() {
            let id = title_ids.get(i).unwrap();
            if let Some(tenure) = env
                .storage()
                .persistent()
                .get::<_, LandTenureVerification>(&DataKey::Tenure(id))
            {
                tenures.push_back(tenure);
            }
        }
        tenures
    }

    // ── Planter Reputation Array (#751) ───────────────────────────────────────

    /// Upsert (update or insert) a planter's reputation entry in the
    /// compact reputation array.
    ///
    /// The entire `Vec<ReputationEntry>` is read from a single storage entry,
    /// the target planter's record is updated or appended, and the Vec is
    /// written back.  This O(n) pattern is efficient for ≤ ~500 entries.
    ///
    /// # Access
    /// Only the contract admin may call this.  Admin must `require_auth`.
    ///
    /// # Errors
    /// - `Unauthorized` — caller is not the admin.
    ///
    /// # Emits
    /// `(RepUpsert, planter, (score, tier))`
    pub fn upsert_reputation(
        env: Env,
        admin: Address,
        planter: Address,
        score: u32,
        completed_jobs: u64,
    ) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let tier = Self::compute_tier(score);
        let timestamp = env.ledger().timestamp();

        let key = DataKey::Reputation;
        let mut entries: Vec<ReputationEntry> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        // Linear search for an existing entry.
        let mut found = false;
        for i in 0..entries.len() {
            let mut entry = entries.get(i).unwrap();
            if entry.planter == planter {
                entry.score = score;
                entry.tier = tier.clone();
                entry.completed_jobs = completed_jobs;
                entry.last_updated = timestamp;
                entries.set(i, entry);
                found = true;
                break;
            }
        }

        if !found {
            entries.push_back(ReputationEntry {
                planter: planter.clone(),
                score,
                tier: tier.clone(),
                completed_jobs,
                last_updated: timestamp,
            });
        }

        env.storage().persistent().set(&key, &entries);
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("RepUpsert"), planter.clone()),
            (score, tier),
        );
    }

    /// Remove a planter from the reputation array.
    ///
    /// If the planter is not found, this is a no-op (no panic).
    ///
    /// # Access
    /// Only the contract admin may call this.  Admin must `require_auth`.
    ///
    /// # Emits
    /// `(RepRemove, planter)` if the entry was found and removed.
    pub fn remove_reputation(env: Env, admin: Address, planter: Address) {
        Self::assert_not_paused(&env);
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let key = DataKey::Reputation;
        let mut entries: Vec<ReputationEntry> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let len_before = entries.len();
        // Retain all entries whose planter address does NOT match.
        // We build a new Vec because soroban_sdk::Vec doesn't support retain.
        let mut filtered = Vec::new(&env);
        for i in 0..entries.len() {
            let entry = entries.get(i).unwrap();
            if entry.planter != planter {
                filtered.push_back(entry);
            }
        }

        if filtered.len() < len_before {
            env.storage().persistent().set(&key, &filtered);
            env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

            env.events().publish(
                (symbol_short!("RepRemove"), planter),
                env.ledger().timestamp(),
            );
        }
    }

    /// Read a single planter's reputation entry from the compact array.
    ///
    /// Returns `None` if the planter has no reputation record.
    pub fn get_reputation(env: Env, planter: Address) -> Option<ReputationEntry> {
        let entries: Vec<ReputationEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation)
            .unwrap_or_else(|| Vec::new(&env));

        for i in 0..entries.len() {
            let entry = entries.get(i).unwrap();
            if entry.planter == planter {
                return Some(entry);
            }
        }
        None
    }

    /// Return the full reputation array.
    ///
    /// This is a public, unauthenticated read.
    pub fn get_all_reputations(env: Env) -> Vec<ReputationEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the number of planters in the reputation array.
    pub fn get_reputation_count(env: Env) -> u32 {
        let entries: Vec<ReputationEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation)
            .unwrap_or_else(|| Vec::new(&env));
        entries.len()
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Panics with `Unauthorized` if `caller` is not the stored admin.
    fn require_admin(env: &Env, caller: &Address) {
        let admin = Self::load_admin(env);
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
    }

    /// Loads the admin address from instance storage.
    fn load_admin(env: &Env) -> Address {
        let (admin, _): (Address, Address) = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin
    }

    /// Loads the admin-controls contract address from instance storage.
    fn admin_controls(env: &Env) -> Address {
        let (_, ac): (Address, Address) = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        ac
    }

    /// Panics if the admin-controls contract reports the system is paused.
    fn assert_not_paused(env: &Env) {
        let ac_addr = Self::admin_controls(env);
        let ac_client = AdminControlsClient::new(env, &ac_addr);
        ac_client.assert_not_paused();
    }

    /// Panics with `NotValidator` if `caller` is not a registered validator.
    fn require_validator(env: &Env, caller: &Address) {
        if !Self::_is_validator(env, caller) {
            panic_with_error!(env, FarmerError::NotValidator);
        }
    }

    /// Panics with `FarmerFrozen` if `wallet` is frozen.
    fn assert_not_frozen(env: &Env, wallet: &Address) {
        if Self::_is_frozen(env, wallet) {
            panic_with_error!(env, FarmerError::FarmerFrozen);
        }
    }

    /// Returns `true` if `wallet` has a `Frozen` entry set to `true`.
    fn _is_frozen(env: &Env, wallet: &Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::Frozen(wallet.clone()))
            .unwrap_or(false)
    }

    /// Returns `true` if `addr` is set as a validator in instance storage.
    fn _is_validator(env: &Env, addr: &Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::Validator(addr.clone()))
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

    /// Compute the reputation tier badge from a numeric score.
    fn compute_tier(score: u32) -> ReputationTier {
        if score >= 900 {
            ReputationTier::Platinum
        } else if score >= 600 {
            ReputationTier::Gold
        } else if score >= 300 {
            ReputationTier::Silver
        } else {
            ReputationTier::Bronze
        }
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

        // Deploy admin-controls contract.
        let ac_id = env.register_contract(None, admin_controls::AdminControls);
        let ac_client = admin_controls::AdminControlsClient::new(&env, &ac_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        ac_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, FarmerRegistry);
        let client = FarmerRegistryClient::new(&env, &contract_id);

        let validator = Address::generate(&env);

        client.initialize(&admin, &ac_id);
        client.register_validator(&admin, &validator);

        (env, admin, validator, client)
    }

    /// Build a deterministic SHA-256 pre-image and its digest from a seed byte.
    fn doc(env: &Env, seed: u8) -> (Bytes, BytesN<32>) {
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

        client.register_farmer(
            &validator,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "s1"),
        );

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

        client.register_farmer(
            &validator,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "s2"),
        );

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

        client.register_farmer(
            &validator,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "s1"),
        );

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

        client.register_farmer(
            &validator,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "e7"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_register_farmer_non_validator_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);
        let (preimage, hash) = doc(&env, 1);

        client.register_farmer(
            &attacker,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "s1"),
        );
    }

    // ── SHA-256 integrity ─────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_hash_mismatch_on_register_rejected() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let (preimage, _real_hash) = doc(&env, 1);
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

        client.register_farmer(
            &validator,
            &farmer,
            &hash,
            &preimage,
            &region(&env, "s5"),
        );
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
            client.register_farmer(
                &validator,
                &farmer,
                &h,
                &p,
                &region(&env, prefix),
            );
            assert!(client.is_registered(&farmer));
        }
    }

    // ── farm plots ────────────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get_plots() {
        let (env, _, _, client) = setup();
        let farmer = Address::generate(&env);
        let plot_id = BytesN::from_array(&env, &[1u8; 32]);

        let mut coords = Vec::new(&env);
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

        let mut coords = Vec::new(&env);
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

        let mut coords = Vec::new(&env);
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

        let mut coords = Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));
        coords.push_back((1000001, 2000000));

        client.register_plot(&farmer, &plot_id, &coords, &1000);
        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    // ── Emergency Freeze Authority ────────────────────────────────────────────

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
        let mut coords = Vec::new(&env);
        coords.push_back((1000000, 2000000));
        coords.push_back((1000000, 2000001));
        coords.push_back((1000001, 2000000));

        client.register_plot(&farmer, &plot_id, &coords, &1000);
    }

    // ── Land Tenure Verification Tests ────────────────────────────────────────

    #[test]
    fn test_verify_land_tenure_success() {
        let (env, _, validator, client) = setup();
        let farmer = Address::generate(&env);
        let title_id = BytesN::from_array(&env, &[10u8; 32]);
        let land_title_hash = BytesN::from_array(&env, &[20u8; 32]);
        let signature = Bytes::from_array(&env, &[1, 2, 3, 4]);

        let verification = client.verify_land_tenure(
            &validator,
            &farmer,
            &title_id,
            &land_title_hash,
            &signature,
        );
        assert!(verification.is_verified);
        assert_eq!(verification.farmer_id, farmer);
        assert_eq!(verification.land_title_hash, land_title_hash);

        let retrieved = client.get_land_tenure(&title_id).unwrap();
        assert_eq!(retrieved.title_id, title_id);

        let farmer_tenures = client.get_farmer_land_tenures(&farmer);
        assert_eq!(farmer_tenures.len(), 1);
    }

    // ── Planter Reputation Array Tests (#751) ─────────────────────────────────

    #[test]
    fn test_upsert_reputation_insert_new() {
        let (env, admin, _, client) = setup();
        let planter = Address::generate(&env);

        client.upsert_reputation(&admin, &planter, &250u32, &5u64);

        let entry = client.get_reputation(&planter).unwrap();
        assert_eq!(entry.planter, planter);
        assert_eq!(entry.score, 250);
        assert_eq!(entry.tier, ReputationTier::Bronze);
        assert_eq!(entry.completed_jobs, 5);
    }

    #[test]
    fn test_upsert_reputation_update_existing() {
        let (env, admin, _, client) = setup();
        let planter = Address::generate(&env);

        client.upsert_reputation(&admin, &planter, &250u32, &5u64);
        client.upsert_reputation(&admin, &planter, &650u32, &25u64);

        let entry = client.get_reputation(&planter).unwrap();
        assert_eq!(entry.score, 650);
        assert_eq!(entry.tier, ReputationTier::Gold);
        assert_eq!(entry.completed_jobs, 25);
    }

    #[test]
    fn test_get_all_reputations() {
        let (env, admin, _, client) = setup();
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);
        let p3 = Address::generate(&env);

        client.upsert_reputation(&admin, &p1, &100u32, &1u64);
        client.upsert_reputation(&admin, &p2, &350u32, &10u64);
        client.upsert_reputation(&admin, &p3, &950u32, &50u64);

        let all = client.get_all_reputations();
        assert_eq!(all.len(), 3);
        assert_eq!(client.get_reputation_count(), 3);
    }

    #[test]
    fn test_remove_reputation() {
        let (env, admin, _, client) = setup();
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        client.upsert_reputation(&admin, &p1, &100u32, &1u64);
        client.upsert_reputation(&admin, &p2, &200u32, &2u64);
        assert_eq!(client.get_reputation_count(), 2);

        client.remove_reputation(&admin, &p1);
        assert_eq!(client.get_reputation_count(), 1);
        assert!(client.get_reputation(&p1).is_none());
        assert!(client.get_reputation(&p2).is_some());
    }

    #[test]
    fn test_remove_reputation_missing_is_noop() {
        let (env, admin, _, client) = setup();
        let planter = Address::generate(&env);

        // Should not panic.
        client.remove_reputation(&admin, &planter);
        assert_eq!(client.get_reputation_count(), 0);
    }

    #[test]
    fn test_get_reputation_missing_returns_none() {
        let (env, _, _, client) = setup();
        assert!(client.get_reputation(&Address::generate(&env)).is_none());
    }

    #[test]
    fn test_reputation_tiers_correct() {
        let (env, admin, _, client) = setup();

        let bronze = Address::generate(&env);
        let silver = Address::generate(&env);
        let gold = Address::generate(&env);
        let platinum = Address::generate(&env);

        client.upsert_reputation(&admin, &bronze, &0u32, &0u64);
        client.upsert_reputation(&admin, &silver, &300u32, &0u64);
        client.upsert_reputation(&admin, &gold, &600u32, &0u64);
        client.upsert_reputation(&admin, &platinum, &900u32, &0u64);

        assert_eq!(
            client.get_reputation(&bronze).unwrap().tier,
            ReputationTier::Bronze
        );
        assert_eq!(
            client.get_reputation(&silver).unwrap().tier,
            ReputationTier::Silver
        );
        assert_eq!(
            client.get_reputation(&gold).unwrap().tier,
            ReputationTier::Gold
        );
        assert_eq!(
            client.get_reputation(&platinum).unwrap().tier,
            ReputationTier::Platinum
        );
    }

    #[test]
    fn test_reputation_tier_boundaries() {
        let (env, admin, _, client) = setup();
        let p = Address::generate(&env);

        // Exactly at the boundary.
        client.upsert_reputation(&admin, &p, &299u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Bronze
        );

        client.upsert_reputation(&admin, &p, &300u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Silver
        );

        client.upsert_reputation(&admin, &p, &599u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Silver
        );

        client.upsert_reputation(&admin, &p, &600u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Gold
        );

        client.upsert_reputation(&admin, &p, &899u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Gold
        );

        client.upsert_reputation(&admin, &p, &900u32, &0u64);
        assert_eq!(
            client.get_reputation(&p).unwrap().tier,
            ReputationTier::Platinum
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_upsert_reputation_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let planter = Address::generate(&env);

        client.upsert_reputation(&attacker, &planter, &100u32, &0u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_remove_reputation_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let planter = Address::generate(&env);

        client.remove_reputation(&attacker, &planter);
    }

    #[test]
    fn test_reputation_empty_array_returns_zero_count() {
        let (_env, _, _, client) = setup();
        assert_eq!(client.get_reputation_count(), 0);
        assert!(client.get_all_reputations().is_empty());
    }
}
