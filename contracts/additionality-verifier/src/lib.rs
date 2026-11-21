#![no_std]

//! Additionality Verifier — Closes #1334 (v1)
//!
//! Verifies that carbon offset projects are *additional*: they would not have
//! happened without carbon-credit incentives. The core test compares a
//! project's claimed sequestration/emissions path against the counterfactual
//! **regional baseline** — the BAU (business-as-usual) scenario for the same
//! region and project activity type.
//!
//! # Design (v1)
//!
//! ## Baselines
//! The admin (governance multisig) registers a baseline per
//! `(region_geohash, activity)` pair: the expected annual emissions
//! (tCO2e/yr, scaled ×100 to avoid floats — same convention as
//! `carbon-credits` `co2_scaled`) and the credentialing year over which the
//! baseline is measured (e.g. a 5-year rolling historical average).
//!
//! ## Project scoring
//! A verifier (registered like `farmer-registry` validators) submits a
//! project assessment:
//! - `claimed_sequestration_scaled` — the project's claimed annual tCO2e ×100
//! - `assessed_sequestration_scaled` — the verifier's independent, more
//!   conservative estimate (always used for credit quantification)
//! - `baseline_deviation_bps` — how far the project's measured performance
//!   sits from the regional baseline, in basis points
//!
//! ## Decision rule
//! A project is **additional** when, and only when:
//! 1. its assessed annual sequestration exceeds the regional baseline by at
//!    least `MIN_BASELINE_UPLIFT_BPS` (default 10%, i.e. 1_000 bps) — the
//!    "performance standard" test used by Gold Standard / Verra methodologies;
//! 2. the verifier's assessment is not more aggressive than the claim
//!    (`assessed <= claimed`) — protecting against inflated quantification;
//! 3. the project started before or at the crediting start date (no
//!    retroactive crediting of pre-incentive activity), enforced by requiring
//!    `project_start` ≤ `baseline.credited_from` + `MAX_RETROACTIVE_SECS`.
//!
//! The full decision is recomputed deterministically by
//! `evaluate_additionality` so governance can re-score projects when
//! baselines are tightened.
//!
//! # Storage
//! Persistent storage keyed by a `#[contracttype] DataKey` enum (the compact
//! encoding pattern used across this suite), with 30–90 day TTL extensions on
//! every write.

use admin_controls::AdminControlsClient;
use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, String,
};

// ── Constants ────────────────────────────────────────────────────────────────

/// Minimum uplift of assessed sequestration over the regional baseline for a
/// project to count as additional, in basis points (1_000 = 10%).
const DEFAULT_MIN_UPLIFT_BPS: u32 = 1_000;
/// BPS denominator.
const BPS_DENOM: u32 = 10_000;
/// Maximum retroactive crediting window: 2 years. A project that started more
/// than 2 years before the baseline's crediting start is presumed non-additional.
const MAX_RETROACTIVE_SECS: u64 = 2 * 365 * 24 * 60 * 60;
/// TTL extension window (30 days min / 90 days max) — matches farmer-registry.
const TTL_MIN: u32 = 518_400;
const TTL_MAX: u32 = 1_036_800;
/// Maximum length of a registered activity tag.
const MAX_ACTIVITY_LEN: u32 = 32;

// ── Types ────────────────────────────────────────────────────────────────────

/// Compact storage-key enum (see farmer-registry for the encoding rationale).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    /// (admin, admin_controls, min_uplift_bps)
    Config,
    /// Boolean: is `Address` a registered verifier?
    Verifier(Address),
    /// Baseline record keyed by (region_geohash, activity).
    Baseline(String, String),
    /// ProjectAssessment for a given project_id.
    Project(BytesN<32>),
    /// Boolean: is the project currently flagged additional?
    Additional(BytesN<32>),
}

/// 32-byte project identifier (SHA-256 of project metadata, off-chain).
/// Stored directly as `BytesN<32>`, matching the proof-hash convention used
/// across this contract suite.

/// Regional BAU baseline for one (region, activity) pair.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RegionalBaseline {
    /// Northern-Nigeria geohash prefix (s0–s8 scheme, as in farmer-registry).
    pub region_geohash: String,
    /// Activity type tag, e.g. "afforestation", "cookstove", "avoided_conversion".
    pub activity: String,
    /// Regional BAU annual emissions/uptake, tCO2e/yr ×100 (i128).
    pub baseline_annual_scaled: i128,
    /// Crediting start (unix secs): activity after this date is eligible.
    pub credited_from: u64,
    /// Who registered the baseline (admin).
    pub registered_by: Address,
    pub registered_at: u64,
}

/// Verifier-submitted project assessment.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProjectAssessment {
    pub project_id: BytesN<32>,
    pub region_geohash: String,
    pub activity: String,
    pub farmer: Address,
    pub verifier: Address,
    /// Project's claimed annual sequestration, tCO2e/yr ×100.
    pub claimed_sequestration_scaled: i128,
    /// Verifier's conservative independent estimate, tCO2e/yr ×100.
    pub assessed_sequestration_scaled: i128,
    /// Project start timestamp (unix secs).
    pub project_start: u64,
    pub assessed_at: u64,
}

/// Deterministic outcome of the additionality tests.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdditionalityResult {
    pub project_id: BytesN<32>,
    /// True when every test passes.
    pub is_additional: bool,
    /// Assessed uplift over the regional baseline, in basis points.
    pub uplift_bps: u32,
    /// Human-readable reason for rejection ("" when additional).
    pub reason: String,
    pub evaluated_at: u64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

/// Contract-specific errors (codes 1–…), prefixed by the module.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AdditionalityError {
    /// No baseline registered for the (region, activity) pair.
    BaselineNotFound = 1,
    /// The (region, activity) baseline already exists — use update_baseline.
    BaselineAlreadyRegistered = 2,
    /// Baseline value must be positive (tCO2e ×100).
    BaselineMustBePositive = 3,
    /// Region prefix is not one of s0–s8.
    InvalidRegion = 4,
    /// Assessed value must be positive.
    AssessedMustBePositive = 5,
    /// Claimed value must be positive.
    ClaimedMustBePositive = 6,
    /// Verifier assessment may not exceed the project's own claim.
    AssessmentExceedsClaim = 7,
    /// Project started too long before the crediting window (retroactivity).
    RetroactiveNotEligible = 8,
    /// Project already has a recorded assessment.
    ProjectAlreadyAssessed = 9,
    /// Project has no assessment on record.
    ProjectNotFound = 10,
    /// Activity tag is empty or too long.
    InvalidActivity = 11,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct AdditionalityVerifier;

#[contractimpl]
impl AdditionalityVerifier {
    /// One-time initialisation.
    pub fn initialize(env: Env, admin: Address, admin_controls: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(
            &DataKey::Config,
            &(admin, admin_controls, DEFAULT_MIN_UPLIFT_BPS),
        );
    }

    // ── Governance configuration ─────────────────────────────────────────────

    /// Admin-only: tighten or relax the minimum baseline uplift threshold.
    ///
    /// # Errors
    /// - `Unauthorized` — caller is not the admin
    /// - `InvalidThreshold` — bps is 0 or exceeds BPS_DENOM (100%)
    pub fn set_min_uplift_bps(env: Env, admin: Address, min_uplift_bps: u32) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if min_uplift_bps == 0 || min_uplift_bps > BPS_DENOM {
            panic_with_error!(&env, HarvestaError::InvalidThreshold);
        }
        let (a, ac, _) = Self::config(&env);
        env.storage()
            .instance()
            .set(&DataKey::Config, &(a, ac, min_uplift_bps));
        env.events().publish(
            (symbol_short!("UpliftSet"),),
            (min_uplift_bps, env.ledger().timestamp()),
        );
    }

    /// Returns the currently configured minimum uplift threshold in bps.
    pub fn get_min_uplift_bps(env: Env) -> u32 {
        let (_, _, bps) = Self::config(&env);
        bps
    }

    // ── Verifier management (admin-only) ─────────────────────────────────────

    /// Register an additionality verifier.
    pub fn register_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        let key = DataKey::Verifier(verifier.clone());
        env.storage().instance().set(&key, &true);
        env.events().publish(
            (symbol_short!("VerReg"), verifier),
            env.ledger().timestamp(),
        );
    }

    /// Revoke an additionality verifier.
    pub fn revoke_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().instance().remove(&DataKey::Verifier(verifier));
        env.events().publish(
            (symbol_short!("VerRev"), verifier),
            env.ledger().timestamp(),
        );
    }

    /// Returns `true` if `verifier` is registered.
    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::Verifier(verifier))
            .unwrap_or(false)
    }

    // ── Baseline management (admin-only) ─────────────────────────────────────

    /// Register (or overwrite) the regional BAU baseline for a
    /// (region_geohash, activity) pair.
    ///
    /// # Errors
    /// - `Unauthorized` — caller is not the admin
    /// - `InvalidRegion` — region prefix not s0–s8
    /// - `InvalidActivity` — empty or > 32 chars
    /// - `BaselineMustBePositive` — baseline_annual_scaled ≤ 0
    pub fn set_baseline(
        env: Env,
        admin: Address,
        region_geohash: String,
        activity: String,
        baseline_annual_scaled: i128,
        credited_from: u64,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        Self::assert_valid_region(&env, &region_geohash);
        Self::assert_valid_activity(&env, &activity);
        if baseline_annual_scaled <= 0 {
            panic_with_error!(&env, AdditionalityError::BaselineMustBePositive);
        }

        let key = DataKey::Baseline(region_geohash.clone(), activity.clone());
        let baseline = RegionalBaseline {
            region_geohash,
            activity,
            baseline_annual_scaled,
            credited_from,
            registered_by: admin.clone(),
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &baseline);
        env.storage().persistent().extend_ttl(&key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("BaseSet"), admin),
            (baseline.baseline_annual_scaled, credited_from),
        );
    }

    /// Read the baseline for a (region, activity) pair, if registered.
    pub fn get_baseline(env: Env, region_geohash: String, activity: String) -> Option<RegionalBaseline> {
        env.storage()
            .persistent()
            .get(&DataKey::Baseline(region_geohash, activity))
    }

    // ── Project assessment (verifier-gated) ──────────────────────────────────

    /// Submit a project's additionality assessment and record the decision.
    ///
    /// Both the verifier and the farmer must sign. The decision is computed
    /// deterministically (see module docs) and stored so it can be consumed by
    /// escrow/marketplace contracts before release.
    ///
    /// # Errors
    /// - `NotValidator` — caller is not a registered verifier
    /// - `BaselineNotFound` — no regional baseline covers this (region, activity)
    /// - `AssessmentExceedsClaim` — assessed > claimed (inflation guard)
    /// - `RetroactiveNotEligible` — project predates the crediting window
    /// - `ProjectAlreadyAssessed` — project already scored (v1: immutable)
    pub fn submit_assessment(
        env: Env,
        verifier: Address,
        farmer: Address,
        project_id: BytesN<32>,
        region_geohash: String,
        activity: String,
        claimed_sequestration_scaled: i128,
        assessed_sequestration_scaled: i128,
        project_start: u64,
    ) -> AdditionalityResult {
        Self::assert_not_paused(&env);
        verifier.require_auth();
        farmer.require_auth();

        if !Self::_is_verifier(&env, &verifier) {
            panic_with_error!(&env, HarvestaError::NotValidator);
        }
        Self::assert_valid_region(&env, &region_geohash);
        Self::assert_valid_activity(&env, &activity);
        if assessed_sequestration_scaled <= 0 {
            panic_with_error!(&env, AdditionalityError::AssessedMustBePositive);
        }
        if claimed_sequestration_scaled <= 0 {
            panic_with_error!(&env, AdditionalityError::ClaimedMustBePositive);
        }
        // Anti-inflation: the verifier's independent estimate may never exceed
        // the project's own claim.
        if assessed_sequestration_scaled > claimed_sequestration_scaled {
            panic_with_error!(&env, AdditionalityError::AssessmentExceedsClaim);
        }

        let project_key = DataKey::Project(project_id);
        if env.storage().persistent().has(&project_key) {
            panic_with_error!(&env, AdditionalityError::ProjectAlreadyAssessed);
        }

        let baseline_key = DataKey::Baseline(region_geohash.clone(), activity.clone());
        let baseline: RegionalBaseline = env
            .storage()
            .persistent()
            .get(&baseline_key)
            .unwrap_or_else(|| panic_with_error!(&env, AdditionalityError::BaselineNotFound));

        let assessment = ProjectAssessment {
            project_id,
            region_geohash,
            activity,
            farmer,
            verifier,
            claimed_sequestration_scaled,
            assessed_sequestration_scaled,
            project_start,
            assessed_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&project_key, &assessment);
        env.storage().persistent().extend_ttl(&project_key, TTL_MIN, TTL_MAX);

        let (min_uplift_bps, _, _) = Self::config(&env);
        let result = Self::evaluate(&env, &assessment, &baseline, min_uplift_bps);

        let flag_key = DataKey::Additional(project_id);
        env.storage().persistent().set(&flag_key, &result.is_additional);
        env.storage().persistent().extend_ttl(&flag_key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("AddEval"), project_id),
            (result.is_additional, result.uplift_bps),
        );

        result
    }

    /// Re-evaluate an existing assessment against the *current* baseline and
    /// threshold. Permissionless read-modify-write of only the derived flags —
    /// the underlying assessment is immutable, so any signer can trigger the
    /// recomputation when governance tightens baselines.
    ///
    /// # Errors
    /// - `ProjectNotFound` — no assessment for `project_id`
    /// - `BaselineNotFound` — the covering baseline was removed/never set
    pub fn reevaluate(env: Env, project_id: BytesN<32>) -> AdditionalityResult {
        let project_key = DataKey::Project(project_id);
        let assessment: ProjectAssessment = env
            .storage()
            .persistent()
            .get(&project_key)
            .unwrap_or_else(|| panic_with_error!(&env, AdditionalityError::ProjectNotFound));

        let baseline_key = DataKey::Baseline(
            assessment.region_geohash.clone(),
            assessment.activity.clone(),
        );
        let baseline: RegionalBaseline = env
            .storage()
            .persistent()
            .get(&baseline_key)
            .unwrap_or_else(|| panic_with_error!(&env, AdditionalityError::BaselineNotFound));

        let (min_uplift_bps, _, _) = Self::config(&env);
        let result = Self::evaluate(&env, &assessment, &baseline, min_uplift_bps);

        let flag_key = DataKey::Additional(project_id);
        env.storage().persistent().set(&flag_key, &result.is_additional);
        env.storage().persistent().extend_ttl(&flag_key, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("AddEval"), project_id),
            (result.is_additional, result.uplift_bps),
        );

        result
    }

    // ── Query ────────────────────────────────────────────────────────────────

    /// Returns the stored assessment, if any.
    pub fn get_assessment(env: Env, project_id: BytesN<32>) -> Option<ProjectAssessment> {
        env.storage().persistent().get(&DataKey::Project(project_id))
    }

    /// Returns the last recorded additionality decision for the project.
    pub fn is_additional(env: Env, project_id: BytesN<32>) -> Option<bool> {
        env.storage().persistent().get(&DataKey::Additional(project_id))
    }

    /// Convenience predicate for consumers: a project is releasable only when
    /// it was assessed **and** flagged additional.
    pub fn is_releasable(env: Env, project_id: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::Additional(project_id))
            .unwrap_or(false)
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// Deterministic scoring: the three additionality tests from the module
    /// docs, evaluated in order so the returned `reason` names the first
    /// failing test.
    fn evaluate(
        env: &Env,
        assessment: &ProjectAssessment,
        baseline: &RegionalBaseline,
        min_uplift_bps: u32,
    ) -> AdditionalityResult {
        // Test 3 — retroactivity guard.
        if assessment.project_start > baseline.credited_from.saturating_add(MAX_RETROACTIVE_SECS) {
            return Self::result(
                env,
                assessment.project_id,
                false,
                0,
                String::from_str(env, "project predates crediting window"),
            );
        }

        // Test 1 — performance standard: assessed sequestration must beat the
        // regional BAU baseline by at least `min_uplift_bps`.
        let base = baseline.baseline_annual_scaled;
        let uplift_scaled = assessment
            .assessed_sequestration_scaled
            .saturating_sub(base);
        // Percent uplift = (assessed - baseline) * 10_000 / baseline.
        let uplift_bps = if base > 0 {
            ((uplift_scaled as u128).saturating_mul(BPS_DENOM as u128) / (base as u128)) as u32
        } else {
            0
        };
        if uplift_bps < min_uplift_bps {
            return Self::result(
                env,
                assessment.project_id,
                false,
                uplift_bps,
                String::from_str(env, "uplift below regional baseline threshold"),
            );
        }

        // Test 2 — anti-inflation: enforced at submission; re-check defensively
        // in case the assessment was recorded before this rule existed.
        if assessment.assessed_sequestration_scaled > assessment.claimed_sequestration_scaled {
            return Self::result(
                env,
                assessment.project_id,
                false,
                uplift_bps,
                String::from_str(env, "assessment exceeds claim"),
            );
        }

        Self::result(env, assessment.project_id, true, uplift_bps, String::from_str(env, ""))
    }

    fn result(
        env: &Env,
        project_id: BytesN<32>,
        is_additional: bool,
        uplift_bps: u32,
        reason: String,
    ) -> AdditionalityResult {
        AdditionalityResult {
            project_id,
            is_additional,
            uplift_bps,
            reason,
            evaluated_at: env.ledger().timestamp(),
        }
    }

    fn config(env: &Env) -> (Address, Address, u32) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let (admin, _, _) = Self::config(env);
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
    }

    fn assert_not_paused(env: &Env) {
        let (_, ac, _) = Self::config(env);
        AdminControlsClient::new(env, &ac).assert_not_paused();
    }

    fn _is_verifier(env: &Env, addr: &Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::Verifier(addr.clone()))
            .unwrap_or(false)
    }

    /// Northern Nigeria geohash validation (2-char prefixes s0–s8), matching
    /// farmer-registry.
    fn assert_valid_region(env: &Env, region: &String) {
        const VALID: [&str; 9] = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
        for prefix in VALID {
            if *region == String::from_str(env, prefix) {
                return;
            }
        }
        panic_with_error!(env, AdditionalityError::InvalidRegion);
    }

    fn assert_valid_activity(env: &Env, activity: &String) {
        let len = activity.len();
        if len == 0 || len > MAX_ACTIVITY_LEN {
            panic_with_error!(env, AdditionalityError::InvalidActivity);
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn activity(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    /// Deploy admin-controls + verifier contract; register `verifier`.
    fn setup() -> (Env, Address, Address, AdditionalityVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let ac_id = env.register_contract(None, admin_controls::AdminControls);
        let ac_client = admin_controls::AdminControlsClient::new(&env, &ac_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        ac_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, AdditionalityVerifier);
        let client = AdditionalityVerifierClient::new(&env, &contract_id);
        client.initialize(&admin, &ac_id);

        let verifier = Address::generate(&env);
        client.register_verifier(&admin, &verifier);

        (env, admin, verifier, client)
    }

    fn project_id(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    /// Register a baseline of 100.00 tCO2e/yr for (s1, afforestation)
    /// with crediting starting at t=0.
    fn setup_baseline(env: &Env, admin: &Address, client: &AdditionalityVerifierClient) {
        client.set_baseline(
            admin,
            &activity(env, "s1"),
            &activity(env, "afforestation"),
            &10_000i128, // 100.00 tCO2e/yr ×100
            &0u64,
        );
    }

    // ── lifecycle ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (env, admin, _verifier, client) = setup();
        let ac = Address::generate(&env);
        client.initialize(&admin, &ac);
    }

    // ── verifier management ──────────────────────────────────────────────────

    #[test]
    fn test_register_and_revoke_verifier() {
        let (env, admin, verifier, client) = setup();
        assert!(client.is_verifier(&verifier));

        let other = Address::generate(&env);
        assert!(!client.is_verifier(&other));
        client.register_verifier(&admin, &other);
        assert!(client.is_verifier(&other));

        client.revoke_verifier(&admin, &other);
        assert!(!client.is_verifier(&other));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_register_verifier_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let target = Address::generate(&env);
        client.register_verifier(&attacker, &target);
    }

    // ── baselines ────────────────────────────────────────────────────────────

    #[test]
    fn test_set_and_get_baseline() {
        let (env, admin, _verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        let b = client
            .get_baseline(&activity(&env, "s1"), &activity(&env, "afforestation"))
            .unwrap();
        assert_eq!(b.baseline_annual_scaled, 10_000);
        assert_eq!(b.credited_from, 0);
        assert_eq!(b.registered_by, admin);
    }

    #[test]
    fn test_baseline_overwrite_allowed() {
        let (env, admin, _verifier, client) = setup();
        setup_baseline(&env, &admin, &client);
        client.set_baseline(
            &admin,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &12_000i128,
            &0u64,
        );
        let b = client
            .get_baseline(&activity(&env, "s1"), &activity(&env, "afforestation"))
            .unwrap();
        assert_eq!(b.baseline_annual_scaled, 12_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_baseline_invalid_region_rejected() {
        let (env, admin, _verifier, client) = setup();
        client.set_baseline(
            &admin,
            &activity(&env, "zz"),
            &activity(&env, "afforestation"),
            &10_000i128,
            &0u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_baseline_non_admin_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        client.set_baseline(
            &attacker,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &10_000i128,
            &0u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_baseline_non_positive_rejected() {
        let (env, admin, _verifier, client) = setup();
        client.set_baseline(
            &admin,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &0i128,
            &0u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_baseline_invalid_activity_rejected() {
        let (env, admin, _verifier, client) = setup();
        client.set_baseline(
            &admin,
            &activity(&env, "s1"),
            &activity(&env, ""),
            &10_000i128,
            &0u64,
        );
    }

    // ── additionality decision ───────────────────────────────────────────────

    #[test]
    fn test_project_above_baseline_is_additional() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        // Assessed 130.00 t/yr → uplift over 100.00 = 30% = 3_000 bps ≥ 1_000.
        let result = client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 1),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &14_000i128,
            &13_000i128,
            &10u64,
        );
        assert!(result.is_additional);
        assert_eq!(result.uplift_bps, 3_000);
        assert!(client.is_releasable(&project_id(&env, 1)));
        assert_eq!(client.is_additional(&project_id(&env, 1)), Some(true));
    }

    #[test]
    fn test_project_at_or_below_baseline_is_not_additional() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        // Assessed 105.00 → uplift 5% = 500 bps < 1_000 bps minimum.
        let result = client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 2),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &10_500i128,
            &10_500i128,
            &10u64,
        );
        assert!(!result.is_additional);
        assert!(!client.is_releasable(&project_id(&env, 2)));
    }

    #[test]
    fn test_unassessed_project_not_releasable() {
        let (_env, _admin, _verifier, client) = setup();
        assert!(!client.is_releasable(&project_id(&Env::default(), 99)));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_assessment_exceeding_claim_rejected() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 3),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &11_000i128,  // claim
            &12_000i128,  // assessed > claim → panic
            &10u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_assessment_without_baseline_rejected() {
        let (env, _admin, verifier, client) = setup();
        client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 4),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &13_000i128,
            &12_000i128,
            &10u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_assessment_by_non_verifier_rejected() {
        let (env, admin, _verifier, client) = setup();
        setup_baseline(&env, &admin, &client);
        let attacker = Address::generate(&env);

        client.submit_assessment(
            &attacker,
            &Address::generate(&env),
            &project_id(&env, 5),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &13_000i128,
            &12_000i128,
            &10u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_double_assessment_rejected() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 6),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &13_000i128,
            &12_000i128,
            &10u64,
        );
        client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 6),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &13_000i128,
            &12_000i128,
            &10u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_retroactive_project_rejected() {
        let (env, admin, verifier, client) = setup();
        // Baseline credited from t = 1_000_000.
        client.set_baseline(
            &admin,
            &activity(&env, "s2"),
            &activity(&env, "afforestation"),
            &10_000i128,
            &1_000_000u64,
        );

        // Project started 3 years before the crediting window (> 2y max).
        let too_early = 1_000_000u64.saturating_sub(3 * 365 * 24 * 60 * 60);
        client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 7),
            &activity(&env, "s2"),
            &activity(&env, "afforestation"),
            &13_000i128,
            &12_000i128,
            &too_early,
        );
    }

    #[test]
    fn test_boundary_uplift_exactly_at_threshold_passes() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        // Assessed 110.00 → uplift exactly 10% = 1_000 bps = threshold.
        let result = client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &project_id(&env, 8),
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &11_000i128,
            &11_000i128,
            &10u64,
        );
        assert!(result.is_additional);
        assert_eq!(result.uplift_bps, 1_000);
    }

    // ── governance threshold ─────────────────────────────────────────────────

    #[test]
    fn test_stricter_threshold_rejects_formerly_additional() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        // 15% uplift passes the default 10% threshold.
        let pid = project_id(&env, 9);
        let result = client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &pid,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &11_500i128,
            &11_500i128,
            &10u64,
        );
        assert!(result.is_additional);

        // Tighten to 20% and re-evaluate — same data, now rejected.
        client.set_min_uplift_bps(&admin, &2_000u32);
        let again = client.reevaluate(&pid);
        assert!(!again.is_additional);
        assert!(!client.is_releasable(&pid));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_set_min_uplift_over_100pct_rejected() {
        let (env, admin, _verifier, client) = setup();
        client.set_min_uplift_bps(&admin, &10_001u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_set_min_uplift_non_admin_rejected() {
        let (env, _, _, client) = setup();
        client.set_min_uplift_bps(&Address::generate(&env), &2_000u32);
    }

    // ── re-evaluation ────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_reevaluate_unknown_project_rejected() {
        let (_env, _, _, client) = setup();
        client.reevaluate(&project_id(&Env::default(), 77));
    }

    #[test]
    fn test_baseline_tightening_flips_decision_on_reevaluate() {
        let (env, admin, verifier, client) = setup();
        setup_baseline(&env, &admin, &client);

        let pid = project_id(&env, 10);
        let result = client.submit_assessment(
            &verifier,
            &Address::generate(&env),
            &pid,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &12_500i128,
            &12_500i128,
            &10u64,
        );
        assert!(result.is_additional);

        // Baseline raised to 120.00 → assessed 125.00 is only ~4% uplift.
        client.set_baseline(
            &admin,
            &activity(&env, "s1"),
            &activity(&env, "afforestation"),
            &12_000i128,
            &0u64,
        );
        let again = client.reevaluate(&pid);
        assert!(!again.is_additional);
        assert_eq!(client.is_additional(&pid), Some(false));
    }
}
