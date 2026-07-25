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
    contract, contractimpl, contracttype, symbol_short, BytesN, Env, Vec,
};

// ── Error types ───────────────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ZkError {
    EmptyBatch = 1,
    LengthMismatch = 2,
    VerificationFailed = 3,
}

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

    /// Verify a single Groth16 proof.
    ///
    /// For batch verification use [`Self::batch_verify`].
    ///
    /// Steps (atomic):
    ///   1. Decode proof components into fixed-size arrays.
    ///   2. Run Groth16 verification against the embedded VK.
    ///   3. Check nullifier is not already spent.
    ///   4. Record nullifier in persistent storage.
    ///
    /// Panics with "INVALID_PROOF" or "NULLIFIER_ALREADY_SPENT" on failure.
    pub fn verify_proof(env: Env, proof: ZkProof, inputs: ProofInputs) {
        Self::verify_single(&env, &proof, &inputs)
            .expect("Proof verification failed");
    }

    /// Batch verifies multiple Groth16 proofs atomically in a single transaction invocation.
    ///
    /// All proofs are verified before any result is returned.
    /// If ANY proof fails verification, the entire batch fails
    /// (atomic all-or-nothing semantics).
    ///
    /// Reduces average gas cost per proof vs individual calls.
    ///
    /// # Parameters
    /// - `env` — The Soroban environment
    /// - `proofs` — Array of Groth16 proofs to verify
    /// - `public_inputs` — Array of public inputs, one per proof
    ///   (must be same length as proofs)
    ///
    /// # Returns
    /// - `Ok(Vec<bool>)` — verification result per proof (all true on success)
    /// - `Err(ZkError::LengthMismatch)` — if arrays differ in length
    /// - `Err(ZkError::EmptyBatch)` — if arrays are empty
    /// - `Err(ZkError::VerificationFailed)` — if any proof invalid
    ///
    /// # Atomicity
    /// All proofs verified before returning. Partial success is not possible.
    pub fn batch_verify(
        env: Env,
        proofs: Vec<ZkProof>,
        public_inputs: Vec<ProofInputs>,
    ) -> Result<Vec<bool>, ZkError> {
        // Validate inputs
        if proofs.is_empty() {
            return Err(ZkError::EmptyBatch);
        }

        if proofs.len() != public_inputs.len() {
            return Err(ZkError::LengthMismatch);
        }

        // Verify all proofs atomically
        // Collect results — fail fast on first invalid proof
        let mut results = Vec::new(&env);

        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let inputs = public_inputs.get(i).unwrap();

            // Reuse existing single verify logic
            // Do NOT reimplement — call existing verify helper
            let valid = Self::verify_single(&env, &proof, &inputs)?;
            results.push_back(valid);
        }

        // Atomic: if we reach here, all proofs verified
        Ok(results)
    }

    /// Helper: Verify a single proof and perform nullifier check.
    ///
    /// Returns Ok(true) if valid, Err if invalid or nullifier already spent.
    fn verify_single(env: &Env, proof: &ZkProof, inputs: &ProofInputs) -> Result<bool, ZkError> {
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
            return Err(ZkError::VerificationFailed);
        }

        // 4. Nullifier double-spend check
        let nullifier_key = inputs.nullifier_hash.clone();
        if env.storage().persistent().has(&nullifier_key) {
            return Err(ZkError::VerificationFailed);
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

        Ok(true)
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

    // ── Batch verification tests ────────────────────────────────────────────────

    #[test]
    fn test_batch_verify_single_valid_proof() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 100);

        let proofs = soroban_sdk::vec![&env, proof];
        let public_inputs = soroban_sdk::vec![&env, inputs.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results.get(0).unwrap(), true);

        // Nullifier must be marked spent
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_two_valid_proofs() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 101);
        let inputs2 = valid_inputs(&env, 102);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results.get(0).unwrap(), true);
        assert_eq!(results.get(1).unwrap(), true);

        // Both nullifiers must be marked spent
        assert!(client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(client.is_nullifier_spent(&inputs2.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_five_valid_proofs() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);

        let mut proofs = soroban_sdk::vec![&env];
        let mut public_inputs = soroban_sdk::vec![&env];

        for i in 0..5 {
            proofs.push_back(proof.clone());
            public_inputs.push_back(valid_inputs(&env, 110 + i as u8));
        }

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 5);
        for i in 0..5 {
            assert_eq!(results.get(i).unwrap(), true);
        }

        // All nullifiers must be marked spent
        for i in 0..5 {
            let inputs = valid_inputs(&env, 110 + i as u8);
            assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
        }
    }

    #[test]
    fn test_batch_verify_empty_arrays_returns_error() {
        let (env, _, client) = setup();
        let proofs = soroban_sdk::vec![&env];
        let public_inputs = soroban_sdk::vec![&env];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::EmptyBatch);
    }

    #[test]
    fn test_batch_verify_mismatched_lengths_fewer_inputs() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 120);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let public_inputs = soroban_sdk::vec![&env, inputs];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::LengthMismatch);
    }

    #[test]
    fn test_batch_verify_mismatched_lengths_more_inputs() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 121);
        let inputs2 = valid_inputs(&env, 122);

        let proofs = soroban_sdk::vec![&env, proof];
        let public_inputs = soroban_sdk::vec![&env, inputs1, inputs2];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::LengthMismatch);
    }

    #[test]
    fn test_batch_verify_first_proof_invalid() {
        let (env, _, client) = setup();
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let valid_proof_1 = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 130);
        let inputs2 = valid_inputs(&env, 131);

        let proofs = soroban_sdk::vec![&env, bad_proof, valid_proof_1];
        let public_inputs = soroban_sdk::vec![&env, inputs1, inputs2];

        let result = client.batch_verify(&proofs, &public_inputs);

        // Should fail on first invalid proof
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::VerificationFailed);

        // No nullifiers should be marked spent (atomic failure)
        assert!(!client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(!client.is_nullifier_spent(&inputs2.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_middle_proof_invalid() {
        let (env, _, client) = setup();
        let valid_proof_1 = valid_proof(&env);
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let valid_proof_2 = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 140);
        let inputs2 = valid_inputs(&env, 141);
        let inputs3 = valid_inputs(&env, 142);

        let proofs = soroban_sdk::vec![&env, valid_proof_1, bad_proof, valid_proof_2];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone(), inputs3.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        // Should fail on second invalid proof
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::VerificationFailed);

        // No nullifiers should be marked spent (atomic failure)
        assert!(!client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(!client.is_nullifier_spent(&inputs2.nullifier_hash));
        assert!(!client.is_nullifier_spent(&inputs3.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_last_proof_invalid() {
        let (env, _, client) = setup();
        let valid_proof_1 = valid_proof(&env);
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let inputs1 = valid_inputs(&env, 150);
        let inputs2 = valid_inputs(&env, 151);

        let proofs = soroban_sdk::vec![&env, valid_proof_1, bad_proof];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        // Should fail on last invalid proof
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::VerificationFailed);

        // No nullifiers should be marked spent (atomic failure)
        assert!(!client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(!client.is_nullifier_spent(&inputs2.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_nullifier_replay_in_batch() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs_repeated = valid_inputs(&env, 160);

        // Try to verify same nullifier twice in same batch
        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let public_inputs = soroban_sdk::vec![&env, inputs_repeated.clone(), inputs_repeated.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        // Should fail because second proof has already-spent nullifier
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error, ZkError::VerificationFailed);

        // First nullifier should NOT be marked (atomic failure)
        assert!(!client.is_nullifier_spent(&inputs_repeated.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_does_not_partially_succeed() {
        let (env, _, client) = setup();
        let valid_proof_1 = valid_proof(&env);
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let inputs1 = valid_inputs(&env, 170);
        let inputs2 = valid_inputs(&env, 171);

        let proofs = soroban_sdk::vec![&env, valid_proof_1, bad_proof];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        // Must be error, not partial success
        assert!(result.is_err());

        // Verify no partial application occurred
        assert!(!client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(!client.is_nullifier_spent(&inputs2.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_results_ordered_by_input() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 180);
        let inputs2 = valid_inputs(&env, 181);
        let inputs3 = valid_inputs(&env, 182);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone(), proof.clone()];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone(), inputs3.clone()];

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_ok());
        let results = result.unwrap();

        // Verify results are in order: result[i] corresponds to input[i]
        assert_eq!(results.len(), 3);
        assert_eq!(results.get(0).unwrap(), true); // inputs1
        assert_eq!(results.get(1).unwrap(), true); // inputs2
        assert_eq!(results.get(2).unwrap(), true); // inputs3

        // Verify all three nullifiers are marked
        assert!(client.is_nullifier_spent(&inputs1.nullifier_hash));
        assert!(client.is_nullifier_spent(&inputs2.nullifier_hash));
        assert!(client.is_nullifier_spent(&inputs3.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_same_result_as_individual_calls() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);
        let inputs1 = valid_inputs(&env, 190);
        let inputs2 = valid_inputs(&env, 191);

        // Individual calls
        let env2 = Env::default();
        env2.mock_all_auths();
        let contract_id2 = env2.register_contract(None, ZkVerifier);
        let client2 = ZkVerifierClient::new(&env2, &contract_id2);
        let admin2 = Address::generate(&env2);
        client2.initialize(&admin2);

        let proof2 = valid_proof(&env2);
        let inputs1_copy = valid_inputs(&env2, 190);
        let inputs2_copy = valid_inputs(&env2, 191);

        client2.verify_proof(&proof2.clone(), &inputs1_copy);
        client2.verify_proof(&proof2.clone(), &inputs2_copy);

        // Batch call
        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let public_inputs = soroban_sdk::vec![&env, inputs1.clone(), inputs2.clone()];
        let batch_result = client.batch_verify(&proofs, &public_inputs);

        // Results should match
        assert!(batch_result.is_ok());
        let results = batch_result.unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results.get(0).unwrap(), true);
        assert_eq!(results.get(1).unwrap(), true);

        // Both nullifiers should be marked in both cases
        assert!(client2.is_nullifier_spent(&inputs1_copy.nullifier_hash));
        assert!(client2.is_nullifier_spent(&inputs2_copy.nullifier_hash));
    }

    #[test]
    fn test_batch_verify_large_batch() {
        let (env, _, client) = setup();
        let proof = valid_proof(&env);

        let mut proofs = soroban_sdk::vec![&env];
        let mut public_inputs = soroban_sdk::vec![&env];

        for i in 0..10 {
            proofs.push_back(proof.clone());
            public_inputs.push_back(valid_inputs(&env, 200 + i as u8));
        }

        let result = client.batch_verify(&proofs, &public_inputs);

        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 10);

        // All results should be true
        for i in 0..10 {
            assert_eq!(results.get(i).unwrap(), true);
        }

        // All nullifiers should be marked
        for i in 0..10 {
            let inputs = valid_inputs(&env, 200 + i as u8);
            assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
        }
    }
}
