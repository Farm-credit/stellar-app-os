#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Address, Env, Symbol,
};

fn create_tree_registry(env: &Env) -> TreeRegistryContractClient {
    TreeRegistryContractClient::new(env, &env.register_contract(None, TreeRegistryContract))
}

fn setup() -> (Env, Address, Address, TreeRegistryContractClient) {
    let env = Env::default();
    env.mock_all_auths();
    let sponsor = Address::generate(&env);
    let planter = Address::generate(&env);
    let registry = create_tree_registry(&env);
    registry.initialize();
    (env, sponsor, planter, registry)
}

#[test]
fn test_mint_anonymous_tree() {
    let (env, _, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    let tree_id = registry.mint_anon(&symbol_short!("teak"), &symbol_short!("kenya"), &planter);
    assert_eq!(tree_id, 1u64);
    let tree = registry.get_tree(&tree_id).unwrap();
    assert_eq!(tree.sponsor, None);
    assert_eq!(tree.co2_offset_kg, 22);
}

#[test]
fn test_anonymous_tree_not_in_dashboard() {
    let (env, sponsor, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.mint_anon(&symbol_short!("teak"), &symbol_short!("kenya"), &planter);
    registry.mint_sponsored(&sponsor, &planter, &symbol_short!("moringa"), &symbol_short!("india"));
    let sponsor_trees = registry.get_sponsor_trees(&sponsor);
    assert_eq!(sponsor_trees.len(), 1);
    assert_eq!(sponsor_trees.get(0).unwrap().id, 2u64);
}

#[test]
fn test_anonymous_event_emitted() {
    let (env, _, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.mint_anon(&symbol_short!("mangrove"), &symbol_short!("indonesia"), &planter);
    let events = env.events().all();
    let anon_event = events.iter().find(|e| e.0 == (symbol_short!("anon_minted"),));
    assert!(anon_event.is_some());
}

#[test]
fn test_total_anonymous_counter() {
    let (env, sponsor, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    assert_eq!(registry.get_total_anonymous_trees(), 0);
    registry.mint_anon(&symbol_short!("teak"), &symbol_short!("kenya"), &planter);
    registry.mint_anon(&symbol_short!("moringa"), &symbol_short!("india"), &planter);
    registry.mint_sponsored(&sponsor, &planter, &symbol_short!("eucalyptus"), &symbol_short!("brazil"));
    assert_eq!(registry.get_total_anonymous_trees(), 2);
    assert_eq!(registry.get_total_trees(), 3);
}

#[test]
fn test_co2_per_species() {
    let (env, _, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    let tests = vec![
        &env,
        (symbol_short!("teak"), 22u64),
        (symbol_short!("moringa"), 9u64),
        (symbol_short!("eucalyptus"), 31u64),
        (symbol_short!("mangrove"), 14u64),
        (symbol_short!("acacia"), 18u64),
        (symbol_short!("bamboo"), 12u64),
    ];
    for (species, expected) in tests.iter() {
        let id = registry.mint_anon(&species, &symbol_short!("test"), &planter);
        assert_eq!(registry.get_tree(&id).unwrap().co2_offset_kg, expected);
    }
}

#[test]
fn test_upload_proof() {
    let (env, _, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    let tree_id = registry.mint_anon(&symbol_short!("teak"), &symbol_short!("kenya"), &planter);
    env.set_auths(&[planter.clone()]);
    registry.upload_proof(&tree_id, &Symbol::new(&env, "QmTest123"), &-1_234567i64, &36_876543i64);
    let tree = registry.get_tree(&tree_id).unwrap();
    assert_eq!(tree.status, TreeStatus::Planted);
    assert_eq!(tree.gps_lat, Some(-1_234567i64));
}

#[test]
#[should_panic(expected = "InvalidCoordinates")]
fn test_invalid_coordinates() {
    let (env, _, planter, registry) = setup();
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    let tree_id = registry.mint_anon(&symbol_short!("teak"), &symbol_short!("kenya"), &planter);
    env.set_auths(&[planter.clone()]);
    registry.upload_proof(&tree_id, &Symbol::new(&env, "QmTest123"), &100_000000i64, &0i64);
}