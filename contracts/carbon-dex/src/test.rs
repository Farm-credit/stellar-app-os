use super::*;
use soroban_sdk::testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation};
use soroban_sdk::{symbol_short, BytesN, IntoVal};

fn create_token_contract<'a>(e: &Env, admin: &Address) -> (Address, token::Client<'a>) {
    let contract_address = e.register_stellar_asset_contract(admin.clone());
    (contract_address.clone(), token::Client::new(e, &contract_address))
}


#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CarbonDEX);
    let client = CarbonDEXClient::new(&env, &contract_id);

    let token_a = Address::random(&env);
    let token_b = Address::random(&env);
    let fee_bps = 30; // 0.3%

    client.initialize(&token_a, &token_b, &fee_bps);

    assert_eq!(client.try_initialize(&token_a, &token_b, &fee_bps).is_err(), false);
}

#[test]
fn test_deposit_and_withdraw() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CarbonDEX);
    let client = CarbonDEXClient::new(&env, &contract_id);

    let admin = Address::random(&env);
    let user = Address::random(&env);
    
    let (token_a_addr, token_a) = create_token_contract(&env, &admin);
    let (token_b_addr, token_b) = create_token_contract(&env, &admin);
    
    token_a.mint(&user, &1000);
    token_b.mint(&user, &2000);

    let fee_bps = 30; // 0.3%
    client.initialize(&token_a_addr, &token_b_addr, &fee_bps);

    client.deposit(&user, &100, &200);
    
    assert_eq!(token_a.balance(&user), 900);
    assert_eq!(token_b.balance(&user), 1800);
    assert_eq!(token_a.balance(&contract_id), 100);
    assert_eq!(token_b.balance(&contract_id), 200);

    client.withdraw(&user, &50, &100);

    assert_eq!(token_a.balance(&user), 950);
    assert_eq!(token_b.balance(&user), 1900);
    assert_eq!(token_a.balance(&contract_id), 50);
    assert_eq!(token_b.balance(&contract_id), 100);
}


#[test]
fn test_swap() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CarbonDEX);
    let client = CarbonDEXClient::new(&env, &contract_id);

    let admin = Address::random(&env);
    let user = Address::random(&env);
    
    let (token_a_addr, token_a) = create_token_contract(&env, &admin);
    let (token_b_addr, token_b) = create_token_contract(&env, &admin);
    
    token_a.mint(&user, &10000);
    token_b.mint(&user, &10000);

    // Deposit initial liquidity
    token_a.approve(&user, &contract_id, &5000, &99999);
    token_b.approve(&user, &contract_id, &5000, &99999);
    
    let fee_bps = 30; // 0.3%
    client.initialize(&token_a_addr, &token_b_addr, &fee_bps);
    client.deposit(&user, &5000, &5000);

    assert_eq!(token_a.balance(&contract_id), 5000);
    assert_eq!(token_b.balance(&contract_id), 5000);

    // Swap 100 of A for B
    token_a.approve(&user, &contract_id, &100, &99999);
    let out_amount = client.swap(&user, &token_a_addr, &100);
    
    // in_amount_minus_fee = 100 - (100 * 30 / 10000) = 100 - 0 = 100 (integer math)
    // out_amount = (100 * 5000) / (5000 + 100) = 500000 / 5100 = 98
    let in_amount_minus_fee = 100 - (100 * fee_bps as i128/ 10000);
    let expected_out = (in_amount_minus_fee * 5000) / (5000 + in_amount_minus_fee);
    
    assert_eq!(out_amount, expected_out);

    assert_eq!(token_a.balance(&user), 5000-100); // 4900
    assert_eq!(token_b.balance(&user), 5000 + out_amount);
    
    assert_eq!(token_a.balance(&contract_id), 5000 + 100);
    assert_eq!(token_b.balance(&contract_id), 5000 - out_amount);
}
