#![no_std]

//! Location Proof Contract — Circuit 2
//!
//! Stores ZK location proofs that attest a farmer's GPS coordinates fall
//! within the Northern Nigeria boundary without revealing the raw coordinates.
//!
//! Proof structure (Circuit 2):
//!   commitment = SHA-256(lat_scaled_i32 || lon_scaled_i32 || farmer_id_xdr || nonce)
//!   range_check = lat ∈ [4°N, 14°N] && lon ∈ [3°E, 15°E]  (Northern Nigeria bbox)
//!
//! The contract stores the commitment + a boolean `in_region` flag.
//! The off-chain prover is trusted to set `in_region` correctly; the contract
//! enforces that only the designated verifier can submit proofs.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
};

const ADMIN: &str = "ADMIN";

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LocationProofEntry {
    /// SHA-256 commitment of (lat || lon || farmer_id || nonce)
    pub commitment: BytesN<32>,
    /// True when the prover confirmed the point is inside Northern Nigeria
    pub in_region: bool,
    /// Farmer's Stellar address
    pub farmer_id: Address,
    /// Ledger timestamp of submission
    pub submitted_at: u64,
    /// Nonce used in the commitment (prevents replay)
    pub nonce: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LocationProof;

#[contractimpl]
impl LocationProof {
    /// One-time initialisation — sets the verifier/admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Submit a ZK location proof for a farmer.
    ///
    /// `commitment`  — SHA-256(lat_i32_be || lon_i32_be || farmer_id_xdr || nonce_be)
    /// `in_region`   — true iff the prover verified the point is in Northern Nigeria
    /// `nonce`       — monotonically increasing per-farmer counter (replay protection)
    pub fn submit_proof(
        env: Env,
        farmer_id: Address,
        commitment: BytesN<32>,
        in_region: bool,
        nonce: u64,
    ) {
        // Only the admin/verifier may submit proofs
        Self::require_admin(&env);

        if !in_region {
            panic!("location outside Northern Nigeria boundary");
        }

        // Reject duplicate commitments (replay / double-count)
        if env.storage().persistent().has(&commitment) {
            panic!("proof commitment already registered");
        }

        let entry = LocationProofEntry {
            commitment: commitment.clone(),
            in_region,
            farmer_id: farmer_id.clone(),
            submitted_at: env.ledger().timestamp(),
            nonce,
        };

        env.storage().persistent().set(&commitment, &entry);

        env.events().publish(
            (symbol_short!("loc_proof"), farmer_id),
            commitment,
        );
    }

    /// Returns the proof entry for a given commitment, if it exists.
    pub fn get_proof(env: Env, commitment: BytesN<32>) -> Option<LocationProofEntry> {
        env.storage().persistent().get(&commitment)
    }

    /// Returns true if the commitment has been registered.
    pub fn is_proven(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&commitment)
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup() -> (Env, Address, LocationProofClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, LocationProof);
        let client = LocationProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn commitment(env: &Env, seed: u8) -> BytesN<32> {
        // Simulate SHA-256 output with a fixed seed for tests
        let mut preimage = Bytes::new(env);
        preimage.extend_from_array(&[seed; 64]);
        env.crypto().sha256(&preimage)
    }

    #[test]
    fn test_submit_and_lookup() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 1);

        client.submit_proof(&farmer, &c, &true, &1u64);
        assert!(client.is_proven(&c));

        let entry = client.get_proof(&c).unwrap();
        assert_eq!(entry.farmer_id, farmer);
        assert!(entry.in_region);
        assert_eq!(entry.nonce, 1);
    }

    #[test]
    #[should_panic(expected = "proof commitment already registered")]
    fn test_replay_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 2);

        client.submit_proof(&farmer, &c, &true, &1u64);
        client.submit_proof(&farmer, &c, &true, &2u64); // must panic
    }

    #[test]
    #[should_panic(expected = "location outside Northern Nigeria boundary")]
    fn test_out_of_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 3);

        client.submit_proof(&farmer, &c, &false, &1u64);
    }
}
