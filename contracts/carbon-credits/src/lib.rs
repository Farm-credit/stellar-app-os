#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, Symbol, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum CarbonCreditsError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    SpeciesNotFound = 4,
    InsufficientOffsets = 5,
    /// No regional baseline is registered for the project's region.
    BaselineNotSet = 6,
    /// A regional baseline must be strictly positive.
    InvalidBaseline = 7,
    /// No emissions record exists for the supplied project id.
    ProjectNotFound = 8,
    /// Emissions were already recorded for this project id (write-once).
    ProjectAlreadyRecorded = 9,
    /// Measured project emissions must be non-negative.
    InvalidEmissions = 10,
    /// The reporting period end must be strictly after its start.
    InvalidPeriod = 11,
    /// Minimum reduction threshold must be in basis points (0..=10_000).
    InvalidThreshold = 12,
    /// The project does not clear its regional baseline by the required margin.
    AdditionalityNotMet = 13,
    /// No retail lot exists for the supplied id.
    LotNotFound = 14,
    /// The retail lot was closed by its seller or is fully sold out.
    LotNotActive = 15,
    /// A retail purchase must be at least one full ton of CO₂.
    BelowMinimumRetailPortion = 16,
    /// The lot does not hold enough CO₂ left for the requested portion.
    InsufficientLotOffsets = 17,
    /// The retail rail has no payment token configured yet.
    RetailNotConfigured = 18,
    /// A lot must be a whole number of tons, and at least one ton.
    InvalidLotSize = 19,
    /// `price_per_ton` must be strictly positive.
    InvalidPrice = 20,
    /// Only the seller that opened a lot may close it.
    Unauthorized = 21,
    /// No soil measurement found for the specified plot.
    PlotMeasurementNotFound = 22,
    /// Invalid soil measurement data provided.
    InvalidSoilData = 23,
    /// Soil organic carbon did not improve above baseline.
    NoSequestrationAboveBaseline = 24,
    /// Soil bonus carbon credits were already awarded for this measurement.
    BonusAlreadyAwarded = 25,
    /// No retirement record exists for the supplied id.
    RetirementNotFound = 26,
}

// ── Units ─────────────────────────────────────────────────────────────────────

/// One metric ton of CO₂ in the gram unit used across the contract.
pub const GRAMS_PER_TON: u64 = 1_000_000;

/// Smallest portion a retail buyer may take: exactly one ton rather than the
/// 100+-ton blocks institutional buyers normally have to take (issue #1366).
pub const MIN_RETAIL_PORTION_GRAMS: u64 = GRAMS_PER_TON;

/// Retirement records are permanent: their TTL is bumped on write so the
/// on-chain proof of retirement is not archived out from under the buyer.
const RETIREMENT_BUMP_THRESHOLD: u32 = 100_000;
const RETIREMENT_BUMP_AMOUNT: u32 = 500_000;

/// Reason recorded when credits are retired through the legacy
/// [`CarbonCredits::retire_offset`] entry point.
const DEFAULT_RETIREMENT_REASON: Symbol = symbol_short!("offset");

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesRate {
    pub slug: Symbol,
    /// kg CO₂/year × 100 (avoids floats on-chain). Example: 22 kg/yr → 2200
    pub co2_scaled: i128,
    pub maturity_years: u32,
    pub updated_at: u64,
}

/// Regional emissions baseline a project is measured against.
///
/// `baseline_co2` is expressed in the same integer unit as
/// [`ProjectEmissions::project_co2`] so the comparison is exact and on-chain
/// safe — no floating point anywhere.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RegionalBaseline {
    pub region: Symbol,
    /// Baseline emissions for the region.
    pub baseline_co2: i128,
    /// Reference year the baseline was derived from.
    pub reference_year: u32,
    /// SHA-256 of the off-chain methodology document backing the baseline.
    pub methodology_digest: BytesN<32>,
    pub updated_at: u64,
}

/// Measured emissions for a single project over one reporting period.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProjectEmissions {
    pub project_id: Symbol,
    pub region: Symbol,
    /// Measured emissions (same unit as the region's baseline).
    pub project_co2: i128,
    pub period_start: u64,
    pub period_end: u64,
    pub recorded_at: u64,
    pub recorded_by: Address,
}

/// Outcome of comparing a project's emissions to its regional baseline.
///
/// `is_additional` is the "would not have happened without the incentive"
/// verdict: the project must emit strictly less than the baseline *and* clear
/// the configured minimum reduction.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AdditionalityVerdict {
    pub project_id: Symbol,
    pub region: Symbol,
    pub baseline_co2: i128,
    pub project_co2: i128,
    /// `baseline_co2 - project_co2`; negative when the project emits more.
    pub reduction_co2: i128,
    /// Minimum reduction required to qualify (basis points of the baseline).
    pub required_reduction: i128,
    pub is_additional: bool,
}

/// A retail-sized offer carved out of a project's verified credit block.
///
/// Institutional buyers normally take carbon credits in 100+-ton blocks. A lot
/// is opened for a whole number of tons and then sold down one ton at a time,
/// so a retail buyer can take a 1-ton portion of a large project (issue #1366).
///
/// The underlying credits are escrowed: opening a lot deducts its grams from
/// the seller's balance, and every purchase credits them to the buyer, who can
/// then retire them with [`CarbonCredits::retire_offset`] like any other credit.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RetailLot {
    pub id: u64,
    /// Project the lot's credits were issued against.
    pub project_id: Symbol,
    /// Seller that opened (and may close) the lot.
    pub seller: Address,
    /// Grams of CO₂ the lot was opened with (a whole number of tons).
    pub total: u64,
    /// Grams of CO₂ still unsold.
    pub remaining: u64,
    /// Price of one whole ton, in payment-token base units.
    pub price_per_ton: i128,
    /// `false` once the seller closes the lot or the last portion is sold.
    pub active: bool,
    pub opened_at: u64,
}

/// Measured soil health and regenerative practices for an agricultural plot (issue #1386).
#[contracttype]
#[derive(Clone, Debug)]
pub struct SoilHealthMeasurement {
    pub plot_id: Symbol,
    pub farmer: Address,
    /// Baseline Soil Organic Carbon (SOC) in basis points (e.g. 150 = 1.50%).
    pub baseline_soc_bps: u32,
    /// Measured Soil Organic Carbon (SOC) in basis points (e.g. 235 = 2.35%).
    pub measured_soc_bps: u32,
    /// Soil microbial biomass in mg/kg (ppm).
    pub microbial_biomass_ppm: u32,
    /// Bulk density (g/cm³ scaled by 100, e.g. 125 = 1.25 g/cm³).
    pub bulk_density_scaled: u32,
    /// Regenerative practice score (0..=100) based on cover crops, no-till, crop rotation, compost.
    pub practice_score: u32,
    /// Plot size in acres.
    pub acres: u32,
    pub measured_at: u64,
    pub verifier: Address,
}

/// Calculated score and bonus sequestration output for regenerative farming practices (issue #1386).
#[contracttype]
#[derive(Clone, Debug)]
pub struct SoilHealthScore {
    pub plot_id: Symbol,
    pub farmer: Address,
    /// Measured SOC minus baseline SOC (in basis points).
    pub soc_gain_bps: i32,
    /// Composite soil health improvement score (0..=100).
    pub composite_score: u32,
    /// Grams of CO₂ sequestered above baseline.
    pub sequestration_above_baseline_grams: u64,
    /// Awarded bonus carbon credits in grams CO₂.
    pub bonus_credits_grams: u64,
    /// Whether bonus credits have already been awarded into the farmer's balance.
    pub bonus_awarded: bool,
    pub scored_at: u64,
}

/// Immutable proof that credits were permanently burned (issue #1422).
///
/// Written exactly once when credits are retired and never updated or
/// deleted afterwards — the contract exposes no entry point that mutates a
/// stored record. The burned grams leave both the owner's balance and the
/// circulating supply, so the same credits can never be sold again.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetirementRecord {
    /// Sequential id, starting at 1.
    pub id: u64,
    /// Account whose balance the credits were burned from.
    pub owner: Address,
    /// Grams of CO₂ burned.
    pub amount: u64,
    /// Why the credits were retired, e.g. `offset` or a claim reference.
    pub reason: Symbol,
    /// Ledger close time of the retirement.
    pub retired_at: u64,
    /// Ledger sequence of the retirement, for block-explorer lookups.
    pub ledger: u32,
}

/// Network-wide credit supply, in grams of CO₂.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreditSupply {
    /// Every gram ever minted by the contract.
    pub issued: u64,
    /// Every gram permanently burned through retirement.
    pub retired: u64,
    /// `issued - retired`: grams still available to hold, trade or retire.
    pub circulating: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Rate(Symbol),
    TotalOffset(Address),
    RetiredOffset(Address),
    /// Regional baseline, keyed by region symbol.
    Baseline(Symbol),
    /// Measured project emissions, keyed by project id.
    Project(Symbol),
    /// Minimum reduction (basis points of the baseline) required to qualify.
    MinReductionBps,
    /// Payment token retail buyers settle portion purchases with.
    RetailPaymentToken,
    /// Retail lot, keyed by lot id.
    RetailLot(u64),
    /// Number of lots opened so far; also the id counter.
    RetailLotCount,
    /// Soil health measurement, keyed by plot id.
    SoilMeasurement(Symbol),
    /// Soil health calculated score, keyed by plot id.
    SoilScore(Symbol),
    /// Grams minted across every account.
    TotalIssued,
    /// Grams burned through retirement across every account.
    TotalRetired,
    /// Number of retirement records written; also the id counter.
    RetirementCount,
    /// Immutable retirement record, keyed by id.
    Retirement(u64),
    /// Number of retirements made by an owner.
    OwnerRetirementCount(Address),
    /// Owner's n-th retirement (0-based) → retirement id.
    OwnerRetirement(Address, u64),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonCredits;

#[contractimpl]
impl CarbonCredits {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, CarbonCreditsError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin-only: register or update a species sequestration rate.
    pub fn set_rate(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
        Self::require_admin(&env);

        if co2_scaled <= 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidAmount);
        }
        if maturity_years == 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidAmount);
        }

        let rate = SpeciesRate {
            slug: slug.clone(),
            co2_scaled,
            maturity_years,
            updated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Rate(slug), &rate);
    }

    pub fn get_rate(env: Env, slug: Symbol) -> SpeciesRate {
        env.storage()
            .persistent()
            .get(&DataKey::Rate(slug))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::SpeciesNotFound))
    }

    /// Returns lifetime grams CO₂ for one tree of `slug` at `age_years`.
    /// Capped at maturity — a tree does not sequester more after it matures.
    ///
    /// Formula: min(age, maturity) × (co2_scaled × 10)
    ///   co2_scaled is kg/yr × 100; × 10 converts to grams/yr (÷100 × 1000).
    pub fn estimate_offset(env: Env, slug: Symbol, age_years: u32) -> u64 {
        let rate: SpeciesRate = env
            .storage()
            .persistent()
            .get(&DataKey::Rate(slug))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::SpeciesNotFound));

        let capped_years = age_years.min(rate.maturity_years) as i128;
        let grams_per_year: i128 = rate.co2_scaled * 10;
        (capped_years * grams_per_year) as u64
    }

    /// Admin-only: accumulate CO₂ offset credits for a sponsor.
    pub fn record_credit(
        env: Env,
        sponsor: Address,
        slug: Symbol,
        tree_count: u32,
        age_years: u32,
    ) {
        Self::require_admin(&env);
        Self::accumulate_credit(env, sponsor, slug, tree_count, age_years);
    }

    /// Returns the total accumulated grams CO₂ offset for a sponsor.
    /// Returns 0 for an unknown sponsor.
    pub fn total_offset_for_sponsor(env: Env, sponsor: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalOffset(sponsor))
            .unwrap_or(0u64)
    }

    /// Sponsor-only: retire offsets by permanently deducting them from TotalOffset.
    ///
    /// Equivalent to [`Self::retire_credits`] with the reason `offset`; kept
    /// for existing callers.
    pub fn retire_offset(env: Env, sponsor: Address, amount: u64) {
        sponsor.require_auth();
        Self::burn_for_retirement(&env, &sponsor, amount, DEFAULT_RETIREMENT_REASON);
    }

    // ── Permanent retirement / burn (issue #1422) ─────────────────────────────

    /// Owner-only: permanently burn `amount` grams from the owner's balance
    /// and from the circulating supply, returning the id of the immutable
    /// [`RetirementRecord`] written for it.
    ///
    /// Burned credits cannot be transferred, listed in a retail lot or retired
    /// a second time, which is what prevents double-selling.
    pub fn retire_credits(env: Env, owner: Address, amount: u64, reason: Symbol) -> u64 {
        owner.require_auth();
        Self::burn_for_retirement(&env, &owner, amount, reason)
    }

    /// Returns the immutable record for a retirement id.
    pub fn get_retirement(env: Env, id: u64) -> RetirementRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Retirement(id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::RetirementNotFound))
    }

    /// Number of retirement records written so far (the latest id).
    pub fn retirement_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::RetirementCount)
            .unwrap_or(0u64)
    }

    /// Up to `limit` retirement ids for `owner`, oldest first, starting at
    /// the owner's `start`-th retirement (0-based).
    pub fn retirements_for_owner(env: Env, owner: Address, start: u64, limit: u32) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerRetirementCount(owner.clone()))
            .unwrap_or(0u64);
        let end = count.min(start.saturating_add(limit as u64));

        let mut ids = Vec::new(&env);
        let mut index = start;
        while index < end {
            if let Some(id) = env
                .storage()
                .persistent()
                .get::<_, u64>(&DataKey::OwnerRetirement(owner.clone(), index))
            {
                ids.push_back(id);
            }
            index += 1;
        }
        ids
    }

    /// Network-wide issued, retired and circulating supply, in grams.
    pub fn credit_supply(env: Env) -> CreditSupply {
        let issued: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalIssued)
            .unwrap_or(0u64);
        let retired: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRetired)
            .unwrap_or(0u64);
        CreditSupply {
            issued,
            retired,
            // Balances minted before supply tracking existed can be retired
            // too, so never underflow.
            circulating: issued.saturating_sub(retired),
        }
    }

    /// Returns the total permanently retired offsets for a sponsor.
    pub fn total_retired_for_sponsor(env: Env, sponsor: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::RetiredOffset(sponsor))
            .unwrap_or(0u64)
    }

    // ── Additionality verification / baseline emissions (v2) ─────────────────

    /// Admin-only: register or replace the emissions baseline for a region.
    ///
    /// `baseline_co2` must be strictly positive. `methodology_digest` is the
    /// SHA-256 of the off-chain methodology document so the baseline can be
    /// audited independently of the contract.
    pub fn set_regional_baseline(
        env: Env,
        region: Symbol,
        baseline_co2: i128,
        reference_year: u32,
        methodology_digest: BytesN<32>,
    ) {
        Self::require_admin(&env);

        if baseline_co2 <= 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidBaseline);
        }

        let baseline = RegionalBaseline {
            region: region.clone(),
            baseline_co2,
            reference_year,
            methodology_digest,
            updated_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Baseline(region.clone()), &baseline);

        env.events()
            .publish((symbol_short!("baseline"), region), baseline_co2);
    }

    /// Returns the regional baseline, or panics when none is registered.
    pub fn get_regional_baseline(env: Env, region: Symbol) -> RegionalBaseline {
        env.storage()
            .persistent()
            .get(&DataKey::Baseline(region))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::BaselineNotSet))
    }

    /// Admin-only: minimum reduction (basis points of the regional baseline) a
    /// project must beat to count as additional. Defaults to `0`.
    pub fn set_min_reduction_bps(env: Env, bps: u32) {
        Self::require_admin(&env);

        if bps > 10_000 {
            panic_with_error!(&env, CarbonCreditsError::InvalidThreshold);
        }

        env.storage()
            .instance()
            .set(&DataKey::MinReductionBps, &bps);
        env.events()
            .publish((symbol_short!("minred"), symbol_short!("bps")), bps);
    }

    /// Returns the configured minimum reduction in basis points (`0` if unset).
    pub fn get_min_reduction_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MinReductionBps)
            .unwrap_or(0u32)
    }

    /// Admin-only: record the measured emissions for a project in a region.
    ///
    /// The regional baseline must already exist so an additionality verdict is
    /// always computable. Records are write-once per `project_id` to keep the
    /// audit trail immutable.
    pub fn record_project_emissions(
        env: Env,
        project_id: Symbol,
        region: Symbol,
        project_co2: i128,
        period_start: u64,
        period_end: u64,
    ) {
        let admin = Self::require_admin(&env);

        if project_co2 < 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidEmissions);
        }
        if period_end <= period_start {
            panic_with_error!(&env, CarbonCreditsError::InvalidPeriod);
        }
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Baseline(region.clone()))
        {
            panic_with_error!(&env, CarbonCreditsError::BaselineNotSet);
        }

        let key = DataKey::Project(project_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, CarbonCreditsError::ProjectAlreadyRecorded);
        }

        let record = ProjectEmissions {
            project_id: project_id.clone(),
            region: region.clone(),
            project_co2,
            period_start,
            period_end,
            recorded_at: env.ledger().timestamp(),
            recorded_by: admin,
        };
        env.storage().persistent().set(&key, &record);

        env.events()
            .publish((symbol_short!("project"), project_id), project_co2);
    }

    /// Returns the recorded emissions for a project, or panics when unknown.
    pub fn get_project_emissions(env: Env, project_id: Symbol) -> ProjectEmissions {
        env.storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::ProjectNotFound))
    }

    /// Compare a project's measured emissions against its regional baseline.
    ///
    /// A project is additional when it emits strictly less than the baseline
    /// **and** the reduction clears the configured minimum (basis points of the
    /// baseline). Read-only and safe to call from any client.
    pub fn evaluate_additionality(env: Env, project_id: Symbol) -> AdditionalityVerdict {
        let project: ProjectEmissions = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::ProjectNotFound));

        let baseline: RegionalBaseline = env
            .storage()
            .persistent()
            .get(&DataKey::Baseline(project.region.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::BaselineNotSet));

        let bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MinReductionBps)
            .unwrap_or(0u32);

        let reduction_co2 = baseline.baseline_co2 - project.project_co2;
        let required_reduction = baseline.baseline_co2 * bps as i128 / 10_000;

        AdditionalityVerdict {
            project_id,
            region: project.region,
            baseline_co2: baseline.baseline_co2,
            project_co2: project.project_co2,
            reduction_co2,
            required_reduction,
            is_additional: reduction_co2 > 0 && reduction_co2 >= required_reduction,
        }
    }

    /// Admin-only: issue offset credits only after additionality passes.
    ///
    /// Identical to [`Self::record_credit`] except it refuses to mint when
    /// [`Self::evaluate_additionality`] does not return an additional verdict,
    /// so business-as-usual emissions never earn credits.
    pub fn record_verified_credit(
        env: Env,
        sponsor: Address,
        project_id: Symbol,
        slug: Symbol,
        tree_count: u32,
        age_years: u32,
    ) {
        Self::require_admin(&env);

        let verdict = Self::evaluate_additionality(env.clone(), project_id);
        if !verdict.is_additional {
            panic_with_error!(&env, CarbonCreditsError::AdditionalityNotMet);
        }

        Self::accumulate_credit(env, sponsor, slug, tree_count, age_years);
    }

    // ── Retail fractionalisation (issue #1366) ────────────────────────────────

    /// Admin-only: set the token retail buyers pay with.
    ///
    /// Until this is called the retail rail is closed and every other retail
    /// entry point panics with `RetailNotConfigured`.
    pub fn configure_retail(env: Env, payment_token: Address) {
        Self::require_admin(&env);

        env.storage()
            .instance()
            .set(&DataKey::RetailPaymentToken, &payment_token);

        env.events().publish(
            (symbol_short!("retail"), symbol_short!("token")),
            payment_token,
        );
    }

    /// Returns the token retail buyers pay with.
    pub fn get_retail_payment_token(env: Env) -> Address {
        Self::retail_payment_token(&env)
    }

    /// Seller-only: carve `grams` of owned credits out of a project's block and
    /// offer them to retail buyers.
    ///
    /// `grams` must be a whole number of tons and at least one ton, so a large
    /// block is offered as 1-ton portions instead of one 100+-ton chunk
    /// (issue #1366). `price_per_ton` is quoted in payment-token base units.
    ///
    /// The credits are escrowed in the contract: they leave the seller's
    /// balance now and are released to buyers as portions are purchased, or
    /// returned by [`Self::close_retail_lot`].
    ///
    /// # Returns
    /// The new lot id, queryable with [`Self::get_retail_lot`].
    pub fn open_retail_lot(
        env: Env,
        seller: Address,
        project_id: Symbol,
        grams: u64,
        price_per_ton: i128,
    ) -> u64 {
        seller.require_auth();
        Self::retail_payment_token(&env); // the rail must be configured

        if price_per_ton <= 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidPrice);
        }
        if grams < MIN_RETAIL_PORTION_GRAMS || grams % GRAMS_PER_TON != 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidLotSize);
        }

        // Escrow the credits out of the seller's balance.
        let balance_key = DataKey::TotalOffset(seller.clone());
        let balance: u64 = env.storage().persistent().get(&balance_key).unwrap_or(0u64);
        if grams > balance {
            panic_with_error!(&env, CarbonCreditsError::InsufficientOffsets);
        }
        env.storage()
            .persistent()
            .set(&balance_key, &(balance - grams));

        let id = Self::next_retail_lot_id(&env);
        let lot = RetailLot {
            id,
            project_id: project_id.clone(),
            seller: seller.clone(),
            total: grams,
            remaining: grams,
            price_per_ton,
            active: true,
            opened_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::RetailLot(id), &lot);

        env.events().publish(
            (symbol_short!("retail"), symbol_short!("opened")),
            (id, seller, project_id, grams, price_per_ton),
        );

        id
    }

    /// Buy `grams` of CO₂ out of a retail lot.
    ///
    /// At minimum one ton must be bought — that is the whole point of the
    /// retail rail, so a buyer never has to take a 100+-ton block. The credits
    /// are credited to the buyer's balance and can be retired with
    /// [`Self::retire_offset`].
    ///
    /// Panics with `BelowMinimumRetailPortion` for sub-ton purchases,
    /// `InsufficientLotOffsets` when the lot cannot cover the portion, and
    /// `LotNotFound` / `LotNotActive` when the lot is gone or closed.
    pub fn buy_retail_portion(env: Env, buyer: Address, lot_id: u64, grams: u64) {
        buyer.require_auth();

        let payment_token = Self::retail_payment_token(&env);
        let lot_key = DataKey::RetailLot(lot_id);
        let mut lot: RetailLot = env
            .storage()
            .persistent()
            .get(&lot_key)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::LotNotFound));

        if !lot.active {
            panic_with_error!(&env, CarbonCreditsError::LotNotActive);
        }
        if grams < MIN_RETAIL_PORTION_GRAMS {
            panic_with_error!(&env, CarbonCreditsError::BelowMinimumRetailPortion);
        }
        if grams > lot.remaining {
            panic_with_error!(&env, CarbonCreditsError::InsufficientLotOffsets);
        }

        let cost = Self::retail_portion_cost(grams, lot.price_per_ton);
        if cost <= 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidPrice);
        }

        // Buyer pays the seller directly; the credits move inside the contract.
        token::Client::new(&env, &payment_token).transfer(&buyer, &lot.seller, &cost);

        lot.remaining = lot
            .remaining
            .checked_sub(grams)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::InsufficientLotOffsets));
        if lot.remaining == 0 {
            lot.active = false;
        }
        env.storage().persistent().set(&lot_key, &lot);

        let balance_key = DataKey::TotalOffset(buyer.clone());
        let balance: u64 = env.storage().persistent().get(&balance_key).unwrap_or(0u64);
        let credited = balance
            .checked_add(grams)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::InvalidAmount));
        env.storage().persistent().set(&balance_key, &credited);

        env.events().publish(
            (symbol_short!("retail"), symbol_short!("bought")),
            (lot_id, buyer, grams, lot.remaining, cost),
        );
    }

    /// Seller-only: close a lot and return its unsold credits.
    pub fn close_retail_lot(env: Env, seller: Address, lot_id: u64) {
        seller.require_auth();

        let lot_key = DataKey::RetailLot(lot_id);
        let mut lot: RetailLot = env
            .storage()
            .persistent()
            .get(&lot_key)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::LotNotFound));

        if !lot.active {
            panic_with_error!(&env, CarbonCreditsError::LotNotActive);
        }
        if lot.seller != seller {
            panic_with_error!(&env, CarbonCreditsError::Unauthorized);
        }

        let refund = lot.remaining;
        lot.remaining = 0;
        lot.active = false;
        env.storage().persistent().set(&lot_key, &lot);

        if refund > 0 {
            let balance_key = DataKey::TotalOffset(seller.clone());
            let balance: u64 = env.storage().persistent().get(&balance_key).unwrap_or(0u64);
            let restored = balance
                .checked_add(refund)
                .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::InvalidAmount));
            env.storage().persistent().set(&balance_key, &restored);
        }

        env.events().publish(
            (symbol_short!("retail"), symbol_short!("closed")),
            (lot_id, seller, refund),
        );
    }

    /// Returns the lot record, or panics with `LotNotFound`.
    pub fn get_retail_lot(env: Env, lot_id: u64) -> RetailLot {
        env.storage()
            .persistent()
            .get(&DataKey::RetailLot(lot_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::LotNotFound))
    }

    /// Returns how many lots have been opened (also the last assigned id).
    pub fn retail_lot_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::RetailLotCount)
            .unwrap_or(0u64)
    }

    /// View-only quote: what `grams` out of `lot_id` cost today.
    pub fn quote_retail_portion(env: Env, lot_id: u64, grams: u64) -> i128 {
        let lot = Self::get_retail_lot(env, lot_id);
        Self::retail_portion_cost(grams, lot.price_per_ton)
    }

    // ── internal ──────────────────────────────────────────────────────────────

    /// Returns the configured retail payment token, or panics when the retail
    /// rail has not been set up yet.
    fn retail_payment_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::RetailPaymentToken)
            .unwrap_or_else(|| panic_with_error!(env, CarbonCreditsError::RetailNotConfigured))
    }

    /// Allocates the next retail lot id (monotonically increasing, starting 1).
    fn next_retail_lot_id(env: &Env) -> u64 {
        let next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RetailLotCount)
            .unwrap_or(0u64)
            + 1;
        env.storage()
            .instance()
            .set(&DataKey::RetailLotCount, &next);
        next
    }

    /// Cost of `grams` at `price_per_ton`, floored to whole payment units.
    /// Exact for whole-ton portions, which is what the retail rail offers.
    fn retail_portion_cost(grams: u64, price_per_ton: i128) -> i128 {
        (grams as i128 * price_per_ton) / GRAMS_PER_TON as i128
    }

    /// Require the stored admin's authorization and return the admin address.
    fn require_admin(env: &Env) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, CarbonCreditsError::NotInitialized));
        admin.require_auth();
        admin
    }

    /// Shared credit accumulation used by both `record_credit` and
    /// `record_verified_credit` so the accounting logic lives in one place.
    fn accumulate_credit(
        env: Env,
        sponsor: Address,
        slug: Symbol,
        tree_count: u32,
        age_years: u32,
    ) {
        if tree_count == 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidAmount);
        }

        let per_tree = Self::estimate_offset(env.clone(), slug, age_years);
        let delta = per_tree * tree_count as u64;

        let key = DataKey::TotalOffset(sponsor.clone());
        let current: u64 = env.storage().persistent().get(&key).unwrap_or(0u64);
        env.storage().persistent().set(&key, &(current + delta));
        Self::add_issued(&env, delta);

        env.events().publish(
            (symbol_short!("credit"), symbol_short!("recorded")),
            (sponsor, delta),
        );
    }

    /// Count freshly minted grams toward the network-wide issued supply.
    fn add_issued(env: &Env, grams: u64) {
        let issued: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalIssued)
            .unwrap_or(0u64);
        env.storage()
            .instance()
            .set(&DataKey::TotalIssued, &(issued + grams));
    }

    /// Burn `amount` grams from `owner`, update the retired supply and write
    /// the immutable retirement record. Caller must have checked auth.
    fn burn_for_retirement(env: &Env, owner: &Address, amount: u64, reason: Symbol) -> u64 {
        if amount == 0 {
            panic_with_error!(env, CarbonCreditsError::InvalidAmount);
        }

        let balance_key = DataKey::TotalOffset(owner.clone());
        let balance: u64 = env.storage().persistent().get(&balance_key).unwrap_or(0u64);
        if amount > balance {
            panic_with_error!(env, CarbonCreditsError::InsufficientOffsets);
        }

        // Burn from the owner's balance.
        env.storage()
            .persistent()
            .set(&balance_key, &(balance - amount));

        let retired_key = DataKey::RetiredOffset(owner.clone());
        let owner_retired: u64 = env.storage().persistent().get(&retired_key).unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&retired_key, &(owner_retired + amount));

        // Burn from circulation.
        let total_retired: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRetired)
            .unwrap_or(0u64);
        env.storage()
            .instance()
            .set(&DataKey::TotalRetired, &(total_retired + amount));

        // Write-once record.
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RetirementCount)
            .unwrap_or(0u64)
            + 1;
        env.storage().instance().set(&DataKey::RetirementCount, &id);

        let record = RetirementRecord {
            id,
            owner: owner.clone(),
            amount,
            reason: reason.clone(),
            retired_at: env.ledger().timestamp(),
            ledger: env.ledger().sequence(),
        };
        let record_key = DataKey::Retirement(id);
        env.storage().persistent().set(&record_key, &record);
        env.storage().persistent().extend_ttl(
            &record_key,
            RETIREMENT_BUMP_THRESHOLD,
            RETIREMENT_BUMP_AMOUNT,
        );

        let owner_count_key = DataKey::OwnerRetirementCount(owner.clone());
        let owner_count: u64 = env
            .storage()
            .persistent()
            .get(&owner_count_key)
            .unwrap_or(0u64);
        let owner_index_key = DataKey::OwnerRetirement(owner.clone(), owner_count);
        env.storage().persistent().set(&owner_index_key, &id);
        env.storage().persistent().extend_ttl(
            &owner_index_key,
            RETIREMENT_BUMP_THRESHOLD,
            RETIREMENT_BUMP_AMOUNT,
        );
        env.storage()
            .persistent()
            .set(&owner_count_key, &(owner_count + 1));

        // Unchanged legacy event, then the full record for indexers.
        env.events()
            .publish((symbol_short!("retire"), owner.clone()), amount);
        env.events().publish(
            (symbol_short!("retire"), symbol_short!("record")),
            (id, owner.clone(), amount, reason),
        );

        id
    }

    // ── Soil Health Scoring & Regenerative Agriculture Incentives (issue #1386) ──

    /// Record a verified soil health and regenerative practice measurement for a farm plot.
    ///
    /// Verifier or admin must authorize. Validates soil parameters and stores measurement.
    pub fn record_soil_measurement(
        env: Env,
        plot_id: Symbol,
        farmer: Address,
        baseline_soc_bps: u32,
        measured_soc_bps: u32,
        microbial_biomass_ppm: u32,
        bulk_density_scaled: u32,
        practice_score: u32,
        acres: u32,
        verifier: Address,
    ) {
        verifier.require_auth();

        if acres == 0 || bulk_density_scaled == 0 || practice_score > 100 || measured_soc_bps == 0 {
            panic_with_error!(&env, CarbonCreditsError::InvalidSoilData);
        }

        let measurement = SoilHealthMeasurement {
            plot_id: plot_id.clone(),
            farmer: farmer.clone(),
            baseline_soc_bps,
            measured_soc_bps,
            microbial_biomass_ppm,
            bulk_density_scaled,
            practice_score,
            acres,
            measured_at: env.ledger().timestamp(),
            verifier,
        };

        env.storage()
            .persistent()
            .set(&DataKey::SoilMeasurement(plot_id.clone()), &measurement);

        env.events().publish(
            (symbol_short!("soil"), symbol_short!("measured")),
            (plot_id, farmer, measured_soc_bps),
        );
    }

    /// Calculate soil health improvement score and sequestration above baseline for regenerative farming.
    ///
    /// Evaluates:
    /// - SOC (Soil Organic Carbon) increase above baseline (up to 40 pts)
    /// - Adoption of regenerative practices (no-till, cover crop, crop rotation, compost) (up to 35 pts)
    /// - Biological soil activity / microbial biomass (up to 25 pts)
    ///
    /// Calculates net CO₂ sequestration in grams and determines eligible bonus credits.
    pub fn calculate_soil_health_score(env: Env, plot_id: Symbol) -> SoilHealthScore {
        let m: SoilHealthMeasurement = env
            .storage()
            .persistent()
            .get(&DataKey::SoilMeasurement(plot_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::PlotMeasurementNotFound));

        let soc_gain_bps = m.measured_soc_bps as i32 - m.baseline_soc_bps as i32;
        if soc_gain_bps <= 0 {
            panic_with_error!(&env, CarbonCreditsError::NoSequestrationAboveBaseline);
        }

        // Composite scoring (0..=100)
        let soc_pts = ((soc_gain_bps as u32).min(100) * 40) / 100;
        let practice_pts = (m.practice_score.min(100) * 35) / 100;
        let microbial_pts = (m.microbial_biomass_ppm.min(500) * 25) / 500;
        let composite_score = (soc_pts + practice_pts + microbial_pts).min(100);

        // Sequestration calculation:
        // Soil mass per acre (30cm layer) = 12,140 * bulk_density_scaled (kg)
        // Total plot soil mass = soil_mass_per_acre * acres
        let soil_mass_per_acre = 12_140u64 * m.bulk_density_scaled as u64;
        let total_soil_mass_kg = soil_mass_per_acre * m.acres as u64;

        // Carbon sequestered (kg) = total_soil_mass * (soc_gain_bps / 10,000)
        let carbon_sequestered_kg = (total_soil_mass_kg * soc_gain_bps as u64) / 10_000;

        // Grams CO₂ = carbon_kg * 44/12 * 1000 = (carbon_kg * 44 * 1000) / 12
        let sequestration_above_baseline_grams =
            (carbon_sequestered_kg * 44 * 1_000) / 12;

        // Bonus credits scaled by composite regenerative score
        let bonus_credits_grams =
            (sequestration_above_baseline_grams * composite_score as u64) / 100;

        let score = SoilHealthScore {
            plot_id: plot_id.clone(),
            farmer: m.farmer,
            soc_gain_bps,
            composite_score,
            sequestration_above_baseline_grams,
            bonus_credits_grams,
            bonus_awarded: false,
            scored_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::SoilScore(plot_id.clone()), &score);

        env.events().publish(
            (symbol_short!("soil"), symbol_short!("scored")),
            (plot_id, composite_score, bonus_credits_grams),
        );

        score
    }

    /// Award bonus carbon credits to the farmer for verified soil sequestration above baseline.
    ///
    /// Credits are added directly to the farmer's `TotalOffset` balance.
    pub fn award_soil_bonus_credits(env: Env, plot_id: Symbol) -> u64 {
        Self::require_admin(&env);

        let mut score: SoilHealthScore = env
            .storage()
            .persistent()
            .get(&DataKey::SoilScore(plot_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::PlotMeasurementNotFound));

        if score.bonus_awarded {
            panic_with_error!(&env, CarbonCreditsError::BonusAlreadyAwarded);
        }

        let bonus = score.bonus_credits_grams;
        if bonus > 0 {
            let key = DataKey::TotalOffset(score.farmer.clone());
            let current: u64 = env.storage().persistent().get(&key).unwrap_or(0u64);
            env.storage().persistent().set(&key, &(current + bonus));
            Self::add_issued(&env, bonus);
        }

        score.bonus_awarded = true;
        env.storage()
            .persistent()
            .set(&DataKey::SoilScore(plot_id.clone()), &score);

        env.events().publish(
            (symbol_short!("soil"), symbol_short!("bon_awd")),
            (plot_id, score.farmer, bonus),
        );

        bonus
    }

    /// Retrieve the soil health measurement for a plot.
    pub fn get_soil_measurement(env: Env, plot_id: Symbol) -> SoilHealthMeasurement {
        env.storage()
            .persistent()
            .get(&DataKey::SoilMeasurement(plot_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::PlotMeasurementNotFound))
    }

    /// Retrieve the soil health score and bonus credit status for a plot.
    pub fn get_soil_health_score(env: Env, plot_id: Symbol) -> SoilHealthScore {
        env.storage()
            .persistent()
            .get(&DataKey::SoilScore(plot_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonCreditsError::PlotMeasurementNotFound))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Symbol};

    fn setup() -> (Env, Address, CarbonCreditsClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn digest(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn region(env: &Env, name: &str) -> Symbol {
        Symbol::new(env, name)
    }

    #[test]
    fn test_initialize() {
        let (_, _, _client) = setup();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_init_panics() {
        let (_, admin, client) = setup();
        client.initialize(&admin);
    }

    #[test]
    fn test_set_and_get_rate() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let rate = client.get_rate(&slug);
        assert_eq!(rate.co2_scaled, 2200);
        assert_eq!(rate.maturity_years, 20);
    }

    #[test]
    fn test_estimate_offset_under_maturity() {
        let (env, _, client) = setup();

        // teak: 22 kg/yr → co2_scaled=2200, maturity=20yr
        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=10yr < maturity=20yr → 10 × 2200 × 10 = 220_000 g
        let result = client.estimate_offset(&slug, &10_u32);
        assert_eq!(result, 220_000u64);
    }

    #[test]
    fn test_estimate_offset_at_maturity() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=20yr = maturity=20yr → 20 × 2200 × 10 = 440_000 g
        let result = client.estimate_offset(&slug, &20_u32);
        assert_eq!(result, 440_000u64);
    }

    #[test]
    fn test_estimate_offset_over_maturity() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=50yr > maturity=20yr → capped at 20 → 440_000 g (same as at_maturity)
        let result = client.estimate_offset(&slug, &50_u32);
        assert_eq!(result, 440_000u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_estimate_unknown_slug_panics() {
        let (env, _, client) = setup();
        client.estimate_offset(&Symbol::new(&env, "unknown"), &5_u32);
    }

    #[test]
    fn test_record_credit_accumulates() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);

        // First call: 5 trees × 10yr → 5 × 220_000 = 1_100_000 g
        client.record_credit(&sponsor, &slug, &5_u32, &10_u32);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_100_000u64);

        // Second call: 3 trees × 10yr → 3 × 220_000 = 660_000 g
        client.record_credit(&sponsor, &slug, &3_u32, &10_u32);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_760_000u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_record_credit_zero_tree_count_panics() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);
        client.record_credit(&sponsor, &slug, &0_u32, &10_u32);
    }

    #[test]
    fn test_total_offset_unknown_sponsor_zero() {
        let (env, _, client) = setup();

        let sponsor = Address::generate(&env);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 0u64);
        assert_eq!(client.total_retired_for_sponsor(&sponsor), 0u64);
    }

    #[test]
    fn test_retire_offset_success() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);
        client.record_credit(&sponsor, &slug, &5_u32, &10_u32); // 1_100_000 g

        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_100_000u64);
        assert_eq!(client.total_retired_for_sponsor(&sponsor), 0u64);

        // Retire 100_000 g
        client.retire_offset(&sponsor, &100_000u64);

        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_000_000u64);
        assert_eq!(client.total_retired_for_sponsor(&sponsor), 100_000u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_retire_offset_insufficient_balance() {
        let (env, _, client) = setup();

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);
        client.record_credit(&sponsor, &slug, &1_u32, &10_u32); // 220_000 g

        // Try to retire more than balance
        client.retire_offset(&sponsor, &220_001u64);
    }

    // ── Additionality verification (v2) ──────────────────────────────────────

    #[test]
    fn test_set_and_get_regional_baseline() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let baseline = client.get_regional_baseline(&r);
        assert_eq!(baseline.region, r);
        assert_eq!(baseline.baseline_co2, 1_000_000);
        assert_eq!(baseline.reference_year, 2024);
    }

    #[test]
    fn test_regional_baseline_can_be_replaced() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));
        client.set_regional_baseline(&r, &900_000_i128, &2025_u32, &digest(&env, 2));

        assert_eq!(client.get_regional_baseline(&r).baseline_co2, 900_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_baseline_must_be_positive() {
        let (env, _, client) = setup();
        client.set_regional_baseline(&region(&env, "north"), &0_i128, &2024_u32, &digest(&env, 1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_get_missing_baseline_panics() {
        let (env, _, client) = setup();
        client.get_regional_baseline(&region(&env, "nowhere"));
    }

    #[test]
    fn test_default_min_reduction_is_zero() {
        let (_, _, client) = setup();
        assert_eq!(client.get_min_reduction_bps(), 0u32);
    }

    #[test]
    fn test_set_min_reduction_bps() {
        let (_, _, client) = setup();
        client.set_min_reduction_bps(&2500_u32);
        assert_eq!(client.get_min_reduction_bps(), 2500u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_invalid_threshold_rejected() {
        let (_, _, client) = setup();
        client.set_min_reduction_bps(&10_001_u32);
    }

    #[test]
    fn test_record_and_get_project_emissions() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let record = client.get_project_emissions(&p);
        assert_eq!(record.project_id, p);
        assert_eq!(record.region, r);
        assert_eq!(record.project_co2, 800_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_record_project_emissions_requires_baseline() {
        let (env, _, client) = setup();
        client.record_project_emissions(
            &region(&env, "proj1"),
            &region(&env, "nowhere"),
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_record_project_emissions_rejects_negative() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        client.record_project_emissions(
            &region(&env, "proj1"),
            &r,
            &-1_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_record_project_emissions_rejects_bad_period() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        client.record_project_emissions(
            &region(&env, "proj1"),
            &r,
            &800_000_i128,
            &1_702_592_000_u64,
            &1_700_000_000_u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_project_emissions_are_write_once() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );
        client.record_project_emissions(
            &p,
            &r,
            &700_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_get_missing_project_panics() {
        let (env, _, client) = setup();
        client.get_project_emissions(&region(&env, "proj1"));
    }

    #[test]
    fn test_additionality_true_when_below_baseline() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let verdict = client.evaluate_additionality(&p);
        assert!(verdict.is_additional);
        assert_eq!(verdict.reduction_co2, 200_000);
        assert_eq!(verdict.required_reduction, 0);
    }

    #[test]
    fn test_additionality_false_when_equal_to_baseline() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &1_000_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let verdict = client.evaluate_additionality(&p);
        assert!(!verdict.is_additional);
        assert_eq!(verdict.reduction_co2, 0);
    }

    #[test]
    fn test_additionality_false_when_above_baseline() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &1_400_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let verdict = client.evaluate_additionality(&p);
        assert!(!verdict.is_additional);
        assert_eq!(verdict.reduction_co2, -400_000);
    }

    #[test]
    fn test_threshold_blocks_borderline_reduction() {
        let (env, _, client) = setup();
        client.set_min_reduction_bps(&3000_u32); // 30%

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let verdict = client.evaluate_additionality(&p);
        assert!(!verdict.is_additional);
        assert_eq!(verdict.reduction_co2, 200_000);
        assert_eq!(verdict.required_reduction, 300_000);
    }

    #[test]
    fn test_threshold_met_marks_additional() {
        let (env, _, client) = setup();
        client.set_min_reduction_bps(&1000_u32); // 10%

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &850_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let verdict = client.evaluate_additionality(&p);
        assert!(verdict.is_additional);
        assert_eq!(verdict.required_reduction, 100_000);
    }

    #[test]
    fn test_record_verified_credit_issues_when_additional() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let p = region(&env, "proj1");
        client.record_project_emissions(
            &p,
            &r,
            &800_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let sponsor = Address::generate(&env);
        client.record_verified_credit(&sponsor, &p, &slug, &5_u32, &10_u32);

        // Same accounting as record_credit: 5 × 220_000 g
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_100_000u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_record_verified_credit_rejected_when_not_additional() {
        let (env, _, client) = setup();

        let r = region(&env, "north");
        client.set_regional_baseline(&r, &1_000_000_i128, &2024_u32, &digest(&env, 1));

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let p = region(&env, "proj1");
        // Emits exactly the regional baseline → business as usual.
        client.record_project_emissions(
            &p,
            &r,
            &1_000_000_i128,
            &1_700_000_000_u64,
            &1_702_592_000_u64,
        );

        let sponsor = Address::generate(&env);
        client.record_verified_credit(&sponsor, &p, &slug, &5_u32, &10_u32);
    }

    // ── Retail fractionalisation (issue #1366) ───────────────────────────────

    /// Registers a Stellar asset contract to act as the retail payment token.
    fn payment_token(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn pay_balance(env: &Env, token_id: &Address, of: &Address) -> i128 {
        token::Client::new(env, token_id).balance(of)
    }

    /// Credits `holder` with exactly `tons` tons (1_000_000 g each): at this
    /// rate and age one tree sequesters 10 × 10_000 × 10 = 1_000_000 g.
    fn give_tons(env: &Env, client: &CarbonCreditsClient, holder: &Address, tons: u32) {
        let slug = Symbol::new(env, "teak");
        client.set_rate(&slug, &10_000_i128, &20_u32);
        client.record_credit(holder, &slug, &tons, &10_u32);
    }

    fn retail_ctx() -> (Env, Address, CarbonCreditsClient<'static>, Address) {
        let (env, admin, client) = setup();
        let usdc = payment_token(&env, &admin);
        client.configure_retail(&usdc);
        (env, admin, client, usdc)
    }

    #[test]
    fn test_configure_retail_sets_payment_token() {
        let (_, _, client, usdc) = retail_ctx();
        assert_eq!(client.get_retail_payment_token(), usdc);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_get_retail_payment_token_before_configure_panics() {
        let (_, _, client) = setup();
        client.get_retail_payment_token();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_open_lot_before_configure_retail_panics() {
        let (env, _, client) = setup();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 5);
        client.open_retail_lot(
            &seller,
            &Symbol::new(&env, "proj1"),
            &5_000_000_u64,
            &10_i128,
        );
    }

    #[test]
    fn test_open_lot_escrows_seller_credits() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 100);
        assert_eq!(client.total_offset_for_sponsor(&seller), 100_000_000);

        let id = client.open_retail_lot(
            &seller,
            &Symbol::new(&env, "proj1"),
            &100_000_000_u64,
            &25_i128,
        );

        assert_eq!(id, 1);
        assert_eq!(client.retail_lot_count(), 1);
        // Escrowed: the seller no longer holds them, the lot does.
        assert_eq!(client.total_offset_for_sponsor(&seller), 0);

        let lot = client.get_retail_lot(&id);
        assert_eq!(lot.id, 1);
        assert_eq!(lot.seller, seller);
        assert_eq!(lot.project_id, Symbol::new(&env, "proj1"));
        assert_eq!(lot.total, 100_000_000);
        assert_eq!(lot.remaining, 100_000_000);
        assert_eq!(lot.price_per_ton, 25);
        assert!(lot.active);
    }

    #[test]
    fn test_lot_ids_increment() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);

        let first =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &5_000_000_u64, &1_i128);
        let second =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p2"), &5_000_000_u64, &1_i128);

        assert_eq!(first, 1);
        assert_eq!(second, 2);
        assert_eq!(client.retail_lot_count(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_lot_below_one_ton_rejected() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 5);

        // One gram short of a ton.
        client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &999_999_u64, &10_i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_lot_that_is_not_a_whole_number_of_tons_rejected() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 5);

        client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &1_500_000_u64, &10_i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn test_lot_with_zero_price_rejected() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 5);

        client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &5_000_000_u64, &0_i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_lot_larger_than_seller_balance_rejected() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 3);

        client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &4_000_000_u64, &10_i128);
    }

    /// The acceptance criterion for #1366: a 100-ton block is reachable one ton
    /// at a time by a retail buyer.
    #[test]
    fn test_retail_buyer_takes_one_ton_from_a_hundred_ton_block() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 100);

        let id = client.open_retail_lot(
            &seller,
            &Symbol::new(&env, "proj1"),
            &100_000_000_u64,
            &7_i128,
        );
        mint(&env, &usdc, &buyer, 7);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);

        // The buyer owns exactly one ton and paid exactly one ton's price.
        assert_eq!(client.total_offset_for_sponsor(&buyer), 1_000_000);
        assert_eq!(pay_balance(&env, &usdc, &buyer), 0);
        assert_eq!(pay_balance(&env, &usdc, &seller), 7);
        assert_eq!(client.get_retail_lot(&id).remaining, 99_000_000);
        assert!(client.get_retail_lot(&id).active);
    }

    #[test]
    fn test_retail_buyer_can_take_a_fractional_ton_above_the_minimum() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &4_i128);
        mint(&env, &usdc, &buyer, 6);

        client.buy_retail_portion(&buyer, &id, &1_500_000_u64); // 1.5 tons

        assert_eq!(client.total_offset_for_sponsor(&buyer), 1_500_000);
        assert_eq!(pay_balance(&env, &usdc, &seller), 6);
        assert_eq!(client.get_retail_lot(&id).remaining, 8_500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_sub_ton_purchase_rejected() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &4_i128);
        mint(&env, &usdc, &buyer, 100);

        // One gram short of the one-ton retail minimum.
        client.buy_retail_portion(&buyer, &id, &999_999_u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_single_gram_purchase_rejected() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &4_i128);
        mint(&env, &usdc, &buyer, 100);

        client.buy_retail_portion(&buyer, &id, &1_u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_purchase_larger_than_lot_remaining_rejected() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &4_i128);
        mint(&env, &usdc, &buyer, 1_000);

        client.buy_retail_portion(&buyer, &id, &11_000_000_u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_purchase_from_unknown_lot_panics() {
        let (env, _, client, usdc) = retail_ctx();
        let buyer = Address::generate(&env);
        mint(&env, &usdc, &buyer, 100);

        client.buy_retail_portion(&buyer, &42_u64, &1_000_000_u64);
    }

    #[test]
    fn test_lot_deactivates_once_fully_sold() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 2);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &2_000_000_u64, &3_i128);
        mint(&env, &usdc, &buyer, 6);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
        assert!(client.get_retail_lot(&id).active);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
        let sold_out = client.get_retail_lot(&id);
        assert_eq!(sold_out.remaining, 0);
        assert!(!sold_out.active);
        assert_eq!(client.total_offset_for_sponsor(&buyer), 2_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_purchase_from_sold_out_lot_rejected() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 1);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &1_000_000_u64, &3_i128);
        mint(&env, &usdc, &buyer, 6);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
    }

    #[test]
    fn test_quote_matches_the_charged_price() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &9_i128);
        mint(&env, &usdc, &buyer, 27);

        assert_eq!(client.quote_retail_portion(&id, &1_000_000_u64), 9);
        assert_eq!(client.quote_retail_portion(&id, &3_000_000_u64), 27);

        client.buy_retail_portion(&buyer, &id, &3_000_000_u64);
        assert_eq!(pay_balance(&env, &usdc, &seller), 27);
    }

    /// Bought portions are ordinary credits: the retail buyer can retire them.
    #[test]
    fn test_bought_portion_can_be_retired() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 5);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &5_000_000_u64, &2_i128);
        mint(&env, &usdc, &buyer, 2);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
        client.retire_offset(&buyer, &1_000_000_u64);

        assert_eq!(client.total_offset_for_sponsor(&buyer), 0);
        assert_eq!(client.total_retired_for_sponsor(&buyer), 1_000_000);
    }

    #[test]
    fn test_close_lot_returns_unsold_credits_to_seller() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 10);
        let id =
            client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &10_000_000_u64, &2_i128);
        mint(&env, &usdc, &buyer, 2);

        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
        client.close_retail_lot(&seller, &id);

        let lot = client.get_retail_lot(&id);
        assert!(!lot.active);
        assert_eq!(lot.remaining, 0);
        // Seller keeps the sale proceeds and gets the unsold 9 tons back.
        assert_eq!(client.total_offset_for_sponsor(&seller), 9_000_000);
        assert_eq!(pay_balance(&env, &usdc, &seller), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_closing_a_lot_twice_rejected() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 4);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &4_000_000_u64, &2_i128);

        client.close_retail_lot(&seller, &id);
        client.close_retail_lot(&seller, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #21)")]
    fn test_only_the_seller_may_close_a_lot() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        let stranger = Address::generate(&env);
        give_tons(&env, &client, &seller, 4);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &4_000_000_u64, &2_i128);

        client.close_retail_lot(&stranger, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn test_purchase_from_closed_lot_rejected() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &seller, 4);
        let id = client.open_retail_lot(&seller, &Symbol::new(&env, "p1"), &4_000_000_u64, &2_i128);
        mint(&env, &usdc, &buyer, 10);

        client.close_retail_lot(&seller, &id);
        client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_get_unknown_lot_panics() {
        let (_, _, client, _) = retail_ctx();
        client.get_retail_lot(&7_u64);
    }

    #[test]
    fn test_many_retail_buyers_share_one_large_block() {
        let (env, _, client, usdc) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 100);
        let id = client.open_retail_lot(
            &seller,
            &Symbol::new(&env, "proj1"),
            &100_000_000_u64,
            &5_i128,
        );

        // Ten retail buyers each take the one-ton minimum.
        for _ in 0..10 {
            let buyer = Address::generate(&env);
            mint(&env, &usdc, &buyer, 5);
            client.buy_retail_portion(&buyer, &id, &1_000_000_u64);
            assert_eq!(client.total_offset_for_sponsor(&buyer), 1_000_000);
        }

        let lot = client.get_retail_lot(&id);
        assert_eq!(lot.remaining, 90_000_000);
        assert!(lot.active);
        assert_eq!(pay_balance(&env, &usdc, &seller), 50);
    }

    // ── Permanent retirement / burn (issue #1422) ─────────────────────────────

    #[test]
    fn test_minting_tracks_issued_supply() {
        let (env, _, client) = setup();
        let holder = Address::generate(&env);
        give_tons(&env, &client, &holder, 3);

        let supply = client.credit_supply();
        assert_eq!(supply.issued, 3_000_000);
        assert_eq!(supply.retired, 0);
        assert_eq!(supply.circulating, 3_000_000);
    }

    #[test]
    fn test_retire_credits_burns_from_balance_and_circulation() {
        use soroban_sdk::testutils::Ledger as _;

        let (env, _, client) = setup();
        env.ledger().with_mut(|ledger| {
            ledger.timestamp = 1_700_000_000;
            ledger.sequence_number = 42;
        });
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &buyer, 5);

        let reason = Symbol::new(&env, "scope1_2026");
        let id = client.retire_credits(&buyer, &2_000_000_u64, &reason);
        assert_eq!(id, 1);

        assert_eq!(client.total_offset_for_sponsor(&buyer), 3_000_000);
        assert_eq!(client.total_retired_for_sponsor(&buyer), 2_000_000);

        let supply = client.credit_supply();
        assert_eq!(supply.issued, 5_000_000);
        assert_eq!(supply.retired, 2_000_000);
        assert_eq!(supply.circulating, 3_000_000);

        let record = client.get_retirement(&id);
        assert_eq!(
            record,
            RetirementRecord {
                id: 1,
                owner: buyer.clone(),
                amount: 2_000_000,
                reason,
                retired_at: 1_700_000_000,
                ledger: 42,
            }
        );
        assert_eq!(client.retirement_count(), 1);
    }

    #[test]
    fn test_retire_offset_writes_retirement_record() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        give_tons(&env, &client, &sponsor, 1);

        client.retire_offset(&sponsor, &400_000_u64);

        let record = client.get_retirement(&1);
        assert_eq!(record.owner, sponsor);
        assert_eq!(record.amount, 400_000);
        assert_eq!(record.reason, symbol_short!("offset"));
        assert_eq!(client.credit_supply().retired, 400_000);
    }

    #[test]
    fn test_retirement_records_are_not_overwritten() {
        let (env, _, client) = setup();
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &buyer, 3);

        let first = client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("a"));
        let second = client.retire_credits(&buyer, &500_000_u64, &symbol_short!("b"));
        assert_eq!((first, second), (1, 2));

        // The first record keeps its original contents after later retirements.
        let record = client.get_retirement(&first);
        assert_eq!(record.amount, 1_000_000);
        assert_eq!(record.reason, symbol_short!("a"));
        assert_eq!(client.get_retirement(&second).amount, 500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_retired_credits_cannot_be_retired_again() {
        let (env, _, client) = setup();
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &buyer, 1);

        client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("offset"));
        client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("offset"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_retired_credits_cannot_be_resold() {
        let (env, _, client, _) = retail_ctx();
        let seller = Address::generate(&env);
        give_tons(&env, &client, &seller, 2);

        client.retire_credits(&seller, &2_000_000_u64, &symbol_short!("offset"));
        // Nothing is left to list, so the burned tons cannot be sold on.
        client.open_retail_lot(&seller, &Symbol::new(&env, "proj1"), &1_000_000_u64, &5_i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_retire_credits_zero_amount_panics() {
        let (env, _, client) = setup();
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &buyer, 1);
        client.retire_credits(&buyer, &0_u64, &symbol_short!("offset"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_retire_credits_above_balance_panics() {
        let (env, _, client) = setup();
        let buyer = Address::generate(&env);
        give_tons(&env, &client, &buyer, 1);
        client.retire_credits(&buyer, &1_000_001_u64, &symbol_short!("offset"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #26)")]
    fn test_get_unknown_retirement_panics() {
        let (_, _, client) = setup();
        client.get_retirement(&1);
    }

    #[test]
    fn test_retirements_for_owner_paginates() {
        let (env, _, client) = setup();
        let buyer = Address::generate(&env);
        let other = Address::generate(&env);
        give_tons(&env, &client, &buyer, 3);
        give_tons(&env, &client, &other, 1);

        client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("a"));
        client.retire_credits(&other, &1_000_000_u64, &symbol_short!("b"));
        client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("c"));
        client.retire_credits(&buyer, &1_000_000_u64, &symbol_short!("d"));

        let all = client.retirements_for_owner(&buyer, &0_u64, &10_u32);
        assert_eq!(all, Vec::from_array(&env, [1_u64, 3, 4]));

        let page = client.retirements_for_owner(&buyer, &1_u64, &1_u32);
        assert_eq!(page, Vec::from_array(&env, [3_u64]));

        assert_eq!(
            client.retirements_for_owner(&other, &0_u64, &10_u32),
            Vec::from_array(&env, [2_u64])
        );
        assert_eq!(client.credit_supply().circulating, 0);
    }
}
