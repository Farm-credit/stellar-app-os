#![no_std]
#![allow(
    clippy::needless_pass_by_value,
    clippy::must_use_candidate,
    clippy::missing_panics_doc,
    clippy::module_name_repetitions,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss
)]

//! Planter Reputation Scoring Engine stored on-chain (issue #1812).
//!
//! Harvesta rewards verified ecological impact with CARBON tokens and NFT
//! certificates. Both farmers and non-farmer community tree stewards need a
//! durable, auditable reputation that survives escrows coming and going. This
//! contract is that ledger:
//!
//! - an admin registers verifiers and configures the scoring weights;
//! - a verifier records the outcome of a milestone (success or failure) once,
//!   using an immutable 32-byte reference as a replay guard;
//! - the engine recomputes a 0..=`max_score` score, derives a tier, and appends
//!   an immutable entry to the steward's on-chain ledger;
//! - an admin can apply a bounded penalty with the same replay protection;
//! - views return `Option`/plain values so clients can render loading, empty
//!   and ineligible states without issuing a failing transaction.
//!
//! Every profile, ledger entry and reference marker lives in **persistent**
//! storage, so a reputation cannot be lost to a temporary TTL. Configuration,
//! verifier membership and counters live in instance storage following the
//! shared storage policy in `contract_utils::storage`.

use contract_utils::storage::{
    get as storage_get, has as storage_has, set as storage_set, DataLifetime, StorageClass,
};
use harvesta_errors::standard;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    IntoVal, TryFromVal, Val, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Namespace index allocated in `harvesta_errors::standard` for this crate.
pub const CRATE_INDEX: usize = 57;

pub const INITIAL_SCORE: u32 = 100;
pub const MAX_SCORE: u32 = 1_000;
pub const SUCCESS_POINTS: u32 = 10;
pub const FAILURE_PENALTY: u32 = 20;
pub const TREE_BONUS_DIVISOR: u32 = 10;
pub const MAX_TREE_BONUS: u32 = 5;
pub const MAX_TREE_BONUS_DIVISOR: u32 = 1_000;
pub const MAX_TREES_PER_MILESTONE: u32 = 1_000_000;
pub const MAX_PENALTY_POINTS: u32 = 1_000;
pub const PERSISTENT_TTL_LEDGERS: u32 = contract_utils::storage::REPLAY_GUARD_TTL_LEDGERS;

pub const TIER_SILVER_MIN: u32 = 300;
pub const TIER_GOLD_MIN: u32 = 600;
pub const TIER_PLATINUM_MIN: u32 = 900;

// ── Errors (namespace 0x3A, see harvesta-errors/standard.rs) ──────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    AlreadyInitialized = 3_801_089,
    NotInitialized = 3_801_090,
    Unauthorized = 3_801_091,
    NotVerifier = 3_801_092,
    VerifierAlreadyExists = 3_801_093,
    VerifierNotFound = 3_801_094,
    AlreadyRegistered = 3_801_095,
    StewardNotFound = 3_801_096,
    StewardInactive = 3_801_097,
    DuplicateReference = 3_801_098,
    InvalidWeights = 3_801_099,
    InvalidTreeCount = 3_801_100,
    InvalidPenalty = 3_801_101,
    InvalidOutcome = 3_801_102,
    EntryNotFound = 3_801_103,
}

const _: () = {
    assert!(ReputationError::AlreadyInitialized as u32 == standard::global_code(CRATE_INDEX, 1));
    assert!(ReputationError::InvalidOutcome as u32 == standard::global_code(CRATE_INDEX, 14));
    assert!(ReputationError::EntryNotFound as u32 == standard::global_code(CRATE_INDEX, 15));
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StewardKind {
    /// A registered farmer with a plot in the farmer registry.
    Farmer,
    /// A non-farmer community steward (urban planter, school, verifier, ...).
    CommunitySteward,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Tier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LedgerOutcome {
    /// Milestone verified: score grows by success points plus a tree bonus.
    Success,
    /// Milestone rejected: score shrinks by the configured failure penalty.
    Failed,
    /// Manual admin correction (dispute resolution, blacklist, ...).
    Penalty,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreWeights {
    pub initial_score: u32,
    pub max_score: u32,
    pub success_points: u32,
    pub failure_penalty: u32,
    /// Number of verified trees that grants one bonus point. `0` disables it.
    pub tree_bonus_divisor: u32,
    pub max_tree_bonus: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationProfile {
    pub steward: Address,
    pub kind: StewardKind,
    pub score: u32,
    pub tier: Tier,
    pub successful_milestones: u32,
    pub failed_milestones: u32,
    pub penalty_points: u32,
    pub trees_verified: u64,
    pub active: bool,
    pub registered_at: u64,
    pub last_milestone_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneRecord {
    pub id: u64,
    pub steward: Address,
    pub verifier: Address,
    /// Unique external milestone reference, also used as the replay guard.
    pub reference: BytesN<32>,
    pub outcome: LedgerOutcome,
    /// Signed score change applied by this entry.
    pub delta: i32,
    pub trees: u32,
    pub score_after: u32,
    pub recorded_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Admin,
    Verifiers,
    Weights,
    NextEntryId,
    StewardCount,
    Profile(Address),
    Entry(u64),
    StewardEntries(Address),
    SeenReference(BytesN<32>),
}

// ── Events ────────────────────────────────────────────────────────────────────

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StewardRegistered {
    #[topic]
    pub steward: Address,
    pub kind: StewardKind,
    pub score: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneRecorded {
    #[topic]
    pub steward: Address,
    #[topic]
    pub entry_id: u64,
    pub outcome: LedgerOutcome,
    pub delta: i32,
    pub score_after: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PenaltyApplied {
    #[topic]
    pub steward: Address,
    #[topic]
    pub entry_id: u64,
    pub points: u32,
    pub score_after: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierUpdated {
    #[topic]
    pub verifier: Address,
    pub added: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WeightsUpdated {
    pub weights: ScoreWeights,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActivityChanged {
    #[topic]
    pub steward: Address,
    pub active: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlanterReputation;

#[contractimpl]
impl PlanterReputation {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            fail(&env, ReputationError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Verifiers, &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::Weights, &default_weights());
        env.storage().instance().set(&DataKey::NextEntryId, &0u64);
        env.storage().instance().set(&DataKey::StewardCount, &0u32);
    }

    pub fn get_admin(env: Env) -> Address {
        load_admin(&env)
    }

    pub fn get_weights(env: Env) -> ScoreWeights {
        load_weights(&env)
    }

    pub fn set_weights(env: Env, admin: Address, weights: ScoreWeights) {
        require_admin(&env, &admin);
        validate_weights(&env, &weights);
        env.storage().instance().set(&DataKey::Weights, &weights);
        WeightsUpdated { weights }.publish(&env);
    }

    // ── Verifier management ───────────────────────────────────────────────────

    pub fn add_verifier(env: Env, admin: Address, verifier: Address) {
        require_admin(&env, &admin);
        let mut verifiers = load_verifiers(&env);
        if verifiers.contains(&verifier) {
            fail(&env, ReputationError::VerifierAlreadyExists);
        }
        verifiers.push_back(verifier.clone());
        env.storage()
            .instance()
            .set(&DataKey::Verifiers, &verifiers);
        VerifierUpdated {
            verifier,
            added: true,
        }
        .publish(&env);
    }

    pub fn remove_verifier(env: Env, admin: Address, verifier: Address) {
        require_admin(&env, &admin);
        let verifiers = load_verifiers(&env);
        if !verifiers.contains(&verifier) {
            fail(&env, ReputationError::VerifierNotFound);
        }
        let mut kept = Vec::<Address>::new(&env);
        for candidate in verifiers.iter() {
            if candidate != verifier {
                kept.push_back(candidate);
            }
        }
        env.storage().instance().set(&DataKey::Verifiers, &kept);
        VerifierUpdated {
            verifier,
            added: false,
        }
        .publish(&env);
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        is_registered_verifier(&env, &verifier)
    }

    pub fn get_verifiers(env: Env) -> Vec<Address> {
        load_verifiers(&env)
    }

    // ── Steward registration ──────────────────────────────────────────────────

    /// Self-registration: the steward signs for themselves.
    pub fn register_steward(env: Env, steward: Address, kind: StewardKind) -> ReputationProfile {
        steward.require_auth();
        create_profile(&env, &steward, kind)
    }

    /// Admin-driven registration for farmers/stewards imported from KYC or
    /// from the existing farmer/planter registries.
    pub fn register_steward_for(
        env: Env,
        admin: Address,
        steward: Address,
        kind: StewardKind,
    ) -> ReputationProfile {
        require_admin(&env, &admin);
        create_profile(&env, &steward, kind)
    }

    pub fn get_profile(env: Env, steward: Address) -> Option<ReputationProfile> {
        get_audit(&env, &DataKey::Profile(steward))
    }

    pub fn get_score(env: Env, steward: Address) -> Option<u32> {
        Self::get_profile(env, steward).map(|profile| profile.score)
    }

    pub fn get_tier(env: Env, steward: Address) -> Option<Tier> {
        Self::get_profile(env, steward).map(|profile| profile.tier)
    }

    /// Non-panicking eligibility gate for high-value jobs and reward payouts.
    pub fn is_eligible(env: Env, steward: Address, min_score: u32) -> bool {
        match Self::get_profile(env, steward) {
            Some(profile) => profile.active && profile.score >= min_score,
            None => false,
        }
    }

    pub fn get_steward_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::StewardCount)
            .unwrap_or(0)
    }

    pub fn set_active(env: Env, admin: Address, steward: Address, active: bool) {
        require_admin(&env, &admin);
        let mut profile = load_profile(&env, &steward);
        profile.active = active;
        put_audit(&env, &DataKey::Profile(steward.clone()), &profile);
        ActivityChanged { steward, active }.publish(&env);
    }

    // ── Scoring engine ────────────────────────────────────────────────────────

    /// Records one verified milestone. The `reference` is a unique external id
    /// (for example a hash of the escrow milestone id); replaying it is
    /// rejected, so a milestone can never inflate a score twice.
    pub fn record_milestone(
        env: Env,
        verifier: Address,
        steward: Address,
        reference: BytesN<32>,
        outcome: LedgerOutcome,
        trees: u32,
    ) -> u64 {
        require_verifier(&env, &verifier);
        if outcome == LedgerOutcome::Penalty {
            fail(&env, ReputationError::InvalidOutcome);
        }
        if trees > MAX_TREES_PER_MILESTONE {
            fail(&env, ReputationError::InvalidTreeCount);
        }
        let reference_key = DataKey::SeenReference(reference.clone());
        if has_audit(&env, &reference_key) {
            fail(&env, ReputationError::DuplicateReference);
        }

        let mut profile = load_profile(&env, &steward);
        if !profile.active {
            fail(&env, ReputationError::StewardInactive);
        }

        let weights = load_weights(&env);
        let delta = score_delta(&weights, outcome, trees);
        let score_after = apply_delta(profile.score, delta, weights.max_score);
        profile.score = score_after;
        profile.tier = tier_for(score_after);
        profile.last_milestone_at = env.ledger().timestamp();
        match outcome {
            LedgerOutcome::Success => {
                profile.successful_milestones += 1;
                profile.trees_verified += u64::from(trees);
            }
            LedgerOutcome::Failed => profile.failed_milestones += 1,
            LedgerOutcome::Penalty => fail(&env, ReputationError::InvalidOutcome),
        }
        put_audit(&env, &DataKey::Profile(steward.clone()), &profile);

        let id = next_entry_id(&env);
        append_entry(
            &env,
            &MilestoneRecord {
                id,
                steward: steward.clone(),
                verifier: verifier.clone(),
                reference,
                outcome,
                delta,
                trees,
                score_after,
                recorded_at: env.ledger().timestamp(),
            },
        );
        put_audit(&env, &reference_key, &id);
        MilestoneRecorded {
            steward,
            entry_id: id,
            outcome,
            delta,
            score_after,
        }
        .publish(&env);
        id
    }

    /// Admin correction (dispute/blacklist). Uses the same replay guard as
    /// verifier milestones so a penalty can only be applied once.
    pub fn apply_penalty(
        env: Env,
        admin: Address,
        steward: Address,
        points: u32,
        reference: BytesN<32>,
    ) -> u64 {
        require_admin(&env, &admin);
        if points == 0 || points > MAX_PENALTY_POINTS {
            fail(&env, ReputationError::InvalidPenalty);
        }
        let reference_key = DataKey::SeenReference(reference.clone());
        if has_audit(&env, &reference_key) {
            fail(&env, ReputationError::DuplicateReference);
        }

        let mut profile = load_profile(&env, &steward);
        let score_after = profile.score.saturating_sub(points);
        profile.score = score_after;
        profile.tier = tier_for(score_after);
        profile.penalty_points += points;
        put_audit(&env, &DataKey::Profile(steward.clone()), &profile);

        let id = next_entry_id(&env);
        append_entry(
            &env,
            &MilestoneRecord {
                id,
                steward: steward.clone(),
                verifier: admin.clone(),
                reference,
                outcome: LedgerOutcome::Penalty,
                delta: -(points as i32),
                trees: 0,
                score_after,
                recorded_at: env.ledger().timestamp(),
            },
        );
        put_audit(&env, &reference_key, &id);
        PenaltyApplied {
            steward,
            entry_id: id,
            points,
            score_after,
        }
        .publish(&env);
        id
    }

    // ── Ledger views ──────────────────────────────────────────────────────────

    pub fn get_entry(env: Env, id: u64) -> Option<MilestoneRecord> {
        get_audit(&env, &DataKey::Entry(id))
    }

    pub fn get_entry_count(env: Env, steward: Address) -> u32 {
        get_audit::<_, Vec<u64>>(&env, &DataKey::StewardEntries(steward)).map_or(0, |ids| ids.len())
    }

    /// Full, append-only on-chain history for one steward.
    pub fn get_entries(env: Env, steward: Address) -> Vec<MilestoneRecord> {
        let ids = get_audit::<_, Vec<u64>>(&env, &DataKey::StewardEntries(steward))
            .unwrap_or_else(|| Vec::new(&env));
        let mut entries = Vec::<MilestoneRecord>::new(&env);
        for id in ids.iter() {
            if let Some(entry) = get_audit::<_, MilestoneRecord>(&env, &DataKey::Entry(id)) {
                entries.push_back(entry);
            }
        }
        entries
    }
}

// ── Internals ─────────────────────────────────────────────────────────────────

fn audit_class() -> StorageClass {
    DataLifetime::AuditRecord.storage_class()
}

fn put_audit<K, V>(env: &Env, key: &K, value: &V)
where
    K: IntoVal<Env, Val>,
    V: IntoVal<Env, Val>,
{
    storage_set(env, audit_class(), key, value, PERSISTENT_TTL_LEDGERS);
}

fn get_audit<K, V>(env: &Env, key: &K) -> Option<V>
where
    K: IntoVal<Env, Val>,
    V: TryFromVal<Env, Val>,
    V::Error: core::fmt::Debug,
{
    storage_get(env, audit_class(), key)
}

fn has_audit<K>(env: &Env, key: &K) -> bool
where
    K: IntoVal<Env, Val>,
{
    storage_has(env, audit_class(), key)
}

fn fail(env: &Env, error: ReputationError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

fn default_weights() -> ScoreWeights {
    ScoreWeights {
        initial_score: INITIAL_SCORE,
        max_score: MAX_SCORE,
        success_points: SUCCESS_POINTS,
        failure_penalty: FAILURE_PENALTY,
        tree_bonus_divisor: TREE_BONUS_DIVISOR,
        max_tree_bonus: MAX_TREE_BONUS,
    }
}

fn validate_weights(env: &Env, weights: &ScoreWeights) {
    if weights.max_score == 0
        || weights.initial_score > weights.max_score
        || weights.success_points == 0
        || weights.failure_penalty == 0
        || weights.tree_bonus_divisor > MAX_TREE_BONUS_DIVISOR
        || weights.max_tree_bonus > weights.max_score
    {
        fail(env, ReputationError::InvalidWeights);
    }
}

fn load_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| fail(env, ReputationError::NotInitialized))
}

fn load_weights(env: &Env) -> ScoreWeights {
    env.storage()
        .instance()
        .get(&DataKey::Weights)
        .unwrap_or_else(|| fail(env, ReputationError::NotInitialized))
}

fn load_verifiers(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::Verifiers)
        .unwrap_or_else(|| Vec::new(env))
}

fn is_registered_verifier(env: &Env, verifier: &Address) -> bool {
    load_verifiers(env).contains(verifier)
}

fn require_admin(env: &Env, admin: &Address) {
    if admin != &load_admin(env) {
        fail(env, ReputationError::Unauthorized);
    }
    admin.require_auth();
}

fn require_verifier(env: &Env, verifier: &Address) {
    if !is_registered_verifier(env, verifier) {
        fail(env, ReputationError::NotVerifier);
    }
    verifier.require_auth();
}

fn load_profile(env: &Env, steward: &Address) -> ReputationProfile {
    get_audit(env, &DataKey::Profile(steward.clone()))
        .unwrap_or_else(|| fail(env, ReputationError::StewardNotFound))
}

fn create_profile(env: &Env, steward: &Address, kind: StewardKind) -> ReputationProfile {
    if has_audit(env, &DataKey::Profile(steward.clone())) {
        fail(env, ReputationError::AlreadyRegistered);
    }
    let weights = load_weights(env);
    let profile = ReputationProfile {
        steward: steward.clone(),
        kind,
        score: weights.initial_score,
        tier: tier_for(weights.initial_score),
        successful_milestones: 0,
        failed_milestones: 0,
        penalty_points: 0,
        trees_verified: 0,
        active: true,
        registered_at: env.ledger().timestamp(),
        last_milestone_at: 0,
    };
    put_audit(env, &DataKey::Profile(steward.clone()), &profile);
    put_audit(
        env,
        &DataKey::StewardEntries(steward.clone()),
        &Vec::<u64>::new(env),
    );

    let count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::StewardCount)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::StewardCount, &(count + 1));

    StewardRegistered {
        steward: steward.clone(),
        kind,
        score: profile.score,
    }
    .publish(env);
    profile
}

fn tier_for(score: u32) -> Tier {
    if score >= TIER_PLATINUM_MIN {
        Tier::Platinum
    } else if score >= TIER_GOLD_MIN {
        Tier::Gold
    } else if score >= TIER_SILVER_MIN {
        Tier::Silver
    } else {
        Tier::Bronze
    }
}

fn score_delta(weights: &ScoreWeights, outcome: LedgerOutcome, trees: u32) -> i32 {
    match outcome {
        LedgerOutcome::Success => {
            let bonus = trees
                .checked_div(weights.tree_bonus_divisor)
                .unwrap_or(0)
                .min(weights.max_tree_bonus);
            i32::try_from(weights.success_points + bonus).unwrap_or(i32::MAX)
        }
        LedgerOutcome::Failed => -i32::try_from(weights.failure_penalty).unwrap_or(i32::MAX),
        LedgerOutcome::Penalty => 0,
    }
}

fn apply_delta(current: u32, delta: i32, max_score: u32) -> u32 {
    if delta >= 0 {
        current.saturating_add(delta.unsigned_abs()).min(max_score)
    } else {
        current.saturating_sub(delta.unsigned_abs())
    }
}

fn next_entry_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextEntryId)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::NextEntryId, &(id + 1));
    id
}

fn append_entry(env: &Env, entry: &MilestoneRecord) {
    put_audit(env, &DataKey::Entry(entry.id), entry);

    let key = DataKey::StewardEntries(entry.steward.clone());
    let mut ids = get_audit::<_, Vec<u64>>(env, &key).unwrap_or_else(|| Vec::new(env));
    ids.push_back(entry.id);
    put_audit(env, &key, &ids);
}

#[cfg(test)]
mod test;
