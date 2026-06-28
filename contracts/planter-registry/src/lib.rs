#![no_std]

//! Planter Registry Contract — Closes #459
//!
//! Planters must register on-chain before accepting jobs.
//! Tracks reputation scores that can be incremented (by escrow on successful
//! completion) or slashed (on dispute resolution).  A minimum score threshold
//! can be checked before high-value job acceptance.

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error, symbol_short,
    Address, BytesN, Env, IntoVal, String,
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

    /// Register a new planter.
    ///
    /// The wallet must sign the transaction.  Starting score is `INITIAL_SCORE`.
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
            region,
            score: INITIAL_SCORE,
            registered_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&Self::planter_key(&env, &wallet), &record);

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

    // ── internal ──────────────────────────────────────────────────────────────

    fn planter_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("PLANTER"), wallet.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
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

        // Slash many times to drive score to zero without panicking.
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

        // Score is now INITIAL_SCORE - SCORE_SLASH
        assert!(!client.meets_min_score(&planter, &INITIAL_SCORE));
        assert!(client.meets_min_score(&planter, &(INITIAL_SCORE - SCORE_SLASH)));
    }

    #[test]
    fn test_meets_min_score_unregistered_returns_false() {
        let (env, _, client) = setup();
        assert!(!client.meets_min_score(&Address::generate(&env), &0u32));
    }
}
