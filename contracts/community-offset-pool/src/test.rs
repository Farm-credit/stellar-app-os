use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

const BASE: u64 = 1_700_000_000;
const TARGET: i128 = 100;
const DEADLINE: u64 = BASE + 1_000;

struct Ctx {
    env: Env,
    client: CommunityOffsetPoolClient<'static>,
    contract: Address,
    payment: Address,
    credit: Address,
    creator: Address,
}

fn setup_with(target: i128) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = BASE);

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let payment = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let credit = env.register_stellar_asset_contract_v2(admin).address();

    let contract = env.register(CommunityOffsetPool, ());
    let client = CommunityOffsetPoolClient::new(&env, &contract);
    client.initialize(&creator, &payment, &credit, &target, &DEADLINE);

    Ctx {
        env,
        client,
        contract,
        payment,
        credit,
        creator,
    }
}

fn setup() -> Ctx {
    setup_with(TARGET)
}

fn mint(token: &Address, env: &Env, who: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(who, &amount);
}

fn balance(token: &Address, env: &Env, who: &Address) -> i128 {
    TokenClient::new(env, token).balance(who)
}

fn advance(env: &Env, seconds: u64) {
    env.ledger().with_mut(|l| l.timestamp += seconds);
}

/// Contributes `amount` on behalf of a freshly created member.
fn contribute_new(ctx: &Ctx, amount: i128) -> Address {
    let member = Address::generate(&ctx.env);
    mint(&ctx.payment, &ctx.env, &member, amount);
    ctx.client.contribute(&member, &amount);
    member
}

#[test]
fn initialize_opens_the_pool() {
    let ctx = setup();
    let pool = ctx.client.get_pool();

    assert_eq!(pool.creator, ctx.creator);
    assert_eq!(pool.payment_token, ctx.payment);
    assert_eq!(pool.credit_token, ctx.credit);
    assert_eq!(pool.target_amount, TARGET);
    assert_eq!(pool.deadline, DEADLINE);
    assert_eq!(pool.status, PoolStatus::Open);
    assert_eq!(pool.total_contributed, 0);
    assert_eq!(pool.member_count, 0);
    assert!(ctx.client.get_members().is_empty());
}

#[test]
fn rejects_invalid_initialization() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = BASE);
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let payment = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let credit = env.register_stellar_asset_contract_v2(admin).address();
    let contract = env.register(CommunityOffsetPool, ());
    let client = CommunityOffsetPoolClient::new(&env, &contract);

    assert_eq!(
        client.try_initialize(&creator, &payment, &credit, &0, &DEADLINE),
        Err(Ok(PoolError::InvalidAmount.into()))
    );
    assert_eq!(
        client.try_initialize(&creator, &payment, &credit, &TARGET, &BASE),
        Err(Ok(PoolError::InvalidDeadline.into()))
    );

    client.initialize(&creator, &payment, &credit, &TARGET, &DEADLINE);
    assert_eq!(
        client.try_initialize(&creator, &payment, &credit, &TARGET, &DEADLINE),
        Err(Ok(PoolError::AlreadyInitialized.into()))
    );
}

#[test]
fn contribute_escrows_funds_and_accumulates_per_member() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    mint(&ctx.payment, &ctx.env, &alice, 100);

    ctx.client.contribute(&alice, &60);

    assert_eq!(balance(&ctx.payment, &ctx.env, &ctx.contract), 60);
    assert_eq!(balance(&ctx.payment, &ctx.env, &alice), 40);

    // A second contribution from the same wallet merges onto the same member.
    ctx.client.contribute(&alice, &40);
    let member = ctx.client.get_member(&alice).unwrap();
    assert_eq!(member.contributed, 100);
    assert_eq!(ctx.client.get_members().len(), 1);
    assert_eq!(ctx.client.get_pool().member_count, 1);
}

#[test]
fn reaching_the_target_flips_the_pool_to_funded() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 60);
    assert_eq!(ctx.client.get_pool().status, PoolStatus::Open);

    let bob = contribute_new(&ctx, 40);
    let pool = ctx.client.get_pool();

    assert_eq!(pool.status, PoolStatus::Funded);
    assert_eq!(pool.total_contributed, TARGET);
    assert_eq!(pool.member_count, 2);
    assert_eq!(ctx.client.get_members(), soroban_sdk::vec![&ctx.env, alice, bob]);
}

#[test]
fn contribute_rejects_bad_amounts_deadline_and_closed_pools() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    mint(&ctx.payment, &ctx.env, &alice, 200);

    assert_eq!(
        ctx.client.try_contribute(&alice, &0),
        Err(Ok(PoolError::InvalidAmount.into()))
    );

    // After the deadline contributions close.
    advance(&ctx.env, 1_000);
    assert_eq!(
        ctx.client.try_contribute(&alice, &10),
        Err(Ok(PoolError::DeadlinePassed.into()))
    );

    // A pool that already hit its target no longer accepts contributions.
    let fresh = setup();
    let bob = contribute_new(&fresh, 100);
    assert_eq!(
        fresh.client.try_contribute(&bob, &5),
        Err(Ok(PoolError::PoolNotOpen.into()))
    );
}

#[test]
fn finalize_escrows_credits_and_marks_the_pool_purchased() {
    let ctx = setup();
    contribute_new(&ctx, 100);
    mint(&ctx.credit, &ctx.env, &ctx.creator, 12);

    ctx.client.finalize(&ctx.creator, &12);

    let pool = ctx.client.get_pool();
    assert_eq!(pool.status, PoolStatus::Purchased);
    assert_eq!(pool.total_credits, 12);
    assert_eq!(balance(&ctx.credit, &ctx.env, &ctx.contract), 12);
    assert_eq!(balance(&ctx.credit, &ctx.env, &ctx.creator), 0);
}

#[test]
fn finalize_requires_funding_creator_and_happens_once() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    mint(&ctx.payment, &ctx.env, &alice, 100);
    ctx.client.contribute(&alice, &40);
    mint(&ctx.credit, &ctx.env, &ctx.creator, 12);

    // Not funded yet.
    assert_eq!(
        ctx.client.try_finalize(&ctx.creator, &12),
        Err(Ok(PoolError::NotFunded.into()))
    );

    // Only the creator may finalize.
    let stranger = Address::generate(&ctx.env);
    ctx.client.contribute(&alice, &60);
    assert_eq!(
        ctx.client.try_finalize(&stranger, &12),
        Err(Ok(PoolError::Unauthorized.into()))
    );

    ctx.client.finalize(&ctx.creator, &12);
    assert_eq!(
        ctx.client.try_finalize(&ctx.creator, &12),
        Err(Ok(PoolError::AlreadyPurchased.into()))
    );
    assert_eq!(
        ctx.client.try_finalize(&ctx.creator, &0),
        Err(Ok(PoolError::InvalidAmount.into()))
    );
}

#[test]
fn claim_pays_proportional_shares_and_gives_the_remainder_to_the_last_member() {
    let ctx = setup_with(30);
    let alice = contribute_new(&ctx, 10);
    let bob = contribute_new(&ctx, 10);
    let carol = contribute_new(&ctx, 10);
    mint(&ctx.credit, &ctx.env, &ctx.creator, 10);
    ctx.client.finalize(&ctx.creator, &10);

    // 10 credits over 30 of contributions floors to 3 each; the last claimant
    // receives the remaining 1 rather than stranding it in the contract.
    assert_eq!(ctx.client.preview_claim(&alice), 3);
    assert_eq!(ctx.client.claim(&alice), 3);
    assert_eq!(ctx.client.claim(&bob), 3);
    assert_eq!(ctx.client.claim(&carol), 4);

    assert_eq!(balance(&ctx.credit, &ctx.env, &alice), 3);
    assert_eq!(balance(&ctx.credit, &ctx.env, &bob), 3);
    assert_eq!(balance(&ctx.credit, &ctx.env, &carol), 4);
    assert_eq!(balance(&ctx.credit, &ctx.env, &ctx.contract), 0);

    let pool = ctx.client.get_pool();
    assert_eq!(pool.members_claimed, 3);
    assert_eq!(pool.credits_claimed, 10);
}

#[test]
fn claim_rejects_premature_double_and_non_member_claims() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 40);
    let stranger = Address::generate(&ctx.env);

    assert_eq!(
        ctx.client.try_claim(&alice),
        Err(Ok(PoolError::NotFunded.into()))
    );

    let bob = contribute_new(&ctx, 60);
    mint(&ctx.credit, &ctx.env, &ctx.creator, 5);
    ctx.client.finalize(&ctx.creator, &5);

    assert_eq!(
        ctx.client.try_claim(&stranger),
        Err(Ok(PoolError::NotAMember.into()))
    );

    ctx.client.claim(&alice);
    assert_eq!(
        ctx.client.try_claim(&alice),
        Err(Ok(PoolError::AlreadyClaimed.into()))
    );
    assert_eq!(ctx.client.preview_claim(&alice), 0);
    // bob is the last (and only outstanding) claimant.
    assert_eq!(ctx.client.claim(&bob), 3);
}

#[test]
fn refund_returns_contributions_when_the_deadline_passes_unfunded() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 40);

    // Too early while the pool is still open.
    assert_eq!(
        ctx.client.try_refund(&alice),
        Err(Ok(PoolError::RefundNotAvailable.into()))
    );

    advance(&ctx.env, 1_000);
    assert_eq!(ctx.client.refund(&alice), 40);
    assert_eq!(balance(&ctx.payment, &ctx.env, &alice), 40);
    assert_eq!(balance(&ctx.payment, &ctx.env, &ctx.contract), 0);
    assert_eq!(ctx.client.get_pool().total_contributed, 0);
    assert_eq!(
        ctx.client.try_refund(&alice),
        Err(Ok(PoolError::AlreadyRefunded.into()))
    );
}

#[test]
fn refund_is_available_immediately_after_cancellation() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 40);

    ctx.client.cancel();
    assert_eq!(ctx.client.get_pool().status, PoolStatus::Cancelled);
    assert_eq!(ctx.client.refund(&alice), 40);
}

#[test]
fn cancel_is_rejected_once_the_pool_is_funded_or_cancelled() {
    let ctx = setup();
    contribute_new(&ctx, 100);
    assert_eq!(
        ctx.client.try_cancel(),
        Err(Ok(PoolError::PoolNotOpen.into()))
    );

    let fresh = setup();
    fresh.client.cancel();
    assert_eq!(
        fresh.client.try_cancel(),
        Err(Ok(PoolError::PoolNotOpen.into()))
    );
}

#[test]
fn funded_pool_refunds_only_after_the_grace_period() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 100);
    assert_eq!(ctx.client.get_pool().status, PoolStatus::Funded);

    advance(&ctx.env, 1_000); // past the deadline, inside the grace window
    assert_eq!(
        ctx.client.try_refund(&alice),
        Err(Ok(PoolError::RefundNotAvailable.into()))
    );

    advance(&ctx.env, REFUND_GRACE_SECONDS);
    assert_eq!(ctx.client.refund(&alice), 100);
    // Refunding drops the pool back below target, so it no longer reads as funded.
    assert_eq!(ctx.client.get_pool().status, PoolStatus::Open);
}

#[test]
fn purchased_pool_is_never_refundable() {
    let ctx = setup();
    let alice = contribute_new(&ctx, 100);
    mint(&ctx.credit, &ctx.env, &ctx.creator, 5);
    ctx.client.finalize(&ctx.creator, &5);

    advance(&ctx.env, 10 * REFUND_GRACE_SECONDS);
    assert_eq!(
        ctx.client.try_refund(&alice),
        Err(Ok(PoolError::RefundNotAvailable.into()))
    );
}

#[test]
fn views_report_unknown_members_consistently() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    assert!(ctx.client.get_member(&stranger).is_none());
    assert_eq!(ctx.client.preview_claim(&stranger), 0);
}
