#![no_std]

//! Planter Registry Contract — Closes #459
//!
//! Planters must register on-chain before accepting jobs.
//! Tracks reputation scores that can be incremented (by escrow on successful
//! completion) or slashed (on dispute resolution).  A minimum score threshold
//! can be checked before high-value job acceptance.
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

            .set(&Self::planter_key(&env, &wallet), &record);

        // Add to region index
        let mut region_planters: Vec<Address> = env
            .get(&Self::region_key(&env, &region))
            .unwrap_or(Vec::new(&env));
        region_planters.push_back(wallet.clone());
            .set(&Self::region_key(&env, &region), &region_planters);

        env.events().publish(
            (symbol_short!("PlantReg"), wallet.clone()),
            record.clone(),
        );

        record
    }

    /// Return the planter record for `wallet`, or `None` if not registered.
    pub fn get_planter(env: Env, wallet: Address) -> Option<PlanterRecord> {
            .get(&Self::planter_key(&env, &wallet))
    }

    /// Increment the planter's score by `SCORE_INCREMENT`.
    /// Only callable by the contract admin (typically the escrow contract).
    pub fn increment_score(env: Env, wallet: Address) {

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_add(SCORE_INCREMENT);
        env.storage().persistent().set(&key, &record);

            (symbol_short!("ScoreInc"), wallet.clone()),
            record.score,
        );
    }

    /// Slash the planter's score by `SCORE_SLASH`.
    /// Only callable by the contract admin (typically the dispute-resolver).
    /// Score floor is 0 — will not underflow.
    pub fn slash_score(env: Env, wallet: Address) {


        record.score = record.score.saturating_sub(SCORE_SLASH);

            (symbol_short!("ScoreSls"), wallet.clone()),
        );
    }

    /// Return `true` if `wallet` meets `min_score` — use before high-value job
    /// acceptance.  Returns `false` (does not panic) if the planter is not
    /// registered.
    pub fn meets_min_score(env: Env, wallet: Address, min_score: u32) -> bool {
        match env
            .get::<_, PlanterRecord>(&Self::planter_key(&env, &wallet))
            Some(record) => record.score >= min_score,
            None => false,
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // #461: Anonymous donation flow — workload & availability

    /// Get available planters in a region.
    /// Returns planters where: active=true AND workload < capacity
    pub fn get_avail(env: Env, region: String) -> Vec<Address> {
        let region_planters: Vec<Address> = env

        let mut available = Vec::new(&env);
        for addr in region_planters.iter() {
            if let Some(planter) = env
                .get::<_, PlanterRecord>(&Self::planter_key(&env, &addr))
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


        if !record.active {
            panic_with_error!(&env, Error::PlanterInactive);
        }

        if record.workload >= record.capacity {
            panic_with_error!(&env, Error::CapacityExceeded);
        }

        record.workload += 1;

            (symbol_short!("WorkInc"), wallet.clone()),
            record.workload,
        );
    }

    /// Decrement planter workload (called by escrow on tree completion).
    /// Also increments total_trees_planted.
    pub fn dec_work(env: Env, wallet: Address) {


        if record.workload == 0 {
            panic_with_error!(&env, Error::WorkloadAlreadyZero);
        }

        record.workload -= 1;
        record.total_trees_planted += 1;

            (symbol_short!("WorkDec"), wallet.clone()),
        );
    }

    /// Set planter active/inactive (admin only).
    pub fn set_active(env: Env, wallet: Address, active: bool) {


        record.active = active;

            (symbol_short!("ActiveSet"), wallet.clone()),
            active,
        );
    }

    /// Update planter capacity (admin only).
    pub fn set_capacity(env: Env, wallet: Address, capacity: u32) {


        record.capacity = capacity;
    }

    /// Get all planters in a region (including inactive/full ones).
    pub fn get_planters_by_region(env: Env, region: String) -> Vec<Address> {
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
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }

    fn require_escrow(env: &Env) {
        let escrow: Address = env
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

    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_double_registration_rejected() {

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        client.register_planter(&planter, &name_hash(&env, 2), &String::from_str(&env, "s2"));
    }

    fn test_get_unregistered_returns_none() {
        assert!(client.get_planter(&Address::generate(&env)).is_none());
    }

    // ── increment_score ───────────────────────────────────────────────────────

    fn test_increment_score() {

        client.increment_score(&planter);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, INITIAL_SCORE + SCORE_INCREMENT);
    }

    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_increment_unregistered_panics() {
        client.increment_score(&Address::generate(&env));
    }

    // ── slash_score ───────────────────────────────────────────────────────────

    fn test_slash_score() {

        client.slash_score(&planter);

        assert_eq!(record.score, INITIAL_SCORE - SCORE_SLASH);
    }

    fn test_slash_floors_at_zero() {


        for _ in 0..20 {
        }

        assert_eq!(record.score, 0);
    }

    fn test_slash_unregistered_panics() {
        client.slash_score(&Address::generate(&env));
    }

    // ── meets_min_score ───────────────────────────────────────────────────────

    fn test_meets_min_score_initial() {


        assert!(client.meets_min_score(&planter, &INITIAL_SCORE));
        assert!(client.meets_min_score(&planter, &(INITIAL_SCORE - 1)));
        assert!(!client.meets_min_score(&planter, &(INITIAL_SCORE + 1)));
    }

    fn test_meets_min_score_after_slash() {


        assert!(!client.meets_min_score(&planter, &INITIAL_SCORE));
        assert!(client.meets_min_score(&planter, &(INITIAL_SCORE - SCORE_SLASH)));
    }

    fn test_meets_min_score_unregistered_returns_false() {
        assert!(!client.meets_min_score(&Address::generate(&env), &0u32));
    }

    // ── #461: get_avail ───────────────────────────────────────────────────────

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

    fn test_get_available_planters_empty_region() {
        let available = client.get_avail(&String::from_str(&env, "antarctica"));
        assert!(available.is_empty());
    }

    // ── #461: inc_work / dec_work ─────────────────────────────────────────────

    fn test_increment_workload() {

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "kenya"));

        client.inc_work(&planter);

        assert_eq!(record.workload, 1);
    }

    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_increment_workload_at_capacity() {

        client.set_capacity(&planter, &2u32);

    }

    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_increment_workload_inactive() {

        client.set_active(&planter, &false);

    }

    fn test_decrement_workload() {


        client.dec_work(&planter);

        assert_eq!(record.total_trees_planted, 1);
    }

    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_decrement_workload_zero() {


    }

    fn test_set_active_toggles_availability() {

        assert_eq!(client.get_avail(&String::from_str(&env, "kenya")).len(), 1);
        assert!(client.get_avail(&String::from_str(&env, "kenya")).is_empty());
    }

    fn test_get_planters_by_region() {

        client.register_planter(&p3, &name_hash(&env, 3), &String::from_str(&env, "india"));

        assert_eq!(client.get_planters_by_region(&String::from_str(&env, "kenya")).len(), 2);
        assert_eq!(client.get_planters_by_region(&String::from_str(&env, "india")).len(), 1);
    }
}
IyFbbm9fc3RkXQ0KDQovLyEgUGxhbnRlciBSZWdpc3RyeSBDb250cmFjdCDigJQgQ2xvc2VzICM0NTkNCi8vIQovLyEgUGxhbnRlcnMgbXVzdCByZWdpc3RlciBvbi1jaGFpbiBiZWZvcmUgYWNjZXB0aW5nIGpvYnMuCi8vISBUcmFja3MgcmVwdXRhdGlvbiBzY29yZXMgdGhhdCBjYW4gYmUgaW5jcmVtZW50ZWQgKGJ5IGVzY3JvdyBvbiBzdWNjZXNzZnVsCi8vISBjb21wbGV0aW9uKSBvciBzbGFzaGVkIChvbiBkaXNwdXRlIHJlc29sdXRpb24pLiAgQSBtaW5pbXVtIHNjb3JlIHRocmVzaG9sZAovLyEgY2FuIGJlIGNoZWNrZWQgYmVmb3JlIGhpZ2gtdmFsdWUgam9iIGFjY2VwdGFuY2UuCi8vISBQbGFudGVycyBtdXN0IGFsc28gc3Rha2UgYSBtaW5pbXVtIGFtb3VudCBvZiBUUkVFIHRva2VucyB0byBhcHBseSwgd2hpY2ggY2FuCi8vISBiZSBzbGFzaGVkIGlmIHRoZWlyIGFwcGxpY2F0aW9uIGlzIHByb3ZlbiBmcmF1ZHVsZW50LgovLyEKLy8hICMgUmVwdXRhdGlvbiBUaWVycyAoSXNzdWUgIzc5MCkKLy8hCi8vISBQbGFudGVycyBhcmUgYXNzaWduZWQgYSByZXB1dGF0aW9uIHRpZXIgYmFkZ2UgYmFzZWQgb24gdGhlaXIgc2NvcmU6Ci8vISAtIEJyb256ZSAgIDogc2NvcmUgPCAgMzAwICAoMCAlIGZlZSBkaXNjb3VudCkKLy8hIC0gU2lsdmVyICAgOiBzY29yZSA+PSAzMDAgICg1ICUgZmVlIGRpc2NvdW50KQovLyEgLSBHb2xkICAgICA6IHNjb3JlID49IDYwMCAgKDE1ICUgZmVlIGRpc2NvdW50KQovLyEgLSBQbGF0aW51bSA6IHNjb3JlID49IDkwMCAgKDMwICUgZmVlIGRpc2NvdW50KQoKdXNlIHNvcm9iYW5fc2RrOjp7CiAgICBjb250cmFjdCwgY29udHJhY3RpbXBsLCBjb250cmFjdHR5cGUsIGNvbnRyYWN0ZXJyb3IsIHBhbmljX3dpdGhfZXJyb3IsIHN5bWJvbF9zaG9ydCwKICAgIHRva2VuLCBBZGRyZXNzLCBCeXRlc04sIEVudiwgSW50b1ZhbCwgU3RyaW5nLAp9Owp1c2UgaGFydmVzdGFfZXJyb3JzOjpIYXJ2ZXN0YUVycm9yOwp1c2UgYWRtaW5fY29udHJvbHM6OkFkbWluQ29udHJvbHNDbGllbnQ7CgovLyDilIDilIAgRXJyb3JzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKI1tjb250cmFjdGVycm9yXQojW2Rlcml2ZShDb3B5LCBDbG9uZSwgRGVidWcsIEVxLCBQYXJ0aWFsRXEpXQojW3JlcHIodTMyKV0KcHViIGVudW0gRXJyb3IgewogICAgQWxyZWFkeUluaXRpYWxpemVkID0gMSwKICAgIE5vdEluaXRpYWxpemVkID0gMiwKICAgIEFscmVhZHlSZWdpc3RlcmVkID0gMywKICAgIE5vdFJlZ2lzdGVyZWQgPSA0LAogICAgTm90QXV0aG9yaXplZCA9IDUsCiAgICBNaW5TdGFrZU11c3RCZVBvc2l0aXZlID0gNiwKICAgIEluc3VmZmljaWVudFN0YWtlID0gNywKICAgIFBsYW50ZXJOb3RTdGFrZWQgPSA4LAogICAgU2xhc2hFeGNlZWRzU3Rha2UgPSA5LAp9CgovLyDilIDilIAgQ29uc3RhbnRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKLy8vIERlZmF1bHQgc3RhcnRpbmcgc2NvcmUgZm9yIGEgbmV3bHkgcmVnaXN0ZXJlZCBwbGFudGVyLgpwdWIgY29uc3QgSU5JVElBTF9TQ09SRTogdTMyID0gMTAwOwovLy8gQW1vdW50IGFkZGVkIHBlciBzdWNjZXNzZnVsIGpvYiBjb21wbGV0aW9uLgpwdWIgY29uc3QgU0NPUkVfSU5DUkVNRU5UOiB1MzIgPSAxMDsKLy8vIEFtb3VudCByZW1vdmVkIHBlciBkaXNwdXRlIHJlc29sdXRpb24gYWdhaW5zdCB0aGUgcGxhbnRlci4KcHViIGNvbnN0IFNDT1JFX1NMQVNIOiB1MzIgPSAyMDsKCi8vIFJlcHV0YXRpb24gdGllciBzY29yZSB0aHJlc2hvbGRzCi8vLyBTY29yZSA+PSBUSUVSX1BMQVRJVU5VTV9NSU4gLT4gUGxhdGludW0gdGllciAoaGlnaGVzdCkKcHViIGNvbnN0IFRJRVJfUExBVElOVU1fTUlOOiB1MzIgPSA5MDA7Ci8vLyBTY29yZSA+PSBUSUVSX0dPTERfTUlOIC0+IEdvbGQgdGllcgpwdWIgY29uc3QgVElFUl9HT0xEX01JTjogdTMyID0gNjAwOwovLy8gU2NvcmUgPj0gVElFUl9TSUxWRVJfTUlOIC0+IFNpbHZlciB0aWVyCnB1YiBjb25zdCBUSUVSX1NJTFZFUl9NSU46IHUzMiA9IDMwMDsKLy8vIFNjb3JlIDwgVElFUl9TSUxWRVJfTUlOIC0+IEJyb256ZSB0aWVyIChlbnRyeSBsZXZlbCkKCi8vIEZlZSBkaXNjb3VudCBpbiBiYXNpcyBwb2ludHMgKDEgYnAgPSAwLjAxICUpCi8vLyBCcm9uemUgdGllcjogbm8gZGlzY291bnQKcHViIGNvbnN0IERJU0NPVU5UX0JST05aRV9CUFM6IHUzMiA9IDA7Ci8vLyBTaWx2ZXIgdGllcjogNSAlIGZlZSBkaXNjb3VudApwdWIgY29uc3QgRElTQ09VTlRfU0lMVkVSX0JQUzogdTMyID0gNTAwOwovLy8gR29sZCB0aWVyOiAxNSAlIGZlZSBkaXNjb3VudApwdWIgY29uc3QgRElTQ09VTlRfR09MRF9CUFM6IHUzMiA9IDE1MDA7Ci8vLyBQbGF0aW51bSB0aWVyOiAzMCAlIGZlZSBkaXNjb3VudApwdWIgY29uc3QgRElTQ09VTlRfUExBVElOVU1fQlBTOiB1MzIgPSAzMDAwOwoKLy8g4pSA4pSAIFR5cGVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKLy8vIFJlcHV0YXRpb24gdGllciBiYWRnZSBhc3NpZ25lZCBiYXNlZCBvbiBwbGFudGVyIHNjb3JlLgovLy8KLy8vIHwgVGllciAgICAgfCBNaW4gU2NvcmUgfCBGZWUgRGlzY291bnQgfAovLy8gfC0tLS0tLS0tLS18LS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS18Ci8vLyB8IEJyb256ZSAgIHwgMCAgICAgICAgIHwgMCAlICAgICAgICAgIHwKLy8vIHwgU2lsdmVyICAgfCAzMDAgICAgICAgfCA1ICUgICAgICAgICAgfAovLy8gfCBHb2xkICAgICB8IDYwMCAgICAgICB8IDE1ICUgICAgICAgICB8Ci8vLyB8IFBsYXRpbnVtIHwgOTAwICAgICAgIHwgMzAgJSAgICAgICAgIHwKI1tjb250cmFjdHR5cGVdCiNbZGVyaXZlKENsb25lLCBEZWJ1ZywgUGFydGlhbEVxKV0KcHViIGVudW0gUmVwdXRhdGlvblRpZXIgewogICAgQnJvbnplLAogICAgU2lsdmVyLAogICAgR29sZCwKICAgIFBsYXRpbnVtLAp9CgojW2NvbnRyYWN0dHlwZV0KI1tkZXJpdmUoQ2xvbmUsIERlYnVnLCBQYXJ0aWFsRXEpXQpwdWIgc3RydWN0IFBsYW50ZXJSZWNvcmQgewogICAgcHViIHdhbGxldDogQWRkcmVzcywKICAgIC8vLyBTSEEtMjU2IGhhc2ggb2YgdGhlIHBsYW50ZXIncyBvZmYtY2hhaW4gbmFtZSAvIGlkZW50aXR5IGRvY3VtZW50LgogICAgcHViIG5hbWVfaGFzaDogQnl0ZXNOPDMyPiwKICAgIC8vLyBSZWdpb24gaWRlbnRpZmllciBzdHJpbmcuCiAgICBwdWIgcmVnaW9uOiBTdHJpbmcsCiAgICBwdWIgc2NvcmU6IHUzMiwKICAgIHB1YiByZWdpc3RlcmVkX2F0OiB1NjQsCiAgICAvLy8gQ3VtdWxhdGl2ZSBzYXBsaW5nIHN1cnZpdmFsIGlucHV0cyB1c2VkIHRvIGRlcml2ZSBgc2NvcmVgLgogICAgcHViIHNhcGxpbmdzX3BsYW50ZWQ6IHUzMiwKICAgIHB1YiBzYXBsaW5nc19zdXJ2aXZlZDogdTMyLAogICAgcHViIHZlcmlmaWNhdGlvbnNfcGFzc2VkOiB1MzIsCiAgICBwdWIgdmVyaWZpY2F0aW9uc190b3RhbDogdTMyLAp9CgojW2NvbnRyYWN0dHlwZV0KI1tkZXJpdmUoQ2xvbmUsIERlYnVnKV0KcHViIHN0cnVjdCBQbGFudGVyU3Rha2UgewogICAgcHViIHBsYW50ZXI6IEFkZHJlc3MsCiAgICBwdWIgdG9rZW46IEFkZHJlc3MsCiAgICBwdWIgYW1vdW50OiBpMTI4LAogICAgcHViIHN0YWtlZF9hdDogdTY0LAogICAgcHViIHNsYXNoZWQ6IGkxMjgsCn0KCi8vIOKUgOKUgCBTdG9yYWdlIGtleXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgojW2NvbnRyYWN0dHlwZV0KZW51bSBEYXRhS2V5IHsKICAgIC8vLyAoYWRtaW4sIHN0YWtlX3Rva2VuLCBtaW5fc3Rha2VfYW1vdW50KQogICAgQ29uZmlnLAogICAgLy8vIFBlci1wbGFudGVyIHN0YWtlIHJlY29yZAogICAgU3Rha2UoQWRkcmVzcyksCiAgICAvLy8gUGVyLXBsYW50ZXIgcmVjb3JkIChleGlzdGluZykKICAgIFBsYW50ZXIoQWRkcmVzcyksCn0KCi8vIOKUgOKUgCBDb250cmFjdCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKCiNbY29udHJhY3RdCnB1YiBzdHJ1Y3QgUGxhbnRlclJlZ2lzdHJ5OwoKI1tjb250cmFjdGltcGxdCmltcGwgUGxhbnRlclJlZ2lzdHJ5IHsKICAgIC8vLyBPbmUtdGltZSBpbml0aWFsaXNhdGlvbiDigJQgc3RvcmUgYWRtaW4gYWRkcmVzcywgc3Rha2UgdG9rZW4sIGFuZCBtaW4gc3Rha2UuCiAgICBwdWIgZm4gaW5pdGlhbGl6ZShlbnY6IEVudiwgYWRtaW46IEFkZHJlc3MsIHN0YWtlX3Rva2VuOiBBZGRyZXNzLCBtaW5fc3Rha2VfYW1vdW50OiBpMTI4KSB7CiAgICAgICAgaWYgZW52LnN0b3JhZ2UoKS5pbnN0YW5jZSgpLmhhcygmRGF0YUtleTo6Q29uZmlnKSB7CiAgICAgICAgICAgIHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpBbHJlYWR5SW5pdGlhbGl6ZWQpOwogICAgICAgIH0KICAgICAgICBpZiBtaW5fc3Rha2VfYW1vdW50IDw9IDAgewogICAgICAgICAgICBwYW5pY193aXRoX2Vycm9yISgmZW52LCBFcnJvcjo6TWluU3Rha2VNdXN0QmVQb3NpdGl2ZSk7CiAgICAgICAgfQogICAgICAgIGVudi5zdG9yYWdlKCkKICAgICAgICAgICAgLmluc3RhbmNlKCkKICAgICAgICAgICAgLnNldCgmRGF0YUtleTo6Q29uZmlnLCAmKGFkbWluLCBzdGFrZV90b2tlbiwgbWluX3N0YWtlX2Ftb3VudCkpOwogICAgfQoKICAgIC8vLyBTdGFrZSB0b2tlbnMgdG8gYXBwbHkgYXMgYSBwbGFudGVyLgogICAgcHViIGZuIHN0YWtlX3RvX2FwcGx5KGVudjogRW52LCBwbGFudGVyOiBBZGRyZXNzLCBhbW91bnQ6IGkxMjgpIHsKICAgICAgICBwbGFudGVyLnJlcXVpcmVfYXV0aCgpOwoKICAgICAgICBpZiBhbW91bnQgPD0gMCB7CiAgICAgICAgICAgIHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEhhcnZlc3RhRXJyb3I6OkFtb3VudE11c3RCZVBvc2l0aXZlKTsKICAgICAgICB9CgogICAgICAgIGxldCAoXywgc3Rha2VfdG9rZW4sIG1pbl9zdGFrZSk6IChBZGRyZXNzLCBBZGRyZXNzLCBpMTI4KSA9IFNlbGY6OmNvbmZpZygmZW52KTsKCiAgICAgICAgbGV0IGtleSA9IERhdGFLZXk6OlN0YWtlKHBsYW50ZXIuY2xvbmUoKSk7CiAgICAgICAgaWYgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuaGFzKCZrZXkpIHsKICAgICAgICAgICAgbGV0IG11dCByZWM6IFBsYW50ZXJTdGFrZSA9IGVudi5zdG9yYWdlKCkucGVyc2lzdGVudCgpLmdldCgma2V5KS51bndyYXAoKTsKICAgICAgICAgICAgcmVjLmFtb3VudCArPSBhbW91bnQ7CiAgICAgICAgICAgIHRva2VuOjpDbGllbnQ6Om5ldygmZW52LCAmc3Rha2VfdG9rZW4pLnRyYW5zZmVyKAogICAgICAgICAgICAgICAgJnBsYW50ZXIsCiAgICAgICAgICAgICAgICAmZW52LmN1cnJlbnRfY29udHJhY3RfYWRkcmVzcygpLAogICAgICAgICAgICAgICAgJmFtb3VudCwKICAgICAgICAgICAgKTsKICAgICAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuc2V0KCZrZXksICZyZWMpOwogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgIGlmIGFtb3VudCA8IG1pbl9zdGFrZSB7CiAgICAgICAgICAgICAgICBwYW5pY193aXRoX2Vycm9yISgmZW52LCBFcnJvcjo6SW5zdWZmaWNpZW50U3Rha2UpOwogICAgICAgICAgICB9CiAgICAgICAgICAgIHRva2VuOjpDbGllbnQ6Om5ldygmZW52LCAmc3Rha2VfdG9rZW4pLnRyYW5zZmVyKAogICAgICAgICAgICAgICAgJnBsYW50ZXIsCiAgICAgICAgICAgICAgICAmZW52LmN1cnJlbnRfY29udHJhY3RfYWRkcmVzcygpLAogICAgICAgICAgICAgICAgJmFtb3VudCwKICAgICAgICAgICAgKTsKICAgICAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuc2V0KAogICAgICAgICAgICAgICAgJmtleSwKICAgICAgICAgICAgICAgICZQbGFudGVyU3Rha2UgewogICAgICAgICAgICAgICAgICAgIHBsYW50ZXI6IHBsYW50ZXIuY2xvbmUoKSwKICAgICAgICAgICAgICAgICAgICB0b2tlbjogc3Rha2VfdG9rZW4sCiAgICAgICAgICAgICAgICAgICAgYW1vdW50LAogICAgICAgICAgICAgICAgICAgIHN0YWtlZF9hdDogZW52LmxlZGdlcigpLnRpbWVzdGFtcCgpLAogICAgICAgICAgICAgICAgICAgIHNsYXNoZWQ6IDAsCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICApOwogICAgICAgIH0KCiAgICAgICAgZW52LmV2ZW50cygpCiAgICAgICAgICAgIC5wdWJsaXNoKChzeW1ib2xfc2hvcnQhKCJzdGFrZWQiKSwgcGxhbnRlciksIGFtb3VudCk7CiAgICB9CgogICAgLy8vIFVuc3Rha2UgcmVtYWluaW5nIHRva2VucyBhbmQgZXhpdCBhcyBwbGFudGVyLgogICAgcHViIGZuIHVuc3Rha2UoZW52OiBFbnYsIHBsYW50ZXI6IEFkZHJlc3MpIHsKICAgICAgICBwbGFudGVyLnJlcXVpcmVfYXV0aCgpOwoKICAgICAgICBsZXQga2V5ID0gRGF0YUtleTo6U3Rha2UocGxhbnRlci5jbG9uZSgpKTsKICAgICAgICBsZXQgcmVjOiBQbGFudGVyU3Rha2UgPSBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQoJmtleSkKICAgICAgICAgICAgLnVud3JhcF9vcl9lbHNlKHx8IHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpQbGFudGVyTm90U3Rha2VkKSk7CgogICAgICAgIGxldCBhbW91bnQgPSByZWMuYW1vdW50OwogICAgICAgIGlmIGFtb3VudCA+IDAgewogICAgICAgICAgICB0b2tlbjo6Q2xpZW50OjpuZXcoJmVudiwgJnJlYy50b2tlbikudHJhbnNmZXIoCiAgICAgICAgICAgICAgICAmZW52LmN1cnJlbnRfY29udHJhY3RfYWRkcmVzcygpLAogICAgICAgICAgICAgICAgJnBsYW50ZXIsCiAgICAgICAgICAgICAgICAmYW1vdW50LAogICAgICAgICAgICApOwogICAgICAgIH0KCiAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkucmVtb3ZlKCZrZXkpOwoKICAgICAgICBlbnYuZXZlbnRzKCkKICAgICAgICAgICAgLnB1Ymxpc2goKHN5bWJvbF9zaG9ydCEoInVuc3Rha2VkIiksIHBsYW50ZXIpLCBhbW91bnQpOwogICAgfQoKICAgIC8vLyBBZG1pbiBzbGFzaGVzIHN0YWtlIGZyb20gYSBwbGFudGVyIG9uIHByb3ZlbiBmcmF1ZC4KICAgIHB1YiBmbiBzbGFzaF9zdGFrZShlbnY6IEVudiwgcGxhbnRlcjogQWRkcmVzcywgc2xhc2hfYW1vdW50OiBpMTI4KSB7CiAgICAgICAgbGV0IChhZG1pbiwgXywgXykgPSBTZWxmOjpjb25maWcoJmVudik7CiAgICAgICAgYWRtaW4ucmVxdWlyZV9hdXRoKCk7CgogICAgICAgIGlmIHNsYXNoX2Ftb3VudCA8PSAwIHsKICAgICAgICAgICAgcGFuaWNfd2l0aF9lcnJvciEoJmVudiwgSGFydmVzdGFFcnJvcjo6QW1vdW50TXVzdEJlUG9zaXRpdmUpOwogICAgICAgIH0KCiAgICAgICAgbGV0IGtleSA9IERhdGFLZXk6OlN0YWtlKHBsYW50ZXIuY2xvbmUoKSk7CiAgICAgICAgbGV0IG11dCByZWM6IFBsYW50ZXJTdGFrZSA9IGVudgogICAgICAgICAgICAuc3RvcmFnZSgpCiAgICAgICAgICAgIC5wZXJzaXN0ZW50KCkKICAgICAgICAgICAgLmdldCgma2V5KQogICAgICAgICAgICAudW53cmFwX29yX2Vsc2UofHwgcGFuaWNfd2l0aF9lcnJvciEoJmVudiwgRXJyb3I6OlBsYW50ZXJOb3RTdGFrZWQpKTsKCiAgICAgICAgaWYgc2xhc2hfYW1vdW50ID4gcmVjLmFtb3VudCB7CiAgICAgICAgICAgIHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpTbGFzaEV4Y2VlZHNTdGFrZSk7CiAgICAgICAgfQoKICAgICAgICByZWMuYW1vdW50IC09IHNsYXNoX2Ftb3VudDsKICAgICAgICByZWMuc2xhc2hlZCArPSBzbGFzaF9hbW91bnQ7CiAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuc2V0KCZrZXksICZyZWMpOwoKICAgICAgICBlbnYuZXZlbnRzKCkKICAgICAgICAgICAgLnB1Ymxpc2goKHN5bWJvbF9zaG9ydCEoInNsYXNoZWQiKSwgcGxhbnRlciksIHNsYXNoX2Ftb3VudCk7CiAgICB9CgogICAgLy8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgcGxhbnRlciBoYXMgYSBzdGFrZSA+PSBtaW5fc3Rha2VfYW1vdW50LgogICAgcHViIGZuIGlzX2VsaWdpYmxlKGVudjogRW52LCBwbGFudGVyOiBBZGRyZXNzKSAtPiBib29sIHsKICAgICAgICBsZXQgKF8sIF8sIG1pbl9zdGFrZSkgPSBTZWxmOjpjb25maWcoJmVudik7CiAgICAgICAgZW52LnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQ6OjxEYXRhS2V5LCBQbGFudGVyU3Rha2U+KCZEYXRhS2V5OjpTdGFrZShwbGFudGVyKSkKICAgICAgICAgICAgLm1hcCh8cnwgci5hbW91bnQgPj0gbWluX3N0YWtlKQogICAgICAgICAgICAudW53cmFwX29yKGZhbHNlKQogICAgfQoKICAgIC8vLyBSZXR1cm5zIHRoZSBzdGFrZSByZWNvcmQgZm9yIGEgcGxhbnRlciwgb3IgTm9uZS4KICAgIHB1YiBmbiBnZXRfc3Rha2UoZW52OiBFbnYsIHBsYW50ZXI6IEFkZHJlc3MpIC0+IE9wdGlvbjxQbGFudGVyU3Rha2U+IHsKICAgICAgICBlbnYuc3RvcmFnZSgpCiAgICAgICAgICAgIC5wZXJzaXN0ZW50KCkKICAgICAgICAgICAgLmdldCgmRGF0YUtleTo6U3Rha2UocGxhbnRlcikpCiAgICB9CgogICAgLy8vIFJldHVybnMgdGhlIGNvbmZpZ3VyZWQgbWluaW11bSBzdGFrZSBhbW91bnQuCiAgICBwdWIgZm4gZ2V0X21pbl9zdGFrZShlbnY6IEVudikgLT4gaTEyOCB7CiAgICAgICAgbGV0IChfLCBfLCBtaW5fc3Rha2UpID0gU2VsZjo6Y29uZmlnKCZlbnYpOwogICAgICAgIG1pbl9zdGFrZQogICAgfQoKICAgIC8vLyBSZWdpc3RlciBhIG5ldyBwbGFudGVyLgogICAgcHViIGZuIHJlZ2lzdGVyX3BsYW50ZXIoCiAgICAgICAgZW52OiBFbnYsCiAgICAgICAgd2FsbGV0OiBBZGRyZXNzLAogICAgICAgIG5hbWVfaGFzaDogQnl0ZXNOPDMyPiwKICAgICAgICByZWdpb246IFN0cmluZywKICAgICkgLT4gUGxhbnRlclJlY29yZCB7CiAgICAgICAgU2VsZjo6YXNzZXJ0X25vdF9wYXVzZWQoJmVudik7CiAgICAgICAgd2FsbGV0LnJlcXVpcmVfYXV0aCgpOwoKICAgICAgICBpZiAhU2VsZjo6aXNfZWxpZ2libGUoZW52LmNsb25lKCksIHdhbGxldC5jbG9uZSgpKSB7CiAgICAgICAgICAgIHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpJbnN1ZmZpY2llbnRTdGFrZSk7CiAgICAgICAgfQoKICAgICAgICBpZiBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5oYXMoJkRhdGFLZXk6OlBsYW50ZXIod2FsbGV0LmNsb25lKCkpKQogICAgICAgIHsKICAgICAgICAgICAgcGFuaWNfd2l0aF9lcnJvciEoJmVudiwgRXJyb3I6OkFscmVhZHlSZWdpc3RlcmVkKTsKICAgICAgICB9CgogICAgICAgIGxldCByZWNvcmQgPSBQbGFudGVyUmVjb3JkIHsKICAgICAgICAgICAgd2FsbGV0OiB3YWxsZXQuY2xvbmUoKSwKICAgICAgICAgICAgbmFtZV9oYXNoLAogICAgICAgICAgICByZWdpb24sCiAgICAgICAgICAgIHNjb3JlOiBJTklUSUFMX1NDT1JFLAogICAgICAgICAgICByZWdpc3RlcmVkX2F0OiBlbnYubGVkZ2VyKCkudGltZXN0YW1wKCksCiAgICAgICAgICAgIHNhcGxpbmdzX3BsYW50ZWQ6IDAsCiAgICAgICAgICAgIHNhcGxpbmdzX3N1cnZpdmVkOiAwLAogICAgICAgICAgICB2ZXJpZmljYXRpb25zX3Bhc3NlZDogMCwKICAgICAgICAgICAgdmVyaWZpY2F0aW9uc190b3RhbDogMCwKICAgICAgICB9OwoKICAgICAgICBlbnYuc3RvcmFnZSgpCiAgICAgICAgICAgIC5wZXJzaXN0ZW50KCkKICAgICAgICAgICAgLnNldCgmRGF0YUtleTo6UGxhbnRlcih3YWxsZXQuY2xvbmUoKSksICZyZWNvcmQpOwoKICAgICAgICBlbnYuZXZlbnRzKCkucHVibGlzaCgKICAgICAgICAgICAgKHN5bWJvbF9zaG9ydCEoIlBsYW50UmVnIiksIHdhbGxldC5jbG9uZSgpKSwKICAgICAgICAgICAgcmVjb3JkLmNsb25lKCksCiAgICAgICAgKTsKCiAgICAgICAgcmVjb3JkCiAgICB9CgogICAgLy8vIFJldHVybiB0aGUgcGxhbnRlciByZWNvcmQgZm9yIGB3YWxsZXRgLCBvciBgTm9uZWAgaWYgbm90IHJlZ2lzdGVyZWQuCiAgICBwdWIgZm4gZ2V0X3BsYW50ZXIoZW52OiBFbnYsIHdhbGxldDogQWRkcmVzcykgLT4gT3B0aW9uPFBsYW50ZXJSZWNvcmQ+IHsKICAgICAgICBlbnYuc3RvcmFnZSgpCiAgICAgICAgICAgIC5wZXJzaXN0ZW50KCkKICAgICAgICAgICAgLmdldCgmRGF0YUtleTo6UGxhbnRlcih3YWxsZXQpKQogICAgfQoKICAgIC8vLyBJbmNyZW1lbnQgdGhlIHBsYW50ZXIncyBzY29yZSBieSBgU0NPUkVfSU5DUkVNRU5UYC4KICAgIHB1YiBmbiBpbmNyZW1lbnRfc2NvcmUoZW52OiBFbnYsIHdhbGxldDogQWRkcmVzcykgewogICAgICAgIFNlbGY6OmFzc2VydF9ub3RfcGF1c2VkKCZlbnYpOwogICAgICAgIFNlbGY6OnJlcXVpcmVfYWRtaW4oJmVudik7CgogICAgICAgIGxldCBrZXkgPSBEYXRhS2V5OjpQbGFudGVyKHdhbGxldC5jbG9uZSgpKTsKICAgICAgICBsZXQgbXV0IHJlY29yZDogUGxhbnRlclJlY29yZCA9IGVudgogICAgICAgICAgICAuc3RvcmFnZSgpCiAgICAgICAgICAgIC5wZXJzaXN0ZW50KCkKICAgICAgICAgICAgLmdldCgma2V5KQogICAgICAgICAgICAudW53cmFwX29yX2Vsc2UofHwgcGFuaWNfd2l0aF9lcnJvciEoJmVudiwgRXJyb3I6Ok5vdFJlZ2lzdGVyZWQpKTsKCiAgICAgICAgcmVjb3JkLnNjb3JlID0gcmVjb3JkLnNjb3JlLnNhdHVyYXRpbmdfYWRkKFNDT1JFX0lOQ1JFTUVOVCk7CiAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuc2V0KCZrZXksICZyZWNvcmQpOwoKICAgICAgICBlbnYuZXZlbnRzKCkucHVibGlzaCgKICAgICAgICAgICAgKHN5bWJvbF9zaG9ydCEoIlNjb3JlSW5jIiksIHdhbGxldC5jbG9uZSgpKSwKICAgICAgICAgICAgcmVjb3JkLnNjb3JlLAogICAgICAgICk7CiAgICB9CgogICAgLy8vIFNsYXNoIHRoZSBwbGFudGVyJ3Mgc2NvcmUgYnkgYFNDT1JFX1NMQVNIYC4KICAgIHB1YiBmbiBzbGFzaF9zY29yZShlbnY6IEVudiwgd2FsbGV0OiBBZGRyZXNzKSB7CiAgICAgICAgU2VsZjo6YXNzZXJ0X25vdF9wYXVzZWQoJmVudik7CiAgICAgICAgU2VsZjo6cmVxdWlyZV9hZG1pbigmZW52KTsKCiAgICAgICAgbGV0IGtleSA9IERhdGFLZXk6OlBsYW50ZXIod2FsbGV0LmNsb25lKCkpOwogICAgICAgIGxldCBtdXQgcmVjb3JkOiBQbGFudGVyUmVjb3JkID0gZW52CiAgICAgICAgICAgIC5zdG9yYWdlKCkKICAgICAgICAgICAgLnBlcnNpc3RlbnQoKQogICAgICAgICAgICAuZ2V0KCZrZXkpCiAgICAgICAgICAgIC51bndyYXBfb3JfZWxzZSh8fCBwYW5pY193aXRoX2Vycm9yISgmZW52LCBFcnJvcjo6Tm90UmVnaXN0ZXJlZCkpOwoKICAgICAgICByZWNvcmQuc2NvcmUgPSByZWNvcmQuc2NvcmUuc2F0dXJhdGluZ19zdWIoU0NPUkVfU0xBU0gpOwogICAgICAgIGVudi5zdG9yYWdlKCkucGVyc2lzdGVudCgpLnNldCgma2V5LCAmcmVjb3JkKTsKCiAgICAgICAgZW52LmV2ZW50cygpLnB1Ymxpc2goCiAgICAgICAgICAgIChzeW1ib2xfc2hvcnQhKCJTY29yZVNscyIpLCB3YWxsZXQuY2xvbmUoKSksCiAgICAgICAgICAgIHJlY29yZC5zY29yZSwKICAgICAgICApOwogICAgfQoKICAgIC8vLyBSZWNvcmQgb3V0Y29tZSBhbmQgcmVjb21wdXRlIHNjb3JlIGZyb20gY3VtdWxhdGl2ZSBoaXN0b3J5LgogICAgcHViIGZuIHJlY29yZF9vdXRjb21lKAogICAgICAgIGVudjogRW52LAogICAgICAgIHdhbGxldDogQWRkcmVzcywKICAgICAgICBuZXdfcGxhbnRlZDogdTMyLAogICAgICAgIG5ld19zdXJ2aXZlZDogdTMyLAogICAgICAgIHZlcmlmX3Bhc3NlZDogdTMyLAogICAgICAgIHZlcmlmX3RvdGFsOiB1MzIsCiAgICApIHsKICAgICAgICBTZWxmOjphc3NlcnRfbm90X3BhdXNlZCgmZW52KTsKICAgICAgICBTZWxmOjpyZXF1aXJlX2FkbWluKCZlbnYpOwoKICAgICAgICBsZXQga2V5ID0gRGF0YUtleTo6UGxhbnRlcih3YWxsZXQuY2xvbmUoKSk7CiAgICAgICAgbGV0IG11dCByZWNvcmQ6IFBsYW50ZXJSZWNvcmQgPSBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQoJmtleSkKICAgICAgICAgICAgLnVud3JhcF9vcl9lbHNlKHx8IHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpOb3RSZWdpc3RlcmVkKSk7CgogICAgICAgIHJlY29yZC5zYXBsaW5nc19wbGFudGVkID0gcmVjb3JkLnNhcGxpbmdzX3BsYW50ZWQuc2F0dXJhdGluZ19hZGQobmV3X3BsYW50ZWQpOwogICAgICAgIHJlY29yZC5zYXBsaW5nc19zdXJ2aXZlZCA9IHJlY29yZC5zYXBsaW5nc19zdXJ2aXZlZC5zYXR1cmF0aW5nX2FkZChuZXdfc3Vydml2ZWQpOwogICAgICAgIHJlY29yZC52ZXJpZmljYXRpb25zX3Bhc3NlZCA9IHJlY29yZC52ZXJpZmljYXRpb25zX3Bhc3NlZC5zYXR1cmF0aW5nX2FkZCh2ZXJpZl9wYXNzZWQpOwogICAgICAgIHJlY29yZC52ZXJpZmljYXRpb25zX3RvdGFsID0gcmVjb3JkLnZlcmlmaWNhdGlvbnNfdG90YWwuc2F0dXJhdGluZ19hZGQodmVyaWZfdG90YWwpOwoKICAgICAgICBsZXQgc3Vydml2YWxfc2NvcmUgPSBpZiByZWNvcmQuc2FwbGluZ3NfcGxhbnRlZCA9PSAwIHsKICAgICAgICAgICAgMHUzMgogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgIHJlY29yZC5zYXBsaW5nc19zdXJ2aXZlZC5zYXR1cmF0aW5nX211bCg3MCkgLyByZWNvcmQuc2FwbGluZ3NfcGxhbnRlZAogICAgICAgIH07CgogICAgICAgIGxldCB2ZXJpZmljYXRpb25fc2NvcmUgPSBpZiByZWNvcmQudmVyaWZpY2F0aW9uc190b3RhbCA9PSAwIHsKICAgICAgICAgICAgMHUzMgogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgIHJlY29yZC52ZXJpZmljYXRpb25zX3Bhc3NlZC5zYXR1cmF0aW5nX211bCgzMCkgLyByZWNvcmQudmVyaWZpY2F0aW9uc190b3RhbAogICAgICAgIH07CgogICAgICAgIHJlY29yZC5zY29yZSA9IHN1cnZpdmFsX3Njb3JlLnNhdHVyYXRpbmdfYWRkKHZlcmlmaWNhdGlvbl9zY29yZSk7CiAgICAgICAgZW52LnN0b3JhZ2UoKS5wZXJzaXN0ZW50KCkuc2V0KCZrZXksICZyZWNvcmQpOwoKICAgICAgICBlbnYuZXZlbnRzKCkucHVibGlzaCgKICAgICAgICAgICAgKHN5bWJvbF9zaG9ydCEoIlNjb3JlVXBkIiksIHdhbGxldC5jbG9uZSgpKSwKICAgICAgICAgICAgcmVjb3JkLnNjb3JlLAogICAgICAgICk7CiAgICB9CgogICAgLy8vIFJldHVybiBgdHJ1ZWAgaWYgYHdhbGxldGAgbWVldHMgYG1pbl9zY29yZWAuCiAgICBwdWIgZm4gbWVldHNfbWluX3Njb3JlKGVudjogRW52LCB3YWxsZXQ6IEFkZHJlc3MsIG1pbl9zY29yZTogdTMyKSAtPiBib29sIHsKICAgICAgICBtYXRjaCBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQ6OjxfLCBQbGFudGVyUmVjb3JkPigmRGF0YUtleTo6UGxhbnRlcih3YWxsZXQpKQogICAgICAgIHsKICAgICAgICAgICAgU29tZShyZWNvcmQpID0+IHJlY29yZC5zY29yZSA+PSBtaW5fc2NvcmUsCiAgICAgICAgICAgIE5vbmUgPT4gZmFsc2UsCiAgICAgICAgfQogICAgfQoKICAgIC8vLyBSZXR1cm4gdGhlIHJlcHV0YXRpb24gdGllciBiYWRnZSBmb3IgYSByZWdpc3RlcmVkIHBsYW50ZXIuCiAgICAvLy8KICAgIC8vLyBUaWVycyBhcmUgZGVyaXZlZCBmcm9tIHRoZSBwbGFudGVyJ3MgY3VycmVudCBzY29yZToKICAgIC8vLyAtIFBsYXRpbnVtIDogc2NvcmUgPj0gOTAwCiAgICAvLy8gLSBHb2xkICAgICA6IHNjb3JlID49IDYwMAogICAgLy8vIC0gU2lsdmVyICAgOiBzY29yZSA+PSAzMDAKICAgIC8vLyAtIEJyb256ZSAgIDogc2NvcmUgPCAgMzAwCiAgICBwdWIgZm4gZ2V0X3RpZXIoZW52OiBFbnYsIHdhbGxldDogQWRkcmVzcykgLT4gUmVwdXRhdGlvblRpZXIgewogICAgICAgIGxldCByZWNvcmQ6IFBsYW50ZXJSZWNvcmQgPSBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQoJkRhdGFLZXk6OlBsYW50ZXIod2FsbGV0KSkKICAgICAgICAgICAgLnVud3JhcF9vcl9lbHNlKHx8IHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpOb3RSZWdpc3RlcmVkKSk7CiAgICAgICAgU2VsZjo6c2NvcmVfdG9fdGllcihyZWNvcmQuc2NvcmUpCiAgICB9CgogICAgLy8vIFJldHVybiB0aGUgZmVlIGRpc2NvdW50IGluIGJhc2lzIHBvaW50cyBmb3IgYSByZWdpc3RlcmVkIHBsYW50ZXIuCiAgICAvLy8KICAgIC8vLyB8IFRpZXIgICAgIHwgRGlzY291bnQgICAgIHwKICAgIC8vLyB8LS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLXwKICAgIC8vLyB8IEJyb256ZSAgIHwgMCBicHMgICgwICUpICB8CiAgICAvLy8gfCBTaWx2ZXIgICB8IDUwMCBicHMgKDUgJSkgfAogICAgLy8vIHwgR29sZCAgICAgfCAxNTAwIGJwcyAoMTUlKXwKICAgIC8vLyB8IFBsYXRpbnVtIHwgMzAwMCBicHMgKDMwJSl8CiAgICBwdWIgZm4gZmVlX2Rpc2NvdW50X2JwcyhlbnY6IEVudiwgd2FsbGV0OiBBZGRyZXNzKSAtPiB1MzIgewogICAgICAgIGxldCByZWNvcmQ6IFBsYW50ZXJSZWNvcmQgPSBlbnYKICAgICAgICAgICAgLnN0b3JhZ2UoKQogICAgICAgICAgICAucGVyc2lzdGVudCgpCiAgICAgICAgICAgIC5nZXQoJkRhdGFLZXk6OlBsYW50ZXIod2FsbGV0KSkKICAgICAgICAgICAgLnVud3JhcF9vcl9lbHNlKHx8IHBhbmljX3dpdGhfZXJyb3IhKCZlbnYsIEVycm9yOjpOb3RSZWdpc3RlcmVkKSk7CiAgICAgICAgbGV0IHRpZXIgPSBTZWxmOjpzY29yZV90b190aWVyKHJlY29yZC5zY29yZSk7CiAgICAgICAgbWF0Y2ggdGllciB7CiAgICAgICAgICAgIFJlcHV0YXRpb25UaWVyOjpCcm9uemUgICA9PiBESVNDT1VOVF9CUk9OWkVfQlBTLAogICAgICAgICAgICBSZXB1dGF0aW9uVGllcjo6U2lsdmVyICAgPT4gRElTQ09VTlRfU0lMVkVSX0JQUywKICAgICAgICAgICAgUmVwdXRhdGlvblRpZXI6OkdvbGQgICAgID0+IERJU0NPVU5UX0dPTERfQlBTLAogICAgICAgICAgICBSZXB1dGF0aW9uVGllcjo6UGxhdGludW0gPT4gRElTQ09VTlRfUExBVElOVU1fQlBTLAogICAgICAgIH0KICAgIH0KCiAgICAvLyBpbnRlcm5hbAoKICAgIGZuIGNvbmZpZyhlbnY6ICZFbnYpIC0+IChBZGRyZXNzLCBBZGRyZXNzLCBpMTI4KSB7CiAgICAgICAgZW52LnN0b3JhZ2UoKQogICAgICAgICAgICAuaW5zdGFuY2UoKQogICAgICAgICAgICAuZ2V0KCZEYXRhS2V5OjpDb25maWcpCiAgICAgICAgICAgIC51bndyYXBfb3JfZWxzZSh8fCBwYW5pY193aXRoX2Vycm9yIShlbnYsIEVycm9yOjpOb3RJbml0aWFsaXplZCkpCiAgICB9CgogICAgZm4gYWRtaW5fY29udHJvbHMoZW52OiAmRW52KSAtPiBBZGRyZXNzIHsKICAgICAgICBlbnYuc3RvcmFnZSgpCiAgICAgICAgICAgIC5pbnN0YW5jZSgpCiAgICAgICAgICAgIC5nZXQoJnN5bWJvbF9zaG9ydCEoIkFETUMiKSkKICAgICAgICAgICAgLnVud3JhcF9vcl9lbHNlKHx8IHBhbmljX3dpdGhfZXJyb3IhKGVudiwgRXJyb3I6Ok5vdEluaXRpYWxpemVkKSkKICAgIH0KCiAgICBmbiBhc3NlcnRfbm90X3BhdXNlZChlbnY6ICZFbnYpIHsKICAgICAgICBsZXQgYWRtaW5fY29udHJvbHNfYWRkciA9IFNlbGY6OmFkbWluX2NvbnRyb2xzKGVudik7CiAgICAgICAgbGV0IGFkbWluX2NvbnRyb2xzX2NsaWVudCA9IEFkbWluQ29udHJvbHNDbGllbnQ6Om5ldyhlbnYsICZhZG1pbl9jb250cm9sc19hZGRyKTsKICAgICAgICBhZG1pbl9jb250cm9sc19jbGllbnQuYXNzZXJ0X25vdF9wYXVzZWQoKTsKICAgIH0KCiAgICBmbiByZXF1aXJlX2FkbWluKGVudjogJkVudikgewogICAgICAgIGxldCAoYWRtaW4sIF8sIF8pID0gU2VsZjo6Y29uZmlnKGVudik7CiAgICAgICAgYWRtaW4ucmVxdWlyZV9hdXRoKCk7CiAgICB9CgogICAgLy8vIENvbnZlcnQgYSBzY29yZSB2YWx1ZSB0byB0aGUgY29ycmVzcG9uZGluZyBgUmVwdXRhdGlvblRpZXJgLgogICAgZm4gc2NvcmVfdG9fdGllcihzY29yZTogdTMyKSAtPiBSZXB1dGF0aW9uVGllciB7CiAgICAgICAgaWYgc2NvcmUgPj0gVElFUl9QTEFUSU5VTV9NSU4gewogICAgICAgICAgICBSZXB1dGF0aW9uVGllcjo6UGxhdGludW0KICAgICAgICB9IGVsc2UgaWYgc2NvcmUgPj0gVElFUl9HT0xEX01JTiB7CiAgICAgICAgICAgIFJlcHV0YXRpb25UaWVyOjpHb2xkCiAgICAgICAgfSBlbHNlIGlmIHNjb3JlID49IFRJRVJfU0lMVkVSX01JTiB7CiAgICAgICAgICAgIFJlcHV0YXRpb25UaWVyOjpTaWx2ZXIKICAgICAgICB9IGVsc2UgewogICAgICAgICAgICBSZXB1dGF0aW9uVGllcjo6QnJvbnplCiAgICAgICAgfQogICAgfQp9CgojW2NmZyh0ZXN0KV0KbW9kIHRlc3RzIHsKICAgIHVzZSBzdXBlcjo6KjsKICAgIHVzZSBzb3JvYmFuX3Nkazo6e3Rlc3R1dGlsczo6QWRkcmVzcyBhcyBfLCB0b2tlbiwgQWRkcmVzcywgQnl0ZXNOLCBFbnYsIFN0cmluZ307CgogICAgc3RydWN0IEN0eCB7CiAgICAgICAgZW52OiBFbnYsCiAgICAgICAgYWRtaW46IEFkZHJlc3MsCiAgICAgICAgcGxhbnRlcjogQWRkcmVzcywKICAgICAgICB0b2tlbjogQWRkcmVzcywKICAgICAgICBjbGllbnQ6IFBsYW50ZXJSZWdpc3RyeUNsaWVudDwnc3RhdGljPiwKICAgIH0KCiAgICBmbiBzZXR1cCgpIC0+IEN0eCB7CiAgICAgICAgc2V0dXBfd2l0aF9taW4oMV8wMDApCiAgICB9CgogICAgZm4gc2V0dXBfd2l0aF9taW4obWluX3N0YWtlOiBpMTI4KSAtPiBDdHggewogICAgICAgIGxldCBlbnYgPSBFbnY6OmRlZmF1bHQoKTsKICAgICAgICBlbnYubW9ja19hbGxfYXV0aHMoKTsKCiAgICAgICAgbGV0IGNvbnRyYWN0X2lkID0gZW52LnJlZ2lzdGVyX2NvbnRyYWN0KE5vbmUsIFBsYW50ZXJSZWdpc3RyeSk7CiAgICAgICAgbGV0IGNsaWVudCA9IFBsYW50ZXJSZWdpc3RyeUNsaWVudDo6bmV3KCZlbnYsICZjb250cmFjdF9pZCk7CgogICAgICAgIGxldCBhZG1pbiA9IEFkZHJlc3M6OmdlbmVyYXRlKCZlbnYpOwogICAgICAgIGxldCBwbGFudGVyID0gQWRkcmVzczo6Z2VuZXJhdGUoJmVudik7CiAgICAgICAgbGV0IHRva2VuID0gZW52CiAgICAgICAgICAgIC5yZWdpc3Rlcl9zdGVsbGFyX2Fzc2V0X2NvbnRyYWN0X3YyKGFkbWluLmNsb25lKCkpCiAgICAgICAgICAgIC5hZGRyZXNzKCk7CgogICAgICAgIHRva2VuOjpTdGVsbGFyQXNzZXRDbGllbnQ6Om5ldygmZW52LCAmdG9rZW4pLm1pbnQoJnBsYW50ZXIsICYxMF8wMDApOwogICAgICAgIGNsaWVudC5pbml0aWFsaXplKCZhZG1pbiwgJnRva2VuLCAmbWluX3N0YWtlKTsKCiAgICAgICAgQ3R4IHsgZW52LCBhZG1pbiwgcGxhbnRlciwgdG9rZW4sIGNsaWVudCB9CiAgICB9CgogICAgZm4gYmFsYW5jZShlbnY6ICZFbnYsIHRva2VuOiAmQWRkcmVzcywgd2hvOiAmQWRkcmVzcykgLT4gaTEyOCB7CiAgICAgICAgdG9rZW46OkNsaWVudDo6bmV3KGVudiwgdG9rZW4pLmJhbGFuY2Uod2hvKQogICAgfQoKICAgIGZuIG5hbWVfaGFzaChlbnY6ICZFbnYsIHNlZWQ6IHU4KSAtPiBCeXRlc048MzI+IHsKICAgICAgICBCeXRlc046OmZyb21fYXJyYXkoZW52LCAmW3NlZWQ7IDMyXSkKICAgIH0KCiAgICAjW3Rlc3RdCiAgICAjW3Nob3VsZF9wYW5pYyhleHBlY3RlZCA9ICJFcnJvcihDb250cmFjdCwgIzEpIildCiAgICBmbiBkb3VibGVfaW5pdF9yZWplY3RlZCgpIHsKICAgICAgICBsZXQgY3R4ID0gc2V0dXAoKTsKICAgICAgICBjdHguY2xpZW50LmluaXRpYWxpemUoJmN0eC5hZG1pbiwgJmN0eC50b2tlbiwgJjFfMDAwKTsKICAgIH0KCiAgICAjW3Rlc3RdCiAgICBmbiBzdGFrZV90cmFuc2ZlcnNfdG9rZW5zKCkgewogICAgICAgIGxldCBjdHggPSBzZXR1cCgpOwogICAgICAgIGxldCBwcmUgPSBiYWxhbmNlKCZjdHguZW52LCAmY3R4LnRva2VuLCAmY3R4LnBsYW50ZXIpOwogICAgICAgIGN0eC5jbGllbnQuc3Rha2VfdG9fYXBwbHkoJmN0eC5wbGFudGVyLCAmMl8wMDApOwogICAgICAgIGFzc2VydF9lcSEoYmFsYW5jZSgmY3R4LmVudiwgJmN0eC50b2tlbiwgJmN0eC5wbGFudGVyKSwgcHJlIC0gMl8wMDApOwoKICAgICAgICBsZXQgcmVjID0gY3R4LmNsaWVudC5nZXRfc3Rha2UoJmN0eC5wbGFudGVyKS51bndyYXAoKTsKICAgICAgICBhc3NlcnRfZXEhKHJlYy5hbW91bnQsIDJfMDAwKTsKICAgIH0KCiAgICAjW3Rlc3RdCiAgICBmbiBpc19lbGlnaWJsZV9hZnRlcl9zdGFrZSgpIHsKICAgICAgICBsZXQgY3R4ID0gc2V0dXAoKTsKICAgICAgICBhc3NlcnQhKCFjdHguY2xpZW50LmlzX2VsaWdpYmxlKCZjdHgucGxhbnRlcikpOwogICAgICAgIGN0eC5jbGllbnQuc3Rha2VfdG9fYXBwbHkoJmN0eC5wbGFudGVyLCAmMV8wMDApOwogICAgICAgIGFzc2VydCEoY3R4LmNsaWVudC5pc19lbGlnaWJsZSgmY3R4LnBsYW50ZXIpKTsKICAgIH0KCiAgICAjW3Rlc3RdCiAgICBmbiBzdGFrZV9hbmRfdW5zdGFrZV9yZXR1cm5zX3Rva2VucygpIHsKICAgICAgICBsZXQgY3R4ID0gc2V0dXAoKTsKICAgICAgICBsZXQgcHJlID0gYmFsYW5jZSgmY3R4LmVudiwgJmN0eC50b2tlbiwgJmN0eC5wbGFudGVyKTsKICAgICAgICBjdHguY2xpZW50LnN0YWtlX3RvX2FwcGx5KCZjdHgucGxhbnRlciwgJjJfMDAwKTsKICAgICAgICBjdHguY2xpZW50LnVuc3Rha2UoJmN0eC5wbGFudGVyKTsKICAgICAgICBhc3NlcnRfZXEhKGJhbGFuY2UoJmN0eC5lbnYsICZjdHgudG9rZW4sICZjdHgucGxhbnRlciksIHByZSk7CiAgICB9CgogICAgI1t0ZXN0XQogICAgZm4gcmVnaXN0ZXJfYW5kX2dldCgpIHsKICAgICAgICBsZXQgY3R4ID0gc2V0dXAoKTsKICAgICAgICBjdHguY2xpZW50LnN0YWtlX3RvX2FwcGx5KCZjdHgucGxhbnRlciwgJjFfMDAwKTsKICAgICAgICBsZXQgcmVjb3JkID0gY3R4LmNsaWVudC5yZWdpc3Rlcl9wbGFudGVyKAogICAgICAgICAgICAmY3R4LnBsYW50ZXIsCiAgICAgICAgICAgICZuYW1lX2hhc2goJmN0eC5lbnYsIDEpLAogICAgICAgICAgICAmU3RyaW5nOjpmcm9tX3N0cigmY3R4LmVudiwgInMxIiksCiAgICAgICAgKTsKICAgICAgICBhc3NlcnRfZXEhKHJlY29yZC53YWxsZXQsIGN0eC5wbGFudGVyKTsKICAgICAgICBhc3NlcnRfZXEhKHJlY29yZC5zY29yZSwgSU5JVElBTF9TQ09SRSk7CiAgICB9CgogICAgLy8gVGllciB0ZXN0cwoKICAgIGZuIHJlZ2lzdGVyX3dpdGhfc2NvcmUoY3R4OiAmQ3R4LCBzZWVkOiB1OCkgLT4gQWRkcmVzcyB7CiAgICAgICAgbGV0IHBsYW50ZXIgPSBBZGRyZXNzOjpnZW5lcmF0ZSgmY3R4LmVudik7CiAgICAgICAgdG9rZW46OlN0ZWxsYXJBc3NldENsaWVudDo6bmV3KCZjdHguZW52LCAmY3R4LnRva2VuKS5taW50KCZwbGFudGVyLCAmMTBfMDAwKTsKICAgICAgICBjdHguY2xpZW50LnN0YWtlX3RvX2FwcGx5KCZwbGFudGVyLCAmMV8wMDApOwogICAgICAgIGN0eC5jbGllbnQucmVnaXN0ZXJfcGxhbnRlcigmcGxhbnRlciwgJm5hbWVfaGFzaCgmY3R4LmVudiwgc2VlZCksICZTdHJpbmc6OmZyb21fc3RyKCZjdHguZW52LCAiciIpKTsKICAgICAgICBwbGFudGVyCiAgICB9CgogICAgI1t0ZXN0XQogICAgZm4gbmV3X3BsYW50ZXJfc3RhcnRzX2Jyb256ZSgpIHsKICAgICAgICBsZXQgY3R4ID0gc2V0dXAoKTsKICAgICAgICBsZXQgcGxhbnRlciA9IHJlZ2lzdGVyX3dpdGhfc2NvcmUoJmN0eCwgNTApOwogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5nZXRfdGllcigmcGxhbnRlciksIFJlcHV0YXRpb25UaWVyOjpCcm9uemUpOwogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5mZWVfZGlzY291bnRfYnBzKCZwbGFudGVyKSwgMCk7CiAgICB9CgogICAgI1t0ZXN0XQogICAgZm4gc2lsdmVyX3RpZXJfYXRfMzAwKCkgewogICAgICAgIGxldCBjdHggPSBzZXR1cCgpOwogICAgICAgIGxldCBwbGFudGVyID0gcmVnaXN0ZXJfd2l0aF9zY29yZSgmY3R4LCA1MSk7CiAgICAgICAgZm9yIF8gaW4gMC4uMjAgewogICAgICAgICAgICBjdHguY2xpZW50LmluY3JlbWVudF9zY29yZSgmcGxhbnRlcik7CiAgICAgICAgfQogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5nZXRfdGllcigmcGxhbnRlciksIFJlcHV0YXRpb25UaWVyOjpTaWx2ZXIpOwogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5mZWVfZGlzY291bnRfYnBzKCZwbGFudGVyKSwgNTAwKTsKICAgIH0KCiAgICAjW3Rlc3RdCiAgICBmbiBnb2xkX3RpZXJfYXRfNjAwKCkgewogICAgICAgIGxldCBjdHggPSBzZXR1cCgpOwogICAgICAgIGxldCBwbGFudGVyID0gcmVnaXN0ZXJfd2l0aF9zY29yZSgmY3R4LCA1Mik7CiAgICAgICAgZm9yIF8gaW4gMC4uNTAgewogICAgICAgICAgICBjdHguY2xpZW50LmluY3JlbWVudF9zY29yZSgmcGxhbnRlcik7CiAgICAgICAgfQogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5nZXRfdGllcigmcGxhbnRlciksIFJlcHV0YXRpb25UaWVyOjpHb2xkKTsKICAgICAgICBhc3NlcnRfZXEhKGN0eC5jbGllbnQuZmVlX2Rpc2NvdW50X2JwcygmcGxhbnRlciksIDE1MDApOwogICAgfQoKICAgICNbdGVzdF0KICAgIGZuIHBsYXRpbnVtX3RpZXJfYXRfOTAwKCkgewogICAgICAgIGxldCBjdHggPSBzZXR1cCgpOwogICAgICAgIGxldCBwbGFudGVyID0gcmVnaXN0ZXJfd2l0aF9zY29yZSgmY3R4LCA1Myk7CiAgICAgICAgZm9yIF8gaW4gMC4uODAgewogICAgICAgICAgICBjdHguY2xpZW50LmluY3JlbWVudF9zY29yZSgmcGxhbnRlcik7CiAgICAgICAgfQogICAgICAgIGFzc2VydF9lcSEoY3R4LmNsaWVudC5nZXRfdGllcigmcGxhbnRlciksIFJlcHV0YXRpb25UaWVyOjpQbGF0aW51bSk7CiAgICAgICAgYXNzZXJ0X2VxIShjdHguY2xpZW50LmZlZV9kaXNjb3VudF9icHMoJnBsYW50ZXIpLCAzMDAwKTsKICAgIH0KCiAgICAjW3Rlc3RdCiAgICAjW3Nob3VsZF9wYW5pYyhleHBlY3RlZCA9ICJFcnJvcihDb250cmFjdCwgIzQpIildCiAgICBmbiBnZXRfdGllcl91bnJlZ2lzdGVyZWRfcGFuaWNzKCkgewogICAgICAgIGxldCBjdHggPSBzZXR1cCgpOwogICAgICAgIGN0eC5jbGllbnQuZ2V0X3RpZXIoJkFkZHJlc3M6OmdlbmVyYXRlKCZjdHguZW52KSk7CiAgICB9CgogICAgI1t0ZXN0XQogICAgI1tzaG91bGRfcGFuaWMoZXhwZWN0ZWQgPSAiRXJyb3IoQ29udHJhY3QsICM0KSIpXQogICAgZm4gZmVlX2Rpc2NvdW50X3VucmVnaXN0ZXJlZF9wYW5pY3MoKSB7CiAgICAgICAgbGV0IGN0eCA9IHNldHVwKCk7CiAgICAgICAgY3R4LmNsaWVudC5mZWVfZGlzY291bnRfYnBzKCZBZGRyZXNzOjpnZW5lcmF0ZSgmY3R4LmVudikpOwogICAgfQp9Cg==