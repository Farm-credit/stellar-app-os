use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

const PRICE: i128 = 250_000_000; // 25 units of a 7-decimal token per tonne

struct Ctx {
    env: Env,
    client: CarbonFractionalizationClient<'static>,
    token: Address,
    admin: Address,
    owner: Address,
    project_id: u32,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let contract = env.register(CarbonFractionalization, ());
    let client = CarbonFractionalizationClient::new(&env, &contract);
    client.initialize(&admin, &token);
    let project_id = client.list_project(&owner, &500, &PRICE);
    Ctx {
        env,
        client,
        token,
        admin,
        owner,
        project_id,
    }
}

fn funded_buyer(ctx: &Ctx, amount: i128) -> Address {
    let buyer = Address::generate(&ctx.env);
    StellarAssetClient::new(&ctx.env, &ctx.token).mint(&buyer, &amount);
    buyer
}

fn balance(ctx: &Ctx, who: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.token).balance(who)
}

#[test]
fn retail_buyer_can_purchase_a_single_tonne_of_a_large_block() {
    let ctx = setup();
    let buyer = funded_buyer(&ctx, PRICE);

    let cost = ctx.client.buy(&buyer, &ctx.project_id, &1);

    assert_eq!(cost, PRICE);
    assert_eq!(ctx.client.holding(&ctx.project_id, &buyer), 1);
    assert_eq!(ctx.client.available(&ctx.project_id), 499);
    assert_eq!(balance(&ctx, &buyer), 0);
    assert_eq!(balance(&ctx, &ctx.owner), PRICE);
}

#[test]
fn many_retail_buyers_share_one_block() {
    let ctx = setup();
    let a = funded_buyer(&ctx, PRICE * 10);
    let b = funded_buyer(&ctx, PRICE * 10);
    ctx.client.buy(&a, &ctx.project_id, &3);
    ctx.client.buy(&b, &ctx.project_id, &7);
    ctx.client.buy(&a, &ctx.project_id, &2);

    assert_eq!(ctx.client.holding(&ctx.project_id, &a), 5);
    assert_eq!(ctx.client.holding(&ctx.project_id, &b), 7);
    assert_eq!(ctx.client.get_project(&ctx.project_id).sold_tonnes, 12);
    assert_eq!(balance(&ctx, &ctx.owner), PRICE * 12);
}

#[test]
fn quote_matches_purchase_cost() {
    let ctx = setup();
    assert_eq!(ctx.client.quote(&ctx.project_id, &4), PRICE * 4);
}

#[test]
fn zero_tonne_purchase_is_rejected() {
    let ctx = setup();
    let buyer = funded_buyer(&ctx, PRICE);
    assert_eq!(
        ctx.client.try_buy(&buyer, &ctx.project_id, &0),
        Err(Ok(FractionError::BelowMinimumPurchase.into()))
    );
}

#[test]
fn cannot_buy_more_than_remaining_supply() {
    let ctx = setup();
    let whale = funded_buyer(&ctx, PRICE * 600);
    ctx.client.buy(&whale, &ctx.project_id, &500);
    assert_eq!(ctx.client.available(&ctx.project_id), 0);
    assert_eq!(
        ctx.client.try_buy(&whale, &ctx.project_id, &1),
        Err(Ok(FractionError::InsufficientSupply.into()))
    );
}

#[test]
fn listing_requires_a_block_of_at_least_100_tonnes() {
    let ctx = setup();
    assert_eq!(
        ctx.client.try_list_project(&ctx.owner, &99, &PRICE),
        Err(Ok(FractionError::BlockTooSmall.into()))
    );
    assert_eq!(
        ctx.client.try_list_project(&ctx.owner, &100, &0),
        Err(Ok(FractionError::InvalidPrice.into()))
    );
    assert_eq!(
        ctx.client.list_project(&ctx.owner, &100, &PRICE),
        ctx.project_id + 1
    );
}

#[test]
fn holders_can_transfer_whole_tonnes() {
    let ctx = setup();
    let buyer = funded_buyer(&ctx, PRICE * 5);
    let friend = Address::generate(&ctx.env);
    ctx.client.buy(&buyer, &ctx.project_id, &5);

    ctx.client.transfer(&buyer, &friend, &ctx.project_id, &2);

    assert_eq!(ctx.client.holding(&ctx.project_id, &buyer), 3);
    assert_eq!(ctx.client.holding(&ctx.project_id, &friend), 2);
    assert_eq!(
        ctx.client
            .try_transfer(&friend, &buyer, &ctx.project_id, &3),
        Err(Ok(FractionError::InsufficientHolding.into()))
    );
}

#[test]
fn retiring_burns_the_holding_and_is_tracked() {
    let ctx = setup();
    let buyer = funded_buyer(&ctx, PRICE * 4);
    ctx.client.buy(&buyer, &ctx.project_id, &4);

    ctx.client.retire(&buyer, &ctx.project_id, &3);

    assert_eq!(ctx.client.holding(&ctx.project_id, &buyer), 1);
    assert_eq!(ctx.client.retired_by(&ctx.project_id, &buyer), 3);
    assert_eq!(ctx.client.get_project(&ctx.project_id).retired_tonnes, 3);
    assert_eq!(
        ctx.client.try_retire(&buyer, &ctx.project_id, &2),
        Err(Ok(FractionError::InsufficientHolding.into()))
    );
}

#[test]
fn paused_project_rejects_purchases_until_resumed() {
    let ctx = setup();
    let buyer = funded_buyer(&ctx, PRICE);
    ctx.client.set_active(&ctx.admin, &ctx.project_id, &false);
    assert_eq!(
        ctx.client.try_buy(&buyer, &ctx.project_id, &1),
        Err(Ok(FractionError::ProjectInactive.into()))
    );

    ctx.client.set_active(&ctx.owner, &ctx.project_id, &true);
    ctx.client.buy(&buyer, &ctx.project_id, &1);
    assert_eq!(ctx.client.holding(&ctx.project_id, &buyer), 1);
}

#[test]
fn only_owner_or_admin_can_pause() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client
            .try_set_active(&stranger, &ctx.project_id, &false),
        Err(Ok(FractionError::Unauthorized.into()))
    );
}

#[test]
fn unknown_project_and_double_initialize_are_rejected() {
    let ctx = setup();
    assert_eq!(
        ctx.client.try_available(&42),
        Err(Ok(FractionError::ProjectNotFound.into()))
    );
    assert_eq!(
        ctx.client.try_initialize(&ctx.admin, &ctx.token),
        Err(Ok(FractionError::AlreadyInitialized.into()))
    );
}
