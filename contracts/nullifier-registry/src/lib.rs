#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, crypto::Hash, symbol_short, vec, xdr::ToXdr, Address, Bytes,
    BytesN, Env, String, Symbol,
};

// Storage key namespace
const NULLIFIER: &str = "NULL";
const ADMIN: &str = "ADMIN";

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TreeCommitmentInput {
    /// GPS coordinates as a string e.g. "-1.2345,36.8219"
    pub gps: String,
    /// Unix timestamp (seconds)
    pub timestamp: u64,
    /// Farmer's Stellar account address
    pub farmer_id: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct NullifierEntry {
    pub commitment: BytesN<32>,
    pub farmer_id: Address,
    pub registered_at: u64,
}

#[contract]
pub struct NullifierRegistry;

#[contractimpl]
impl NullifierRegistry {
    /// Initialize the contract with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Compute a SHA-256 commitment from GPS + timestamp + farmer_id.
    /// Returns the 32-byte hash.
    pub fn compute_commitment(env: Env, input: TreeCommitmentInput) -> BytesN<32> {
        Self::_compute_commitment(&env, &input)
    }

    /// Register a tree commitment on-chain.
    /// Panics if the commitment already exists (double-count prevention).
    pub fn register(env: Env, input: TreeCommitmentInput) -> BytesN<32> {
        // Caller must be the farmer themselves
        input.farmer_id.require_auth();

        let commitment = Self::_compute_commitment(&env, &input);

        // Reject if already registered — nullifier check
        if env
            .storage()
            .persistent()
            .has(&commitment)
        {
            panic!("commitment already registered: double-counting rejected");
        }

        let entry = NullifierEntry {
            commitment: commitment.clone(),
            farmer_id: input.farmer_id.clone(),
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&commitment, &entry);

        // Emit event for indexers
        env.events().publish(
            (Symbol::new(&env, "FarmerRegistered"), input.farmer_id),
            commitment.clone(),
        );

        commitment
    }

    /// Check whether a commitment is already in the registry.
    pub fn is_registered(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&commitment)
    }

    /// Fetch the full entry for a commitment (returns None if not found).
    pub fn get_entry(env: Env, commitment: BytesN<32>) -> Option<NullifierEntry> {
        env.storage().persistent().get(&commitment)
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn _compute_commitment(env: &Env, input: &TreeCommitmentInput) -> BytesN<32> {
        // Encode: gps_bytes | timestamp_be_8_bytes | farmer_id_bytes
        let gps_bytes = input.gps.clone().to_xdr(env);
        let ts_bytes = input.timestamp.to_be_bytes();
        let farmer_bytes = input.farmer_id.clone().to_xdr(env);

        let mut preimage = Bytes::new(env);
        preimage.append(&gps_bytes);
        preimage.extend_from_array(&ts_bytes);
        preimage.append(&farmer_bytes);

        env.crypto().sha256(&preimage).into()
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    fn setup() -> (Env, Address, NullifierRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, NullifierRegistry);
        let client = NullifierRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn sample_input(env: &Env, farmer: &Address) -> TreeCommitmentInput {
        TreeCommitmentInput {
            gps: String::from_str(env, "-1.2345,36.8219"),
            timestamp: 1_700_000_000u64,
            farmer_id: farmer.clone(),
        }
    }

    #[test]
    fn test_register_and_lookup() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        let commitment = client.register(&input);
        assert!(client.is_registered(&commitment));

        let entry = client.get_entry(&commitment).unwrap();
        assert_eq!(entry.farmer_id, farmer);
    }

    #[test]
    #[should_panic(expected = "commitment already registered")]
    fn test_double_registration_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        client.register(&input);
        // Second call with identical input must panic
        client.register(&input);
    }

    #[test]
    fn test_different_inputs_produce_different_commitments() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input1 = sample_input(&env, &farmer);
        let input2 = TreeCommitmentInput {
            gps: String::from_str(&env, "-1.9999,36.0000"),
            timestamp: 1_700_000_001u64,
            farmer_id: farmer.clone(),
        };

        let c1 = client.register(&input1);
        let c2 = client.register(&input2);
        assert_ne!(c1, c2);
    }

    #[test]
    fn test_compute_commitment_is_deterministic() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        let c1 = client.compute_commitment(&input);
        let c2 = client.compute_commitment(&input);
        assert_eq!(c1, c2);
    }
}
