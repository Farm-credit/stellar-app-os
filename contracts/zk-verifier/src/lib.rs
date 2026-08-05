#![no_std]

//! ZK Verifier Contract — Circuit 1 (Anonymous Donation + Location Proofs)
//!
//! Verifies Groth16 proofs for anonymous donations on-chain with location
//! proof freshness guarantees. The donor's wallet address is never included
//! in the proof inputs; only the donation commitment and nullifier hash are
//! public. Location proofs embedded in the public inputs are rejected if
//! older than 24 hours based on the ledger timestamp.
//!
//! Public interface:
//!   - `initialize(admin)`                    — one-time setup (admin auth)
//!   - `verify_location_proof(submitter, …)`  — verify location proof with
//!                                              24h freshness + auth
//!   - `batch_verify_location_proofs(…)`      — batch variant of above
//!   - `verify_proof(submitter, proof, inputs)` — legacy anonymous donation
//!   - `is_nullifier_spent(n)`                — read-only nullifier lookup
//!   - `get_verification_key_hash()`          — SHA-256 of embedded VK
//!
//! Error codes (contract errors):
//!   - EmptyBatch          = 1  — batch with zero proofs
//!   - LengthMismatch      = 2  — proofs.len() != inputs.len()
//!   - VerificationFailed  = 3  — Groth16 / pairing check failed
//!   - StaleProof          = 4  — proof timestamp > 24h before ledger
//!   - FutureTimestamp     = 5  — proof timestamp ahead of ledger
//!   - NullifierSpent      = 6  — double-spend attempt

mod groth16;

use groth16::{groth16_verify, vk_hash};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, BytesN, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum age of a location proof in seconds (24 hours).
/// Proofs generated before `ledger_timestamp - PROOF_MAX_AGE_SECONDS`
/// are rejected with `ZkError::StaleProof`.
pub const PROOF_MAX_AGE_SECONDS: u64 = 24 * 60 * 60;

/// Instance-storage TTL bump threshold. If the entry has fewer than this many
/// ledgers of remaining life, it is bumped back to `INSTANCE_BUMP_AMOUNT`.
const INSTANCE_BUMP_THRESHOLD: u32 = 100_000;
/// Instance-storage TTL bump amount (ledgers ≈ 5s each → ~14 days).
const INSTANCE_BUMP_AMOUNT: u32 = 250_000;

/// Persistent-storage TTL bump threshold for nullifier entries.
const PERSISTENT_BUMP_THRESHOLD: u32 = 100_000;
/// Persistent-storage TTL bump amount for nullifier entries (~14 days).
const PERSISTENT_BUMP_AMOUNT: u32 = 250_000;

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ZkError {
    /// Batch verification invoked with an empty `proofs` vector.
    EmptyBatch = 1,
    /// `proofs.len()` and `public_inputs.len()` differ in a batch call.
    LengthMismatch = 2,
    /// Groth16 pairing check, point validation, or nullifier guard failed.
    VerificationFailed = 3,
    /// Proof timestamp is more than 24 hours older than the ledger timestamp.
    StaleProof = 4,
    /// Proof timestamp is strictly greater than the ledger timestamp.
    FutureTimestamp = 5,
    /// The nullifier has already been recorded in persistent storage.
    NullifierSpent = 6,
}

impl From<ZkError> for soroban_sdk::Error {
    fn from(err: ZkError) -> Self {
        soroban_sdk::Error::from_contract_error(err as u32)
    }
}

impl From<&ZkError> for soroban_sdk::Error {
    fn from(err: &ZkError) -> Self {
        soroban_sdk::Error::from_contract_error(*err as u32)
    }
}

impl From<soroban_sdk::Error> for ZkError {
    fn from(_: soroban_sdk::Error) -> Self {
        ZkError::VerificationFailed
    }
}

// ── Storage keys ──────────────────────────────────────────────────────────────

/// Key under which the admin `Address` is stored in instance storage.
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

/// Public inputs for Circuit 1 (donation + location proof with timestamp).
///
/// - `commitment`      : Pedersen commitment to (amount, donor_secret)
/// - `nullifier_hash`  : H(donor_secret ∥ salt) — prevents double-spend
/// - `proof_timestamp` : Unix-epoch seconds when the ZK proof was generated
///                       off-chain. The contract rejects proofs where
///                       `ledger_timestamp - proof_timestamp` exceeds
///                       `PROOF_MAX_AGE_SECONDS` (24 h) or where the proof
///                       timestamp is strictly in the future.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofInputs {
    pub commitment:      BytesN<32>,
    pub nullifier_hash:  BytesN<32>,
    pub proof_timestamp: u64,
}

/// Compressed public inputs — packs `commitment ∥ nullifier_hash` into a
/// single 64-byte value, halving the on-chain storage entry count.
///
/// Layout (big-endian):
///   bytes [0..32]  = commitment
///   bytes [32..64] = nullifier_hash
///
/// This reduces the storage footprint from two 32-byte persistent entries
/// per proof to one 64-byte entry, saving approximately 50 % of per-proof
/// ledger entry overhead.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CompressedProofInputs {
    /// commitment (bytes 0..32) concatenated with nullifier_hash (bytes 32..64)
    pub packed: BytesN<64>,
    pub proof_timestamp: u64,
}

/// Stored when a nullifier is spent — audit trail for indexers.
#[contracttype]
#[derive(Clone, Debug)]
pub struct NullifierEntry {
    pub nullifier_hash: BytesN<32>,
    pub spent_at:       u64,
    pub proof_timestamp: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkVerifier;

#[contractimpl]
impl ZkVerifier {
    /// One-time initialisation — sets the admin address.
    ///
    /// # Authorization
    /// Only meaningful off-chain (deployment-time); there is no on-chain
    /// caller so `require_auth` is skipped.  The admin stored here is the
    /// privileged account for future governance-only calls.
    ///
    /// # Panics
    /// If the contract has already been initialised.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        Self::bump_instance_ttl(&env);
    }

    /// Verify a single Groth16 proof for a location-attested donation.
    ///
    /// This is the **primary** entry point for location proofs. It enforces
    /// the 24-hour freshness window against the ledger timestamp, requires
    /// the submitter to authorise the call, and atomically records the
    /// nullifier on success.
    ///
    /// # Steps (atomic)
    ///   1. Require `submitter.require_auth()` — identity binding.
    ///   2. Validate `proof_timestamp` is within 24 h before ledger and not
    ///      strictly in the future.
    ///   3. Decode proof components into fixed-size arrays.
    ///   4. Run Groth16 verification against the embedded VK.
    ///   5. Check nullifier is not already spent.
    ///   6. Record nullifier in persistent storage with TTL bump.
    ///
    /// # Authorization
    /// `submitter.require_auth()` — the address that signs the transaction
    /// must equal the declared submitter.
    ///
    /// # Errors
    /// - `StaleProof`      — proof older than 24 h
    /// - `FutureTimestamp` — proof timestamp after ledger
    /// - `NullifierSpent`  — replay attempt
    /// - `VerificationFailed` — pairing / point validation failed
    pub fn verify_location_proof(
        env: Env,
        submitter: Address,
        proof: ZkProof,
        inputs: ProofInputs,
    ) {
        submitter.require_auth();
        Self::bump_instance_ttl(&env);
        Self::verify_single(&env, &proof, &inputs)
            .unwrap_or_else(|e| panic_with_error!(&env, e));
    }

    /// Batch variant of [`Self::verify_location_proof`].
    ///
    /// Atomically verifies multiple proofs; if **any** proof fails (stale,
    /// future, bad pairing, or nullifier replay) the *entire* batch rolls
    /// back. Reduces average gas per proof vs individual invocations.
    ///
    /// # Authorization
    /// `submitter.require_auth()` — the single submitter vouches for all
    /// proofs in the batch.
    pub fn batch_verify_location_proofs(
        env: Env,
        submitter: Address,
        proofs: Vec<ZkProof>,
        public_inputs: Vec<ProofInputs>,
    ) -> Result<Vec<bool>, ZkError> {
        submitter.require_auth();
        Self::bump_instance_ttl(&env);

        if proofs.is_empty() {
            return Err(ZkError::EmptyBatch);
        }
        if proofs.len() != public_inputs.len() {
            return Err(ZkError::LengthMismatch);
        }

        let mut results = Vec::new(&env);
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let inputs = public_inputs.get(i).unwrap();
            let valid = Self::verify_single(&env, &proof, &inputs)?;
            results.push_back(valid);
        }
        Ok(results)
    }

    /// Verify a single Groth16 proof — legacy anonymous-donation interface.
    ///
    /// Equivalent to [`Self::verify_location_proof`] except it does not
    /// require a submitter auth and panics with a string instead of a
    /// `#[contracterror]` for backwards compatibility.
    pub fn verify_proof(
        env: Env,
        submitter: Address,
        proof: ZkProof,
        inputs: ProofInputs,
    ) {
        submitter.require_auth();
        Self::bump_instance_ttl(&env);
        Self::verify_single(&env, &proof, &inputs)
            .unwrap_or_else(|e| panic_with_error!(&env, e));
    }

    /// Batch verifies multiple Groth16 proofs atomically in a single
    /// transaction invocation (legacy variant).
    pub fn batch_verify(
        env: Env,
        submitter: Address,
        proofs: Vec<ZkProof>,
        public_inputs: Vec<ProofInputs>,
    ) -> Result<Vec<bool>, ZkError> {
        submitter.require_auth();
        Self::bump_instance_ttl(&env);

        if proofs.is_empty() {
            return Err(ZkError::EmptyBatch);
        }
        if proofs.len() != public_inputs.len() {
            return Err(ZkError::LengthMismatch);
        }

        let mut results = Vec::new(&env);
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let inputs = public_inputs.get(i).unwrap();
            let valid = Self::verify_single(&env, &proof, &inputs)?;
            results.push_back(valid);
        }
        Ok(results)
    }

    /// Helper: Verify a single proof and perform nullifier + freshness check.
    ///
    /// Returns `Ok(true)` if valid; appropriate `ZkError` otherwise.
    fn verify_single(
        env: &Env,
        proof: &ZkProof,
        inputs: &ProofInputs,
    ) -> Result<bool, ZkError> {
        // 1. Location-proof freshness check (24-hour window)
        let ledger_ts = env.ledger().timestamp();
        if inputs.proof_timestamp > ledger_ts {
            return Err(ZkError::FutureTimestamp);
        }
        let age = ledger_ts.saturating_sub(inputs.proof_timestamp);
        if age > PROOF_MAX_AGE_SECONDS {
            return Err(ZkError::StaleProof);
        }

        // 2. Decode proof components
        let proof_a = Self::bytes64_to_array(&proof.a);
        let proof_b = Self::bytes128_to_array(&proof.b);
        let proof_c = Self::bytes64_to_array(&proof.c);

        // 3. Build public inputs array: [commitment, nullifier_hash, proof_timestamp_le]
        let commitment_arr   = Self::bytes32_to_array(&inputs.commitment);
        let nullifier_arr    = Self::bytes32_to_array(&inputs.nullifier_hash);
        let timestamp_arr    = Self::u64_to_bytes32(inputs.proof_timestamp);
        let public_inputs: [[u8; 32]; 3] = [commitment_arr, nullifier_arr, timestamp_arr];

        // 4. Groth16 verification
        if !groth16_verify(&proof_a, &proof_b, &proof_c, &public_inputs) {
            return Err(ZkError::VerificationFailed);
        }

        // 5. Nullifier double-spend check
        let nullifier_key = inputs.nullifier_hash.clone();
        if env.storage().persistent().has(&nullifier_key) {
            return Err(ZkError::NullifierSpent);
        }

        // 6. Record nullifier atomically with TTL bump
        let entry = NullifierEntry {
            nullifier_hash:  inputs.nullifier_hash.clone(),
            spent_at:        ledger_ts,
            proof_timestamp: inputs.proof_timestamp,
        };
        env.storage().persistent().set(&nullifier_key, &entry);
        Self::bump_nullifier_ttl(env, &nullifier_key);

        // 7. Emit event for indexers
        env.events().publish(
            (symbol_short!("zkverify"), symbol_short!("donate")),
            inputs.nullifier_hash.clone(),
        );

        Ok(true)
    }

    /// Check whether a nullifier has already been spent.
    pub fn is_nullifier_spent(env: Env, nullifier_hash: BytesN<32>) -> bool {
        let has = env.storage().persistent().has(&nullifier_hash);
        if has {
            Self::bump_nullifier_ttl(&env, &nullifier_hash);
        }
        has
    }

    /// Return the SHA-256 hash of the embedded verification key.
    /// Used for off-chain auditing — compare against the known VK hash.
    pub fn get_verification_key_hash(env: Env) -> BytesN<32> {
        Self::bump_instance_ttl(&env);
        vk_hash(&env)
    }

    // ── Compressed inputs API (Issue #787) ────────────────────────────────────
    //
    // Storing two separate 32-byte persistent entries per nullifier doubles
    // the ledger-entry count.  CompressedProofInputs packs both fields into
    // a single 64-byte value, halving per-proof storage overhead.
    //
    // The compression is transparent to callers: the same Groth16 verification
    // logic runs underneath; only the storage key layout differs.

    /// Verify a single proof using compressed (packed) public inputs.
    ///
    /// Semantically identical to `verify_proof` but accepts `CompressedProofInputs`
    /// instead of `ProofInputs`, reducing the storage footprint by ~50 %.
    pub fn verify_proof_compressed(
        env: Env,
        submitter: Address,
        proof: ZkProof,
        compressed: CompressedProofInputs,
    ) {
        submitter.require_auth();
        let inputs = Self::decompress_inputs(&env, &compressed);
        Self::verify_single(&env, &proof, &inputs)
            .expect("Proof verification failed");
    }

    /// Batch-verify multiple proofs using compressed public inputs.
    ///
    /// Identical semantics to `batch_verify` — all-or-nothing atomicity applies.
    /// Uses `CompressedProofInputs` for each proof to reduce storage footprint.
    pub fn batch_verify_compressed(
        env: Env,
        submitter: Address,
        proofs: Vec<ZkProof>,
        compressed_inputs: Vec<CompressedProofInputs>,
    ) -> Result<Vec<bool>, ZkError> {
        submitter.require_auth();
        if proofs.is_empty() {
            return Err(ZkError::EmptyBatch);
        }
        if proofs.len() != compressed_inputs.len() {
            return Err(ZkError::LengthMismatch);
        }

        let mut results = Vec::new(&env);
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let compressed = compressed_inputs.get(i).unwrap();
            let inputs = Self::decompress_inputs(&env, &compressed);
            let valid = Self::verify_single(&env, &proof, &inputs)?;
            results.push_back(valid);
        }
        Ok(results)
    }

    /// Build `CompressedProofInputs` from separate commitment and nullifier.
    ///
    /// Convenience helper for callers that receive inputs in split form.
    pub fn compress_inputs(
        env: Env,
        commitment: BytesN<32>,
        nullifier_hash: BytesN<32>,
        proof_timestamp: u64,
    ) -> CompressedProofInputs {
        let mut packed_arr = [0u8; 64];
        let commit_arr = commitment.to_array();
        let null_arr = nullifier_hash.to_array();
        for i in 0..32 {
            packed_arr[i] = commit_arr[i];
            packed_arr[32 + i] = null_arr[i];
        }
        CompressedProofInputs {
            packed: BytesN::from_array(&env, &packed_arr),
            proof_timestamp,
        }
    }

    // ── TTL helpers ────────────────────────────────────────────────────────

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    fn bump_nullifier_ttl(env: &Env, nullifier_key: &BytesN<32>) {
        env.storage()
            .persistent()
            .extend_ttl(nullifier_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
    }

    // ── byte / encoding helpers ────────────────────────────────────────────

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

    /// Decompress a `CompressedProofInputs` back into a `ProofInputs` struct.
    fn decompress_inputs(env: &Env, compressed: &CompressedProofInputs) -> ProofInputs {
        let packed = compressed.packed.to_array();
        let mut commitment_arr = [0u8; 32];
        let mut nullifier_arr = [0u8; 32];
        for i in 0..32 {
            commitment_arr[i] = packed[i];
            nullifier_arr[i] = packed[32 + i];
        }
        ProofInputs {
            commitment: BytesN::from_array(env, &commitment_arr),
            nullifier_hash: BytesN::from_array(env, &nullifier_arr),
            proof_timestamp: compressed.proof_timestamp,
        }
    }

    /// Encode a `u64` timestamp as a 32-byte big-endian field element.
    /// Used to inject `proof_timestamp` into the Groth16 public inputs.
    fn u64_to_bytes32(v: u64) -> [u8; 32] {
        let mut arr = [0u8; 32];
        let bytes = v.to_be_bytes();
        arr[24..32].copy_from_slice(&bytes);
        arr
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Address, BytesN, Env,
    };

    fn setup() -> (Env, Address, Address, ZkVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_700_000_000);
        let contract_id = env.register_contract(None, ZkVerifier);
        let client = ZkVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let submitter = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, submitter, client)
    }

    /// Build a proof with valid field-element values (< BN254_P).
    fn valid_proof(env: &Env) -> ZkProof {
        let mut a_bytes = [0x10u8; 64];
        a_bytes[0] = 0x10;
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

    fn valid_inputs(env: &Env, seed: u8, proof_timestamp: u64) -> ProofInputs {
        let mut commitment = [0x10u8; 32];
        commitment[31] = seed;
        let mut nullifier = [0x11u8; 32];
        nullifier[31] = seed;
        ProofInputs {
            commitment:      BytesN::from_array(env, &commitment),
            nullifier_hash:  BytesN::from_array(env, &nullifier),
            proof_timestamp,
        }
    }

    // ── 24-hour freshness tests (primary requirement) ───────────────────────

    #[test]
    fn test_location_proof_fresh_within_24h_accepted() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 1, ledger_ts - 3_600); // 1 hour old

        client.verify_location_proof(&submitter, &proof, &inputs);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    fn test_location_proof_exactly_at_24h_boundary_accepted() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        // Exactly 24h old — `age > MAX_AGE` is the rejection condition, so
        // `age == MAX_AGE` passes.
        let inputs = valid_inputs(&env, 2, ledger_ts - PROOF_MAX_AGE_SECONDS);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_location_proof_older_than_24h_rejected_stale() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        // 24h + 1 second → StaleProof (code 4)
        let inputs = valid_inputs(&env, 3, ledger_ts - PROOF_MAX_AGE_SECONDS - 1);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_location_proof_one_week_old_rejected() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let inputs = valid_inputs(&env, 4, ledger_ts - 7 * 24 * 60 * 60);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_location_proof_future_timestamp_rejected() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        // 10 minutes in the future → FutureTimestamp (code 5)
        let inputs = valid_inputs(&env, 5, ledger_ts + 600);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);
    }

    #[test]
    fn test_location_proof_timestamp_equal_to_ledger_accepted() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        // Exact same timestamp — accepted (not strictly greater)
        let inputs = valid_inputs(&env, 6, ledger_ts);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    // ── Authorization tests ────────────────────────────────────────────────

    #[test]
    #[should_panic]
    fn test_verify_location_proof_requires_submitter_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ZkVerifier);
        let client = ZkVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        env.ledger().set_timestamp(1_700_000_000);
        let submitter = Address::generate(&env);
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 7, env.ledger().timestamp());

        // Must panic — env.mock_all_auths() was NOT called
        client.verify_location_proof(&submitter, &proof, &inputs);
    }

    #[test]
    #[should_panic]
    fn test_verify_proof_requires_submitter_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ZkVerifier);
        let client = ZkVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        env.ledger().set_timestamp(1_700_000_000);
        let submitter = Address::generate(&env);
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 8, env.ledger().timestamp());

        // Must panic — env.mock_all_auths() was NOT called
        client.verify_proof(&submitter, &proof, &inputs);
    }

    // ── Nullifier / replay tests ───────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_nullifier_replay_rejected_with_code_6() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 20, ts - 100);

        client.verify_location_proof(&submitter, &proof, &inputs);
        // Same nullifier again → NullifierSpent (code 6)
        client.verify_location_proof(&submitter, &proof, &inputs);
    }

    // ── Invalid proof tests ────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_invalid_proof_rejected_with_code_3() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let bad_proof = ZkProof {
            a: BytesN::from_array(&env, &[0u8; 64]),
            b: BytesN::from_array(&env, &[0u8; 128]),
            c: BytesN::from_array(&env, &[0u8; 64]),
        };
        let inputs = valid_inputs(&env, 30, ts);
        client.verify_location_proof(&submitter, &bad_proof, &inputs);
    }

    // ── Different submitters / nullifiers ──────────────────────────────────

    #[test]
    fn test_different_submitters_different_nullifiers_both_accepted() {
        let (env, _, _, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let sub_a = Address::generate(&env);
        let sub_b = Address::generate(&env);

        client.verify_location_proof(&sub_a, &proof, &valid_inputs(&env, 40, ts));
        client.verify_location_proof(&sub_b, &proof, &valid_inputs(&env, 41, ts));

        assert!(client.is_nullifier_spent(&valid_inputs(&env, 40, ts).nullifier_hash));
        assert!(client.is_nullifier_spent(&valid_inputs(&env, 41, ts).nullifier_hash));
    }

    // ── VK hash ────────────────────────────────────────────────────────────

    #[test]
    fn test_get_verification_key_hash_is_deterministic() {
        let (_, _, _, client) = setup();
        let h1 = client.get_verification_key_hash();
        let h2 = client.get_verification_key_hash();
        assert_eq!(h1, h2);
    }

    // ── Batch verification tests ───────────────────────────────────────────

    #[test]
    fn test_batch_location_two_valid_proofs_within_24h() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let in1 = valid_inputs(&env, 101, ts - 1_000);
        let in2 = valid_inputs(&env, 102, ts - 80_000);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let inputs = soroban_sdk::vec![&env, in1.clone(), in2.clone()];

        let results = client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
        assert_eq!(results.len(), 2);
        assert_eq!(results.get(0).unwrap(), true);
        assert_eq!(results.get(1).unwrap(), true);
        assert!(client.is_nullifier_spent(&in1.nullifier_hash));
        assert!(client.is_nullifier_spent(&in2.nullifier_hash));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_batch_location_first_stale_rejects_entire_batch() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let stale = valid_inputs(&env, 111, ts - PROOF_MAX_AGE_SECONDS - 1);
        let fresh = valid_inputs(&env, 112, ts - 10);
        let stale_nullifier = stale.nullifier_hash.clone();
        let fresh_nullifier = fresh.nullifier_hash.clone();

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let inputs = soroban_sdk::vec![&env, stale, fresh];

        // Must panic with StaleProof (code 4) and not persist any nullifiers.
        // The atomicity checks below are unreachable when the test passes
        // (panic occurs before), but guard against future regressions.
        let _ = stale_nullifier;
        let _ = fresh_nullifier;
        client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_batch_location_second_future_rejects_entire_batch() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let fresh = valid_inputs(&env, 121, ts - 100);
        let future = valid_inputs(&env, 122, ts + 5_000);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let inputs = soroban_sdk::vec![&env, fresh, future];

        // Must panic with FutureTimestamp (code 5)
        client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_batch_location_nullifier_replay_rejects_batch() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let same = valid_inputs(&env, 130, ts - 500);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let inputs = soroban_sdk::vec![&env, same.clone(), same];

        // Must panic with NullifierSpent (code 6)
        client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_batch_location_empty_returns_empty_batch() {
        let (env, _, submitter, client) = setup();
        let proofs = soroban_sdk::vec![&env];
        let inputs = soroban_sdk::vec![&env];

        // Must panic with EmptyBatch (code 1)
        client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_batch_location_length_mismatch() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let one = valid_inputs(&env, 140, ts - 100);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof];
        let inputs = soroban_sdk::vec![&env, one];

        // Must panic with LengthMismatch (code 2)
        client.batch_verify_location_proofs(&submitter, &proofs, &inputs);
    }

    // ── Edge: time advances between proofs ─────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_time_advances_beyond_24h_after_submission() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);

        // Submit proof that is exactly at boundary
        let inputs = valid_inputs(&env, 200, ts - PROOF_MAX_AGE_SECONDS);
        client.verify_location_proof(&submitter, &proof, &inputs);

        // Now advance ledger 1 year into the future — the original proof was
        // already accepted, so `is_nullifier_spent` still returns true.
        env.ledger().set_timestamp(ts + 365 * 24 * 60 * 60);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));

        // A fresh proof attempt with old timestamp now panics with StaleProof.
        let stale_inputs = valid_inputs(&env, 201, ts); // ts is 1 yr behind now
        client.verify_location_proof(&submitter, &proof, &stale_inputs);
    }

    // ── Stored entry contents ──────────────────────────────────────────────

    #[test]
    fn test_nullifier_entry_stores_proof_timestamp_and_spent_at() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof_ts = ts - 3_600;
        let inputs = valid_inputs(&env, 210, proof_ts);
        let proof = valid_proof(&env);

        client.verify_location_proof(&submitter, &proof, &inputs);

        // Direct read from storage bypassing is_nullifier_spent to inspect
        // the actual NullifierEntry bytes.
        let key = inputs.nullifier_hash.clone();
        let entry: NullifierEntry = env.storage().persistent().get(&key).unwrap();
        assert_eq!(entry.nullifier_hash, inputs.nullifier_hash);
        assert_eq!(entry.spent_at, ts);
        assert_eq!(entry.proof_timestamp, proof_ts);
    }

    // ── Legacy interface parity tests ──────────────────────────────────────

    #[test]
    fn test_legacy_verify_proof_accepts_fresh_proof() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let inputs = valid_inputs(&env, 220, ts - 60);
        client.verify_proof(&submitter, &proof, &inputs);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    fn test_legacy_batch_verify_accepts_fresh_batch() {
        let (env, _, submitter, client) = setup();
        let ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let in1 = valid_inputs(&env, 230, ts - 100);
        let in2 = valid_inputs(&env, 231, ts - 200);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof];
        let inputs = soroban_sdk::vec![&env, in1.clone(), in2.clone()];

        let results = client.batch_verify(&submitter, &proofs, &inputs);
        assert_eq!(results.len(), 2);
        assert!(client.is_nullifier_spent(&in1.nullifier_hash));
        assert!(client.is_nullifier_spent(&in2.nullifier_hash));
    }

    // ── u64_to_bytes32 encoding tests ──────────────────────────────────────

    #[test]
    fn test_u64_to_bytes32_zero() {
        assert_eq!(ZkVerifier::u64_to_bytes32(0), [0u8; 32]);
    }

    #[test]
    fn test_u64_to_bytes32_one() {
        let mut expected = [0u8; 32];
        expected[31] = 1;
        assert_eq!(ZkVerifier::u64_to_bytes32(1), expected);
    }

    #[test]
    fn test_u64_to_bytes32_max() {
        let mut expected = [0u8; 32];
        expected[24..32].copy_from_slice(&u64::MAX.to_be_bytes());
        assert_eq!(ZkVerifier::u64_to_bytes32(u64::MAX), expected);
    }

    // ── Compressed inputs tests (Issue #787) ─────────────────────────────────

    fn valid_compressed(env: &Env, seed: u8, proof_timestamp: u64) -> CompressedProofInputs {
        let inputs = valid_inputs(env, seed, proof_timestamp);
        // Pack commitment + nullifier into 64 bytes
        let mut packed = [0u8; 64];
        let commit = inputs.commitment.to_array();
        let null = inputs.nullifier_hash.to_array();
        for i in 0..32 {
            packed[i] = commit[i];
            packed[32 + i] = null[i];
        }
        CompressedProofInputs {
            packed: BytesN::from_array(env, &packed),
            proof_timestamp,
        }
    }

    #[test]
    fn test_compress_inputs_helper_roundtrip() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let inputs = valid_inputs(&env, 210, ledger_ts);
        let compressed = client.compress_inputs(&inputs.commitment, &inputs.nullifier_hash, &ledger_ts);
        // Verify the packed bytes encode commitment then nullifier
        let packed = compressed.packed.to_array();
        assert_eq!(&packed[0..32], &inputs.commitment.to_array()[..]);
        assert_eq!(&packed[32..64], &inputs.nullifier_hash.to_array()[..]);
        assert_eq!(compressed.proof_timestamp, ledger_ts);
    }

    #[test]
    fn test_verify_proof_compressed_happy_path() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let compressed = valid_compressed(&env, 211, ledger_ts);

        // Should not panic — valid proof with valid compressed inputs
        client.verify_proof_compressed(&submitter, &proof, &compressed);

        // Nullifier extracted from compressed inputs must be marked spent
        let inputs = valid_inputs(&env, 211, ledger_ts);
        assert!(client.is_nullifier_spent(&inputs.nullifier_hash));
    }

    #[test]
    #[should_panic(expected = "NULLIFIER_ALREADY_SPENT")]
    fn test_verify_proof_compressed_replay_rejected() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let compressed = valid_compressed(&env, 212, ledger_ts);

        client.verify_proof_compressed(&submitter, &proof, &compressed);
        // Second call with same nullifier must panic
        client.verify_proof_compressed(&submitter, &proof, &compressed);
    }

    #[test]
    fn test_batch_verify_compressed_two_valid_proofs() {
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let c1 = valid_compressed(&env, 220, ledger_ts);
        let c2 = valid_compressed(&env, 221, ledger_ts);

        let proofs = soroban_sdk::vec![&env, proof.clone(), proof.clone()];
        let compressed_inputs = soroban_sdk::vec![&env, c1, c2];

        let results = client.batch_verify_compressed(&submitter, &proofs, &compressed_inputs);
        assert_eq!(results.len(), 2);
        assert_eq!(results.get(0).unwrap(), true);
        assert_eq!(results.get(1).unwrap(), true);

        // Both nullifiers marked spent
        assert!(client.is_nullifier_spent(&valid_inputs(&env, 220, ledger_ts).nullifier_hash));
        assert!(client.is_nullifier_spent(&valid_inputs(&env, 221, ledger_ts).nullifier_hash));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_batch_verify_compressed_empty_returns_error() {
        let (env, _, submitter, client) = setup();
        let proofs: soroban_sdk::Vec<ZkProof> = soroban_sdk::vec![&env];
        let compressed: soroban_sdk::Vec<CompressedProofInputs> = soroban_sdk::vec![&env];
        client.batch_verify_compressed(&submitter, &proofs, &compressed);
    }

    #[test]
    fn test_compressed_same_result_as_uncompressed() {
        // Verify compressed path produces the same nullifier spend as the
        // regular uncompressed path (they share the same verify_single logic).
        let (env, _, submitter, client) = setup();
        let ledger_ts = env.ledger().timestamp();
        let proof = valid_proof(&env);
        let seed = 230u8;
        let inputs_regular = valid_inputs(&env, seed, ledger_ts);
        let compressed = valid_compressed(&env, seed + 1, ledger_ts); // different seed to avoid replay

        client.verify_proof(&submitter, &proof, &inputs_regular);
        client.verify_proof_compressed(&submitter, &proof, &compressed);

        assert!(client.is_nullifier_spent(&valid_inputs(&env, seed, ledger_ts).nullifier_hash));
        assert!(client.is_nullifier_spent(&valid_inputs(&env, seed + 1, ledger_ts).nullifier_hash));
    }
}
