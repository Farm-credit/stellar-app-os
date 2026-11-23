#![no_std]

//! Species Registry — Closes #554, #1807
//!
//! On-chain catalogue of tree species with FAO/IPCC Tier-1 CO₂ sequestration
//! rates.  The off-chain seeder (`scripts/seed-species.mjs`) calls
//! `register_classified_species` for each row in `data/fao_co2_rates.csv`.
//!
//! # #1807 — Ecological yield multipliers
//!
//! The Tier-1 rate alone rewards fast-growing species (eucalyptus matures in
//! 10 years and sequesters more per year than most hardwoods), which is the
//! opposite of what an ecological restoration project wants to incentivise.
//! Every species therefore carries a **category** and an **ecological yield
//! multiplier** expressed in basis points (`10_000` = 1.00×):
//!
//! | Category        | Default | Rationale |
//! | --------------- | ------- | --------- |
//! | `Native`        | 1.20×   | Native saplings restore the local seed bank, support endemic fauna, hold soil and water, and are permanent — so a native tonne counts for more than a generic one. |
//! | `FastGrowing`   | 0.80×   | Quick-growing, often introduced species sequester fast but consume more water and nutrients, are harvested young, and their permanence (the "non-permanence" risk of every carbon standard) is lower. |
//! | `Unclassified`  | 1.00×   | Neutral default, so records written before #1807 (and the legacy 3-argument `register_species` entrypoint) keep their exact previous value. |
//!
//! The **base** rate stays available unchanged through `get_co2_rate`; the
//! multiplier-adjusted value — the one that should be used for credit
//! issuance and yield projections — is `get_effective_co2_rate`, i.e.
//!
//! ```text
//! effective = base_co2_scaled × yield_multiplier_bps / 10_000
//! ```
//!
//! Multipliers are admin-controlled in two layers: the per-category default
//! (`set_category_multiplier`, used whenever a species is registered or
//! classified) and a per-species override (`set_species_multiplier`) that wins
//! over the category default.  Both are validated against
//! `[MIN_MULTIPLIER_BPS, MAX_MULTIPLIER_BPS]` so no single species can be made
//! worth an absurd amount.
//!
//! # Storage layout
//!   Instance:
//!     ADMIN                   — Address   (admin allowed to write species)
//!     ("CATMULT", category)    — u32       (per-category default multiplier)
//!   Persistent (keyed by species slug Symbol):
//!     ("SPECIES", <slug>)      — SpeciesRecord
//!
//! The `("SPECIES", slug)` key encoding is unchanged from #554 so records
//! written before #1807 stay readable; they simply decode with the new
//! `category`/`yield_multiplier_bps` fields defaulted by `SpeciesRecord`
//! (see `get_species`).
//!
//! # Functions
//!   initialize(admin)
//!   register_species(slug, co2_scaled, maturity_years)                    — legacy, Unclassified
//!   register_classified_species(slug, co2_scaled, maturity_years, category)
//!   classify_species(slug, category)                                      — re-classify, admin only
//!   set_species_multiplier(slug, bps)                                     — per-species override
//!   set_category_multiplier(category, bps)                                — category default
//!   get_species(slug) -> SpeciesRecord
//!   get_co2_rate(slug) -> i128                        (base, co2_kg_per_year × 100)
//!   get_effective_co2_rate(slug) -> i128              (base × multiplier)
//!   get_multiplier(slug) -> u32
//!   get_category(slug) -> SpeciesCategory
//!   get_category_multiplier(category) -> u32

use harvesta_errors::{standard, HarvestaError};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol,
};

// ── Errors ────────────────────────────────────────────────────────────────────

/// Crate-local errors, in the `species-registry` block of the global error
/// namespace (`contracts/harvesta-errors/src/standard.rs`, crate index 39).
///
/// Shared conditions (`NotInitialized`, `SpeciesNotFound`, `Co2MustBePositive`,
/// …) keep using the canonical [`HarvestaError`] codes; only conditions that
/// are unique to this contract get a local code, so no shipped client has to
/// re-map anything.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SpeciesRegistryError {
    /// Yield multiplier outside `[MIN_MULTIPLIER_BPS, MAX_MULTIPLIER_BPS]`.
    InvalidMultiplier = 2_621_441,
}

/// Index of this crate in `harvesta_errors::standard::CRATE_NAMES`
/// (`species-registry` → namespace `0x28`).
pub const CRATE_INDEX: usize = 39;

const _: () = {
    assert!(
        SpeciesRegistryError::InvalidMultiplier as u32 == standard::global_code(CRATE_INDEX, 1)
    );
};

// ── Multiplier policy ─────────────────────────────────────────────────────────

/// Basis-point denominator: `10_000 bps` = 1.00×.
pub const BPS_DENOMINATOR: u32 = 10_000;

/// Lowest multiplier an admin may set (0.10×).  A floor keeps a species from
/// being reduced to a rounding-error rate by a typo.
pub const MIN_MULTIPLIER_BPS: u32 = 1_000;

/// Highest multiplier an admin may set (3.00×).  A ceiling keeps one species
/// from being able to claim an outsized share of an issuance round.
pub const MAX_MULTIPLIER_BPS: u32 = 30_000;

/// Default multiplier for native species (1.20×).
pub const NATIVE_MULTIPLIER_BPS: u32 = 12_000;

/// Default multiplier for fast-growing species (0.80×).
pub const FAST_GROWING_MULTIPLIER_BPS: u32 = 8_000;

/// Default multiplier for species that have not been classified (1.00×).
pub const UNCLASSIFIED_MULTIPLIER_BPS: u32 = BPS_DENOMINATOR;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Ecological role of a species, which selects its default yield multiplier.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpeciesCategory {
    /// Not classified (all records written before #1807 start here).
    Unclassified,
    /// Native to the project's biome — ecological premium.
    Native,
    /// Quick-growing / often introduced species — permanence discount.
    FastGrowing,
}

impl SpeciesCategory {
    /// Stable on-chain code, used in storage keys and events.  Values are part
    /// of the observable interface — never renumber them.
    pub const fn code(self) -> u32 {
        match self {
            SpeciesCategory::Unclassified => 0,
            SpeciesCategory::Native => 1,
            SpeciesCategory::FastGrowing => 2,
        }
    }
}

/// On-chain record for a single species.
/// `co2_scaled` = kg CO₂ per year × 100 (integer, avoids floats on-chain).
/// Example: 22.00 kg/yr  →  co2_scaled = 2200
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesRecord {
    pub slug: Symbol,
    /// CO₂ kg/year × 100 (scaled integer) — the FAO/IPCC Tier-1 baseline.
    pub co2_scaled: i128,
    /// Years to biomass maturity
    pub maturity_years: u32,
    /// Ledger timestamp of last update
    pub updated_at: u64,
    /// Ecological category (#1807).
    pub category: SpeciesCategory,
    /// Ecological yield multiplier in basis points (#1807); `10_000` = 1.00×.
    pub yield_multiplier_bps: u32,
}

impl SpeciesRecord {
    /// Base rate scaled by the ecological multiplier, truncated toward zero.
    pub fn effective_co2_scaled(&self) -> i128 {
        self.co2_scaled * (self.yield_multiplier_bps as i128) / (BPS_DENOMINATOR as i128)
    }
}

/// Built-in default used when the admin has never overridden a category.
pub const fn builtin_multiplier(category: SpeciesCategory) -> u32 {
    match category {
        SpeciesCategory::Native => NATIVE_MULTIPLIER_BPS,
        SpeciesCategory::FastGrowing => FAST_GROWING_MULTIPLIER_BPS,
        SpeciesCategory::Unclassified => UNCLASSIFIED_MULTIPLIER_BPS,
    }
}

// ── Storage keys ──────────────────────────────────────────────────────────────

fn admin_key() -> Symbol {
    symbol_short!("ADMIN")
}

fn species_key(slug: &Symbol) -> (Symbol, Symbol) {
    (symbol_short!("SPECIES"), slug.clone())
}

fn category_multiplier_key(category: SpeciesCategory) -> (Symbol, u32) {
    (symbol_short!("CATMULT"), category.code())
}

/// Reads the category default, falling back to the built-in policy value.
fn category_multiplier(env: &Env, category: SpeciesCategory) -> u32 {
    env.storage()
        .instance()
        .get(&category_multiplier_key(category))
        .unwrap_or_else(|| builtin_multiplier(category))
}

/// Admin authentication shared by every write.
fn require_admin(env: &Env) -> Address {
    let admin: Address = match env.storage().instance().get(&admin_key()) {
        Some(admin) => admin,
        None => panic_with_error!(env, HarvestaError::NotInitialized),
    };
    admin.require_auth();
    admin
}

/// Rejects multipliers outside the policy window.
fn validate_multiplier(env: &Env, bps: u32) {
    if !(MIN_MULTIPLIER_BPS..=MAX_MULTIPLIER_BPS).contains(&bps) {
        panic_with_error!(env, SpeciesRegistryError::InvalidMultiplier);
    }
}

fn load_species(env: &Env, slug: &Symbol) -> SpeciesRecord {
    env.storage()
        .persistent()
        .get(&species_key(slug))
        .unwrap_or_else(|| panic_with_error!(env, HarvestaError::SpeciesNotFound))
}

/// Validates and stores a record, emitting the legacy `register` event plus the
/// #1807 `classify` event so indexers can track the multiplier.
fn store_species(
    env: &Env,
    slug: &Symbol,
    co2_scaled: i128,
    maturity_years: u32,
    category: SpeciesCategory,
    yield_multiplier_bps: u32,
) -> SpeciesRecord {
    if co2_scaled <= 0 {
        panic_with_error!(env, HarvestaError::Co2MustBePositive);
    }
    if maturity_years == 0 {
        panic_with_error!(env, HarvestaError::MaturityYearsMustBePositive);
    }
    validate_multiplier(env, yield_multiplier_bps);

    let record = SpeciesRecord {
        slug: slug.clone(),
        co2_scaled,
        maturity_years,
        updated_at: env.ledger().timestamp(),
        category,
        yield_multiplier_bps,
    };

    env.storage().persistent().set(&species_key(slug), &record);

    env.events().publish(
        (symbol_short!("species"), symbol_short!("register")),
        (slug.clone(), co2_scaled, maturity_years),
    );
    env.events().publish(
        (symbol_short!("species"), symbol_short!("classify")),
        (slug.clone(), category.code(), yield_multiplier_bps),
    );

    record
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SpeciesRegistry;

#[contractimpl]
impl SpeciesRegistry {
    /// One-time initialisation.  Must be called before any other function.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&admin_key()) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&admin_key(), &admin);
    }

    /// Register or update a species without an ecological classification.
    ///
    /// Kept for backwards compatibility with #554 and the original seeder:
    /// the record lands in `SpeciesCategory::Unclassified` with the neutral
    /// 1.00× multiplier, so `get_effective_co2_rate` equals the base rate
    /// exactly as before #1807.  Use [`Self::register_classified_species`] to
    /// apply a category multiplier, or [`Self::classify_species`] to upgrade a
    /// record already on chain.
    ///
    /// * `slug`          — short identifier, e.g. `Symbol::new(&env, "teak")`
    /// * `co2_scaled`    — kg CO₂ per year × 100  (positive integer)
    /// * `maturity_years`— years to biomass maturity
    pub fn register_species(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
        require_admin(&env);
        let category = SpeciesCategory::Unclassified;
        store_species(
            &env,
            &slug,
            co2_scaled,
            maturity_years,
            category,
            category_multiplier(&env, category),
        );
    }

    /// Register or update a species with its ecological category (#1807).
    ///
    /// The stored multiplier is the category's current default; override it
    /// afterwards with [`Self::set_species_multiplier`].  Native species pick
    /// up 1.20×, fast-growing species 0.80× unless the admin changed the
    /// category defaults.
    pub fn register_classified_species(
        env: Env,
        slug: Symbol,
        co2_scaled: i128,
        maturity_years: u32,
        category: SpeciesCategory,
    ) {
        require_admin(&env);
        let multiplier = category_multiplier(&env, category);
        store_species(
            &env,
            &slug,
            co2_scaled,
            maturity_years,
            category,
            multiplier,
        );
    }

    /// Re-classify an existing species and snap it to the category default.
    ///
    /// This is the migration path for records seeded before #1807: the base
    /// rate and maturity stay untouched, only the category and multiplier
    /// change.  A per-species override is reset — re-apply it afterwards if
    /// the species needs one.
    pub fn classify_species(env: Env, slug: Symbol, category: SpeciesCategory) {
        require_admin(&env);
        let mut record = load_species(&env, &slug);
        let multiplier = category_multiplier(&env, category);
        record.category = category;
        record.yield_multiplier_bps = multiplier;
        record.updated_at = env.ledger().timestamp();
        env.storage().persistent().set(&species_key(&slug), &record);

        env.events().publish(
            (symbol_short!("species"), symbol_short!("classify")),
            (slug, category.code(), multiplier),
        );
    }

    /// Override one species' multiplier (`1_000..=30_000` bps).
    ///
    /// The override survives later category-default changes; it is replaced
    /// only by another override or by `classify_species`.
    pub fn set_species_multiplier(env: Env, slug: Symbol, yield_multiplier_bps: u32) {
        require_admin(&env);
        validate_multiplier(&env, yield_multiplier_bps);

        let mut record = load_species(&env, &slug);
        record.yield_multiplier_bps = yield_multiplier_bps;
        record.updated_at = env.ledger().timestamp();
        env.storage().persistent().set(&species_key(&slug), &record);

        env.events().publish(
            (symbol_short!("species"), symbol_short!("setmult")),
            (slug, yield_multiplier_bps),
        );
    }

    /// Set the default multiplier used for future registrations of a category.
    ///
    /// Existing records are deliberately **not** rewritten — their multiplier
    /// was snapshotted when they were registered, so an issuance round already
    /// priced on those values stays reproducible.  Use
    /// [`Self::classify_species`] or [`Self::set_species_multiplier`] to move a
    /// specific record.
    pub fn set_category_multiplier(env: Env, category: SpeciesCategory, yield_multiplier_bps: u32) {
        require_admin(&env);
        validate_multiplier(&env, yield_multiplier_bps);

        env.storage()
            .instance()
            .set(&category_multiplier_key(category), &yield_multiplier_bps);

        env.events().publish(
            (symbol_short!("species"), symbol_short!("catmult")),
            (category.code(), yield_multiplier_bps),
        );
    }

    /// Retrieve the full record for a species slug.  Panics if not found.
    pub fn get_species(env: Env, slug: Symbol) -> SpeciesRecord {
        load_species(&env, &slug)
    }

    /// Base CO₂ rate: kg CO₂ per year × 100, without the ecological
    /// multiplier.  Unchanged since #554.
    pub fn get_co2_rate(env: Env, slug: Symbol) -> i128 {
        load_species(&env, &slug).co2_scaled
    }

    /// Ecological yield multiplier for a species, in basis points.
    pub fn get_multiplier(env: Env, slug: Symbol) -> u32 {
        load_species(&env, &slug).yield_multiplier_bps
    }

    /// Category a species is classified under.
    pub fn get_category(env: Env, slug: Symbol) -> SpeciesCategory {
        load_species(&env, &slug).category
    }

    /// Current default multiplier for a category (admin override or built-in).
    pub fn get_category_multiplier(env: Env, category: SpeciesCategory) -> u32 {
        category_multiplier(&env, category)
    }

    /// Multiplier-adjusted CO₂ rate — the value to use for credit issuance:
    /// `co2_scaled × yield_multiplier_bps / 10_000`.
    ///
    /// Example: teak at 2200 (22.00 kg/yr) classified `Native` →
    /// `2200 × 12_000 / 10_000 = 2640` (26.40 kg/yr of credited sequestration).
    pub fn get_effective_co2_rate(env: Env, slug: Symbol) -> i128 {
        load_species(&env, &slug).effective_co2_scaled()
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events},
        xdr::ContractEventBody,
        Env, IntoVal, Symbol, TryFromVal, Val,
    };

    fn setup() -> (Env, SpeciesRegistryClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SpeciesRegistry, ());
        let client = SpeciesRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    // ── #554 behaviour is unchanged ──────────────────────────────────────────

    #[test]
    fn test_register_and_get() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        let record = client.get_species(&slug);
        assert_eq!(record.co2_scaled, 2200);
        assert_eq!(record.maturity_years, 20);
        assert_eq!(client.get_co2_rate(&slug), 2200);
    }

    #[test]
    fn test_legacy_register_is_neutral() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "legacy");
        client.register_species(&slug, &1500_i128, &12_u32);

        let record = client.get_species(&slug);
        assert_eq!(record.category, SpeciesCategory::Unclassified);
        assert_eq!(record.yield_multiplier_bps, UNCLASSIFIED_MULTIPLIER_BPS);
        // Backwards compatibility: effective rate must equal the base rate.
        assert_eq!(client.get_effective_co2_rate(&slug), 1500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #64)")]
    fn test_get_unknown_species_panics() {
        let (env, client, _admin) = setup();
        client.get_species(&Symbol::new(&env, "unknown"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_reject_zero_co2() {
        let (env, client, _admin) = setup();
        client.register_species(&Symbol::new(&env, "bad"), &0_i128, &5_u32);
    }

    // ── #1807 ecological multipliers ─────────────────────────────────────────

    #[test]
    fn test_native_species_gets_premium() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "mangrove");
        client.register_classified_species(&slug, &1400_i128, &15_u32, &SpeciesCategory::Native);

        let record = client.get_species(&slug);
        assert_eq!(record.category, SpeciesCategory::Native);
        assert_eq!(record.yield_multiplier_bps, NATIVE_MULTIPLIER_BPS);
        assert_eq!(client.get_multiplier(&slug), NATIVE_MULTIPLIER_BPS);
        assert_eq!(client.get_category(&slug), SpeciesCategory::Native);
        // 1400 × 1.20 = 1680
        assert_eq!(client.get_effective_co2_rate(&slug), 1680);
    }

    #[test]
    fn test_fast_growing_species_gets_discount() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "eucalyptus");
        client.register_classified_species(
            &slug,
            &3100_i128,
            &10_u32,
            &SpeciesCategory::FastGrowing,
        );

        let record = client.get_species(&slug);
        assert_eq!(record.category, SpeciesCategory::FastGrowing);
        assert_eq!(record.yield_multiplier_bps, FAST_GROWING_MULTIPLIER_BPS);
        // 3100 × 0.80 = 2480 — a lower credited rate than the native species,
        // even though this species sequesters more per year.
        assert_eq!(client.get_effective_co2_rate(&slug), 2480);
        assert!(client.get_effective_co2_rate(&slug) < client.get_co2_rate(&slug));
    }

    #[test]
    fn test_effective_rate_truncates_toward_zero() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "acacia");
        client.register_classified_species(&slug, &1234_i128, &12_u32, &SpeciesCategory::Native);
        // 1234 × 12_000 / 10_000 = 1480.8 → 1480
        assert_eq!(client.get_effective_co2_rate(&slug), 1480);

        client.set_species_multiplier(&slug, &8_125_u32);
        // 1234 × 8_125 / 10_000 = 1002.625 → 1002
        assert_eq!(client.get_effective_co2_rate(&slug), 1002);
    }

    #[test]
    fn test_per_species_override_wins_over_category_default() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "neem");
        client.register_classified_species(&slug, &1300_i128, &10_u32, &SpeciesCategory::Native);
        client.set_species_multiplier(&slug, &15_000_u32);

        assert_eq!(client.get_multiplier(&slug), 15_000);
        // Overriding the multiplier keeps the category.
        assert_eq!(client.get_category(&slug), SpeciesCategory::Native);
        // 1300 × 1.50 = 1950
        assert_eq!(client.get_effective_co2_rate(&slug), 1950);
    }

    #[test]
    fn test_category_default_change_only_affects_new_registrations() {
        let (env, client, _admin) = setup();

        let old = Symbol::new(&env, "old_native");
        client.register_classified_species(&old, &1000_i128, &10_u32, &SpeciesCategory::Native);

        client.set_category_multiplier(&SpeciesCategory::Native, &13_500_u32);
        assert_eq!(
            client.get_category_multiplier(&SpeciesCategory::Native),
            13_500
        );

        // Snapshot semantics: the already-registered record keeps 1.20×.
        assert_eq!(client.get_multiplier(&old), NATIVE_MULTIPLIER_BPS);

        let new = Symbol::new(&env, "new_native");
        client.register_classified_species(&new, &1000_i128, &10_u32, &SpeciesCategory::Native);
        assert_eq!(client.get_multiplier(&new), 13_500);
        assert_eq!(client.get_effective_co2_rate(&new), 1350);
    }

    #[test]
    fn test_classify_upgrades_legacy_record() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);
        assert_eq!(client.get_effective_co2_rate(&slug), 2200);

        client.classify_species(&slug, &SpeciesCategory::Native);

        let record = client.get_species(&slug);
        // Base rate and maturity untouched by the migration.
        assert_eq!(record.co2_scaled, 2200);
        assert_eq!(record.maturity_years, 20);
        assert_eq!(record.category, SpeciesCategory::Native);
        assert_eq!(record.yield_multiplier_bps, NATIVE_MULTIPLIER_BPS);
        assert_eq!(client.get_effective_co2_rate(&slug), 2640);
    }

    #[test]
    fn test_classify_resets_override_to_category_default() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "mahogany");
        client.register_classified_species(&slug, &1800_i128, &25_u32, &SpeciesCategory::Native);
        client.set_species_multiplier(&slug, &20_000_u32);
        assert_eq!(client.get_multiplier(&slug), 20_000);

        client.classify_species(&slug, &SpeciesCategory::FastGrowing);
        assert_eq!(client.get_multiplier(&slug), FAST_GROWING_MULTIPLIER_BPS);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #64)")]
    fn test_classify_unknown_species_panics() {
        let (env, client, _admin) = setup();
        client.classify_species(&Symbol::new(&env, "ghost"), &SpeciesCategory::Native);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #64)")]
    fn test_set_multiplier_unknown_species_panics() {
        let (env, client, _admin) = setup();
        client.set_species_multiplier(&Symbol::new(&env, "ghost"), &12_000_u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2621441)")]
    fn test_reject_multiplier_above_max() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "teak");
        client.register_classified_species(&slug, &2200_i128, &20_u32, &SpeciesCategory::Native);
        client.set_species_multiplier(&slug, &(MAX_MULTIPLIER_BPS + 1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2621441)")]
    fn test_reject_multiplier_below_min() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "teak");
        client.register_classified_species(&slug, &2200_i128, &20_u32, &SpeciesCategory::Native);
        client.set_species_multiplier(&slug, &(MIN_MULTIPLIER_BPS - 1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2621441)")]
    fn test_reject_zero_multiplier() {
        let (_env, client, _admin) = setup();
        client.set_category_multiplier(&SpeciesCategory::Native, &0_u32);
    }

    #[test]
    fn test_multiplier_bounds_are_inclusive() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "bounds");
        client.register_classified_species(&slug, &1000_i128, &5_u32, &SpeciesCategory::Native);

        client.set_species_multiplier(&slug, &MIN_MULTIPLIER_BPS);
        assert_eq!(client.get_effective_co2_rate(&slug), 100);

        client.set_species_multiplier(&slug, &MAX_MULTIPLIER_BPS);
        assert_eq!(client.get_effective_co2_rate(&slug), 3000);
    }

    #[test]
    fn test_classify_event_carries_category_and_multiplier() {
        let (env, client, _admin) = setup();

        let slug = Symbol::new(&env, "shea");
        client.register_classified_species(&slug, &900_i128, &15_u32, &SpeciesCategory::Native);

        let events = env.events().all();
        // `register_classified_species` emits `register` then `classify`, so
        // the classify event is the last one.
        let last = events.events().last().expect("classify event missing");
        let ContractEventBody::V0(v0) = &last.body;
        let data = Val::try_from_val(&env, &v0.data)
            .ok()
            .and_then(|val| <(Symbol, u32, u32)>::try_from_val(&env, &val).ok());
        assert_eq!(
            data,
            Some((
                slug.clone(),
                SpeciesCategory::Native.code(),
                NATIVE_MULTIPLIER_BPS
            ))
        );
    }

    /// Pin the wire format the seeder has to produce for `category`.
    ///
    /// A fieldless Soroban enum is a union with void cases, so it is **not** a
    /// bare `Symbol`: the variant name travels inside a one-element `Vec`
    /// (`xdr.ScVal.scvVec([nativeToScVal('FastGrowing', { type: 'symbol' })])`
    /// in the seeder).  Encoding it as a plain symbol or as `code()` is
    /// rejected, which is exactly the mistake worth guarding against.
    #[test]
    fn test_category_wire_format_is_variant_symbol_in_vec() {
        let env = Env::default();

        for (name, expected) in [
            ("Native", SpeciesCategory::Native),
            ("FastGrowing", SpeciesCategory::FastGrowing),
            ("Unclassified", SpeciesCategory::Unclassified),
        ] {
            let symbol = Symbol::new(&env, name);
            let encoded: Val = soroban_sdk::vec![&env, symbol.clone()].into_val(&env);
            assert_eq!(
                <SpeciesCategory>::try_from_val(&env, &encoded).unwrap(),
                expected
            );

            // A bare symbol is not the wire format.
            assert!(<SpeciesCategory>::try_from_val(&env, &symbol.to_val()).is_err());
        }

        // Neither is the integer code used in events and storage keys.
        let code: Val = 2_u32.into_val(&env);
        assert!(<SpeciesCategory>::try_from_val(&env, &code).is_err());
    }

    #[test]
    fn test_writes_require_initialization() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SpeciesRegistry, ());
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        // No admin stored → NotInitialized rather than a silent success.
        assert!(client
            .try_register_classified_species(
                &Symbol::new(&env, "teak"),
                &2200_i128,
                &20_u32,
                &SpeciesCategory::Native,
            )
            .is_err());
    }

    #[test]
    fn test_writes_require_admin_authorization() {
        let env = Env::default();
        let contract_id = env.register(SpeciesRegistry, ());
        let client = SpeciesRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        // Initialize without mocking auth (the constructor takes no auth).
        env.mock_all_auths();
        client.initialize(&admin);
        // From here on, auth must be genuinely satisfied by the admin.
        env.set_auths(&[]);

        let slug = Symbol::new(&env, "teak");
        assert!(client
            .try_register_classified_species(&slug, &2200_i128, &20_u32, &SpeciesCategory::Native)
            .is_err());
    }
}
