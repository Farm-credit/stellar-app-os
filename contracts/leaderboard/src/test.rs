use crate::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (LeaderboardClient<'_>, Address, Month) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let month = Month { year: 2026, month: 8 };

    let contract_id = env.register(Leaderboard, ());
    let client = LeaderboardClient::new(env, &contract_id);
    client.initialize(&admin, &month);

    (client, admin, month)
}

#[test]
fn initialize_works() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let month = Month { year: 2026, month: 8 };

    let contract_id = env.register(Leaderboard, ());
    let client = LeaderboardClient::new(&env, &contract_id);
    client.initialize(&admin, &month);

    let retrieved_month = client.get_current_month();
    assert_eq!(retrieved_month, month);
}

#[test]
fn double_initialize_fails() {
    let env = Env::default();
    let (client, admin, month) = setup(&env);

    assert_eq!(
        client.try_initialize(&admin, &month),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn record_sponsor_works() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let sponsor = Address::generate(&env);
    client.record_sponsor(&sponsor, &1000i128);

    let score = client.get_sponsor_score(&sponsor);
    assert_eq!(score, 1000);
}

#[test]
fn record_sponsor_accumulates() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let sponsor = Address::generate(&env);
    client.record_sponsor(&sponsor, &500i128);
    client.record_sponsor(&sponsor, &300i128);

    let score = client.get_sponsor_score(&sponsor);
    assert_eq!(score, 800);
}

#[test]
fn record_planter_works() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let planter = Address::generate(&env);
    client.record_planter(&planter, &50i128);

    let score = client.get_planter_score(&planter);
    assert_eq!(score, 50);
}

#[test]
fn record_planter_accumulates() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let planter = Address::generate(&env);
    client.record_planter(&planter, &20i128);
    client.record_planter(&planter, &30i128);

    let score = client.get_planter_score(&planter);
    assert_eq!(score, 50);
}

#[test]
fn reset_month_works() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    let new_month = Month { year: 2026, month: 9 };
    client.reset_month(&admin, &new_month);

    let retrieved_month = client.get_current_month();
    assert_eq!(retrieved_month, new_month);
}

#[test]
fn reset_month_invalid_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    let invalid_month = Month { year: 2026, month: 8 };
    assert_eq!(
        client.try_reset_month(&admin, &invalid_month),
        Err(Ok(Error::InvalidMonth))
    );
}

#[test]
fn reset_month_backward_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    let invalid_month = Month { year: 2026, month: 7 };
    assert_eq!(
        client.try_reset_month(&admin, &invalid_month),
        Err(Ok(Error::InvalidMonth))
    );
}

#[test]
fn reset_month_unauthorized_fails() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let stranger = Address::generate(&env);
    let new_month = Month { year: 2026, month: 9 };
    assert_eq!(
        client.try_reset_month(&stranger, &new_month),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn add_bonus_pool_works() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &1000i128);

    let pool = client.get_bonus_pool();
    assert_eq!(pool, 1000);
}

#[test]
fn add_bonus_pool_accumulates() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &500i128);
    client.add_bonus_pool(&admin, &300i128);

    let pool = client.get_bonus_pool();
    assert_eq!(pool, 800);
}

#[test]
fn add_bonus_pool_unauthorized_fails() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_add_bonus_pool(&stranger, &1000i128),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn distribute_sponsor_bonus_works() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &1000i128);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    client.distribute_sponsor_bonus(&admin, &first, &second, &third);

    let pool = client.get_bonus_pool();
    assert_eq!(pool, 0);
}

#[test]
fn distribute_sponsor_bonus_insufficient_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &2i128);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    assert_eq!(
        client.try_distribute_sponsor_bonus(&admin, &first, &second, &third),
        Err(Ok(Error::NoBonusAvailable))
    );
}

#[test]
fn distribute_sponsor_bonus_unauthorized_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &1000i128);

    let stranger = Address::generate(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    assert_eq!(
        client.try_distribute_sponsor_bonus(&stranger, &first, &second, &third),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn distribute_planter_bonus_works() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &1000i128);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    client.distribute_planter_bonus(&admin, &first, &second, &third);

    let pool = client.get_bonus_pool();
    assert_eq!(pool, 0);
}

#[test]
fn distribute_planter_bonus_insufficient_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &2i128);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    assert_eq!(
        client.try_distribute_planter_bonus(&admin, &first, &second, &third),
        Err(Ok(Error::NoBonusAvailable))
    );
}

#[test]
fn distribute_planter_bonus_unauthorized_fails() {
    let env = Env::default();
    let (client, admin, _month) = setup(&env);

    client.add_bonus_pool(&admin, &1000i128);

    let stranger = Address::generate(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    assert_eq!(
        client.try_distribute_planter_bonus(&stranger, &first, &second, &third),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn get_top_sponsors_works() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let sponsors = client.get_top_sponsors();
    assert_eq!(sponsors.len(), 0);
}

#[test]
fn get_top_planters_works() {
    let env = Env::default();
    let (client, _admin, _month) = setup(&env);

    let planters = client.get_top_planters();
    assert_eq!(planters.len(), 0);
}

#[test]
fn uninitialized_operations_fail() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Leaderboard, ());
    let client = LeaderboardClient::new(&env, &contract_id);

    let sponsor = Address::generate(&env);
    assert_eq!(
        client.try_record_sponsor(&sponsor, &1000i128),
        Err(Ok(Error::NotInitialized))
    );

    let planter = Address::generate(&env);
    assert_eq!(
        client.try_record_planter(&planter, &50i128),
        Err(Ok(Error::NotInitialized))
    );

    let admin = Address::generate(&env);
    let month = Month { year: 2026, month: 9 };
    assert_eq!(
        client.try_reset_month(&admin, &month),
        Err(Ok(Error::NotInitialized))
    );

    assert_eq!(
        client.try_add_bonus_pool(&admin, &1000i128),
        Err(Ok(Error::NotInitialized))
    );

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);
    assert_eq!(
        client.try_distribute_sponsor_bonus(&admin, &first, &second, &third),
        Err(Ok(Error::NotInitialized))
    );

    assert_eq!(
        client.try_get_current_month(),
        Err(Ok(Error::NotInitialized))
    );
}
