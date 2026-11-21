#![no_std]

//! Species Catalog Search Index — On-chain searchable catalogue for tree species.
//!
//! Provides a rich, indexed species catalog with efficient search across
//! common name, scientific name, genus, family, conservation status, leaf type,
//! and native region.  Supports prefix-based text search and paginated results.
//!
//! # Storage layout
//!
//!   Instance:
//!     ADMIN        — Address   (admin allowed to register/update/remove species)
//!     SPCOUNT      — u32       (total species registered)
//!     NXTID        — u32       (auto-incrementing species ID)
//!
//!   Persistent (keyed by species ID):
//!     CAT:<id>     — SpeciesCatalogEntry
//!
//!   Persistent slug → ID mapping:
//!     CATSLUG:<slug> — u32
//!
//!   Persistent index keys (each stores Vec<u32> of species IDs):
//!     IDX_GE:<genus>    — genus exact-match index
//!     IDX_FA:<family>   — family exact-match index
//!     IDX_CS:<tag>      — conservation status index
//!     IDX_LT:<tag>      — leaf type index
//!     IDX_RG:<region>   — native region exact-match index
//!
//!   Prefix search on common_name / scientific_name is performed by scanning
//!   the primary species list — acceptable for catalog-scale data.
//!
//! # Error codes
//!
//!   95–106 — SpeciesCatalogError (see enum below)
//!   1     — HarvestaError::AlreadyInitialized (shared crate)

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Vec,
};

// ── Error enum ────────────────────────────────────────────────────────────────

/// Species catalog specific errors.
/// Codes 95–106 sit outside every other contract's range in this workspace.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SpeciesCatalogError {
    /// A species with this slug is already registered.
    SpeciesAlreadyRegistered = 95,
    /// No species found for the given ID.
    SpeciesNotFound = 96,
    /// Reserved.
    _Reserved97 = 97,
    /// Common name is empty.
    EmptyCommonName = 98,
    /// Scientific name is empty.
    EmptyScientificName = 99,
    /// Average height must be positive.
    InvalidAvgHeight = 100,
    /// Average lifespan must be positive.
    InvalidAvgLifespan = 101,
    /// CO₂ sequestration rate must be positive.
    InvalidCo2Rate = 102,
    /// Caller is not the contract admin.
    NotAuthorized = 103,
    /// Page size exceeds the maximum allowed limit or is zero.
    PageSizeExceeded = 104,
    /// Reserved.
    _Reserved105 = 105,
    /// Native region string is empty.
    EmptyRegion = 106,
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum page size for paginated search queries.
const MAX_PAGE_SIZE: u32 = 100;

/// Default persistent storage TTL (~6 months in ledger seconds).
const DEFAULT_PERSISTENT_TTL: u32 = 1_576_800;

// ── Enums ─────────────────────────────────────────────────────────────────────

/// IUCN-style conservation status classification.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConservationStatus {
    LeastConcern,
    NearThreatened,
    Vulnerable,
    Endangered,
    CriticallyEndangered,
    DataDeficient,
    NotEvaluated,
}

/// Leaf morphology classification.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LeafType {
    Broadleaf,
    Needleleaf,
    Palm,
    Fern,
    Succulent,
    GrassLike,
    Other,
}

// ── Data types ────────────────────────────────────────────────────────────────

/// A single species record stored on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpeciesCatalogEntry {
    pub id: u32,
    pub slug: Symbol,
    pub common_name: soroban_sdk::String,
    pub scientific_name: soroban_sdk::String,
    pub family: soroban_sdk::String,
    pub genus: soroban_sdk::String,
    pub conservation_status: ConservationStatus,
    pub leaf_type: LeafType,
    pub native_region: soroban_sdk::String,
    pub avg_height_m: u32,
    pub avg_lifespan_years: u32,
    pub co2_kg_per_year: i128,
    pub registered_at: u64,
    pub updated_at: u64,
}

/// Arguments for registering a new species (wraps the large parameter set).
#[contracttype]
#[derive(Clone, Debug)]
pub struct RegisterSpeciesArgs {
    pub slug: Symbol,
    pub common_name: soroban_sdk::String,
    pub scientific_name: soroban_sdk::String,
    pub family: soroban_sdk::String,
    pub genus: soroban_sdk::String,
    pub conservation_status: ConservationStatus,
    pub leaf_type: LeafType,
    pub native_region: soroban_sdk::String,
    pub avg_height_m: u32,
    pub avg_lifespan_years: u32,
    pub co2_kg_per_year: i128,
}

/// Arguments for updating an existing species record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct UpdateSpeciesArgs {
    pub common_name: soroban_sdk::String,
    pub scientific_name: soroban_sdk::String,
    pub family: soroban_sdk::String,
    pub genus: soroban_sdk::String,
    pub conservation_status: ConservationStatus,
    pub leaf_type: LeafType,
    pub native_region: soroban_sdk::String,
    pub avg_height_m: u32,
    pub avg_lifespan_years: u32,
    pub co2_kg_per_year: i128,
}

/// Search filter for the `search_species` endpoint.
///
/// Each field is optional; only non-`None` fields are applied as filters.
/// Results are intersected across all active filter criteria.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SearchFilter {
    pub common_name_prefix: Option<soroban_sdk::String>,
    pub scientific_name_prefix: Option<soroban_sdk::String>,
    pub genus: Option<soroban_sdk::String>,
    pub family: Option<soroban_sdk::String>,
    pub conservation_status: Option<ConservationStatus>,
    pub leaf_type: Option<LeafType>,
    pub native_region: Option<soroban_sdk::String>,
    pub limit: u32,
    pub offset: u32,
}

/// Paginated search response wrapping the result set.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesSearchResponse {
    pub results: Vec<SpeciesCatalogEntry>,
    pub total: u32,
    pub limit: u32,
    pub offset: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SpeciesCatalog;

#[contractimpl]
impl SpeciesCatalog {
    // ── Initialization ────────────────────────────────────────────────────────

    /// Initialise the species catalog.  Must be called exactly once before any
    /// other function.  Sets the admin address and initialises counters.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("SPCOUNT"), &0u32);
        env.storage()
            .instance()
            .set(&symbol_short!("NXTID"), &0u32);
    }

    // ── Write operations (admin only) ─────────────────────────────────────────

    /// Register a new species in the catalog.  Caller must be the admin.
    ///
    /// Takes a [`RegisterSpeciesArgs`] struct to stay within Soroban's
    /// 10-parameter limit.  Returns the auto-assigned species ID.
    ///
    /// Index keys are created for each searchable attribute to enable efficient
    /// equality lookups on read.  Prefix search on common_name and
    /// scientific_name is performed by scanning the primary species list.
    pub fn register_species(env: Env, args: RegisterSpeciesArgs) -> u32 {
        Self::require_admin(&env);
        Self::validate_register_args(&env, &args);

        if env
            .storage()
            .persistent()
            .has(&Self::slug_key(&args.slug))
        {
            panic_with_error!(&env, SpeciesCatalogError::SpeciesAlreadyRegistered);
        }

        let now = env.ledger().timestamp();
        let next_id: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("NXTID"))
            .unwrap_or(0);

        let entry = SpeciesCatalogEntry {
            id: next_id,
            slug: args.slug.clone(),
            common_name: args.common_name.clone(),
            scientific_name: args.scientific_name.clone(),
            family: args.family.clone(),
            genus: args.genus.clone(),
            conservation_status: args.conservation_status.clone(),
            leaf_type: args.leaf_type.clone(),
            native_region: args.native_region.clone(),
            avg_height_m: args.avg_height_m,
            avg_lifespan_years: args.avg_lifespan_years,
            co2_kg_per_year: args.co2_kg_per_year,
            registered_at: now,
            updated_at: now,
        };

        env.storage()
            .persistent()
            .set(&Self::id_key(next_id), &entry);
        Self::extend_ttl(&env, &Self::id_key(next_id));

        env.storage()
            .persistent()
            .set(&Self::slug_key(&args.slug), &next_id);
        Self::extend_ttl(&env, &Self::slug_key(&args.slug));

        Self::add_to_index(&env, Self::genus_key(&args.genus), next_id);
        Self::add_to_index(&env, Self::family_key(&args.family), next_id);
        Self::add_to_index(&env, Self::status_key(&env, &args.conservation_status), next_id);
        Self::add_to_index(&env, Self::leaf_key(&env, &args.leaf_type), next_id);
        Self::add_to_index(&env, Self::region_key(&args.native_region), next_id);

        let new_id = next_id.checked_add(1).expect("species ID overflow");
        env.storage()
            .instance()
            .set(&symbol_short!("NXTID"), &new_id);

        let count: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("SPCOUNT"))
            .unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("SPCOUNT"),
            &count.checked_add(1).expect("count overflow"),
        );

        env.events().publish(
            (Symbol::new(&env, "SpeciesRegistered"), next_id),
            (args.slug, args.common_name, args.scientific_name),
        );

        next_id
    }

    /// Update an existing species record.  Caller must be the admin.
    ///
    /// Takes the species ID and an [`UpdateSpeciesArgs`] struct.  Index keys are
    /// rebuilt to reflect any changes in searchable attributes.
    pub fn update_species(env: Env, id: u32, args: UpdateSpeciesArgs) {
        Self::require_admin(&env);
        Self::validate_update_args(&env, &args);

        let key = Self::id_key(id);
        let mut entry: SpeciesCatalogEntry = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, SpeciesCatalogError::SpeciesNotFound));

        Self::remove_from_index(&env, Self::genus_key(&entry.genus), id);
        Self::remove_from_index(&env, Self::family_key(&entry.family), id);
        Self::remove_from_index(&env, Self::status_key(&env, &entry.conservation_status), id);
        Self::remove_from_index(&env, Self::leaf_key(&env, &entry.leaf_type), id);
        Self::remove_from_index(&env, Self::region_key(&entry.native_region), id);

        entry.common_name = args.common_name.clone();
        entry.scientific_name = args.scientific_name.clone();
        entry.family = args.family.clone();
        entry.genus = args.genus.clone();
        entry.conservation_status = args.conservation_status.clone();
        entry.leaf_type = args.leaf_type.clone();
        entry.native_region = args.native_region.clone();
        entry.avg_height_m = args.avg_height_m;
        entry.avg_lifespan_years = args.avg_lifespan_years;
        entry.co2_kg_per_year = args.co2_kg_per_year;
        entry.updated_at = env.ledger().timestamp();

        Self::add_to_index(&env, Self::genus_key(&entry.genus), id);
        Self::add_to_index(&env, Self::family_key(&entry.family), id);
        Self::add_to_index(&env, Self::status_key(&env, &entry.conservation_status), id);
        Self::add_to_index(&env, Self::leaf_key(&env, &entry.leaf_type), id);
        Self::add_to_index(&env, Self::region_key(&entry.native_region), id);

        env.storage().persistent().set(&key, &entry);
        Self::extend_ttl(&env, &key);

        env.events().publish(
            (Symbol::new(&env, "SpeciesUpdated"), id),
            (entry.slug, args.common_name, args.scientific_name),
        );
    }

    /// Remove a species from the catalog.  Caller must be the admin.
    ///
    /// Cleans up all index entries and primary records.
    pub fn remove_species(env: Env, id: u32) {
        Self::require_admin(&env);

        let key = Self::id_key(id);
        let entry: SpeciesCatalogEntry = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, SpeciesCatalogError::SpeciesNotFound));

        Self::remove_from_index(&env, Self::genus_key(&entry.genus), id);
        Self::remove_from_index(&env, Self::family_key(&entry.family), id);
        Self::remove_from_index(&env, Self::status_key(&env, &entry.conservation_status), id);
        Self::remove_from_index(&env, Self::leaf_key(&env, &entry.leaf_type), id);
        Self::remove_from_index(&env, Self::region_key(&entry.native_region), id);

        env.storage().persistent().remove(&key);
        env.storage().persistent().remove(&Self::slug_key(&entry.slug));

        let count: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("SPCOUNT"))
            .unwrap_or(0);
        env.storage().instance().set(
            &symbol_short!("SPCOUNT"),
            &count.checked_sub(1).expect("count underflow"),
        );

        env.events()
            .publish((Symbol::new(&env, "SpeciesRemoved"), id), entry.slug);
    }

    // ── Read operations (public) ──────────────────────────────────────────────

    /// Retrieve a species catalog entry by its numeric ID.
    pub fn get_species(env: Env, id: u32) -> SpeciesCatalogEntry {
        env.storage()
            .persistent()
            .get(&Self::id_key(id))
            .unwrap_or_else(|| panic_with_error!(&env, SpeciesCatalogError::SpeciesNotFound))
    }

    /// Retrieve a species catalog entry by its symbolic slug.
    pub fn get_species_by_slug(env: Env, slug: Symbol) -> SpeciesCatalogEntry {
        let id: u32 = env
            .storage()
            .persistent()
            .get(&Self::slug_key(&slug))
            .unwrap_or_else(|| panic_with_error!(&env, SpeciesCatalogError::SpeciesNotFound));
        Self::get_species(env, id)
    }

    /// Search species by common name prefix.
    ///
    /// Scans all registered species and returns those whose common name starts
    /// with `prefix`.  Returns up to `limit` results starting at `offset`.
    pub fn search_by_common_name(
        env: Env,
        prefix: soroban_sdk::String,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let all_ids = Self::collect_all_ids(&env);
        let mut matching = Vec::new(&env);
        for id in all_ids.iter() {
            if let Some(entry) = env.storage().persistent().get::<_, SpeciesCatalogEntry>(&Self::id_key(id)) {
                if Self::string_starts_with(&entry.common_name, &prefix) {
                    matching.push_back(id);
                }
            }
        }
        Self::paginate(&env, &matching, limit, offset)
    }

    /// Search species by scientific name prefix.
    ///
    /// Scans all registered species and returns those whose scientific name
    /// starts with `prefix`.  Returns up to `limit` results starting at `offset`.
    pub fn search_by_scientific_name(
        env: Env,
        prefix: soroban_sdk::String,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let all_ids = Self::collect_all_ids(&env);
        let mut matching = Vec::new(&env);
        for id in all_ids.iter() {
            if let Some(entry) = env.storage().persistent().get::<_, SpeciesCatalogEntry>(&Self::id_key(id)) {
                if Self::string_starts_with(&entry.scientific_name, &prefix) {
                    matching.push_back(id);
                }
            }
        }
        Self::paginate(&env, &matching, limit, offset)
    }

    /// Search species by exact genus match.
    pub fn search_by_genus(
        env: Env,
        genus: soroban_sdk::String,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::get_index_ids(&env, Self::genus_key(&genus));
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Search species by exact family match.
    pub fn search_by_family(
        env: Env,
        family: soroban_sdk::String,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::get_index_ids(&env, Self::family_key(&family));
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Search species by conservation status.
    pub fn search_by_conservation_status(
        env: Env,
        status: ConservationStatus,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::get_index_ids(&env, Self::status_key(&env, &status));
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Search species by leaf type.
    pub fn search_by_leaf_type(
        env: Env,
        leaf_type: LeafType,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::get_index_ids(&env, Self::leaf_key(&env, &leaf_type));
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Search species by native region (exact match).
    pub fn search_by_region(
        env: Env,
        region: soroban_sdk::String,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::get_index_ids(&env, Self::region_key(&region));
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Combined search across multiple filter criteria.
    ///
    /// Each field in the [`SearchFilter`] is optional; only non-`None` fields
    /// are applied as filters.  Results are intersected across all active
    /// criteria.
    pub fn search_species(env: Env, filter: SearchFilter) -> SpeciesSearchResponse {
        Self::assert_page_size(&env, filter.limit);

        let mut candidate_ids = Self::collect_all_ids(&env);

        if let Some(ref prefix) = filter.common_name_prefix {
            let mut filtered = Vec::new(&env);
            for id in candidate_ids.iter() {
                if let Some(entry) = env.storage().persistent().get::<_, SpeciesCatalogEntry>(&Self::id_key(id)) {
                    if Self::string_starts_with(&entry.common_name, prefix) {
                        filtered.push_back(id);
                    }
                }
            }
            candidate_ids = filtered;
        }
        if let Some(ref prefix) = filter.scientific_name_prefix {
            let mut filtered = Vec::new(&env);
            for id in candidate_ids.iter() {
                if let Some(entry) = env.storage().persistent().get::<_, SpeciesCatalogEntry>(&Self::id_key(id)) {
                    if Self::string_starts_with(&entry.scientific_name, prefix) {
                        filtered.push_back(id);
                    }
                }
            }
            candidate_ids = filtered;
        }
        if let Some(ref genus) = filter.genus {
            let idx_ids = Self::get_index_ids(&env, Self::genus_key(genus));
            candidate_ids = Self::intersect(&env, &candidate_ids, &idx_ids);
        }
        if let Some(ref family) = filter.family {
            let idx_ids = Self::get_index_ids(&env, Self::family_key(family));
            candidate_ids = Self::intersect(&env, &candidate_ids, &idx_ids);
        }
        if let Some(ref status) = filter.conservation_status {
            let idx_ids = Self::get_index_ids(&env, Self::status_key(&env, status));
            candidate_ids = Self::intersect(&env, &candidate_ids, &idx_ids);
        }
        if let Some(ref lt) = filter.leaf_type {
            let idx_ids = Self::get_index_ids(&env, Self::leaf_key(&env, lt));
            candidate_ids = Self::intersect(&env, &candidate_ids, &idx_ids);
        }
        if let Some(ref region) = filter.native_region {
            let idx_ids = Self::get_index_ids(&env, Self::region_key(region));
            candidate_ids = Self::intersect(&env, &candidate_ids, &idx_ids);
        }

        let total = candidate_ids.len();
        let results = Self::paginate(&env, &candidate_ids, filter.limit, filter.offset);

        SpeciesSearchResponse {
            results,
            total,
            limit: filter.limit,
            offset: filter.offset,
        }
    }

    /// List all species in the catalog with pagination.
    pub fn list_all_species(env: Env, limit: u32, offset: u32) -> Vec<SpeciesCatalogEntry> {
        Self::assert_page_size(&env, limit);
        let ids = Self::collect_all_ids(&env);
        Self::paginate(&env, &ids, limit, offset)
    }

    /// Return the total number of registered species.
    pub fn species_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("SPCOUNT"))
            .unwrap_or(0)
    }

    // ── Private: validation ───────────────────────────────────────────────────

    fn validate_register_args(env: &Env, args: &RegisterSpeciesArgs) {
        if args.common_name.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyCommonName);
        }
        if args.scientific_name.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyScientificName);
        }
        if args.avg_height_m == 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidAvgHeight);
        }
        if args.avg_lifespan_years == 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidAvgLifespan);
        }
        if args.co2_kg_per_year <= 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidCo2Rate);
        }
        if args.native_region.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyRegion);
        }
    }

    fn validate_update_args(env: &Env, args: &UpdateSpeciesArgs) {
        if args.common_name.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyCommonName);
        }
        if args.scientific_name.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyScientificName);
        }
        if args.avg_height_m == 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidAvgHeight);
        }
        if args.avg_lifespan_years == 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidAvgLifespan);
        }
        if args.co2_kg_per_year <= 0 {
            panic_with_error!(env, SpeciesCatalogError::InvalidCo2Rate);
        }
        if args.native_region.is_empty() {
            panic_with_error!(env, SpeciesCatalogError::EmptyRegion);
        }
    }

    // ── Private: auth & validation helpers ────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn assert_page_size(env: &Env, limit: u32) {
        if limit == 0 || limit > MAX_PAGE_SIZE {
            panic_with_error!(env, SpeciesCatalogError::PageSizeExceeded);
        }
    }

    /// Check if `haystack` starts with `needle` by comparing raw bytes.
    fn string_starts_with(haystack: &soroban_sdk::String, needle: &soroban_sdk::String) -> bool {
        let needle_len = needle.len() as usize;
        if needle_len == 0 {
            return true;
        }
        if needle_len > haystack.len() as usize {
            return false;
        }
        let mut n_buf = [0u8; 32];
        needle.copy_into_slice(&mut n_buf);
        let mut h_buf = [0u8; 32];
        haystack.copy_into_slice(&mut h_buf);
        let mut i = 0;
        while i < needle_len {
            if n_buf[i] != h_buf[i] {
                return false;
            }
            i += 1;
        }
        true
    }

    // ── Private: storage keys ─────────────────────────────────────────────────

    fn id_key(id: u32) -> (Symbol, u32) {
        (symbol_short!("CAT"), id)
    }

    fn slug_key(slug: &Symbol) -> (Symbol, Symbol) {
        (symbol_short!("CATSLUG"), slug.clone())
    }

    // ── Private: index key builders ───────────────────────────────────────────

    fn genus_key(genus: &soroban_sdk::String) -> (Symbol, soroban_sdk::String) {
        (symbol_short!("IDX_GE"), genus.clone())
    }

    fn family_key(family: &soroban_sdk::String) -> (Symbol, soroban_sdk::String) {
        (symbol_short!("IDX_FA"), family.clone())
    }

    fn status_key(env: &Env, status: &ConservationStatus) -> (Symbol, soroban_sdk::String) {
        let tag = match status {
            ConservationStatus::LeastConcern => "LC",
            ConservationStatus::NearThreatened => "NT",
            ConservationStatus::Vulnerable => "VU",
            ConservationStatus::Endangered => "EN",
            ConservationStatus::CriticallyEndangered => "CR",
            ConservationStatus::DataDeficient => "DD",
            ConservationStatus::NotEvaluated => "NE",
        };
        (
            symbol_short!("IDX_CS"),
            soroban_sdk::String::from_str(env, tag),
        )
    }

    fn leaf_key(env: &Env, leaf: &LeafType) -> (Symbol, soroban_sdk::String) {
        let tag = match leaf {
            LeafType::Broadleaf => "BL",
            LeafType::Needleleaf => "NL",
            LeafType::Palm => "PA",
            LeafType::Fern => "FE",
            LeafType::Succulent => "SU",
            LeafType::GrassLike => "GL",
            LeafType::Other => "OT",
        };
        (
            symbol_short!("IDX_LT"),
            soroban_sdk::String::from_str(env, tag),
        )
    }

    fn region_key(region: &soroban_sdk::String) -> (Symbol, soroban_sdk::String) {
        (symbol_short!("IDX_RG"), region.clone())
    }

    // ── Private: index helpers ────────────────────────────────────────────────

    fn add_to_index(env: &Env, full_key: (Symbol, soroban_sdk::String), species_id: u32) {
        let mut ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&full_key)
            .unwrap_or_else(|| Vec::new(env));
        ids.push_back(species_id);
        env.storage().persistent().set(&full_key, &ids);
        Self::extend_ttl(env, &full_key);
    }

    fn remove_from_index(env: &Env, full_key: (Symbol, soroban_sdk::String), species_id: u32) {
        let ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&full_key)
            .unwrap_or_else(|| Vec::new(env));
        let mut filtered = Vec::new(env);
        for id in ids.iter() {
            if id != species_id {
                filtered.push_back(id);
            }
        }
        if filtered.is_empty() {
            env.storage().persistent().remove(&full_key);
        } else {
            env.storage().persistent().set(&full_key, &filtered);
            Self::extend_ttl(env, &full_key);
        }
    }

    fn get_index_ids(env: &Env, full_key: (Symbol, soroban_sdk::String)) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&full_key)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn collect_all_ids(env: &Env) -> Vec<u32> {
        let next_id: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("NXTID"))
            .unwrap_or(0);
        let mut ids = Vec::new(env);
        let mut i: u32 = 0;
        while i < next_id {
            if env.storage().persistent().has(&Self::id_key(i)) {
                ids.push_back(i);
            }
            i = i.checked_add(1).expect("ID iteration overflow");
        }
        ids
    }

    fn intersect(env: &Env, a: &Vec<u32>, b: &Vec<u32>) -> Vec<u32> {
        let mut result = Vec::new(env);
        for id_a in a.iter() {
            for id_b in b.iter() {
                if id_a == id_b {
                    result.push_back(id_a);
                    break;
                }
            }
        }
        result
    }

    fn paginate(
        env: &Env,
        ids: &Vec<u32>,
        limit: u32,
        offset: u32,
    ) -> Vec<SpeciesCatalogEntry> {
        let mut results = Vec::new(env);
        let mut skipped: u32 = 0;
        let mut collected: u32 = 0;
        for id in ids.iter() {
            if skipped < offset {
                skipped = skipped.checked_add(1).expect("offset overflow");
                continue;
            }
            if collected >= limit {
                break;
            }
            if let Some(entry) = env.storage().persistent().get(&Self::id_key(id)) {
                results.push_back(entry);
                collected = collected.checked_add(1).expect("collect overflow");
            }
        }
        results
    }

    fn extend_ttl(env: &Env, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) {
        env.storage()
            .persistent()
            .extend_ttl(key, DEFAULT_PERSISTENT_TTL, DEFAULT_PERSISTENT_TTL);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, Address, SpeciesCatalogClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesCatalog);
        let client = SpeciesCatalogClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn sample_args(env: &Env) -> RegisterSpeciesArgs {
        RegisterSpeciesArgs {
            slug: Symbol::new(env, "mangrove"),
            common_name: soroban_sdk::String::from_str(env, "Mangrove"),
            scientific_name: soroban_sdk::String::from_str(env, "Rhizophora mangle"),
            family: soroban_sdk::String::from_str(env, "Rhizophoraceae"),
            genus: soroban_sdk::String::from_str(env, "Rhizophora"),
            conservation_status: ConservationStatus::LeastConcern,
            leaf_type: LeafType::Broadleaf,
            native_region: soroban_sdk::String::from_str(env, "West Africa"),
            avg_height_m: 15,
            avg_lifespan_years: 100,
            co2_kg_per_year: 2200,
        }
    }

    fn make_args(
        env: &Env,
        slug: &str,
        cn: &str,
        sn: &str,
        fam: &str,
        gen: &str,
        region: &str,
        status: ConservationStatus,
        leaf: LeafType,
        height: u32,
        life: u32,
        co2: i128,
    ) -> RegisterSpeciesArgs {
        RegisterSpeciesArgs {
            slug: Symbol::new(env, slug),
            common_name: soroban_sdk::String::from_str(env, cn),
            scientific_name: soroban_sdk::String::from_str(env, sn),
            family: soroban_sdk::String::from_str(env, fam),
            genus: soroban_sdk::String::from_str(env, gen),
            conservation_status: status,
            leaf_type: leaf,
            native_region: soroban_sdk::String::from_str(env, region),
            avg_height_m: height,
            avg_lifespan_years: life,
            co2_kg_per_year: co2,
        }
    }

    fn upd_args(
        env: &Env,
        cn: &str,
        sn: &str,
        fam: &str,
        gen: &str,
        region: &str,
        status: ConservationStatus,
        leaf: LeafType,
        height: u32,
        life: u32,
        co2: i128,
    ) -> UpdateSpeciesArgs {
        UpdateSpeciesArgs {
            common_name: soroban_sdk::String::from_str(env, cn),
            scientific_name: soroban_sdk::String::from_str(env, sn),
            family: soroban_sdk::String::from_str(env, fam),
            genus: soroban_sdk::String::from_str(env, gen),
            conservation_status: status,
            leaf_type: leaf,
            native_region: soroban_sdk::String::from_str(env, region),
            avg_height_m: height,
            avg_lifespan_years: life,
            co2_kg_per_year: co2,
        }
    }

    fn register_sample(client: &SpeciesCatalogClient<'static>, env: &Env) -> u32 {
        client.register_species(&sample_args(env))
    }

    // ── Initialization ────────────────────────────────────────────────────

    #[test]
    fn test_initialize() {
        let (env, _admin, client) = setup();
        assert_eq!(client.species_count(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_panics() {
        let (env, admin, client) = setup();
        client.initialize(&admin);
    }

    // ── Registration ──────────────────────────────────────────────────────

    #[test]
    fn test_register_species() {
        let (env, _admin, client) = setup();
        let id = register_sample(&client, &env);
        assert_eq!(id, 0);
        assert_eq!(client.species_count(), 1);

        let entry = client.get_species(&0);
        assert_eq!(entry.slug, Symbol::new(&env, "mangrove"));
        assert_eq!(
            entry.common_name,
            soroban_sdk::String::from_str(&env, "Mangrove")
        );
        assert_eq!(
            entry.scientific_name,
            soroban_sdk::String::from_str(&env, "Rhizophora mangle")
        );
        assert_eq!(
            entry.family,
            soroban_sdk::String::from_str(&env, "Rhizophoraceae")
        );
        assert_eq!(
            entry.genus,
            soroban_sdk::String::from_str(&env, "Rhizophora")
        );
        assert_eq!(entry.conservation_status, ConservationStatus::LeastConcern);
        assert_eq!(entry.leaf_type, LeafType::Broadleaf);
        assert_eq!(
            entry.native_region,
            soroban_sdk::String::from_str(&env, "West Africa")
        );
        assert_eq!(entry.avg_height_m, 15);
        assert_eq!(entry.avg_lifespan_years, 100);
        assert_eq!(entry.co2_kg_per_year, 2200);
    }

    #[test]
    fn test_register_multiple_species() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "teak", "Teak", "Tectona grandis", "Lamiaceae", "Tectona",
            "South Asia", ConservationStatus::NearThreatened, LeafType::Broadleaf,
            30, 100, 4800,
        ));
        client.register_species(&make_args(
            &env, "pine", "Pine", "Pinus sylvestris", "Pinaceae", "Pinus",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));
        assert_eq!(client.species_count(), 2);
        assert_eq!(client.get_species(&0).slug, Symbol::new(&env, "teak"));
        assert_eq!(client.get_species(&1).slug, Symbol::new(&env, "pine"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_register_duplicate_slug_panics() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        register_sample(&client, &env);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #98)")]
    fn test_register_empty_common_name_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "", "Test sci", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #99)")]
    fn test_register_empty_scientific_name_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #100)")]
    fn test_register_zero_height_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "Test", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 0, 50, 100,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #101)")]
    fn test_register_zero_lifespan_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "Test", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 0, 100,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_register_zero_co2_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "Test", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 0,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_register_negative_co2_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "Test", "Fam", "Gen", "R",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, -1,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_register_empty_region_panics() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "test", "Test", "Test", "Fam", "Gen", "",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100,
        ));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_non_admin_register_panics() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SpeciesCatalog);
        let client = SpeciesCatalogClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let non_admin = Address::generate(&env);
        env.mock_auths(&[(&non_admin, &contract_id, &[])]);

        client.register_species(&make_args(
            &env, "teak", "Teak", "Tectona", "Lami", "Tectona", "Asia",
            ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100,
        ));
    }

    // ── Update ────────────────────────────────────────────────────────────

    #[test]
    fn test_update_species() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);

        client.update_species(
            &0,
            &upd_args(
                &env, "Mangrove Tree", "Rhizophora mangle L.",
                "Rhizophoraceae", "Rhizophora", "Tropical Coasts",
                ConservationStatus::Vulnerable, LeafType::Broadleaf,
                18, 120, 2500,
            ),
        );

        let entry = client.get_species(&0);
        assert_eq!(
            entry.common_name,
            soroban_sdk::String::from_str(&env, "Mangrove Tree")
        );
        assert_eq!(
            entry.scientific_name,
            soroban_sdk::String::from_str(&env, "Rhizophora mangle L.")
        );
        assert_eq!(entry.conservation_status, ConservationStatus::Vulnerable);
        assert_eq!(entry.avg_height_m, 18);
        assert_eq!(entry.co2_kg_per_year, 2500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_update_nonexistent_panics() {
        let (env, _admin, client) = setup();
        client.update_species(
            &999,
            &upd_args(
                &env, "X", "X", "X", "X", "X",
                ConservationStatus::LeastConcern, LeafType::Broadleaf,
                10, 50, 100,
            ),
        );
    }

    // ── Remove ────────────────────────────────────────────────────────────

    #[test]
    fn test_remove_species() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        assert_eq!(client.species_count(), 1);
        client.remove_species(&0);
        assert_eq!(client.species_count(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_get_removed_species_panics() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        client.remove_species(&0);
        client.get_species(&0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_remove_nonexistent_panics() {
        let (_env, _admin, client) = setup();
        client.remove_species(&999);
    }

    // ── Get by slug ───────────────────────────────────────────────────────

    #[test]
    fn test_get_species_by_slug() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        let entry = client.get_species_by_slug(&Symbol::new(&env, "mangrove"));
        assert_eq!(entry.id, 0);
        assert_eq!(entry.slug, Symbol::new(&env, "mangrove"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_get_species_by_unknown_slug_panics() {
        let (env, _admin, client) = setup();
        client.get_species_by_slug(&Symbol::new(&env, "nonexistent"));
    }

    // ── Search: common name prefix ────────────────────────────────────────

    #[test]
    fn test_search_by_common_name() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhiz", "Rhiz",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Mango Tree", "M. indica", "Anac", "Mang",
            "Asia", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            20, 80, 3000,
        ));
        client.register_species(&make_args(
            &env, "s3", "Pine Tree", "P. sylvestris", "Pin", "Pin",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let results = client.search_by_common_name(
            &soroban_sdk::String::from_str(&env, "Man"),
            &10, &0,
        );
        assert_eq!(results.len(), 2);

        let results2 = client.search_by_common_name(
            &soroban_sdk::String::from_str(&env, "P"),
            &10, &0,
        );
        assert_eq!(results2.len(), 1);
    }

    #[test]
    fn test_search_by_common_name_no_match() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        let results = client.search_by_common_name(
            &soroban_sdk::String::from_str(&env, "Zzz"),
            &10, &0,
        );
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_search_by_common_name_empty_prefix() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        let results = client.search_by_common_name(
            &soroban_sdk::String::from_str(&env, ""),
            &10, &0,
        );
        assert_eq!(results.len(), 1);
    }

    // ── Search: scientific name prefix ────────────────────────────────────

    #[test]
    fn test_search_by_scientific_name() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "Rhizophora mangle", "Rhiz", "Rhiz",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Pine", "Pinus sylvestris", "Pin", "Pin",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let results = client.search_by_scientific_name(
            &soroban_sdk::String::from_str(&env, "Rhizophora"),
            &10, &0,
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results.get_unchecked(0).slug, Symbol::new(&env, "s1"));
    }

    // ── Search: genus (index) ─────────────────────────────────────────────

    #[test]
    fn test_search_by_genus() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhiz", "Rhizophora",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Mangrove2", "R. stylosa", "Rhiz", "Rhizophora",
            "Asia", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            12, 80, 2000,
        ));
        client.register_species(&make_args(
            &env, "s3", "Pine", "P. sylvestris", "Pin", "Pinus",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let results = client.search_by_genus(
            &soroban_sdk::String::from_str(&env, "Rhizophora"),
            &10, &0,
        );
        assert_eq!(results.len(), 2);
    }

    // ── Search: family (index) ────────────────────────────────────────────

    #[test]
    fn test_search_by_family() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhizophoraceae", "Rhiz",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Pine", "P. sylvestris", "Pinaceae", "Pin",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let results = client.search_by_family(
            &soroban_sdk::String::from_str(&env, "Rhizophoraceae"),
            &10, &0,
        );
        assert_eq!(results.len(), 1);
    }

    // ── Search: conservation status ───────────────────────────────────────

    #[test]
    fn test_search_by_conservation_status() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhiz", "Rhiz",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Oak", "Q. robur", "Fag", "Quercus",
            "Europe", ConservationStatus::Vulnerable, LeafType::Broadleaf,
            20, 300, 4000,
        ));

        let lc = client.search_by_conservation_status(&ConservationStatus::LeastConcern, &10, &0);
        assert_eq!(lc.len(), 1);

        let vu = client.search_by_conservation_status(&ConservationStatus::Vulnerable, &10, &0);
        assert_eq!(vu.len(), 1);
    }

    // ── Search: leaf type ─────────────────────────────────────────────────

    #[test]
    fn test_search_by_leaf_type() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhiz", "Rhiz",
            "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Pine", "P. sylvestris", "Pin", "Pin",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let bl = client.search_by_leaf_type(&LeafType::Broadleaf, &10, &0);
        assert_eq!(bl.len(), 1);
        assert_eq!(bl.get_unchecked(0).leaf_type, LeafType::Broadleaf);

        let nl = client.search_by_leaf_type(&LeafType::Needleleaf, &10, &0);
        assert_eq!(nl.len(), 1);
    }

    // ── Search: region ────────────────────────────────────────────────────

    #[test]
    fn test_search_by_region() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(
            &env, "s1", "Mangrove", "R. mangle", "Rhiz", "Rhiz",
            "West Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf,
            15, 100, 2200,
        ));
        client.register_species(&make_args(
            &env, "s2", "Pine", "P. sylvestris", "Pin", "Pin",
            "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf,
            25, 200, 3500,
        ));

        let wa = client.search_by_region(
            &soroban_sdk::String::from_str(&env, "West Africa"), &10, &0,
        );
        assert_eq!(wa.len(), 1);

        let eu = client.search_by_region(
            &soroban_sdk::String::from_str(&env, "Europe"), &10, &0,
        );
        assert_eq!(eu.len(), 1);
    }

    // ── Pagination ────────────────────────────────────────────────────────

    #[test]
    fn test_list_all_pagination() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(&env, "s1", "A", "SA", "F", "G", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));
        client.register_species(&make_args(&env, "s2", "B", "SB", "F", "G", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));
        client.register_species(&make_args(&env, "s3", "C", "SC", "F", "G", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));

        assert_eq!(client.list_all_species(&2, &0).len(), 2);
        assert_eq!(client.list_all_species(&2, &2).len(), 1);
        assert_eq!(client.list_all_species(&2, &4).len(), 0);
    }

    #[test]
    fn test_search_pagination() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(&env, "s1", "A", "SA", "Fam", "Gen", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));
        client.register_species(&make_args(&env, "s2", "B", "SB", "Fam", "Gen", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));
        client.register_species(&make_args(&env, "s3", "C", "SC", "Fam", "Gen", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));

        let results = client.search_by_genus(
            &soroban_sdk::String::from_str(&env, "Gen"), &2, &1,
        );
        assert_eq!(results.len(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_page_size_exceeded_panics() {
        let (env, _admin, client) = setup();
        client.list_all_species(&101, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_zero_page_size_panics() {
        let (env, _admin, client) = setup();
        client.list_all_species(&0, &0);
    }

    // ── Combined search ───────────────────────────────────────────────────

    #[test]
    fn test_search_species_combined_filter() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(&env, "s1", "Mangrove", "R. mangle", "Rhizophoraceae", "Rhizophora", "Africa", ConservationStatus::LeastConcern, LeafType::Broadleaf, 15, 100, 2200));
        client.register_species(&make_args(&env, "s2", "Mangrove2", "R. stylosa", "Rhizophoraceae", "Rhizophora", "Asia", ConservationStatus::Vulnerable, LeafType::Broadleaf, 12, 80, 2000));
        client.register_species(&make_args(&env, "s3", "Pine", "P. sylvestris", "Pinaceae", "Pinus", "Europe", ConservationStatus::LeastConcern, LeafType::Needleleaf, 25, 200, 3500));

        let filter = SearchFilter {
            common_name_prefix: Some(soroban_sdk::String::from_str(&env, "Man")),
            scientific_name_prefix: None,
            genus: None,
            family: Some(soroban_sdk::String::from_str(&env, "Rhizophoraceae")),
            conservation_status: None,
            leaf_type: None,
            native_region: None,
            limit: 10,
            offset: 0,
        };
        let response = client.search_species(&filter);
        assert_eq!(response.results.len(), 2);
        assert_eq!(response.total, 2);
    }

    #[test]
    fn test_search_species_no_filter() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);

        let filter = SearchFilter {
            common_name_prefix: None,
            scientific_name_prefix: None,
            genus: None,
            family: None,
            conservation_status: None,
            leaf_type: None,
            native_region: None,
            limit: 10,
            offset: 0,
        };
        let response = client.search_species(&filter);
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.total, 1);
    }

    #[test]
    fn test_search_species_pagination() {
        let (env, _admin, client) = setup();
        for i in 0..5u32 {
            client.register_species(&make_args(
                &env,
                &format!("sp{}", i),
                &format!("Tree {}", i),
                &format!("Sci {}", i),
                "SameFamily",
                "SameGenus",
                "Region",
                ConservationStatus::LeastConcern,
                LeafType::Broadleaf,
                10, 50, 100,
            ));
        }

        let filter = SearchFilter {
            common_name_prefix: None,
            scientific_name_prefix: None,
            genus: Some(soroban_sdk::String::from_str(&env, "SameGenus")),
            family: None,
            conservation_status: None,
            leaf_type: None,
            native_region: None,
            limit: 2,
            offset: 0,
        };
        let resp = client.search_species(&filter);
        assert_eq!(resp.results.len(), 2);
        assert_eq!(resp.total, 5);

        let filter2 = SearchFilter {
            common_name_prefix: None,
            scientific_name_prefix: None,
            genus: Some(soroban_sdk::String::from_str(&env, "SameGenus")),
            family: None,
            conservation_status: None,
            leaf_type: None,
            native_region: None,
            limit: 2,
            offset: 2,
        };
        let resp2 = client.search_species(&filter2);
        assert_eq!(resp2.results.len(), 2);
        assert_eq!(resp2.total, 5);

        let filter3 = SearchFilter {
            common_name_prefix: None,
            scientific_name_prefix: None,
            genus: Some(soroban_sdk::String::from_str(&env, "SameGenus")),
            family: None,
            conservation_status: None,
            leaf_type: None,
            native_region: None,
            limit: 2,
            offset: 4,
        };
        let resp3 = client.search_species(&filter3);
        assert_eq!(resp3.results.len(), 1);
        assert_eq!(resp3.total, 5);
    }

    // ── Edge cases ────────────────────────────────────────────────────────

    #[test]
    fn test_empty_catalog_queries() {
        let (env, _admin, client) = setup();
        assert_eq!(client.list_all_species(&10, &0).len(), 0);
        assert_eq!(
            client.search_by_common_name(&soroban_sdk::String::from_str(&env, "A"), &10, &0).len(),
            0
        );
        assert_eq!(
            client.search_by_genus(&soroban_sdk::String::from_str(&env, "A"), &10, &0).len(),
            0
        );
    }

    #[test]
    fn test_remove_and_reregister() {
        let (env, _admin, client) = setup();
        register_sample(&client, &env);
        client.remove_species(&0);
        assert_eq!(client.species_count(), 0);
        let id = register_sample(&client, &env);
        assert_eq!(id, 1);
        assert_eq!(client.species_count(), 1);
    }

    #[test]
    fn test_index_cleanup_after_remove() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(&env, "s1", "Tree A", "Sci A", "Fam", "Gen", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));
        client.register_species(&make_args(&env, "s2", "Tree B", "Sci B", "Fam", "Gen", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));

        let before = client.search_by_genus(
            &soroban_sdk::String::from_str(&env, "Gen"), &10, &0,
        );
        assert_eq!(before.len(), 2);

        client.remove_species(&0);

        let after = client.search_by_genus(
            &soroban_sdk::String::from_str(&env, "Gen"), &10, &0,
        );
        assert_eq!(after.len(), 1);
        assert_eq!(after.get_unchecked(0).id, 1);
    }

    #[test]
    fn test_update_rebuilds_index() {
        let (env, _admin, client) = setup();
        client.register_species(&make_args(&env, "s1", "Tree A", "Sci A", "FamA", "GenA", "R", ConservationStatus::LeastConcern, LeafType::Broadleaf, 10, 50, 100));

        let before = client.search_by_family(
            &soroban_sdk::String::from_str(&env, "FamA"), &10, &0,
        );
        assert_eq!(before.len(), 1);

        client.update_species(&0, &upd_args(
            &env, "Tree A Updated", "Sci A Updated",
            "FamB", "GenB", "NewRegion",
            ConservationStatus::Vulnerable, LeafType::Needleleaf,
            20, 75, 500,
        ));

        assert_eq!(
            client.search_by_family(&soroban_sdk::String::from_str(&env, "FamA"), &10, &0).len(), 0
        );
        assert_eq!(
            client.search_by_family(&soroban_sdk::String::from_str(&env, "FamB"), &10, &0).len(), 1
        );
        assert_eq!(
            client.search_by_genus(&soroban_sdk::String::from_str(&env, "GenB"), &10, &0).len(), 1
        );
        assert_eq!(
            client.search_by_conservation_status(&ConservationStatus::Vulnerable, &10, &0).len(), 1
        );
        assert_eq!(
            client.search_by_leaf_type(&LeafType::Needleleaf, &10, &0).len(), 1
        );
    }
}
