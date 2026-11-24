use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};

const NOW: u64 = 1_700_000_000;

struct Ctx {
    env: Env,
    client: PlanterReputationClient<'static>,
    admin: Address,
    verifier: Address,
    farmer: Address,
    steward: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);

    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let farmer = Address::generate(&env);
    let steward = Address::generate(&env);

    let contract = env.register(PlanterReputation, ());
    let client = PlanterReputationClient::new(&env, &contract);
    client.initialize(&admin);
    client.add_verifier(&admin, &verifier);
    client.register_steward(&farmer, &StewardKind::Farmer);
    client.register_steward(&steward, &StewardKind::CommunitySteward);

    Ctx {
        env,
        client,
        admin,
        verifier,
        farmer,
        steward,
    }
}

fn reference(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

#[test]
fn initialize_sets_defaults() {
    let ctx = setup();
    assert_eq!(ctx.client.get_admin(), ctx.admin);
    let weights = ctx.client.get_weights();
    assert_eq!(weights.initial_score, INITIAL_SCORE);
    assert_eq!(weights.max_score, MAX_SCORE);
    assert_eq!(weights.success_points, SUCCESS_POINTS);
    assert_eq!(weights.failure_penalty, FAILURE_PENALTY);
    assert_eq!(weights.tree_bonus_divisor, TREE_BONUS_DIVISOR);
    assert_eq!(weights.max_tree_bonus, MAX_TREE_BONUS);
    assert!(ctx.client.is_verifier(&ctx.verifier));
    assert_eq!(ctx.client.get_verifiers().len(), 1);
    assert_eq!(ctx.client.get_steward_count(), 2);
}

#[test]
fn double_initialize_is_rejected() {
    let ctx = setup();
    assert_eq!(
        ctx.client.try_initialize(&ctx.admin),
        Err(Ok(ReputationError::AlreadyInitialized.into()))
    );
}

#[test]
fn verifier_lifecycle() {
    let ctx = setup();
    let verifier = Address::generate(&ctx.env);

    ctx.client.add_verifier(&ctx.admin, &verifier);
    assert!(ctx.client.is_verifier(&verifier));
    assert_eq!(ctx.client.get_verifiers().len(), 2);
    assert_eq!(
        ctx.client.try_add_verifier(&ctx.admin, &verifier),
        Err(Ok(ReputationError::VerifierAlreadyExists.into()))
    );

    ctx.client.remove_verifier(&ctx.admin, &verifier);
    assert!(!ctx.client.is_verifier(&verifier));
    assert_eq!(ctx.client.get_verifiers().len(), 1);
    assert_eq!(
        ctx.client.try_remove_verifier(&ctx.admin, &verifier),
        Err(Ok(ReputationError::VerifierNotFound.into()))
    );
}

#[test]
fn non_admin_cannot_manage_verifiers_or_weights() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_add_verifier(&outsider, &outsider),
        Err(Ok(ReputationError::Unauthorized.into()))
    );
    assert_eq!(
        ctx.client
            .try_set_weights(&ctx.verifier, &ctx.client.get_weights()),
        Err(Ok(ReputationError::Unauthorized.into()))
    );
}

#[test]
fn both_farmer_and_community_steward_are_registered() {
    let ctx = setup();
    let farmer = ctx.client.get_profile(&ctx.farmer).unwrap();
    let community = ctx.client.get_profile(&ctx.steward).unwrap();

    assert_eq!(farmer.kind, StewardKind::Farmer);
    assert_eq!(community.kind, StewardKind::CommunitySteward);
    assert_eq!(farmer.score, INITIAL_SCORE);
    assert_eq!(farmer.tier, Tier::Bronze);
    assert!(farmer.active);
    assert_eq!(farmer.successful_milestones, 0);
    assert_eq!(farmer.trees_verified, 0);
    assert_eq!(farmer.registered_at, NOW);
    assert_eq!(farmer.last_milestone_at, 0);
    assert_eq!(community.steward, ctx.steward);
}

#[test]
fn duplicate_registration_is_rejected() {
    let ctx = setup();
    assert_eq!(
        ctx.client
            .try_register_steward(&ctx.farmer, &StewardKind::Farmer),
        Err(Ok(ReputationError::AlreadyRegistered.into()))
    );
    assert_eq!(
        ctx.client.try_register_steward_for(
            &ctx.admin,
            &ctx.steward,
            &StewardKind::CommunitySteward,
        ),
        Err(Ok(ReputationError::AlreadyRegistered.into()))
    );
    assert_eq!(ctx.client.get_steward_count(), 2);
}

#[test]
fn admin_can_register_a_steward_from_kyc() {
    let ctx = setup();
    let address = Address::generate(&ctx.env);
    let profile = ctx
        .client
        .register_steward_for(&ctx.admin, &address, &StewardKind::Farmer);

    assert_eq!(profile.steward, address);
    assert_eq!(profile.kind, StewardKind::Farmer);
    assert_eq!(ctx.client.get_steward_count(), 3);
    assert_eq!(
        ctx.client
            .try_register_steward_for(&ctx.admin, &address, &StewardKind::Farmer,),
        Err(Ok(ReputationError::AlreadyRegistered.into()))
    );
}

#[test]
fn successful_milestones_accrue_score_bonus_and_ledger_entries() {
    let ctx = setup();
    for seed in 1..=3 {
        ctx.client.record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, seed),
            &LedgerOutcome::Success,
            &100,
        );
    }

    let profile = ctx.client.get_profile(&ctx.farmer).unwrap();
    assert_eq!(profile.successful_milestones, 3);
    assert_eq!(profile.failed_milestones, 0);
    assert_eq!(profile.trees_verified, 300);
    assert_eq!(
        profile.score,
        INITIAL_SCORE + 3 * (SUCCESS_POINTS + MAX_TREE_BONUS)
    );
    assert_eq!(profile.last_milestone_at, NOW);

    let entries = ctx.client.get_entries(&ctx.farmer);
    assert_eq!(entries.len(), 3);
    assert_eq!(entries.get(0).unwrap().id, 0);
    assert_eq!(entries.get(0).unwrap().delta, 15);
    assert_eq!(entries.get(0).unwrap().verifier, ctx.verifier);
    assert_eq!(entries.get(0).unwrap().reference, reference(&ctx.env, 1));
    assert_eq!(entries.get(2).unwrap().score_after, profile.score);
    assert_eq!(ctx.client.get_entry_count(&ctx.farmer), 3);
    assert_eq!(
        ctx.client.get_entry(&0).unwrap().outcome,
        LedgerOutcome::Success
    );
    assert!(ctx.client.get_entry(&99).is_none());
}

#[test]
fn failed_milestone_reduces_score() {
    let ctx = setup();
    ctx.client.record_milestone(
        &ctx.verifier,
        &ctx.steward,
        &reference(&ctx.env, 1),
        &LedgerOutcome::Failed,
        &0,
    );

    let profile = ctx.client.get_profile(&ctx.steward).unwrap();
    assert_eq!(profile.score, INITIAL_SCORE - FAILURE_PENALTY);
    assert_eq!(profile.failed_milestones, 1);
    assert_eq!(profile.trees_verified, 0);
    let entry = ctx.client.get_entry(&0).unwrap();
    assert_eq!(entry.delta, -(FAILURE_PENALTY as i32));
    assert_eq!(entry.outcome, LedgerOutcome::Failed);
}

#[test]
fn score_is_clamped_to_the_configured_range() {
    let ctx = setup();
    for seed in 0..100 {
        ctx.client.record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, seed),
            &LedgerOutcome::Success,
            &0,
        );
    }
    assert_eq!(ctx.client.get_score(&ctx.farmer), Some(MAX_SCORE));
    assert_eq!(ctx.client.get_tier(&ctx.farmer), Some(Tier::Platinum));

    for seed in 100..250 {
        ctx.client.record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, seed),
            &LedgerOutcome::Failed,
            &0,
        );
    }
    assert_eq!(ctx.client.get_score(&ctx.farmer), Some(0));
    assert_eq!(ctx.client.get_tier(&ctx.farmer), Some(Tier::Bronze));
}

#[test]
fn milestone_reference_cannot_be_replayed() {
    let ctx = setup();
    ctx.client.record_milestone(
        &ctx.verifier,
        &ctx.farmer,
        &reference(&ctx.env, 7),
        &LedgerOutcome::Success,
        &20,
    );
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.verifier,
            &ctx.steward,
            &reference(&ctx.env, 7),
            &LedgerOutcome::Success,
            &20,
        ),
        Err(Ok(ReputationError::DuplicateReference.into()))
    );
    assert_eq!(ctx.client.get_score(&ctx.steward), Some(INITIAL_SCORE));
    assert_eq!(ctx.client.get_entry_count(&ctx.steward), 0);
}

#[test]
fn unregistered_verifier_cannot_record_a_milestone() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.farmer,
            &ctx.farmer,
            &reference(&ctx.env, 1),
            &LedgerOutcome::Success,
            &0,
        ),
        Err(Ok(ReputationError::NotVerifier.into()))
    );
    assert_eq!(
        ctx.client.try_record_milestone(
            &outsider,
            &ctx.farmer,
            &reference(&ctx.env, 1),
            &LedgerOutcome::Success,
            &0,
        ),
        Err(Ok(ReputationError::NotVerifier.into()))
    );
}

#[test]
fn unregistered_steward_and_invalid_inputs_are_rejected() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.verifier,
            &outsider,
            &reference(&ctx.env, 1),
            &LedgerOutcome::Success,
            &0,
        ),
        Err(Ok(ReputationError::StewardNotFound.into()))
    );
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, 2),
            &LedgerOutcome::Penalty,
            &0,
        ),
        Err(Ok(ReputationError::InvalidOutcome.into()))
    );
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, 3),
            &LedgerOutcome::Success,
            &(MAX_TREES_PER_MILESTONE + 1),
        ),
        Err(Ok(ReputationError::InvalidTreeCount.into()))
    );
}

#[test]
fn inactive_steward_is_ineligible_and_cannot_earn_points() {
    let ctx = setup();
    ctx.client.set_active(&ctx.admin, &ctx.farmer, &false);
    assert!(!ctx.client.get_profile(&ctx.farmer).unwrap().active);
    assert!(!ctx.client.is_eligible(&ctx.farmer, &INITIAL_SCORE));
    assert_eq!(
        ctx.client.try_record_milestone(
            &ctx.verifier,
            &ctx.farmer,
            &reference(&ctx.env, 1),
            &LedgerOutcome::Success,
            &0,
        ),
        Err(Ok(ReputationError::StewardInactive.into()))
    );

    ctx.client.set_active(&ctx.admin, &ctx.farmer, &true);
    assert!(ctx.client.is_eligible(&ctx.farmer, &INITIAL_SCORE));
}

#[test]
fn eligibility_uses_score_and_registration_state() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    assert!(ctx.client.is_eligible(&ctx.farmer, &INITIAL_SCORE));
    assert!(!ctx.client.is_eligible(&ctx.farmer, &(INITIAL_SCORE + 1)));
    assert!(!ctx.client.is_eligible(&stranger, &0));
    assert_eq!(ctx.client.get_score(&stranger), None);
    assert_eq!(ctx.client.get_tier(&stranger), None);
    assert_eq!(ctx.client.get_profile(&stranger), None);
}

#[test]
fn admin_penalty_is_bounded_authored_and_replay_protected() {
    let ctx = setup();
    assert_eq!(
        ctx.client
            .try_apply_penalty(&ctx.verifier, &ctx.farmer, &50, &reference(&ctx.env, 1),),
        Err(Ok(ReputationError::Unauthorized.into()))
    );
    assert_eq!(
        ctx.client
            .try_apply_penalty(&ctx.admin, &ctx.farmer, &0, &reference(&ctx.env, 1),),
        Err(Ok(ReputationError::InvalidPenalty.into()))
    );
    assert_eq!(
        ctx.client.try_apply_penalty(
            &ctx.admin,
            &ctx.farmer,
            &(MAX_PENALTY_POINTS + 1),
            &reference(&ctx.env, 1),
        ),
        Err(Ok(ReputationError::InvalidPenalty.into()))
    );

    let id = ctx
        .client
        .apply_penalty(&ctx.admin, &ctx.farmer, &50, &reference(&ctx.env, 1));
    assert_eq!(ctx.client.get_score(&ctx.farmer), Some(INITIAL_SCORE - 50));
    let profile = ctx.client.get_profile(&ctx.farmer).unwrap();
    assert_eq!(profile.penalty_points, 50);
    assert_eq!(profile.failed_milestones, 0);

    let entry = ctx.client.get_entry(&id).unwrap();
    assert_eq!(entry.outcome, LedgerOutcome::Penalty);
    assert_eq!(entry.delta, -50);
    assert_eq!(entry.trees, 0);
    assert_eq!(entry.verifier, ctx.admin);

    assert_eq!(
        ctx.client
            .try_apply_penalty(&ctx.admin, &ctx.farmer, &50, &reference(&ctx.env, 1),),
        Err(Ok(ReputationError::DuplicateReference.into()))
    );
    assert_eq!(ctx.client.get_score(&ctx.farmer), Some(INITIAL_SCORE - 50));
}

#[test]
fn penalty_and_milestone_share_one_reference_namespace() {
    let ctx = setup();
    ctx.client.record_milestone(
        &ctx.verifier,
        &ctx.farmer,
        &reference(&ctx.env, 9),
        &LedgerOutcome::Success,
        &0,
    );
    assert_eq!(
        ctx.client
            .try_apply_penalty(&ctx.admin, &ctx.steward, &20, &reference(&ctx.env, 9),),
        Err(Ok(ReputationError::DuplicateReference.into()))
    );
    assert_eq!(ctx.client.get_score(&ctx.steward), Some(INITIAL_SCORE));
}

#[test]
fn weights_are_validated_and_change_future_scoring() {
    let ctx = setup();
    let weights = ScoreWeights {
        initial_score: INITIAL_SCORE,
        max_score: 500,
        success_points: 50,
        failure_penalty: 10,
        tree_bonus_divisor: 0,
        max_tree_bonus: 0,
    };
    ctx.client.set_weights(&ctx.admin, &weights);
    assert_eq!(ctx.client.get_weights(), weights);

    ctx.client.record_milestone(
        &ctx.verifier,
        &ctx.farmer,
        &reference(&ctx.env, 1),
        &LedgerOutcome::Success,
        &1_000,
    );
    assert_eq!(ctx.client.get_score(&ctx.farmer), Some(150));
    assert_eq!(ctx.client.get_entry(&0).unwrap().delta, 50);

    let mut invalid = weights.clone();
    invalid.success_points = 0;
    assert_eq!(
        ctx.client.try_set_weights(&ctx.admin, &invalid),
        Err(Ok(ReputationError::InvalidWeights.into()))
    );

    invalid = weights.clone();
    invalid.initial_score = invalid.max_score + 1;
    assert_eq!(
        ctx.client.try_set_weights(&ctx.admin, &invalid),
        Err(Ok(ReputationError::InvalidWeights.into()))
    );

    invalid = weights.clone();
    invalid.max_score = 0;
    assert_eq!(
        ctx.client.try_set_weights(&ctx.admin, &invalid),
        Err(Ok(ReputationError::InvalidWeights.into()))
    );
}

#[test]
fn tier_thresholds_match_the_planter_registry_ladder() {
    let ctx = setup();
    let mut weights = ctx.client.get_weights();
    weights.initial_score = 0;
    weights.success_points = 100;
    weights.max_tree_bonus = 0;
    ctx.client.set_weights(&ctx.admin, &weights);

    let steward = Address::generate(&ctx.env);
    ctx.client
        .register_steward_for(&ctx.admin, &steward, &StewardKind::CommunitySteward);
    assert_eq!(ctx.client.get_tier(&steward), Some(Tier::Bronze));

    for seed in 1..=9u8 {
        ctx.client.record_milestone(
            &ctx.verifier,
            &steward,
            &reference(&ctx.env, seed),
            &LedgerOutcome::Success,
            &0,
        );
        let expected = if seed >= 9 {
            Tier::Platinum
        } else if seed >= 6 {
            Tier::Gold
        } else if seed >= 3 {
            Tier::Silver
        } else {
            Tier::Bronze
        };
        assert_eq!(
            ctx.client.get_tier(&steward),
            Some(expected),
            "score {}",
            ctx.client.get_score(&steward).unwrap()
        );
    }
}
