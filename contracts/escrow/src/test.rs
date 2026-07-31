#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, IntoVal, Symbol,
};

fn create_token_contract(env: &Env, admin: &Address) -> (Address, TokenClient) {
    let contract_id = env.register_stellar_asset_contract(admin.clone());
    let client = TokenClient::new(env, &contract_id);
    (contract_id, client)
}

fn create_escrow_contract(env: &Env) -> EscrowContractClient {
    EscrowContractClient::new(env, &env.register_contract(None, EscrowContract))
}

fn setup() -> (Env, Address, Address, Address, Address, TokenClient) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tree_registry = Address::generate(&env);
    let planter_registry = Address::generate(&env);
    let sponsor = Address::generate(&env);
    let (token_id, token_client) = create_token_contract(&env, &admin);
    token_client.mint(&sponsor, &1_000_000_000_000i128);
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    (env, tree_registry, planter_registry, sponsor, token_id, token_client)
}

#[test]
fn test_donate_anonymous_success() {
    let (env, tree_registry, planter_registry, sponsor, token_id, token_client) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    env.register_contract(&planter_registry, MockPlanterRegistry);
    env.register_contract(&tree_registry, MockTreeRegistry);
    let amount = 50_0000000i128;
    token_client.approve(&sponsor, &escrow.address, &amount, &999999);
    let result = escrow.donate_anonymous(&amount, &token_id, &symbol_short!("teak"), &symbol_short!("kenya"));
    assert_eq!(result.0, 1u64);
    let entry = escrow.get_escrow(&1u64).unwrap();
    assert_eq!(entry.sponsor, None);
    assert_eq!(entry.status, EscrowStatus::Locked);
}

#[test]
#[should_panic(expected = "Insufficient donation amount")]
fn test_donate_anonymous_insufficient_funds() {
    let (env, tree_registry, planter_registry, _, token_id, _) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    escrow.donate_anonymous(&5_0000000i128, &token_id, &symbol_short!("teak"), &symbol_short!("kenya"));
}

#[test]
#[should_panic(expected = "No available planters in region")]
fn test_donate_anonymous_no_planters() {
    let (env, tree_registry, planter_registry, _, token_id, _) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    env.register_contract(&planter_registry, MockEmptyPlanterRegistry);
    escrow.donate_anonymous(&50_0000000i128, &token_id, &symbol_short!("teak"), &symbol_short!("antarctica"));
}

#[test]
#[should_panic(expected = "InvalidSpecies")]
fn test_donate_anonymous_invalid_species() {
    let (env, tree_registry, planter_registry, _, token_id, _) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    escrow.donate_anonymous(&50_0000000i128, &token_id, &symbol_short!("alien"), &symbol_short!("kenya"));
}

#[test]
fn test_multiple_anonymous_donations() {
    let (env, tree_registry, planter_registry, sponsor, token_id, token_client) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    env.register_contract(&planter_registry, MockPlanterRegistry);
    env.register_contract(&tree_registry, MockTreeRegistry);
    token_client.approve(&sponsor, &escrow.address, &200_0000000i128, &999999);
    let (id1, _) = escrow.donate_anonymous(&50_0000000i128, &token_id, &symbol_short!("teak"), &symbol_short!("kenya"));
    let (id2, _) = escrow.donate_anonymous(&10_0000000i128, &token_id, &symbol_short!("moringa"), &symbol_short!("india"));
    let (id3, _) = escrow.donate_anonymous(&35_0000000i128, &token_id, &symbol_short!("eucalyptus"), &symbol_short!("brazil"));
    assert_eq!(id1, 1u64);
    assert_eq!(id2, 2u64);
    assert_eq!(id3, 3u64);
}

#[test]
fn test_species_costs() {
    let (env, tree_registry, planter_registry, _, _, _) = setup();
    let escrow = create_escrow_contract(&env);
    escrow.initialize(&tree_registry, &planter_registry);
    assert_eq!(escrow.get_species_cost(&symbol_short!("teak")), 50_0000000i128);
    assert_eq!(escrow.get_species_cost(&symbol_short!("moringa")), 10_0000000i128);
    assert_eq!(escrow.get_species_cost(&symbol_short!("eucalyptus")), 35_0000000i128);
    assert_eq!(escrow.get_species_cost(&symbol_short!("mangrove")), 25_0000000i128);
    assert_eq!(escrow.get_species_cost(&symbol_short!("acacia")), 15_0000000i128);
    assert_eq!(escrow.get_species_cost(&symbol_short!("bamboo")), 8_0000000i128);
}

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct MockPlanterRegistry;
#[contractimpl]
impl MockPlanterRegistry {
    pub fn get_avail(env: Env, _region: Symbol) -> Vec<Address> {
        vec![&env, Address::generate(&env)]
    }
    pub fn inc_work(_env: Env, _planter: Address) {}
}

#[contract]
pub struct MockEmptyPlanterRegistry;
#[contractimpl]
impl MockEmptyPlanterRegistry {
    pub fn get_avail(env: Env, _region: Symbol) -> Vec<Address> {
        vec![&env]
    }
}

#[contract]
pub struct MockTreeRegistry;
#[contractimpl]
impl MockTreeRegistry {
    pub fn mint_anon(_env: Env, _species: Symbol, _region: Symbol, _planter: Address) -> u64 {
        1u64
    }
}