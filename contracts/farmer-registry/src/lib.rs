#![no_std]

//! Farmer Registry Contract — Closes #391
//!
//! Adds `update_profile` with full change history stored in Persistent storage
//! keyed by `(farmer_id, version)`. Each update increments a version counter
//! and emits a `ProfileUpdated` event carrying the old and new data hashes.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, IntoVal, String,
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

/// Snapshot of a profile at a given version, stored for audit history.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProfileHistoryEntry {
    pub version: u32,
    pub profile: FarmerProfile,
    pub updated_at: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FarmerRegistry;

#[contractimpl]
impl FarmerRegistry {
    /// Initialize contract
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
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

        // Store initial history entry at version 0
        let version: u32 = 0;
        let history_key = Self::history_key(&env, &wallet_address, version);
        let entry = ProfileHistoryEntry {
            version,
            profile: profile.clone(),
            updated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&history_key, &entry);

        // Initialise version counter to 0
        let version_key = Self::version_counter_key(&env, &wallet_address);
        env.storage().persistent().set(&version_key, &version);

        env.events().publish(
            (symbol_short!("FarmerReg"), wallet_address.clone()),
            profile.clone(),
        );

        profile
    }

    /// Update a farmer's profile. Only the registered farmer can call this.
    ///
    /// Stores the previous profile in Persistent storage keyed by
    /// `(farmer_id, version)`, increments the version counter, and emits a
    /// `ProfileUpdated` event containing the old and new data hashes.
    pub fn update_profile(
        env: Env,
        wallet_address: Address,
        new_land_doc_hash: BytesN<32>,
        new_region_geohash: String,
    ) -> FarmerProfile {
        // Only the farmer themselves can update their profile
        wallet_address.require_auth();

        Self::assert_valid_region(&env, &new_region_geohash);

        let key = Self::farmer_key(&env, &wallet_address);
        let old_profile: FarmerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("farmer not registered");

        // Increment version counter
        let version_key = Self::version_counter_key(&env, &wallet_address);
        let old_version: u32 = env
            .storage()
            .persistent()
            .get(&version_key)
            .unwrap_or(0u32);
        let new_version = old_version + 1;
        env.storage().persistent().set(&version_key, &new_version);

        // Archive old profile under (wallet_address, old_version)
        let history_key = Self::history_key(&env, &wallet_address, old_version);
        let history_entry = ProfileHistoryEntry {
            version: old_version,
            profile: old_profile.clone(),
            updated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&history_key, &history_entry);

        // Build updated profile (preserve original registration timestamp)
        let new_profile = FarmerProfile {
            wallet_address: wallet_address.clone(),
            land_doc_hash: new_land_doc_hash.clone(),
            region_geohash: new_region_geohash,
            registered_at: old_profile.registered_at,
        };

        env.storage().persistent().set(&key, &new_profile);

        // Emit ProfileUpdated with old and new data hashes
        env.events().publish(
            (symbol_short!("ProfUpd"), wallet_address.clone()),
            (old_profile.land_doc_hash, new_land_doc_hash, new_version),
        );

        new_profile
    }

    /// Returns a specific history entry for a farmer by version number.
    /// Version 0 is the initial registration snapshot.
    pub fn get_profile_history(
        env: Env,
        wallet_address: Address,
        version: u32,
    ) -> Option<ProfileHistoryEntry> {
        let history_key = Self::history_key(&env, &wallet_address, version);
        env.storage().persistent().get(&history_key)
    }

    /// Returns the current version counter for a farmer.
    pub fn get_version(env: Env, wallet_address: Address) -> u32 {
        let version_key = Self::version_counter_key(&env, &wallet_address);
        env.storage()
            .persistent()
            .get(&version_key)
            .unwrap_or(0u32)
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

    fn version_counter_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("VER"), wallet.clone()).into_val(env)
    }

    fn history_key(env: &Env, wallet: &Address, version: u32) -> soroban_sdk::Val {
        (symbol_short!("HIST"), wallet.clone(), version).into_val(env)
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

    // ── update_profile tests ──────────────────────────────────────────────────

    #[test]
    fn test_update_profile_changes_current_data() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));

        client.update_profile(&farmer, &land_hash(&env, 2), &String::from_str(&env, "s2"));

        let updated = client.get_farmer(&farmer).unwrap();
        assert_eq!(updated.land_doc_hash, land_hash(&env, 2));
        assert_eq!(updated.region_geohash, String::from_str(&env, "s2"));
    }

    #[test]
    fn test_update_profile_increments_version_counter() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));
        assert_eq!(client.get_version(&farmer), 0);

        client.update_profile(&farmer, &land_hash(&env, 2), &String::from_str(&env, "s2"));
        assert_eq!(client.get_version(&farmer), 1);

        client.update_profile(&farmer, &land_hash(&env, 3), &String::from_str(&env, "s3"));
        assert_eq!(client.get_version(&farmer), 2);
    }

    #[test]
    fn test_get_profile_history_returns_correct_entry() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        // Register creates version 0 in history
        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));

        // Update archives version 0 and increments to 1
        client.update_profile(&farmer, &land_hash(&env, 2), &String::from_str(&env, "s2"));

        let history_v0 = client.get_profile_history(&farmer, &0u32).unwrap();
        assert_eq!(history_v0.version, 0u32);
        assert_eq!(history_v0.profile.land_doc_hash, land_hash(&env, 1));
        assert_eq!(
            history_v0.profile.region_geohash,
            String::from_str(&env, "s1")
        );
    }

    #[test]
    fn test_profile_history_across_multiple_updates() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));
        client.update_profile(&farmer, &land_hash(&env, 2), &String::from_str(&env, "s2"));
        client.update_profile(&farmer, &land_hash(&env, 3), &String::from_str(&env, "s3"));

        // Version 0 = initial registration snapshot
        let h0 = client.get_profile_history(&farmer, &0u32).unwrap();
        assert_eq!(h0.profile.land_doc_hash, land_hash(&env, 1));

        // Version 1 = snapshot before second update
        let h1 = client.get_profile_history(&farmer, &1u32).unwrap();
        assert_eq!(h1.profile.land_doc_hash, land_hash(&env, 2));

        // Current profile is the latest
        let current = client.get_farmer(&farmer).unwrap();
        assert_eq!(current.land_doc_hash, land_hash(&env, 3));
        assert_eq!(client.get_version(&farmer), 2);
    }

    #[test]
    #[should_panic(expected = "farmer not registered")]
    fn test_update_profile_on_unregistered_farmer_rejected() {
        let (env, _, client) = setup();
        let stranger = Address::generate(&env);

        client.update_profile(&stranger, &land_hash(&env, 1), &String::from_str(&env, "s1"));
    }

    #[test]
    #[should_panic(expected = "region is not within the approved Northern Nigeria geohash boundary")]
    fn test_update_profile_invalid_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "s1"));
        // "e7" is not a valid Northern Nigeria prefix
        client.update_profile(&farmer, &land_hash(&env, 2), &String::from_str(&env, "e7"));
    }

    // ── existing tests ────────────────────────────────────────────────────────

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
}