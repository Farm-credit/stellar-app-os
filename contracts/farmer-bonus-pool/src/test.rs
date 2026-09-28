use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal,
};

struct Ctx {
    env: Env,
    client: FarmerBonusPoolClient<'static>,
    contract: Address,
    token: Address,
    payer: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let marketplace = Address::generate(&env);
    let payer = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    StellarAssetClient::new(&env, &token).mint(&payer, &1_000_000_000);

    let contract = env.register(FarmerBonusPool, ());
    let client = FarmerBonusPoolClient::new(&env, &contract);
    client.initialize(&admin, &token, &marketplace);
    Ctx {
        env,
        client,
        contract,
        token,
        payer,
    }
}

fn advance_quarters(env: &Env, quarters: u64) {
    env.ledger()
        .with_mut(|l| l.timestamp += quarters * QUARTER_SECONDS);
}

fn balance(ctx: &Ctx, who: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.token).balance(who)
}

#[test]
fn bonus_contribution_is_one_percent_rounded_down() {
    assert_eq!(bonus_contribution(10_000), 100);
    assert_eq!(bonus_contribution(12_345), 123);
    assert_eq!(bonus_contribution(99), 0);
}

#[test]
fn record_sale_moves_one_percent_into_current_quarter_pool() {
    let ctx = setup();
    let contribution = ctx.client.record_sale(&ctx.payer, &50_000);

    assert_eq!(contribution, 500);
    assert_eq!(ctx.client.quarter_pool(&0), 500);
    assert_eq!(balance(&ctx, &ctx.contract), 500);
    assert_eq!(balance(&ctx, &ctx.payer), 1_000_000_000 - 500);
}

#[test]
fn tiny_sale_contributes_nothing_and_moves_no_funds() {
    let ctx = setup();
    assert_eq!(ctx.client.record_sale(&ctx.payer, &50), 0);
    assert_eq!(ctx.client.quarter_pool(&0), 0);
    assert_eq!(balance(&ctx, &ctx.contract), 0);
}

#[test]
fn sales_accrue_to_the_quarter_they_happen_in() {
    let ctx = setup();
    ctx.client.record_sale(&ctx.payer, &10_000);
    advance_quarters(&ctx.env, 1);
    ctx.client.record_sale(&ctx.payer, &30_000);

    assert_eq!(ctx.client.current_quarter(), 1);
    assert_eq!(ctx.client.quarter_pool(&0), 100);
    assert_eq!(ctx.client.quarter_pool(&1), 300);
}

#[test]
fn distribute_pays_only_farmers_above_target_pro_rata_to_excess() {
    let ctx = setup();
    let star = Address::generate(&ctx.env);
    let solid = Address::generate(&ctx.env);
    let missed = Address::generate(&ctx.env);
    for farmer in [&star, &solid, &missed] {
        ctx.client.set_target(farmer, &100);
    }

    ctx.client.record_sale(&ctx.payer, &1_200_000); // pool = 12_000
    ctx.client.record_performance(&star, &0, &400); // +300 excess
    ctx.client.record_performance(&solid, &0, &200); // +100 excess
    ctx.client.record_performance(&missed, &0, &80); // below target

    advance_quarters(&ctx.env, 1);
    let summary = ctx.client.distribute(&0);

    assert_eq!(summary.pool, 12_000);
    assert_eq!(summary.distributed, 12_000);
    assert_eq!(summary.rolled_over, 0);
    assert_eq!(summary.recipients, 2);
    assert_eq!(balance(&ctx, &star), 9_000);
    assert_eq!(balance(&ctx, &solid), 3_000);
    assert_eq!(balance(&ctx, &missed), 0);
    assert_eq!(ctx.client.payout(&0, &star), 9_000);
    assert!(ctx.client.is_distributed(&0));
    assert_eq!(ctx.client.quarter_pool(&0), 0);
}

#[test]
fn rounding_dust_rolls_into_the_open_quarter() {
    let ctx = setup();
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    let c = Address::generate(&ctx.env);
    for farmer in [&a, &b, &c] {
        ctx.client.set_target(farmer, &10);
        ctx.client.record_performance(farmer, &0, &11);
    }
    ctx.client.record_sale(&ctx.payer, &10_000); // pool = 100, split 3 ways

    advance_quarters(&ctx.env, 1);
    let summary = ctx.client.distribute(&0);

    assert_eq!(summary.distributed, 99);
    assert_eq!(summary.rolled_over, 1);
    assert_eq!(ctx.client.quarter_pool(&1), 1);
}

#[test]
fn pool_rolls_over_entirely_when_nobody_beats_target() {
    let ctx = setup();
    let farmer = Address::generate(&ctx.env);
    ctx.client.set_target(&farmer, &100);
    ctx.client.record_performance(&farmer, &0, &100); // meeting is not exceeding
    ctx.client.record_sale(&ctx.payer, &100_000);

    advance_quarters(&ctx.env, 2);
    let summary = ctx.client.distribute(&0);

    assert_eq!(summary.distributed, 0);
    assert_eq!(summary.rolled_over, 1_000);
    assert_eq!(ctx.client.quarter_pool(&2), 1_000);
    assert_eq!(balance(&ctx, &ctx.contract), 1_000);
}

#[test]
fn performance_snapshots_target_at_record_time() {
    let ctx = setup();
    let farmer = Address::generate(&ctx.env);
    ctx.client.set_target(&farmer, &100);
    ctx.client.record_performance(&farmer, &0, &150);
    ctx.client.set_target(&farmer, &500);

    let performance = ctx.client.performance(&0, &farmer).unwrap();
    assert_eq!(performance.target_tonnes, 100);
    assert_eq!(performance.achieved_tonnes, 150);
    assert_eq!(ctx.client.target(&farmer), Some(500));
}

#[test]
fn cannot_distribute_open_quarter() {
    let ctx = setup();
    let result = ctx.client.try_distribute(&0);
    assert_eq!(result, Err(Ok(BonusPoolError::QuarterNotEnded.into())));
}

#[test]
fn cannot_distribute_twice() {
    let ctx = setup();
    advance_quarters(&ctx.env, 1);
    ctx.client.distribute(&0);
    let result = ctx.client.try_distribute(&0);
    assert_eq!(result, Err(Ok(BonusPoolError::AlreadyDistributed.into())));
}

#[test]
fn cannot_record_performance_after_distribution_or_for_future_quarter() {
    let ctx = setup();
    let farmer = Address::generate(&ctx.env);
    ctx.client.set_target(&farmer, &10);

    let future = ctx.client.try_record_performance(&farmer, &1, &20);
    assert_eq!(future, Err(Ok(BonusPoolError::InvalidQuarter.into())));

    advance_quarters(&ctx.env, 1);
    ctx.client.distribute(&0);
    let late = ctx.client.try_record_performance(&farmer, &0, &20);
    assert_eq!(late, Err(Ok(BonusPoolError::AlreadyDistributed.into())));
}

#[test]
fn record_performance_requires_a_target() {
    let ctx = setup();
    let farmer = Address::generate(&ctx.env);
    let result = ctx.client.try_record_performance(&farmer, &0, &20);
    assert_eq!(result, Err(Ok(BonusPoolError::TargetNotSet.into())));
}

#[test]
fn rejects_invalid_amounts_and_double_initialize() {
    let ctx = setup();
    let farmer = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_record_sale(&ctx.payer, &0),
        Err(Ok(BonusPoolError::InvalidAmount.into()))
    );
    assert_eq!(
        ctx.client.try_set_target(&farmer, &0),
        Err(Ok(BonusPoolError::InvalidAmount.into()))
    );
    let config = ctx.client.config();
    assert_eq!(
        ctx.client
            .try_initialize(&config.admin, &config.token, &config.marketplace),
        Err(Ok(BonusPoolError::AlreadyInitialized.into()))
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn record_sale_requires_marketplace_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let marketplace = Address::generate(&env);
    let payer = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let contract = env.register(FarmerBonusPool, ());
    let client = FarmerBonusPoolClient::new(&env, &contract);

    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract,
            fn_name: "initialize",
            args: (&admin, &token, &marketplace).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin, &token, &marketplace);

    // No auth mocked for the marketplace: the sale report must be rejected.
    client.record_sale(&payer, &10_000);
}
