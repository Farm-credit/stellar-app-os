#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env};
use tree_token::{TreeToken, TreeTokenClient};

#[test]
fn distributes_a_registered_non_tree_asset_to_stakers() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let staker = Address::generate(&env);
    let tree = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    token::StellarAssetClient::new(&env, &tree).mint(&staker, &1_000);
    token::StellarAssetClient::new(&env, &usdc).mint(&admin, &500);

    let contract = env.register_contract(None, TreeToken);
    let client = TreeTokenClient::new(&env, &contract);
    client.initialize(&admin, &tree);
    client.add_reward_asset(&admin, &usdc);
    client.stake(&staker, &1_000);
    client.deposit_reward_asset(&admin, &usdc, &500);

    assert_eq!(client.pending_reward_asset(&staker, &usdc), 500);
    client.claim_reward_asset(&staker, &usdc);
    assert_eq!(token::Client::new(&env, &usdc).balance(&staker), 500);
    assert_eq!(client.pending_reward_asset(&staker, &usdc), 0);
}

#[test]
fn reward_assets_are_accounted_for_independently() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let staker = Address::generate(&env);
    let tree = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let carbon = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    token::StellarAssetClient::new(&env, &tree).mint(&staker, &100);
    token::StellarAssetClient::new(&env, &carbon).mint(&admin, &70);
    token::StellarAssetClient::new(&env, &usdc).mint(&admin, &30);

    let contract = env.register_contract(None, TreeToken);
    let client = TreeTokenClient::new(&env, &contract);
    client.initialize(&admin, &tree);
    client.add_reward_asset(&admin, &carbon);
    client.add_reward_asset(&admin, &usdc);
    client.stake(&staker, &100);
    client.deposit_reward_asset(&admin, &carbon, &70);
    client.deposit_reward_asset(&admin, &usdc, &30);

    assert_eq!(client.pending_reward_asset(&staker, &carbon), 70);
    assert_eq!(client.pending_reward_asset(&staker, &usdc), 30);
}
