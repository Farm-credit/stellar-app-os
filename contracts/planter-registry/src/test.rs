#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Address, Env, Symbol,
};

fn create_planter_registry(env: &Env) -> PlanterRegistryContractClient {
    PlanterRegistryContractClient::new(env, &env.register_contract(None, PlanterRegistryContract))
}

fn setup() -> (Env, Address, PlanterRegistryContractClient) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let registry = create_planter_registry(&env);
    registry.initialize(&admin);
    (env, admin, registry)
}

#[test]
fn test_register_planter() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("John"), &symbol_short!("kenya"), &10u32);
    let data = registry.get_planter(&planter).unwrap();
    assert_eq!(data.workload, 0);
    assert_eq!(data.reputation, 50);
    assert_eq!(data.active, true);
}

#[test]
fn test_get_available_planters() {
    let (env, _, registry) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    let p4 = Address::generate(&env);
    registry.register_planter(&p1, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    registry.register_planter(&p2, &symbol_short!("B"), &symbol_short!("kenya"), &5u32);
    registry.register_planter(&p3, &symbol_short!("C"), &symbol_short!("kenya"), &10u32);
    registry.register_planter(&p4, &symbol_short!("D"), &symbol_short!("india"), &10u32);
    
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    for _ in 0..5 { registry.inc_work(&p2); }
    registry.set_planter_active(&p3, &false);
    
    let available = registry.get_avail(&symbol_short!("kenya"));
    assert_eq!(available.len(), 1);
    assert_eq!(available.get(0).unwrap(), p1);
}

#[test]
fn test_get_available_planters_empty_region() {
    let (_, _, registry) = setup();
    let available = registry.get_avail(&symbol_short!("antarctica"));
    assert!(available.is_empty());
}

#[test]
fn test_increment_workload() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.inc_work(&planter);
    assert_eq!(registry.get_planter(&planter).unwrap().workload, 1);
}

#[test]
#[should_panic(expected = "CapacityExceeded")]
fn test_increment_workload_at_capacity() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &2u32);
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.inc_work(&planter);
    registry.inc_work(&planter);
    registry.inc_work(&planter);
}

#[test]
#[should_panic(expected = "PlanterInactive")]
fn test_increment_workload_inactive() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    registry.set_planter_active(&planter, &false);
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.inc_work(&planter);
}

#[test]
fn test_decrement_workload() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.inc_work(&planter);
    registry.inc_work(&planter);
    registry.dec_work(&planter);
    let data = registry.get_planter(&planter).unwrap();
    assert_eq!(data.workload, 1);
    assert_eq!(data.total_trees_planted, 1);
}

#[test]
#[should_panic(expected = "WorkloadAlreadyZero")]
fn test_decrement_workload_zero() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    let escrow = Address::generate(&env);
    registry.set_escrow_address(&escrow);
    env.set_auths(&[escrow.clone()]);
    registry.dec_work(&planter);
}

#[test]
fn test_set_planter_active() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    assert_eq!(registry.get_avail(&symbol_short!("kenya")).len(), 1);
    registry.set_planter_active(&planter, &false);
    assert!(registry.get_avail(&symbol_short!("kenya")).is_empty());
}

#[test]
fn test_update_reputation() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    registry.update_reputation(&planter, &85u32);
    assert_eq!(registry.get_planter(&planter).unwrap().reputation, 85);
}

#[test]
#[should_panic(expected = "PlanterAlreadyRegistered")]
fn test_duplicate_registration() {
    let (env, _, registry) = setup();
    let planter = Address::generate(&env);
    registry.register_planter(&planter, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    registry.register_planter(&planter, &symbol_short!("B"), &symbol_short!("india"), &5u32);
}

#[test]
fn test_get_planters_by_region() {
    let (env, _, registry) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    registry.register_planter(&p1, &symbol_short!("A"), &symbol_short!("kenya"), &10u32);
    registry.register_planter(&p2, &symbol_short!("B"), &symbol_short!("kenya"), &10u32);
    registry.register_planter(&p3, &symbol_short!("C"), &symbol_short!("india"), &10u32);
    assert_eq!(registry.get_planters_by_region(&symbol_short!("kenya")).len(), 2);
    assert_eq!(registry.get_planters_by_region(&symbol_short!("india")).len(), 1);
}