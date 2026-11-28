use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

const PRICE: i128 = 50_000_000; // 5 units of a 7-decimal token per share

struct Ctx {
    env: Env,
    client: ImpactPlotSharesClient<'static>,
    token: Address,
    admin: Address,
    steward: Address,
    verifier: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let steward = Address::generate(&env);
    let verifier = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let contract = env.register(ImpactPlotShares, ());
    let client = ImpactPlotSharesClient::new(&env, &contract);
    client.initialize(&admin, &token);
    client.set_verifier(&verifier, &true);
    Ctx {
        env,
        client,
        token,
        admin,
        steward,
        verifier,
    }
}

fn open_plot(ctx: &Ctx, shares: u32) -> u32 {
    let id = ctx.client.register_plot(
        &ctx.steward,
        &BytesN::from_array(&ctx.env, &[7u8; 32]),
        &shares,
        &PRICE,
    );
    ctx.client.verify_plot(&ctx.verifier, &id);
    id
}

fn funded(ctx: &Ctx, amount: i128) -> Address {
    let who = Address::generate(&ctx.env);
    StellarAssetClient::new(&ctx.env, &ctx.token).mint(&who, &amount);
    who
}

fn balance(ctx: &Ctx, who: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.token).balance(who)
}

fn err(code: PlotSharesError) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(code as u32)
}

#[test]
fn plot_must_be_verified_before_contributions() {
    let ctx = setup();
    let id = ctx.client.register_plot(
        &ctx.steward,
        &BytesN::from_array(&ctx.env, &[1u8; 32]),
        &100,
        &PRICE,
    );
    assert_eq!(ctx.client.get_plot(&id).status, PlotStatus::Pending);
    let buyer = funded(&ctx, PRICE);
    assert_eq!(
        ctx.client
            .try_contribute(&buyer, &id, &1)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::PlotNotOpen)
    );
}

#[test]
fn only_registered_verifiers_can_open_plots() {
    let ctx = setup();
    let id = ctx.client.register_plot(
        &ctx.steward,
        &BytesN::from_array(&ctx.env, &[1u8; 32]),
        &100,
        &PRICE,
    );
    let stranger = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client
            .try_verify_plot(&stranger, &id)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::NotVerifier)
    );
    ctx.client.verify_plot(&ctx.verifier, &id);
    let plot = ctx.client.get_plot(&id);
    assert_eq!(plot.status, PlotStatus::Open);
    assert_eq!(plot.verified_by, Some(ctx.verifier.clone()));
    // cannot verify twice
    assert_eq!(
        ctx.client
            .try_verify_plot(&ctx.verifier, &id)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidStatus)
    );
}

#[test]
fn invalid_plot_parameters_are_rejected() {
    let ctx = setup();
    let hash = BytesN::from_array(&ctx.env, &[1u8; 32]);
    assert_eq!(
        ctx.client
            .try_register_plot(&ctx.steward, &hash, &0, &PRICE)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidShareCount)
    );
    assert_eq!(
        ctx.client
            .try_register_plot(&ctx.steward, &hash, &(MAX_SHARES_PER_PLOT + 1), &PRICE)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidShareCount)
    );
    assert_eq!(
        ctx.client
            .try_register_plot(&ctx.steward, &hash, &10, &0)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidPrice)
    );
}

#[test]
fn micro_benefactors_pool_funds_for_single_shares() {
    let ctx = setup();
    let id = open_plot(&ctx, 10);
    let alice = funded(&ctx, PRICE * 3);
    let bob = funded(&ctx, PRICE);

    let alice_cert = ctx.client.contribute(&alice, &id, &1);
    ctx.client.contribute(&alice, &id, &2);
    let bob_cert = ctx.client.contribute(&bob, &id, &1);

    // one certificate per holder, topped up on later purchases
    assert_ne!(alice_cert, bob_cert);
    assert_eq!(
        ctx.client
            .get_certificate(&id, &alice)
            .unwrap()
            .certificate_id,
        alice_cert
    );
    assert_eq!(ctx.client.shares_of(&id, &alice), 3);
    assert_eq!(ctx.client.shares_of(&id, &bob), 1);
    assert_eq!(ctx.client.ownership_bps(&id, &alice), 3_000);
    assert_eq!(ctx.client.available(&id), 6);
    // funds are pooled in the contract, not paid to the steward yet
    assert_eq!(balance(&ctx, &ctx.client.address), PRICE * 4);
    assert_eq!(balance(&ctx, &ctx.steward), 0);
    assert_eq!(ctx.client.get_plot(&id).status, PlotStatus::Open);
}

#[test]
fn cannot_buy_more_than_available_or_zero() {
    let ctx = setup();
    let id = open_plot(&ctx, 5);
    let buyer = funded(&ctx, PRICE * 10);
    assert_eq!(
        ctx.client
            .try_contribute(&buyer, &id, &6)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::ExceedsAvailableShares)
    );
    assert_eq!(
        ctx.client
            .try_contribute(&buyer, &id, &0)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidShareCount)
    );
    assert_eq!(ctx.client.quote(&id, &4), PRICE * 4);
}

#[test]
fn selling_out_funds_the_plot_and_steward_can_release() {
    let ctx = setup();
    let id = open_plot(&ctx, 4);
    let a = funded(&ctx, PRICE * 2);
    let b = funded(&ctx, PRICE * 2);

    // not releasable before it is fully funded
    ctx.client.contribute(&a, &id, &2);
    assert_eq!(
        ctx.client.try_release_pool(&id).unwrap_err().unwrap(),
        err(PlotSharesError::PlotNotFunded)
    );

    ctx.client.contribute(&b, &id, &2);
    assert_eq!(ctx.client.get_plot(&id).status, PlotStatus::Funded);
    // a funded plot takes no more contributions
    let late = funded(&ctx, PRICE);
    assert_eq!(
        ctx.client
            .try_contribute(&late, &id, &1)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::PlotNotOpen)
    );

    assert_eq!(ctx.client.release_pool(&id), PRICE * 4);
    assert_eq!(balance(&ctx, &ctx.steward), PRICE * 4);
    assert_eq!(balance(&ctx, &ctx.client.address), 0);
    assert_eq!(ctx.client.get_plot(&id).status, PlotStatus::Released);
    assert_eq!(
        ctx.client.try_release_pool(&id).unwrap_err().unwrap(),
        err(PlotSharesError::PoolAlreadyReleased)
    );
}

#[test]
fn shares_transfer_between_holders() {
    let ctx = setup();
    let id = open_plot(&ctx, 10);
    let a = funded(&ctx, PRICE * 4);
    let b = Address::generate(&ctx.env);
    ctx.client.contribute(&a, &id, &4);

    ctx.client.transfer_shares(&a, &b, &id, &3);
    assert_eq!(ctx.client.shares_of(&id, &a), 1);
    assert_eq!(ctx.client.shares_of(&id, &b), 3);
    assert_ne!(
        ctx.client.get_certificate(&id, &a).unwrap().certificate_id,
        ctx.client.get_certificate(&id, &b).unwrap().certificate_id
    );

    assert_eq!(
        ctx.client
            .try_transfer_shares(&a, &b, &id, &2)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InsufficientShares)
    );
    assert_eq!(
        ctx.client
            .try_transfer_shares(&a, &b, &id, &0)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidShareCount)
    );
}

#[test]
fn cancelled_plot_refunds_current_holders_exactly() {
    let ctx = setup();
    let id = open_plot(&ctx, 10);
    let a = funded(&ctx, PRICE * 4);
    let b = Address::generate(&ctx.env);
    ctx.client.contribute(&a, &id, &4);
    ctx.client.transfer_shares(&a, &b, &id, &3);

    assert_eq!(
        ctx.client.try_claim_refund(&a, &id).unwrap_err().unwrap(),
        err(PlotSharesError::PlotNotCancelled)
    );
    ctx.client.cancel_plot(&id);

    assert_eq!(ctx.client.claim_refund(&a, &id), PRICE);
    assert_eq!(ctx.client.claim_refund(&b, &id), PRICE * 3);
    assert_eq!(balance(&ctx, &a), PRICE);
    assert_eq!(balance(&ctx, &b), PRICE * 3);
    assert_eq!(balance(&ctx, &ctx.client.address), 0);
    // refunds are one-shot and a cancelled plot no longer trades
    assert_eq!(
        ctx.client.try_claim_refund(&a, &id).unwrap_err().unwrap(),
        err(PlotSharesError::NothingToRefund)
    );
    assert_eq!(
        ctx.client
            .try_transfer_shares(&b, &a, &id, &1)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::InvalidStatus)
    );
}

#[test]
fn released_plot_cannot_be_cancelled() {
    let ctx = setup();
    let id = open_plot(&ctx, 1);
    let a = funded(&ctx, PRICE);
    ctx.client.contribute(&a, &id, &1);
    ctx.client.release_pool(&id);
    assert_eq!(
        ctx.client.try_cancel_plot(&id).unwrap_err().unwrap(),
        err(PlotSharesError::InvalidStatus)
    );
}

#[test]
fn double_initialize_and_missing_plot_fail() {
    let ctx = setup();
    assert_eq!(
        ctx.client
            .try_initialize(&ctx.admin, &ctx.token)
            .unwrap_err()
            .unwrap(),
        err(PlotSharesError::AlreadyInitialized)
    );
    assert_eq!(
        ctx.client.try_get_plot(&99).unwrap_err().unwrap(),
        err(PlotSharesError::PlotNotFound)
    );
}
