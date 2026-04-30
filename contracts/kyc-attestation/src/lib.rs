#![no_std]

//! KYC Attestation Contract — Closes #398
//!
//! Verifier-gated on-chain KYC system. Only registered verifiers may attest
//! a farmer's KYC status. History is append-only; the latest status is
//! queryable publicly.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Vec,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum KycStatus {
    Pending,
    Verified,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attestation {
    pub verifier: Address,
    pub status: KycStatus,
    pub timestamp: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

fn verifier_key(env: &Env, verifier: &Address) -> soroban_sdk::Val {
    (symbol_short!("VRF"), verifier.clone()).into_val(env)
}

fn status_key(env: &Env, farmer_id: &Address) -> soroban_sdk::Val {
    (symbol_short!("KYC_STS"), farmer_id.clone()).into_val(env)
}

fn history_key(env: &Env, farmer_id: &Address) -> soroban_sdk::Val {
    (symbol_short!("KYC_HST"), farmer_id.clone()).into_val(env)
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct KycAttestation;

#[contractimpl]
impl KycAttestation {
    /// Initialize the contract and set the admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Register a verifier. Only callable by admin.
    pub fn register_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        if admin != stored_admin {
            panic!("caller is not admin");
        }
        env.storage()
            .persistent()
            .set(&verifier_key(&env, &verifier), &true);
    }

    /// Attest a farmer's KYC status. Only registered verifiers may call this.
    /// Always appends to history — never overwrites past attestations.
    pub fn attest_kyc(env: Env, verifier: Address, farmer_id: Address, status: KycStatus) {
        verifier.require_auth();

        let is_verifier: bool = env
            .storage()
            .persistent()
            .get(&verifier_key(&env, &verifier))
            .unwrap_or(false);
        if !is_verifier {
            panic!("caller is not a registered verifier");
        }

        let attestation = Attestation {
            verifier: verifier.clone(),
            status: status.clone(),
            timestamp: env.ledger().timestamp(),
        };

        // Append to history (never overwrite)
        let hkey = history_key(&env, &farmer_id);
        let mut history: Vec<Attestation> = env
            .storage()
            .persistent()
            .get(&hkey)
            .unwrap_or(Vec::new(&env));
        history.push_back(attestation);
        env.storage().persistent().set(&hkey, &history);

        // Update latest status
        env.storage()
            .persistent()
            .set(&status_key(&env, &farmer_id), &status);

        env.events().publish(
            (symbol_short!("KYCAttest"), farmer_id.clone()),
            (verifier, status),
        );
    }

    /// Returns the current KYC status of a farmer. Defaults to Pending.
    pub fn get_kyc_status(env: Env, farmer_id: Address) -> KycStatus {
        env.storage()
            .persistent()
            .get(&status_key(&env, &farmer_id))
            .unwrap_or(KycStatus::Pending)
    }

    /// Returns the full attestation history for a farmer.
    pub fn get_kyc_history(env: Env, farmer_id: Address) -> Vec<Attestation> {
        env.storage()
            .persistent()
            .get(&history_key(&env, &farmer_id))
            .unwrap_or(Vec::new(&env))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, Address, KycAttestationClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, KycAttestation);
        let client = KycAttestationClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin);
        client.register_verifier(&admin, &verifier);

        (env, admin, verifier, client)
    }

    #[test]
    fn test_verifier_can_attest() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    #[should_panic(expected = "caller is not a registered verifier")]
    fn test_non_verifier_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.attest_kyc(&attacker, &farmer, &KycStatus::Verified);
    }

    #[test]
    fn test_pending_to_verified_transition() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        // Default is Pending
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Pending);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    fn test_verified_to_rejected_transition() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Rejected);
    }

    #[test]
    fn test_history_preserved_across_attestations() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Pending);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        let history = client.get_kyc_history(&farmer);
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap().status, KycStatus::Pending);
        assert_eq!(history.get(1).unwrap().status, KycStatus::Verified);
        assert_eq!(history.get(2).unwrap().status, KycStatus::Rejected);
    }

    #[test]
    fn test_public_query_works() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Pending);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    fn test_history_append_only_not_overwritten() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        let history = client.get_kyc_history(&farmer);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().status, KycStatus::Verified);
        assert_eq!(history.get(1).unwrap().status, KycStatus::Rejected);
    }
}
