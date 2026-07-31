#![no_std]

//! Planter Registry Contract — Closes #459
//!
//! Planters must register on-chain before accepting jobs.
//! Tracks reputation scores that can be incremented (by escrow on successful
//! completion) or slashed (on dispute resolution).  A minimum score threshold
//! can be checked before high-value job acceptance.
//!
//! #461 additions:
//! - get_avail(region): returns active planters with workload < capacity
//! - inc_work(planter): increments workload (escrow-only)
//! - dec_work(planter): decrements workload, increments total_trees_planted (escrow-only)
//! - capacity & workload tracking per planter

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error, symbol_short,
    Address, BytesN, Env, IntoVal, String, Symbol, Vec,
};

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyRegistered = 3,
    NotRegistered = 4,
    NotAuthorized = 5,
    CapacityExceeded = 6,
    PlanterInactive = 7,
    WorkloadAlreadyZero = 8,
    EscrowNotSet = 9,
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Default starting score for a newly registered planter.
const INITIAL_SCORE: u32 = 100;
/// Amount added per successful job completion.
const SCORE_INCREMENT: u32 = 10;
/// Amount removed per dispute resolution against the planter.
const SCORE_SLASH: u32 = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlanterRecord {
    pub wallet: Address,
    /// SHA-256 hash of the planter's off-chain name / identity document.
    pub name_hash: BytesN<32>,
    /// Region identifier string.
    pub region: String,
    pub score: u32,
    pub registered_at: u64,
    /// Max trees this planter can handle simultaneously.
    pub capacity: u32,
    /// Current assigned trees (workload).
    pub workload: u32,
    /// Whether the planter is active and available for new assignments.
    pub active: bool,
    /// Total trees successfully completed.
    pub total_trees_planted: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlanterRegistry;

#[contractimpl]
impl PlanterRegistry {
    /// One-time initialisation — store admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    /// Set the escrow contract address (for workload management).
    /// Only callable by admin.
    pub fn set_escrow(env: Env, escrow: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("ESCROW"), &escrow);
    }

    /// Register a new planter.
    ///
    /// The wallet must sign the transaction.  Starting score is `INITIAL_SCORE`.
    /// Capacity defaults to 10 trees.
    pub fn register_planter(
        env: Env,
        wallet: Address,
        name_hash: BytesN<32>,
        region: String,
    ) -> PlanterRecord {
        wallet.require_auth();

        if env
            .storage()
            .persistent()
            .has(&Self::planter_key(&env, &wallet))
        {
            panic_with_error!(&env, Error::AlreadyRegistered);
        }

        let record = PlanterRecord {
            wallet: wallet.clone(),
            name_hash,
            region: region.clone(),
            score: INITIAL_SCORE,
            registered_at: env.ledger().timestamp(),
            capacity: 10,
            workload: 0,
            active: true,
            total_trees_planted: 0,
        };

        env.storage()
            .persistent()
            .set(&Self::planter_key(&env, &wallet), &record);

        // Add to region index
        let mut region_planters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Self::region_key(&env, &region))
            .unwrap_or(Vec::new(&env));
        region_planters.push_back(wallet.clone());
        env.storage()
            .persistent()
            .set(&Self::region_key(&env, &region), &region_planters);

        env.events().publish(
            (symbol_short!("PlantReg"), wallet.clone()),
            record.clone(),
        );

        record
    }

    /// Return the planter record for `wallet`, or `None` if not registered.
    pub fn get_planter(env: Env, wallet: Address) -> Option<PlanterRecord> {
        env.storage()
            .persistent()
            .get(&Self::planter_key(&env, &wallet))
    }

    /// Increment the planter's score by `SCORE_INCREMENT`.
    ///
    /// Only callable by the contract admin (typically the escrow contract).
    pub fn increment_score(env: Env, wallet: Address) {
        Self::require_admin(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_add(SCORE_INCREMENT);
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ScoreInc"), wallet.clone()),
            record.score,
        );
    }

    /// Slash the planter's score by `SCORE_SLASH`.
    ///
    /// Only callable by the contract admin (typically the dispute-resolver).
    /// Score floor is 0 — will not underflow.
    pub fn slash_score(env: Env, wallet: Address) {
        Self::require_admin(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_sub(SCORE_SLASH);
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ScoreSls"), wallet.clone()),
            record.score,
        );
    }

    /// Return `true` if `wallet` meets `min_score` — use before high-value job
    /// acceptance.  Returns `false` (does not panic) if the planter is not
    /// registered.
    pub fn meets_min_score(env: Env, wallet: Address, min_score: u32) -> bool {
        match env
            .storage()
            .persistent()
            .get::<_, PlanterRecord>(&Self::planter_key(&env, &wallet))
        {
            Some(record) => record.score >= min_score,
            None => false,
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // #461: Anonymous donation flow — workload & availability
    // ─────────────────────────────────────────────────────────────────────────

    /// Get available planters in a region.
    /// Returns planters where: active=true AND workload < capacity
    pub fn get_avail(env: Env, region: String) -> Vec<Address> {
        let region_planters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Self::region_key(&env, &region))
            .unwrap_or(Vec::new(&env));

        let mut available = Vec::new(&env);
        for addr in region_planters.iter() {
            if let Some(planter) = env
                .storage()
                .persistent()
                .get::<_, PlanterRecord>(&Self::planter_key(&env, &addr))
            {
                if planter.active && planter.workload < planter.capacity {
                    available.push_back(addr);
                }
            }
        }
        available
    }

    /// Increment planter workload (called by escrow on tree assignment).
    /// Only callable by the escrow contract.
    pub fn inc_work(env: Env, wallet: Address) {
        Self::require_escrow(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        if !record.active {
            panic_with_error!(&env, Error::PlanterInactive);
        }

        if record.workload >= record.capacity {
            panic_with_error!(&env, Error::CapacityExceeded);
        }

        record.workload += 1;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("WorkInc"), wallet.clone()),
            record.workload,
        );
    }

    /// Decrement planter workload (called by escrow on tree completion).
    /// Also increments total_trees_planted.
    /// Only callable by the escrow contract.
    pub fn dec_work(env: Env, wallet: Address) {
        Self::require_escrow(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        if record.workload == 0 {
            panic_with_error!(&env, Error::WorkloadAlreadyZero);
        }

        record.workload -= 1;
        record.total_trees_planted += 1;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("WorkDec"), wallet.clone()),
            record.workload,
        );
    }

    /// Set planter active/inactive (admin only).
    pub fn set_active(env: Env, wallet: Address, active: bool) {
        Self::require_admin(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.active = active;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ActiveSet"), wallet.clone()),
            active,
        );
    }

    /// Update planter capacity (admin only).
    pub fn set_capacity(env: Env, wallet: Address, capacity: u32) {
        Self::require_admin(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.capacity = capacity;
        env.storage().persistent().set(&key, &record);
    }

    /// Get all planters in a region (including inactive/full ones).
    pub fn get_planters_by_region(env: Env, region: String) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&Self::region_key(&env, &region))
            .unwrap_or(Vec::new(&env))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn planter_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("PLANTER"), wallet.clone()).into_val(env)
    }

    fn region_key(env: &Env, region: &String) -> soroban_sdk::Val {
        (symbol_short!("REGION"), region.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }

    fn require_escrow(env: &Env) {
        let escrow: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ESCROW"))
            .unwrap_or_else(|| panic_with_error!(env, Error::EscrowNotSet));
        escrow.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    fn setup() -> (Env, Address, PlanterRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PlanterRegistry);
        let client = PlanterRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        (env, admin, client)
    }

    fn name_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ── register_planter ──────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        let record = client.register_planter(
            &planter,
            &name_hash(&env, 1),
            &String::from_str(&env, "s1"),
        );

        assert_eq!(record.wallet, planter);
        assert_eq!(record.score, INITIAL_SCORE);
        assert_eq!(record.capacity, 10);
        assert_eq!(record.workload, 0);
        assert_eq!(record.active, true);
        assert_eq!(record.total_trees_planted, 0);

        let stored = client.get_planter(&planter).unwrap();
        assert_eq!(stored.region, String::from_str(&env, "s1"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_double_registration_rejected() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        client.register_planter(&planter, &name_hash(&env, 2), &String::from_str(&env, "s2"));
    }

    #[test]
    fn test_get_unregistered_returns_none() {
        let (env, _, client) = setup();
        assert!(client.get_planter(&Address::generate(&env)).is_none());
    }

    // ── increment_score ───────────────────────────────────────────────────────

    #[test]
    fn test_increment_score() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        client.increment_score(&planter);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, INITIAL_SCORE + SCORE_INCREMENT);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_increment_unregistered_panics() {
        let (env, _, client) = setup();
        client.increment_score(&Address::generate(&env));
    }

    // ── slash_score ───────────────────────────────────────────────────────────

    #[test]
    fn test_slash_score() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        client.slash_score(&planter);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, INITIAL_SCORE - SCORE_SLASH);
    }

    #[test]
    fn test_slash_floors_at_zero() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));

        for _ in 0..20 {
            client.slash_score(&planter);
        }

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_slash_unregistered_panics() {
        let (env, _, client) = setup();
        client.slash_score(&Address::generate(&env));
    }

    // ── meets_min_score ───────────────────────────────────────────────────────

    #[test]
    fn test_meets_min_score_initial() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));

        assert!(client.meets_min_score(&planter, &INITIAL_SCORE));
        assert!(client.meets_min_score(&planter, &(INITIAL_SCORE - 1)));
        assert!(!client.meets_min_score(&planter, &(INITIAL_SCORE + 1)));
    }

    #[test]
    fn test_meets_min_score_after_slash() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        client.slash_score(&planter);

        assert!(!client.meets_min_score(&planter, &INITIAL_SCORE));
        assert!(client.meets_min_score(&planter, &(INITIAL_SCORE - SCORE_SLASH)));
    }

    #[test]
    fn test_meets_min_score_unregistered_returns_false() {
        let (env, _, client) = setup();
        assert!(!client.meets_min_score(&Address::generate(&env), &0u32));
    }

    // ── #461: get_avail ───────────────────────────────────────────────────────

    #[test]
    fn test_get_available_planters() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let p1 = Address::generate(&env);
        client.register_planter(&p1, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        let p2 = Address::generate(&env);
        client.register_planter(&p2, &name_hash(&env, 2), &String::from_str(&env, "kenya"));
        client.set_capacity(&p2, &5u32);
        env.set_auths(&[escrow.clone()]);
        for _ in 0..5 {
            client.inc_work(&p2);
        }

        let p3 = Address::generate(&env);
        client.register_planter(&p3, &name_hash(&env, 3), &String::from_str(&env, "kenya"));
        client.set_active(&p3, &false);

        let p4 = Address::generate(&env);
        client.register_planter(&p4, &name_hash(&env, 4), &String::from_str(&env, "india"));

        let available = client.get_avail(&String::from_str(&env, "kenya"));
        assert_eq!(available.len(), 1);
        assert_eq!(available.get(0).unwrap(), p1);
    }

    #[test]
    fn test_get_available_planters_empty_region() {
        let (env, _, client) = setup();
        let available = client.get_avail(&String::from_str(&env, "antarctica"));
        assert!(available.is_empty());
    }

    // ── #461: inc_work / dec_work ─────────────────────────────────────────────

    #[test]
    fn test_increment_workload() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        env.set_auths(&[escrow.clone()]);
        client.inc_work(&planter);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.workload, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_increment_workload_at_capacity() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));
        client.set_capacity(&planter, &2u32);

        env.set_auths(&[escrow.clone()]);
        client.inc_work(&planter);
        client.inc_work(&planter);
        client.inc_work(&planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_increment_workload_inactive() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));
        client.set_active(&planter, &false);

        env.set_auths(&[escrow.clone()]);
        client.inc_work(&planter);
    }

    #[test]
    fn test_decrement_workload() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        env.set_auths(&[escrow.clone()]);
        client.inc_work(&planter);
        client.inc_work(&planter);
        client.dec_work(&planter);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.workload, 1);
        assert_eq!(record.total_trees_planted, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_decrement_workload_zero() {
        let (env, _admin, client) = setup();
        let escrow = Address::generate(&env);
        client.set_escrow(&escrow);

        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        env.set_auths(&[escrow.clone()]);
        client.dec_work(&planter);
    }

    #[test]
    fn test_set_active_toggles_availability() {
        let (env, _admin, client) = setup();
        let planter = Address::generate(&env);
        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        assert_eq!(client.get_avail(&String::from_str(&env, "kenya")).len(), 1);
        client.set_active(&planter, &false);
        assert!(client.get_avail(&String::from_str(&env, "kenya")).is_empty());
    }

    #[test]
    fn test_get_planters_by_region() {
        let (env, _, client) = setup();
        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);
        let p3 = Address::generate(&env);

        client.register_planter(&p1, &name_hash(&env, 1), &String::from_str(&env, "kenya"));
        client.register_planter(&p2, &name_hash(&env, 2), &String::from_str(&env, "kenya"));
        client.register_planter(&p3, &name_hash(&env, 3), &String::from_str(&env, "india"));

        assert_eq!(client.get_planters_by_region(&String::from_str(&env, "kenya")).len(), 2);
        assert_eq!(client.get_planters_by_region(&String::from_str(&env, "india")).len(), 1);
    }
}