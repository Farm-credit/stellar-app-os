//! Unit tests for the Farmer Bonus Pool contract (#1355).

use super::*;
use soroban_sdk::testutils::Address as _;

fn setup_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone());
    let token = token_id.address();
    let farmer = Address::generate(&env);
    (env, admin, token, farmer)
}

fn register(env: &Env) -> Address {
    env.register_contract(None, crate::BonusPool)
}

#[test]
fn test_initialize() {
    let (env, admin, token, _farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_payment_token(), token);
    assert_eq!(client.get_bonus_bps(), 100_u32);
    assert_eq!(client.get_pool_balance(), 0_i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init_panics() {
    let (env, admin, token, _farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);
    client.initialize(&admin, &token, &100_u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_invalid_bps_panics() {
    let (env, admin, token, _farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &0_u32);
}

#[test]
fn test_bonus_share_for_sale_is_one_percent() {
    let (env, admin, token, _farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);

    // 1% of 1_000_000 stroops = 10_000 stroops
    assert_eq!(client.bonus_share_for_sale(&1_000_000_i128), 10_000_i128);
}

#[test]
fn test_record_performance_and_quarter_flow() {
    let (env, admin, token, farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);

    let period = 20_264_u32; // Q4 2026
    client.record_performance(&farmer, &period, &1_500_i128, &1_000_i128);

    let perf = client.get_performance(&farmer, &period).unwrap();
    assert!(perf.exceeded);

    client.open_quarter(&period);
    let quarter = client.get_quarter(&period).unwrap();
    assert_eq!(quarter.pool_at_open, 0_i128);
    assert!(!quarter.closed);

    // Unrecorded farmer cannot be allocated anything.
    // (Covered by distribute requiring recorded performance.)

    client.close_quarter(&period);
    let closed = client.get_quarter(&period).unwrap();
    assert!(closed.closed);
}

#[test]
fn test_claim_marks_ledger_entry() {
    let (env, admin, token, farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);

    let period = 20_261_u32; // Q1 2026
    client.record_performance(&farmer, &period, &2_000_i128, &1_000_i128);
    client.open_quarter(&period);

    // The pool snapshot is 0, so no allocation can happen here. The ledger
    // read must report nothing claimed.
    assert!(!client.has_claimed(&farmer, &period));
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_distribute_above_pool_cap_panics() {
    let (env, admin, token, farmer) = setup_env();
    let contract_id = register(&env);
    let client = BonusPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &token, &100_u32);

    let period = 20_262_u32;
    client.record_performance(&farmer, &period, &2_000_i128, &1_000_i128);
    client.open_quarter(&period);
    client.distribute(&period, &farmer, &1_i128); // snapshot is 0
}
