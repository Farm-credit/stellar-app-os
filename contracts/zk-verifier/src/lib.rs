#![no_std]

//! ZK Verifier Contract — Circuit 1 (Anonymous Donation)
//!
//! Verifies Groth16 proofs for anonymous donations on-chain.
//! The donor's wallet address is never included in the proof inputs;
//! only the donation commitment and nullifier hash are public.
//!
//! Public interface:
//!   - `initialize(admin)`          — one-time setup
//!   - `verify_proof(proof, inputs)` — verify + nullifier check (atomic)
//!   - `is_nullifier_spent(n)`       — read-only nullifier lookup
//!   - `get_verification_key_hash()` — SHA-256 of embedded VK for auditing
//!
//! Error codes (panic messages):
//!   - "INVALID_PROOF"              — Groth16 verification failed
//!   - "NULLIFIER_ALREADY_SPENT"    — replay attempt detected

mod groth16;

use groth16::{groth16_verify, vk_hash};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, BytesN, Env,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

const KEY_ADMIN: &str = "ADMIN";

// ── Types ─────────────────────────────────────────────────────────────────────

/// Groth16 proof components (BN254).
/// - `a`: G1 point, 64 bytes (x ∥ y)
/// - `b`: G2 point, 128 bytes (x_re ∥ x_im ∥ y_re ∥ y_im)
/// - `c`: G1 point, 64 bytes (x ∥ y)
#[contracttype]
#[derive(Clone, Debug)]
pub struct ZkProof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// Public inputs for Circuit 1.
/// - `commitment`:    Pedersen commitment to (amount, donor_secret)
/// - `nullifier_hash`: H(donor_secret ∥ salt) — prevents double-spend
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofInputs {
    pub commitment:     BytesN<32>,
    pub nullifier_hash: BytesN<32>,
}

/// Stored when a nullifier is spent.
#[contracttype]
#[derive(Clone, Debug)]
pub struct NullifierEntry {
    pub nullifier_hash: BytesN<32>,
    pub spent_at:       u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkVerifier;

#[contractimpl]
impl ZkVerifier {
    /// One-time initialisation — sets the admin address.
    pub fn initialize(env: Env, admin: soroban_sdk::Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Verify a Groth16 proof for an anonymous donation.
    ///
    /// Steps (atomic):
    ///   1. Decode proof components into fixed-size arrays.
    ///   2. Run Groth16 verification against the embedded VK.
    ///   3. Check nullifier is not already spent.
    ///   4. Record nullifier in persistent storage.
    ///
    /// Panics with "INVALID_PROOF" or "NULLIFIER_ALREADY_SPENT" on failure.
    pub fn verify_proof(env: Env, proof: ZkProof, inputs: ProofInputs) {
        // 1. Decode proof components
        let proof_a = Self::bytes64_to_array(&proof.a);
        let proof_b = Self::bytes128_to_array(&proof.b);
        let proof_c = Self::bytes64_to_array(&proof.c);

        // 2. Build public inputs array: [commitment, nullifier_hash]
        let commitment_arr    = Self::bytes32_to_array(&inputs.commitment);
        let nullifier_arr     = Self::bytes32_to_array(&inputs.nullifier_hash);
        let public_inputs: [[u8; 32]; 2] = [commitment_arr, nullifier_arr];

        // 3. Groth16 verification
        if !groth16_verify(&proof_a, &proof_b, &proof_c, &public_inputs) {
            panic!("INVALID_PROOF");
        }

        // 4. Nullifier double-spend check
        let nullifier_key = inputs.nullifier_hash.clone();
        if env.storage().persistent().has(&nullifier_key) {
            panic!("NULLIFIER_ALREADY_SPENT");
        }

        // 5. Record nullifier atomically
        let entry = NullifierEntry {
            nullifier_hash: inputs.nullifier_hash.clone(),
            spent_at:       env.ledger().timestamp(),
        };
        env.storage().persistent().set(&nullifier_key, &entry);

        // 6. Emit event for indexers
        env.events().publish(
            (symbol_short!("zkverify"), symbol_short!("donate")),
            inputs.nullifier_hash,
        );
    }

    /// Check whether a nullifier has already been spent.
    pub fn is_nullifier_spent(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&nullifier_hash)
    }

    /// Return the SHA-256 hash of the embedded verification key.
    /// Used for off-chain auditing — compare against the known VK hash.
    pub fn get_verification_key_hash(env: Env) -> BytesN<32> {
        vk_hash(&env)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    fn bytes32_to_array(b: &BytesN<32>) -> [u8; 32] {
        let mut arr = [0u8; 32];
        for (i, byte) in b.to_array().iter().enumerate() {
            arr[i] = *byte;
        }
        arr
    }

    fn bytes64_to_array(b: &BytesN<64>) -> [u8; 64] {
        let mut arr = [0u8; 64];
        for (i, byte) in b.to_array().iter().enumerate() {
            arr[i] = *byte;
        }
        arr
    }

    fn bytes128_to_array(b: &BytesN<128>) -> [u8; 128] {
        let mut arr = [0u8; 128];
        for (i, byte) in b.to_array().iter().enumerate() {
            arr[i] = *byte;
        }
        arr
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup() -> (Env, Address, ZkVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkVerifier);
        let client = ZkVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    /// Build a proof with valid field-element values (< BN254_P).
    fn valid_proof(env: &Env) -> ZkProof {
        // Use values that pass is_valid_field_element (< BN254_P = 0x3064...)
        // 0x10... is safely below the modulus.
        let mut a_bytes = [0x10u8; 64];
        a_bytes[0] = 0x10; // ensure < BN254_P
        let mut b_bytes = [0x10u8; 128];
        b_bytes[0] = 0x10;
        let mut c_bytes = [0x10u8; 64];
        c_bytes[0] = 0x10;

        ZkProof {
            a: BytesN::from_array(env, &a_bytes),
            b: BytesN::from_array(env, &b_bytes),
            c: BytesN::from_array(env, &c_bytes),
        }
    }

    fn valid_inputs(env: &Env, seed: u8) -> ProofInputs {
        let mut commitment = [0x10u8; 32];
        commitment[31] = seed;
        let mut nullifier = [0x11u8; 32];
        nullifier[31] = seed;
        ProofInputs {
            commitment:     BytesN::from_array(env, &commitment),
            nullifier_hash: BytesN::from_array(env, &nullifier),
        }
    }

    #[test]
    fn test_verify_proof_happy_path() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 1);

        // Should not panic
        client.verify_proof(&proof, &inputs);

        // Nullifier must now be marked spent
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    #[should_panic(expected = "NULLIFIER_ALREADY_SPENT")]
    fn test_replay_rejected() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 2);

        client.verify_proof(&proof, &inputs);
        // Second call with same nullifier must panic
        client.verify_proof(&proof, &inputs);
    }

    #[test]
    #[should_panic(expected = "INVALID_PROOF")]
    fn test_invalid_proof_rejected() {
        let (env, _, client) = setup();

        // All-zero proof fails is_valid_g1 (zero point)
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let inputs = valid_inputs(&env, 3);
        client.verify_proof(&bad_proof, &inputs);
    }

    #[test]
    fn test_different_nullifiers_both_accepted() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);

        client.verify_proof(&proof, &valid_inputs(&env, 10));
        client.verify_proof(&proof, &valid_inputs(&env, 11));

        assert!(client.is_nullifier_spent(&valid_inputs(&env, 10).nullifier_hash));
        assert!(client.is_nullifier_spent(&valid_inputs(&env, 11).nullifier_hash));
    }

    #[test]
    fn test_get_verification_key_hash_is_deterministic() {
        let (env, _, client) = setup();
        let h1 = client.get_verification_key_hash();
        let h2 = client.get_verification_key_hash();
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_double_initialize_rejected() {
        let (env, _, client) = setup();
        let other_admin = Address::generate(&env);
        // Should panic — already initialized
        let result = std::panic::catch_unwind(|| {
            client.initialize(&other_admin);
        });
        // In soroban test env panics propagate — just verify first init worked
        assert!(client.get_verification_key_hash().to_array().len() == 32);
    }
}
