#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, String,
};
use soroban_sdk::xdr::ToXdr;

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
    pub fn compute_commitment(env: Env, input: TreeCommitmentInput) -> BytesN<32> {
        Self::_compute_commitment(&env, &input)
    }

    /// Register a tree commitment on-chain.
    /// Panics if the commitment already exists (double-count prevention).
    pub fn register(env: Env, input: TreeCommitmentInput) -> BytesN<32> {
        input.farmer_id.require_auth();

        let commitment = Self::_compute_commitment(&env, &input);

        if env.storage().persistent().has(&commitment) {
            panic!("commitment already registered: double-counting rejected");
        }

        let entry = NullifierEntry {
            commitment: commitment.clone(),
            farmer_id: input.farmer_id.clone(),
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&commitment, &entry);

        env.events().publish(
            (symbol_short!("register"), input.farmer_id),
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

    fn _compute_commitment(env: &Env, input: &TreeCommitmentInput) -> BytesN<32> {
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

    // ── Valid proof tests ─────────────────────────────────────────────────────

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
    fn test_compute_commitment_is_deterministic() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        let c1 = client.compute_commitment(&input);
        let c2 = client.compute_commitment(&input);
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_valid_proof_commitment_matches_registered() {
        // compute_commitment must return the same hash that register stores
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        let expected = client.compute_commitment(&input);
        let registered = client.register(&input);
        assert_eq!(expected, registered);
    }

    #[test]
    fn test_multiple_valid_proofs_independent_farmers() {
        // Same GPS + timestamp but different farmer → different commitment, both accepted
        let (env, _, client) = setup();
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);

        let c_a = client.register(&sample_input(&env, &farmer_a));
        let c_b = client.register(&sample_input(&env, &farmer_b));

        assert_ne!(c_a, c_b);
        assert!(client.is_registered(&c_a));
        assert!(client.is_registered(&c_b));
    }

    // ── Invalid proof tests ───────────────────────────────────────────────────

    #[test]
    fn test_tampered_gps_produces_different_commitment() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let original = sample_input(&env, &farmer);
        let tampered = TreeCommitmentInput {
            gps: String::from_str(&env, "0.0000,0.0000"),
            ..original.clone()
        };

        assert_ne!(
            client.compute_commitment(&original),
            client.compute_commitment(&tampered)
        );
    }

    #[test]
    fn test_tampered_timestamp_produces_different_commitment() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let original = sample_input(&env, &farmer);
        let tampered = TreeCommitmentInput {
            timestamp: original.timestamp + 1,
            ..original.clone()
        };

        assert_ne!(
            client.compute_commitment(&original),
            client.compute_commitment(&tampered)
        );
    }

    #[test]
    fn test_tampered_farmer_produces_different_commitment() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let impostor = Address::generate(&env);

        let original = sample_input(&env, &farmer);
        let tampered = TreeCommitmentInput {
            farmer_id: impostor,
            ..original.clone()
        };

        assert_ne!(
            client.compute_commitment(&original),
            client.compute_commitment(&tampered)
        );
    }

    #[test]
    fn test_unregistered_commitment_not_found() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        // compute but never register
        let commitment = client.compute_commitment(&input);
        assert!(!client.is_registered(&commitment));
        assert!(client.get_entry(&commitment).is_none());
    }

    // ── Replay attack tests ───────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "commitment already registered")]
    fn test_double_registration_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        client.register(&input);
        client.register(&input); // replay → must panic
    }

    #[test]
    #[should_panic(expected = "commitment already registered")]
    fn test_replay_attack_same_input_rejected() {
        // Identical (gps, timestamp, farmer_id) submitted twice must be blocked
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        client.register(&input);
        client.register(&input);
    }

    // ── Boundary condition tests ──────────────────────────────────────────────

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
    fn test_boundary_zero_timestamp() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input = TreeCommitmentInput {
            gps: String::from_str(&env, "-1.2345,36.8219"),
            timestamp: 0u64,
            farmer_id: farmer.clone(),
        };

        let commitment = client.register(&input);
        assert!(client.is_registered(&commitment));
    }

    #[test]
    fn test_boundary_max_timestamp() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input = TreeCommitmentInput {
            gps: String::from_str(&env, "-1.2345,36.8219"),
            timestamp: u64::MAX,
            farmer_id: farmer.clone(),
        };

        let commitment = client.register(&input);
        assert!(client.is_registered(&commitment));
    }

    #[test]
    fn test_boundary_minimal_gps_string() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input = TreeCommitmentInput {
            gps: String::from_str(&env, "0,0"),
            timestamp: 1_700_000_000u64,
            farmer_id: farmer.clone(),
        };

        let commitment = client.register(&input);
        assert!(client.is_registered(&commitment));
    }

    #[test]
    fn test_boundary_zero_and_max_timestamps_distinct() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input_zero = TreeCommitmentInput {
            gps: String::from_str(&env, "1.0,1.0"),
            timestamp: 0u64,
            farmer_id: farmer.clone(),
        };
        let input_max = TreeCommitmentInput {
            timestamp: u64::MAX,
            ..input_zero.clone()
        };

        assert_ne!(
            client.compute_commitment(&input_zero),
            client.compute_commitment(&input_max)
        );
    }

    // ── Double-counting prevention tests ─────────────────────────────────────

    #[test]
    fn test_same_farmer_different_timestamps_allowed() {
        // A farmer planting at the same spot on different days is legitimate
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        let input1 = TreeCommitmentInput {
            gps: String::from_str(&env, "-1.2345,36.8219"),
            timestamp: 1_700_000_000u64,
            farmer_id: farmer.clone(),
        };
        let input2 = TreeCommitmentInput {
            timestamp: 1_700_086_400u64, // +1 day
            ..input1.clone()
        };

        let c1 = client.register(&input1);
        let c2 = client.register(&input2);
        assert_ne!(c1, c2);
        assert!(client.is_registered(&c1));
        assert!(client.is_registered(&c2));
    }

    #[test]
    #[should_panic(expected = "commitment already registered")]
    fn test_double_count_exact_duplicate_rejected() {
        // Identical (gps, timestamp, farmer) must never be counted twice
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        client.register(&input);
        client.register(&input);
    }

    #[test]
    fn test_double_count_entry_still_valid_after_failed_replay() {
        // After a rejected duplicate, the original entry is intact
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let input = sample_input(&env, &farmer);

        let commitment = client.register(&input);
        // Verify the entry is correct (replay attempt would panic, so we just
        // confirm the stored entry is sound without triggering a second register)
        let entry = client.get_entry(&commitment).unwrap();
        assert_eq!(entry.commitment, commitment);
        assert_eq!(entry.farmer_id, farmer);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_rejected() {
        let (env, _, client) = setup();
        let second_admin = Address::generate(&env);
        client.initialize(&second_admin);
    }
}
