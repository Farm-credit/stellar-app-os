#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, IntoVal, String, Vec,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerProfile {
    pub wallet_address: Address,
    pub land_doc_hash: BytesN<32>,
    pub region_geohash: String,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum KycStatus {
    Pending,
    Verified,
    Rejected,
}

/// One on-chain attestation by a registered verifier. Stored as an append-only
/// history per farmer so older statuses are preserved alongside the current one.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct KycAttestation {
    pub farmer_id: Address,
    pub verifier: Address,
    pub status: KycStatus,
    pub attested_at: u64,
}

#[contracttype]
enum DataKey {
    Admin,
    /// Set of registered verifier addresses (only these can attest KYC).
    Verifier(Address),
    /// Append-only attestation history for a farmer.
    KycHistory(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FarmerRegistry;

#[contractimpl]
impl FarmerRegistry {
    /// Initialize contract
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // ── Verifier registration (KYC #398) ──────────────────────────────────────

    /// Admin registers an address as an authorised KYC verifier.
    pub fn register_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let key = DataKey::Verifier(verifier.clone());
        if env.storage().persistent().has(&key) {
            panic!("verifier already registered");
        }
        env.storage().persistent().set(&key, &true);
        env.events()
            .publish((symbol_short!("verifreg"), verifier), ());
    }

    /// Admin removes a previously-registered verifier. Past attestations
    /// remain in history; the verifier just cannot make new ones.
    pub fn remove_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let key = DataKey::Verifier(verifier.clone());
        if !env.storage().persistent().has(&key) {
            panic!("verifier not registered");
        }
        env.storage().persistent().remove(&key);
        env.events()
            .publish((symbol_short!("verifrem"), verifier), ());
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Verifier(verifier))
    }

    /// A registered verifier attests to the KYC `status` of `farmer_id`.
    /// Each call appends to the farmer's attestation history; the most recent
    /// entry is treated as the current status.
    pub fn attest_kyc(env: Env, verifier: Address, farmer_id: Address, status: KycStatus) {
        verifier.require_auth();

        if !env.storage()
            .persistent()
            .has(&DataKey::Verifier(verifier.clone()))
        {
            panic!("caller is not a registered verifier");
        }

        let history_key = DataKey::KycHistory(farmer_id.clone());
        let mut history: Vec<KycAttestation> = env
            .storage()
            .persistent()
            .get(&history_key)
            .unwrap_or_else(|| Vec::new(&env));

        let attestation = KycAttestation {
            farmer_id: farmer_id.clone(),
            verifier: verifier.clone(),
            status: status.clone(),
            attested_at: env.ledger().timestamp(),
        };
        history.push_back(attestation);
        env.storage().persistent().set(&history_key, &history);

        env.events()
            .publish((symbol_short!("kycattst"), farmer_id), (verifier, status));
    }

    /// Returns the latest KYC status for `farmer_id`, or `Pending` if none.
    pub fn get_kyc_status(env: Env, farmer_id: Address) -> KycStatus {
        let history: Option<Vec<KycAttestation>> = env
            .storage()
            .persistent()
            .get(&DataKey::KycHistory(farmer_id));
        match history {
            Some(h) if h.len() > 0 => h.get(h.len() - 1).unwrap().status,
            _ => KycStatus::Pending,
        }
    }

    /// Returns the full append-only attestation history for `farmer_id`.
    pub fn get_kyc_history(env: Env, farmer_id: Address) -> Vec<KycAttestation> {
        env.storage()
            .persistent()
            .get(&DataKey::KycHistory(farmer_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract not initialized");
        admin.require_auth();
    }

    /// Register a farmer
    pub fn register_farmer(
        env: Env,
        wallet_address: Address,
        land_doc_hash: BytesN<32>,
        region_geohash: String,
    ) -> FarmerProfile {
        wallet_address.require_auth();

        Self::assert_valid_region(&env, &region_geohash);

        let key = Self::farmer_key(&env, &wallet_address);

        if env.storage().persistent().has(&key) {
            panic!("farmer already registered");
        }

        let profile = FarmerProfile {
            wallet_address: wallet_address.clone(),
            land_doc_hash,
            region_geohash,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &profile);

        env.events().publish(
            (symbol_short!("FarmerReg"), wallet_address.clone()),
            profile.clone(),
        );

        profile
    }

    /// Get farmer profile
    pub fn get_farmer(env: Env, wallet_address: Address) -> Option<FarmerProfile> {
        env.storage()
            .persistent()
            .get(&Self::farmer_key(&env, &wallet_address))
    }

    /// Check if registered
    pub fn is_registered(env: Env, wallet_address: Address) -> bool {
        env.storage()
            .persistent()
            .has(&Self::farmer_key(&env, &wallet_address))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn farmer_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("FARMER"), wallet.clone()).into_val(env)
    }

    /// Northern Nigeria geohash validation (2-char prefixes)
    fn assert_valid_region(env: &Env, region: &String) {
        const VALID: [&str; 9] = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

        for prefix in VALID {
            if *region == String::from_str(env, prefix) {
                return;
            }
        }

        panic!("region is not within the approved Northern Nigeria geohash boundary");
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    fn setup() -> (Env, Address, FarmerRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, FarmerRegistry);
        let client = FarmerRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        (env, admin, client)
    }

    fn land_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_register_and_get() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let profile = client.register_farmer(
            &farmer,
            &land_hash(&env, 1),
            &String::from_str(&env, "s1"),
        );

        assert_eq!(profile.wallet_address, farmer);
        assert!(client.is_registered(&farmer));

        let stored = client.get_farmer(&farmer).unwrap();
        assert_eq!(stored.region_geohash, String::from_str(&env, "s1"));
    }

    #[test]
    #[should_panic(expected = "farmer already registered")]
    fn test_double_registration_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));
        client.register_farmer(&farmer, &land_hash(&env, 2), &String::from_str(&env, "s2"));
    }

    #[test]
    #[should_panic(expected = "region is not within the approved Northern Nigeria geohash boundary")]
    fn test_invalid_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "e7"));
    }

    #[test]
    fn test_all_valid_regions() {
        let (env, _, client) = setup();
        let prefixes = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

        for (i, prefix) in prefixes.iter().enumerate() {
            let farmer = Address::generate(&env);

            client.register_farmer(
                &farmer,
                &land_hash(&env, i as u8),
                &String::from_str(&env, prefix),
            );

            assert!(client.is_registered(&farmer));
        }
    }

    #[test]
    fn test_nonexistent_farmer() {
        let (env, _, client) = setup();
        let stranger = Address::generate(&env);

        assert!(client.get_farmer(&stranger).is_none());
    }

    // ── KYC attestation (#398) ────────────────────────────────────────────────

    #[test]
    fn test_kyc_default_status_is_pending() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Pending);
        assert_eq!(client.get_kyc_history(&farmer).len(), 0);
    }

    #[test]
    fn test_kyc_attest_verified_then_query() {
        let (env, _, client) = setup();
        let verifier = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.register_verifier(&verifier);
        assert!(client.is_verifier(&verifier));

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
        let h = client.get_kyc_history(&farmer);
        assert_eq!(h.len(), 1);
        assert_eq!(h.get(0).unwrap().verifier, verifier);
        assert_eq!(h.get(0).unwrap().status, KycStatus::Verified);
    }

    #[test]
    fn test_kyc_history_preserves_all_status_transitions() {
        let (env, _, client) = setup();
        let verifier = Address::generate(&env);
        let farmer = Address::generate(&env);
        client.register_verifier(&verifier);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Pending);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);

        let h = client.get_kyc_history(&farmer);
        assert_eq!(h.len(), 3);
        assert_eq!(h.get(0).unwrap().status, KycStatus::Pending);
        assert_eq!(h.get(1).unwrap().status, KycStatus::Rejected);
        assert_eq!(h.get(2).unwrap().status, KycStatus::Verified);
        // Latest entry wins for the current status.
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    #[should_panic(expected = "caller is not a registered verifier")]
    fn test_kyc_unregistered_attestation_rejected() {
        let (env, _, client) = setup();
        let impostor = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.attest_kyc(&impostor, &farmer, &KycStatus::Verified);
    }

    #[test]
    #[should_panic(expected = "caller is not a registered verifier")]
    fn test_kyc_removed_verifier_cannot_attest() {
        let (env, _, client) = setup();
        let verifier = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.register_verifier(&verifier);
        client.remove_verifier(&verifier);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
    }

    #[test]
    fn test_kyc_status_queryable_by_anyone() {
        // Anyone can read; no auth required on the query.
        let (env, _, client) = setup();
        let verifier = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.register_verifier(&verifier);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);

        // Query from a stranger context — succeeds because there's no auth check.
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    fn test_kyc_multiple_verifiers_each_can_attest() {
        let (env, _, client) = setup();
        let v1 = Address::generate(&env);
        let v2 = Address::generate(&env);
        let farmer = Address::generate(&env);
        client.register_verifier(&v1);
        client.register_verifier(&v2);

        client.attest_kyc(&v1, &farmer, &KycStatus::Pending);
        client.attest_kyc(&v2, &farmer, &KycStatus::Verified);

        let h = client.get_kyc_history(&farmer);
        assert_eq!(h.len(), 2);
        assert_eq!(h.get(0).unwrap().verifier, v1);
        assert_eq!(h.get(1).unwrap().verifier, v2);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    #[should_panic(expected = "verifier already registered")]
    fn test_kyc_double_register_verifier_rejected() {
        let (env, _, client) = setup();
        let v = Address::generate(&env);
        client.register_verifier(&v);
        client.register_verifier(&v);
    }

    #[test]
    #[should_panic(expected = "verifier not registered")]
    fn test_kyc_remove_unregistered_verifier_rejected() {
        let (env, _, client) = setup();
        let v = Address::generate(&env);
        client.remove_verifier(&v);
    }
}