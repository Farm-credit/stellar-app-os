#![no_std]

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
}