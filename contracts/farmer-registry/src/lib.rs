#![no_std]

//! Farmer Registry Contract — Closes #301
//!
//! Stores on-chain farmer identity:
//!   • Wallet address (Stellar account)
//!   • Land documentation hash (SHA-256 of off-chain document)
//!   • Region geohash (Northern Nigeria 2-char geohash prefix)
//!   • Registration timestamp
//!
//! Emits a FarmerRegistered event on successful registration.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, IntoVal, String,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

/// Prefix for per-farmer storage: (FARMER, wallet) → FarmerRecord
const FARMER_KEY: &str = "FARMER";

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FarmerRecord {
    /// Farmer's Stellar wallet address
    pub wallet: Address,
    /// SHA-256 hash of the farmer's land documentation (stored off-chain)
    pub land_doc_hash: BytesN<32>,
    /// 2-character geohash representing the farmer's Northern Nigeria region
    pub region: String,
    /// Ledger timestamp when the farmer was registered
    pub registered_at: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FarmerRegistry;

#[contractimpl]
impl FarmerRegistry {
    /// One-time initialisation — sets the admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Register a farmer on-chain.
    ///
    /// `wallet`        — farmer's Stellar account (must sign the transaction)
    /// `land_doc_hash` — SHA-256 of the farmer's land documentation
    /// `region`        — 2-char Northern Nigeria geohash (e.g. "s1", "s5")
    ///
    /// Panics if the wallet is already registered or if the region is not an
    /// approved Northern Nigeria geohash prefix.
    pub fn register_farmer(
        env: Env,
        wallet: Address,
        land_doc_hash: BytesN<32>,
        region: String,
    ) {
        // Farmer must authorise this call from their own wallet
        wallet.require_auth();

        Self::assert_valid_region(&env, &region);

        let key = Self::farmer_key(&env, &wallet);
        if env.storage().persistent().has(&key) {
            panic!("farmer already registered");
        }

        let record = FarmerRecord {
            wallet: wallet.clone(),
            land_doc_hash,
            region,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &record);

        // Emit FarmerRegistered event for off-chain indexers
        env.events().publish(
            (symbol_short!("FarmerReg"), wallet),
            env.ledger().timestamp(),
        );
    }

    /// Fetch the registration record for a wallet address.
    pub fn get_farmer(env: Env, wallet: Address) -> Option<FarmerRecord> {
        env.storage().persistent().get(&Self::farmer_key(&env, &wallet))
    }

    /// Returns true if the wallet is already registered.
    pub fn is_registered(env: Env, wallet: Address) -> bool {
        env.storage().persistent().has(&Self::farmer_key(&env, &wallet))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn farmer_key(env: &Env, wallet: &Address) -> soroban_sdk::Val {
        (symbol_short!("FARMER"), wallet.clone()).into_val(env)
    }

    /// Approved 2-character geohash prefixes that cover Northern Nigeria
    /// (approx. 9°N–14°N, 3°E–15°E). Rejects coordinates outside this boundary.
    fn assert_valid_region(env: &Env, region: &String) {
        // Northern Nigeria spans geohash cells: s0, s1, s2, s3, s4, s5, s6, s7, s8
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
    fn test_register_and_lookup() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        assert!(!client.is_registered(&farmer));

        client.register_farmer(
            &farmer,
            &land_hash(&env, 1),
            &String::from_str(&env, "s1"),
        );

        assert!(client.is_registered(&farmer));

        let record = client.get_farmer(&farmer).unwrap();
        assert_eq!(record.wallet, farmer);
        assert_eq!(record.land_doc_hash, land_hash(&env, 1));
        assert_eq!(record.region, String::from_str(&env, "s1"));
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

        // "e7" is outside Northern Nigeria
        client.register_farmer(&farmer, &land_hash(&env, 1), &String::from_str(&env, "e7"));
    }

    #[test]
    fn test_all_valid_northern_nigeria_prefixes_accepted() {
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
    fn test_get_nonexistent_farmer_returns_none() {
        let (env, _, client) = setup();
        let stranger = Address::generate(&env);
        assert!(client.get_farmer(&stranger).is_none());
    }
}
