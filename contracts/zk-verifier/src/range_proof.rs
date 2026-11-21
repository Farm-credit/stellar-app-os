//! ZK Range Proof Verifier — Circuit 3 (Tree Growth Height Range Proof)
//!
//! Verifies zero-knowledge range proofs that validate tree height growth
//! metrics fall within biologically plausible bounds, **without revealing
//! the raw sensor measurements on-chain**.
//!
//! # Protocol
//!
//! Off-chain, the oracle holds the raw sensor reading `h` (height in
//! millimetres).  It generates a Groth16 range proof attesting:
//!
//!   `MIN_HEIGHT_MM ≤ h ≤ MAX_HEIGHT_MM`
//!
//! The proof's public inputs are:
//!   - `height_commitment` — Pedersen commitment to `h` (hides the raw value)
//!   - `range_hash`        — SHA-256(MIN_HEIGHT_MM ∥ MAX_HEIGHT_MM) (public bounds)
//!   - `tree_id`           — 32-byte on-chain tree identifier (links proof to tree)
//!
//! On-chain the contract verifies the proof and, if valid, records a
//! `GrowthRecord` so downstream contracts (e.g. `tree-registry`) can trust
//! the metric without ever seeing the raw sensor value.
//!
//! # Storage layout
//!
//! - `(GRANGE, tree_id)` → `GrowthRecord`  (persistent, latest verified record)
//! - `(RNULL, proof_id)` → `u64` ledger timestamp  (persistent, spent proof IDs)
//! - `ADMIN`             → `Address`        (instance)
//! - `PAUSED`            → `bool`           (instance, emergency pause)
//!
//! # Security properties
//!
//! - **Replay prevention**: each proof carries a unique `proof_id`
//!   (nullifier) — once recorded it cannot be replayed.
//! - **Admin-gated registration**: only the admin can register new trees
//!   and update height bounds.
//! - **Oracle authorization**: `submit_growth_proof` requires the oracle
//!   to authenticate via `require_auth()`.
//! - **Emergency pause**: admin can halt proof submission without wiping state.
//! - **Storage TTL**: instance storage is bumped on every write to stay live.

use crate::groth16::{groth16_verify, is_valid_field_element};
use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, panic_with_error, symbol_short,
    Address, Bytes, BytesN, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum valid tree height in millimetres (10 mm — newly germinated seedling).
pub const MIN_HEIGHT_MM: u32 = 10;

/// Maximum valid tree height in millimetres (50 000 mm = 50 m, tropical canopy).
pub const MAX_HEIGHT_MM: u32 = 50_000;

/// Maximum proofs per batch call.
pub const MAX_BATCH_RANGE: u32 = 10;

/// Persistent storage TTL extension in ledgers (~30 days at 5 s/ledger).
const PERSISTENT_TTL_LEDGERS: u32 = 518_400;

/// Instance storage TTL extension in ledgers (~7 days).
const INSTANCE_TTL_LEDGERS: u32 = 120_960;

// ── Error enum ────────────────────────────────────────────────────────────────

/// Errors specific to the ZK range-proof verifier.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum RangeProofError {
    /// Contract has not been initialised yet.
    NotInitialized = 1,
    /// Contract was already initialised.
    AlreadyInitialized = 2,
    /// Caller is not the admin.
    Unauthorized = 3,
    /// Proof submission is paused by the admin.
    ContractPaused = 4,
    /// This proof ID (nullifier) has already been recorded — replay attempt.
    ProofAlreadySpent = 5,
    /// The Groth16 proof failed structural or pairing validation.
    InvalidProof = 6,
    /// The public `range_hash` does not match the registered bounds for the tree.
    RangeHashMismatch = 7,
    /// No tree is registered under the given `tree_id`.
    TreeNotRegistered = 8,
    /// Tree with this ID is already registered.
    TreeAlreadyRegistered = 9,
    /// Proposed height bounds are invalid (min >= max, or out of global limits).
    InvalidHeightBounds = 10,
    /// Batch Vec is empty.
    EmptyBatch = 11,
    /// Batch Vecs have different lengths.
    BatchLengthMismatch = 12,
    /// Batch size exceeds MAX_BATCH_RANGE.
    BatchTooLarge = 13,
    /// A public input field element is out of the BN254 field range.
    InvalidFieldElement = 14,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Groth16 proof components (BN254) — identical layout to `ZkProof` in lib.rs
/// but kept separate so the two circuits remain independently evolvable.
///
/// - `a`: G1 point, 64 bytes (x ∥ y)
/// - `b`: G2 point, 128 bytes (x_re ∥ x_im ∥ y_re ∥ y_im)
/// - `c`: G1 point, 64 bytes (x ∥ y)
#[contracttype]
#[derive(Clone, Debug)]
pub struct RangeProof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// Public inputs for Circuit 3 (range proof).
///
/// - `height_commitment` — Pedersen commitment to the raw height value `h`.
///   Hides the sensor reading while binding the proof to a specific measurement.
/// - `range_hash`        — SHA-256(min_height_mm_be ∥ max_height_mm_be).
///   Both bounds are encoded as 4-byte big-endian values, zero-padded to 32
///   bytes before hashing: SHA-256(0x0000…<min_4B> ∥ 0x0000…<max_4B>).
/// - `tree_id`           — 32-byte on-chain tree identifier.
///   Links this proof to a specific registered tree entry.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RangeProofInputs {
    /// Pedersen commitment to the raw height reading (hides actual value).
    pub height_commitment: BytesN<32>,
    /// SHA-256 of the encoded height bounds (public integrity anchor).
    pub range_hash: BytesN<32>,
    /// On-chain tree identifier this proof is associated with.
    pub tree_id: BytesN<32>,
}

/// Per-tree configuration: approved height bounds and expected range_hash.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TreeHeightConfig {
    /// Minimum allowed height in millimetres for this tree.
    pub min_height_mm: u32,
    /// Maximum allowed height in millimetres for this tree.
    pub max_height_mm: u32,
    /// Precomputed SHA-256(min_height_mm_padded ∥ max_height_mm_padded).
    /// Stored so on-chain verification is a single 32-byte equality check.
    pub range_hash: BytesN<32>,
    /// Ledger timestamp when the config was registered or last updated.
    pub registered_at: u64,
}

/// A single verified growth record stored per tree after a successful proof.
#[contracttype]
#[derive(Clone, Debug)]
pub struct GrowthRecord {
    /// The verified Pedersen commitment (height is in the configured range).
    pub height_commitment: BytesN<32>,
    /// The unique proof ID (nullifier) used to prevent replays.
    pub proof_id: BytesN<32>,
    /// Ledger sequence number at verification time.
    pub verified_ledger: u32,
    /// Ledger timestamp at verification time.
    pub verified_at: u64,
    /// Address of the oracle that submitted the proof.
    pub oracle: Address,
}

// ── Storage key helpers ───────────────────────────────────────────────────────

fn growth_key(env: &Env, tree_id: &BytesN<32>) -> soroban_sdk::Val {
    use soroban_sdk::IntoVal;
    (symbol_short!("GRANGE"), tree_id.clone()).into_val(env)
}

fn config_key(env: &Env, tree_id: &BytesN<32>) -> soroban_sdk::Val {
    use soroban_sdk::IntoVal;
    (symbol_short!("THTCFG"), tree_id.clone()).into_val(env)
}

fn nullifier_key(env: &Env, proof_id: &BytesN<32>) -> soroban_sdk::Val {
    use soroban_sdk::IntoVal;
    (symbol_short!("RNULL"), proof_id.clone()).into_val(env)
}

/// Bump instance TTL on every mutating call.
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_LEDGERS, INSTANCE_TTL_LEDGERS);
}

/// Bump a persistent entry's TTL.
fn bump_persistent(env: &Env, key: &soroban_sdk::Val) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_LEDGERS, PERSISTENT_TTL_LEDGERS);
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkRangeVerifier;

#[contractimpl]
impl ZkRangeVerifier {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// One-time initialisation — sets the admin address.
    ///
    /// Must be called before any other function.
    /// Panics with [`RangeProofError::AlreadyInitialized`] if called again.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, RangeProofError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        bump_instance(&env);
    }

    // ── Admin operations ──────────────────────────────────────────────────────

    /// Register a tree with its allowed height bounds.
    ///
    /// Computes and stores the `range_hash` = SHA-256(min ∥ max) so that
    /// future proof submissions can be validated with a single equality check.
    ///
    /// # Authorization
    /// Requires admin `require_auth()`.
    ///
    /// # Errors
    /// - [`RangeProofError::Unauthorized`]       — caller is not admin
    /// - [`RangeProofError::TreeAlreadyRegistered`] — tree_id already exists
    /// - [`RangeProofError::InvalidHeightBounds`]   — min >= max or bounds
    ///   outside the global [MIN_HEIGHT_MM, MAX_HEIGHT_MM] range
    pub fn register_tree(
        env: Env,
        tree_id: BytesN<32>,
        min_height_mm: u32,
        max_height_mm: u32,
    ) {
        Self::require_admin_auth(&env);

        if min_height_mm < MIN_HEIGHT_MM
            || max_height_mm > MAX_HEIGHT_MM
            || min_height_mm >= max_height_mm
        {
            panic_with_error!(&env, RangeProofError::InvalidHeightBounds);
        }

        let cfg_key = config_key(&env, &tree_id);
        if env.storage().persistent().has(&cfg_key) {
            panic_with_error!(&env, RangeProofError::TreeAlreadyRegistered);
        }

        let range_hash = Self::range_hash_internal(&env, min_height_mm, max_height_mm);

        let config = TreeHeightConfig {
            min_height_mm,
            max_height_mm,
            range_hash,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&cfg_key, &config);
        bump_persistent(&env, &cfg_key);
        bump_instance(&env);

        env.events().publish(
            (symbol_short!("rngReg"), tree_id.clone()),
            (min_height_mm, max_height_mm),
        );
    }

    /// Update the allowed height bounds for an already-registered tree.
    ///
    /// Recomputes and stores the new `range_hash`. Future proofs must use
    /// the new bounds; previously verified proofs are unaffected.
    ///
    /// # Authorization
    /// Requires admin `require_auth()`.
    ///
    /// # Errors
    /// - [`RangeProofError::Unauthorized`]       — caller is not admin
    /// - [`RangeProofError::TreeNotRegistered`]  — tree_id not found
    /// - [`RangeProofError::InvalidHeightBounds`]— same as `register_tree`
    pub fn update_tree_bounds(
        env: Env,
        tree_id: BytesN<32>,
        min_height_mm: u32,
        max_height_mm: u32,
    ) {
        Self::require_admin_auth(&env);

        if min_height_mm < MIN_HEIGHT_MM
            || max_height_mm > MAX_HEIGHT_MM
            || min_height_mm >= max_height_mm
        {
            panic_with_error!(&env, RangeProofError::InvalidHeightBounds);
        }

        let cfg_key = config_key(&env, &tree_id);
        let mut config: TreeHeightConfig = env
            .storage()
            .persistent()
            .get(&cfg_key)
            .unwrap_or_else(|| panic_with_error!(&env, RangeProofError::TreeNotRegistered));

        config.min_height_mm = min_height_mm;
        config.max_height_mm = max_height_mm;
        config.range_hash = Self::compute_range_hash(&env, min_height_mm, max_height_mm);

        env.storage().persistent().set(&cfg_key, &config);
        bump_persistent(&env, &cfg_key);
        bump_instance(&env);

        env.events().publish(
            (symbol_short!("rngUpd"), tree_id.clone()),
            (min_height_mm, max_height_mm),
        );
    }

    /// Pause all proof submissions (emergency circuit breaker).
    ///
    /// # Authorization
    /// Requires admin `require_auth()`.
    pub fn pause(env: Env) {
        Self::require_admin_auth(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        bump_instance(&env);
    }

    /// Resume proof submissions after a pause.
    ///
    /// # Authorization
    /// Requires admin `require_auth()`.
    pub fn unpause(env: Env) {
        Self::require_admin_auth(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        bump_instance(&env);
    }

    // ── Oracle proof submission ────────────────────────────────────────────────

    /// Submit and verify a single ZK range proof for a tree's height metric.
    ///
    /// Steps (atomic):
    ///   1. Assert contract is not paused.
    ///   2. Oracle `require_auth()`.
    ///   3. Validate public input field elements are within BN254 bounds.
    ///   4. Assert the tree is registered.
    ///   5. Verify the `range_hash` in the proof matches the stored config.
    ///   6. Assert this `proof_id` (nullifier) has not been spent.
    ///   7. Run Groth16 structural verification.
    ///   8. Record nullifier and growth record atomically.
    ///   9. Emit `rngVerif` event.
    ///
    /// # Parameters
    /// - `oracle`    — address of the off-chain oracle submitting the proof
    /// - `proof`     — Groth16 proof components
    /// - `inputs`    — public inputs (commitment, range_hash, tree_id)
    /// - `proof_id`  — unique nullifier for this proof (prevents replay)
    ///
    /// # Authorization
    /// `oracle` must sign the transaction.
    ///
    /// # Errors
    /// - [`RangeProofError::ContractPaused`]
    /// - [`RangeProofError::InvalidFieldElement`]
    /// - [`RangeProofError::TreeNotRegistered`]
    /// - [`RangeProofError::RangeHashMismatch`]
    /// - [`RangeProofError::ProofAlreadySpent`]
    /// - [`RangeProofError::InvalidProof`]
    pub fn submit_growth_proof(
        env: Env,
        oracle: Address,
        proof: RangeProof,
        inputs: RangeProofInputs,
        proof_id: BytesN<32>,
    ) {
        Self::assert_not_paused(&env);
        oracle.require_auth();

        Self::verify_and_record(&env, &oracle, &proof, &inputs, &proof_id);
    }

    /// Batch-submit up to [`MAX_BATCH_RANGE`] growth proofs atomically.
    ///
    /// All proofs are validated before any state is written (all-or-nothing).
    /// If any proof fails, the entire batch is rejected.
    ///
    /// # Parameters
    /// - `oracle`    — oracle address (single auth covers whole batch)
    /// - `proofs`    — Groth16 proofs
    /// - `inputs`    — public inputs, one per proof
    /// - `proof_ids` — unique nullifiers, one per proof
    ///
    /// # Authorization
    /// `oracle` must sign the transaction once for the whole batch.
    ///
    /// # Errors
    /// - [`RangeProofError::EmptyBatch`]
    /// - [`RangeProofError::BatchLengthMismatch`]
    /// - [`RangeProofError::BatchTooLarge`]
    /// - Plus all single-proof errors for any entry
    pub fn batch_submit_growth_proofs(
        env: Env,
        oracle: Address,
        proofs: Vec<RangeProof>,
        inputs: Vec<RangeProofInputs>,
        proof_ids: Vec<BytesN<32>>,
    ) {
        Self::assert_not_paused(&env);
        oracle.require_auth();

        if proofs.is_empty() {
            panic_with_error!(&env, RangeProofError::EmptyBatch);
        }
        if proofs.len() != inputs.len() || proofs.len() != proof_ids.len() {
            panic_with_error!(&env, RangeProofError::BatchLengthMismatch);
        }
        if proofs.len() > MAX_BATCH_RANGE {
            panic_with_error!(&env, RangeProofError::BatchTooLarge);
        }

        // Validation phase — check everything before touching state
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let inp = inputs.get(i).unwrap();
            let pid = proof_ids.get(i).unwrap();
            Self::validate_proof_inputs(&env, &proof, &inp, &pid);
        }

        // Write phase — only reached if all validations passed
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let inp = inputs.get(i).unwrap();
            let pid = proof_ids.get(i).unwrap();
            Self::verify_and_record(&env, &oracle, &proof, &inp, &pid);
        }
    }

    // ── Read-only queries ─────────────────────────────────────────────────────

    /// Returns the latest verified growth record for a tree, if any.
    pub fn get_growth_record(env: Env, tree_id: BytesN<32>) -> Option<GrowthRecord> {
        env.storage()
            .persistent()
            .get(&growth_key(&env, &tree_id))
    }

    /// Returns the height configuration for a registered tree, if any.
    pub fn get_tree_config(env: Env, tree_id: BytesN<32>) -> Option<TreeHeightConfig> {
        env.storage()
            .persistent()
            .get(&config_key(&env, &tree_id))
    }

    /// Returns true if a proof ID (nullifier) has already been spent.
    pub fn is_proof_spent(env: Env, proof_id: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&nullifier_key(&env, &proof_id))
    }

    /// Returns true if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    /// Compute SHA-256(min_padded_32B ∥ max_padded_32B) for height bounds.
    ///
    /// Exposed as a contract function so off-chain clients can compute the
    /// expected `range_hash` value to embed in their ZK proof's public inputs,
    /// without needing to replicate the exact byte encoding off-chain.
    ///
    /// Encoding: each bound is written as 4-byte big-endian in the last 4
    /// bytes of a 32-byte zero-padded buffer, matching the circuit's
    /// field-element encoding.
    pub fn compute_range_hash(env: Env, min_height_mm: u32, max_height_mm: u32) -> BytesN<32> {
        Self::range_hash_internal(&env, min_height_mm, max_height_mm)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Full validation + state mutation for a single proof.
    fn verify_and_record(
        env: &Env,
        oracle: &Address,
        proof: &RangeProof,
        inputs: &RangeProofInputs,
        proof_id: &BytesN<32>,
    ) {
        // 1. Validate field elements and proof structure
        Self::validate_proof_inputs(env, proof, inputs, proof_id);

        // 2. Retrieve tree config
        let cfg_key = config_key(env, &inputs.tree_id);
        let config: TreeHeightConfig = env
            .storage()
            .persistent()
            .get(&cfg_key)
            .unwrap_or_else(|| panic_with_error!(env, RangeProofError::TreeNotRegistered));

        // 3. Verify the range_hash matches the registered config
        if inputs.range_hash != config.range_hash {
            panic_with_error!(env, RangeProofError::RangeHashMismatch);
        }

        // 4. Nullifier check
        let null_key = nullifier_key(env, proof_id);
        if env.storage().persistent().has(&null_key) {
            panic_with_error!(env, RangeProofError::ProofAlreadySpent);
        }

        // 5. Groth16 structural verification
        let proof_a = Self::bytes64_to_array(&proof.a);
        let proof_b = Self::bytes128_to_array(&proof.b);
        let proof_c = Self::bytes64_to_array(&proof.c);

        let commitment_arr = Self::bytes32_to_array(&inputs.height_commitment);
        let range_hash_arr = Self::bytes32_to_array(&inputs.range_hash);
        let tree_id_arr = Self::bytes32_to_array(&inputs.tree_id);
        let public_inputs: [[u8; 32]; 3] = [commitment_arr, range_hash_arr, tree_id_arr];

        if !groth16_verify(&proof_a, &proof_b, &proof_c, &public_inputs) {
            panic_with_error!(env, RangeProofError::InvalidProof);
        }

        // 6. Record nullifier (prevents replay)
        env.storage()
            .persistent()
            .set(&null_key, &env.ledger().timestamp());
        bump_persistent(env, &null_key);

        // 7. Store growth record (overwrites previous — each tree stores its latest)
        let record = GrowthRecord {
            height_commitment: inputs.height_commitment.clone(),
            proof_id: proof_id.clone(),
            verified_ledger: env.ledger().sequence(),
            verified_at: env.ledger().timestamp(),
            oracle: oracle.clone(),
        };
        let g_key = growth_key(env, &inputs.tree_id);
        env.storage().persistent().set(&g_key, &record);
        bump_persistent(env, &g_key);
        bump_instance(env);

        // 8. Emit event for indexers
        env.events().publish(
            (symbol_short!("rngVerif"), inputs.tree_id.clone()),
            (inputs.height_commitment.clone(), proof_id.clone()),
        );
    }

    /// Pure validation — checks field elements and structural validity.
    /// Does NOT touch storage.  Called in both single and batch paths so
    /// the batch can validate-all-then-write-all atomically.
    fn validate_proof_inputs(
        env: &Env,
        proof: &RangeProof,
        inputs: &RangeProofInputs,
        _proof_id: &BytesN<32>,
    ) {
        let commitment_arr = Self::bytes32_to_array(&inputs.height_commitment);
        let range_hash_arr = Self::bytes32_to_array(&inputs.range_hash);
        let tree_id_arr = Self::bytes32_to_array(&inputs.tree_id);

        if !is_valid_field_element(&commitment_arr)
            || !is_valid_field_element(&range_hash_arr)
            || !is_valid_field_element(&tree_id_arr)
        {
            panic_with_error!(env, RangeProofError::InvalidFieldElement);
        }

        // Validate G1/G2 points in proof
        let proof_a = Self::bytes64_to_array(&proof.a);
        let proof_b = Self::bytes128_to_array(&proof.b);
        let proof_c = Self::bytes64_to_array(&proof.c);

        use crate::groth16::{is_valid_g1, is_valid_g2};
        if !is_valid_g1(&proof_a) || !is_valid_g2(&proof_b) || !is_valid_g1(&proof_c) {
            panic_with_error!(env, RangeProofError::InvalidProof);
        }
    }

    /// Compute SHA-256(min_padded_32B ∥ max_padded_32B) for height bounds.
    ///
    /// Encoding: each bound is written as 4-byte big-endian in the last 4
    /// bytes of a 32-byte zero-padded buffer, matching the circuit's
    /// field-element encoding.
    fn range_hash_internal(env: &Env, min_height_mm: u32, max_height_mm: u32) -> BytesN<32> {
        let mut buf = [0u8; 64];
        let min_bytes = min_height_mm.to_be_bytes();
        let max_bytes = max_height_mm.to_be_bytes();
        // Place each 4-byte value at offset 28 within its 32-byte slot
        buf[28..32].copy_from_slice(&min_bytes);
        buf[60..64].copy_from_slice(&max_bytes);

        let mut preimage = Bytes::new(env);
        preimage.extend_from_array(&buf);
        env.crypto().sha256(&preimage).into()
    }

    fn require_admin_auth(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, RangeProofError::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, RangeProofError::ContractPaused);
        }
    }

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

    // ── Setup helpers ─────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, ZkRangeVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkRangeVerifier);
        let client = ZkRangeVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    /// Returns a valid proof with field elements safely below BN254_P.
    fn valid_proof(env: &Env) -> RangeProof {
        let mut a = [0x10u8; 64];
        a[0] = 0x10;
        let mut b = [0x10u8; 128];
        b[0] = 0x10;
        let mut c = [0x10u8; 64];
        c[0] = 0x10;
        RangeProof {
            a: BytesN::from_array(env, &a),
            b: BytesN::from_array(env, &b),
            c: BytesN::from_array(env, &c),
        }
    }

    /// Returns an invalid proof (zero G1 points fail is_valid_g1).
    fn invalid_proof(env: &Env) -> RangeProof {
        RangeProof {
            a: BytesN::from_array(env, &[0u8; 64]),
            b: BytesN::from_array(env, &[0x10u8; 128]),
            c: BytesN::from_array(env, &[0u8; 64]),
        }
    }

    fn tree_id(env: &Env, seed: u8) -> BytesN<32> {
        let mut arr = [0x10u8; 32];
        arr[31] = seed;
        BytesN::from_array(env, &arr)
    }

    fn proof_id(env: &Env, seed: u8) -> BytesN<32> {
        let mut arr = [0x20u8; 32];
        arr[31] = seed;
        BytesN::from_array(env, &arr)
    }

    fn build_inputs(
        env: &Env,
        tree: &BytesN<32>,
        range_hash: &BytesN<32>,
        seed: u8,
    ) -> RangeProofInputs {
        let mut commitment = [0x10u8; 32];
        commitment[31] = seed;
        RangeProofInputs {
            height_commitment: BytesN::from_array(env, &commitment),
            range_hash: range_hash.clone(),
            tree_id: tree.clone(),
        }
    }

    // ── Initialization ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_admin() {
        let (env, _, client) = setup();
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_double_initialize_panics() {
        let (env, _, client) = setup();
        let other = Address::generate(&env);
        client.initialize(&other);
    }

    // ── Tree registration ─────────────────────────────────────────────────────

    #[test]
    fn test_register_tree_success() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 1);
        client.register_tree(&tid, &100, &5000);
        let config = client.get_tree_config(&tid).unwrap();
        assert_eq!(config.min_height_mm, 100);
        assert_eq!(config.max_height_mm, 5000);
    }

    #[test]
    fn test_register_tree_stores_correct_range_hash() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 2);
        client.register_tree(&tid, &200, &10_000);
        let config = client.get_tree_config(&tid).unwrap();
        // Verify the stored hash matches what compute_range_hash would produce
        let expected = client.compute_range_hash(&200, &10_000);
        assert_eq!(config.range_hash, expected);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_register_duplicate_tree_panics() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 3);
        client.register_tree(&tid, &100, &5000);
        client.register_tree(&tid, &100, &5000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_register_tree_min_equals_max_panics() {
        let (env, _, client) = setup();
        client.register_tree(&tree_id(&env, 4), &500, &500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_register_tree_min_greater_than_max_panics() {
        let (env, _, client) = setup();
        client.register_tree(&tree_id(&env, 5), &5000, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_register_tree_below_global_min_panics() {
        let (env, _, client) = setup();
        // min < MIN_HEIGHT_MM (10)
        client.register_tree(&tree_id(&env, 6), &5, &5000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_register_tree_above_global_max_panics() {
        let (env, _, client) = setup();
        // max > MAX_HEIGHT_MM (50_000)
        client.register_tree(&tree_id(&env, 7), &100, &60_000);
    }

    // ── Update bounds ─────────────────────────────────────────────────────────

    #[test]
    fn test_update_tree_bounds_success() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 10);
        client.register_tree(&tid, &100, &5000);
        client.update_tree_bounds(&tid, &200, &8000);
        let config = client.get_tree_config(&tid).unwrap();
        assert_eq!(config.min_height_mm, 200);
        assert_eq!(config.max_height_mm, 8000);
        let expected = client.compute_range_hash(&200, &8000);
        assert_eq!(config.range_hash, expected);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_update_unregistered_tree_panics() {
        let (env, _, client) = setup();
        client.update_tree_bounds(&tree_id(&env, 11), &100, &5000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_update_tree_invalid_bounds_panics() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 12);
        client.register_tree(&tid, &100, &5000);
        client.update_tree_bounds(&tid, &5000, &100);
    }

    // ── Pause / unpause ───────────────────────────────────────────────────────

    #[test]
    fn test_pause_and_unpause() {
        let (env, _, client) = setup();
        assert!(!client.is_paused());
        client.pause();
        assert!(client.is_paused());
        client.unpause();
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_submit_proof_when_paused_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 20);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        client.pause();
        let proof = valid_proof(&env);
        let inputs = build_inputs(&env, &tid, &rh, 20);
        client.submit_growth_proof(&oracle, &proof, &inputs, &proof_id(&env, 20));
    }

    // ── Single proof submission ───────────────────────────────────────────────

    #[test]
    fn test_submit_growth_proof_success() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 30);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proof = valid_proof(&env);
        let pid = proof_id(&env, 30);
        let inputs = build_inputs(&env, &tid, &rh, 30);

        client.submit_growth_proof(&oracle, &proof, &inputs, &pid);

        // Record stored
        let record = client.get_growth_record(&tid).unwrap();
        assert_eq!(record.height_commitment, inputs.height_commitment);
        assert_eq!(record.proof_id, pid);

        // Nullifier spent
        assert!(client.is_proof_spent(&pid));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_replay_same_proof_id_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 31);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proof = valid_proof(&env);
        let pid = proof_id(&env, 31);
        let inputs1 = build_inputs(&env, &tid, &rh, 31);
        let inputs2 = build_inputs(&env, &tid, &rh, 32);

        client.submit_growth_proof(&oracle, &proof, &inputs1, &pid);
        // Same proof_id second time
        client.submit_growth_proof(&oracle, &proof, &inputs2, &pid);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_invalid_proof_rejected() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 32);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let bad = invalid_proof(&env);
        let inputs = build_inputs(&env, &tid, &rh, 33);
        client.submit_growth_proof(&oracle, &bad, &inputs, &proof_id(&env, 33));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_wrong_range_hash_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 34);
        client.register_tree(&tid, &100, &5000);

        // Build inputs with a mismatched range_hash
        let wrong_rh = client.compute_range_hash(&200, &8000);
        let proof = valid_proof(&env);
        let inputs = build_inputs(&env, &tid, &wrong_rh, 34);
        client.submit_growth_proof(&oracle, &proof, &inputs, &proof_id(&env, 34));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_unregistered_tree_proof_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        // No register_tree call
        let tid = tree_id(&env, 35);
        let rh = client.compute_range_hash(&100, &5000);
        let proof = valid_proof(&env);
        let inputs = build_inputs(&env, &tid, &rh, 35);
        client.submit_growth_proof(&oracle, &proof, &inputs, &proof_id(&env, 35));
    }

    #[test]
    fn test_different_trees_can_each_have_proof() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);

        for seed in 40u8..43u8 {
            let tid = tree_id(&env, seed);
            client.register_tree(&tid, &100, &5000);
            let rh = client.compute_range_hash(&100, &5000);
            let proof = valid_proof(&env);
            let inputs = build_inputs(&env, &tid, &rh, seed);
            client.submit_growth_proof(&oracle, &proof, &inputs, &proof_id(&env, seed));
            assert!(client.get_growth_record(&tid).is_some());
        }
    }

    #[test]
    fn test_latest_proof_overwrites_previous_growth_record() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 50);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proof = valid_proof(&env);
        let inputs1 = build_inputs(&env, &tid, &rh, 50);
        let inputs2 = build_inputs(&env, &tid, &rh, 51);

        client.submit_growth_proof(&oracle, &proof, &inputs1, &proof_id(&env, 50));
        client.submit_growth_proof(&oracle, &proof, &inputs2, &proof_id(&env, 51));

        let record = client.get_growth_record(&tid).unwrap();
        // Second proof's commitment should be stored
        assert_eq!(record.height_commitment, inputs2.height_commitment);
        assert_eq!(record.proof_id, proof_id(&env, 51));
    }

    // ── Range hash determinism ────────────────────────────────────────────────

    #[test]
    fn test_compute_range_hash_is_deterministic() {
        let (env, _, client) = setup();
        let h1 = client.compute_range_hash(&100, &5000);
        let h2 = client.compute_range_hash(&100, &5000);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_compute_range_hash_different_bounds_differ() {
        let (env, _, client) = setup();
        let h1 = client.compute_range_hash(&100, &5000);
        let h2 = client.compute_range_hash(&200, &5000);
        let h3 = client.compute_range_hash(&100, &6000);
        assert_ne!(h1, h2);
        assert_ne!(h1, h3);
        assert_ne!(h2, h3);
    }

    // ── Batch submission ──────────────────────────────────────────────────────

    #[test]
    fn test_batch_submit_three_proofs_success() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);

        let mut proofs = soroban_sdk::vec![&env];
        let mut inputs_vec = soroban_sdk::vec![&env];
        let mut pids = soroban_sdk::vec![&env];

        for seed in 60u8..63u8 {
            let tid = tree_id(&env, seed);
            client.register_tree(&tid, &100, &5000);
            let rh = client.compute_range_hash(&100, &5000);
            proofs.push_back(valid_proof(&env));
            inputs_vec.push_back(build_inputs(&env, &tid, &rh, seed));
            pids.push_back(proof_id(&env, seed));
        }

        client.batch_submit_growth_proofs(&oracle, &proofs, &inputs_vec, &pids);

        for seed in 60u8..63u8 {
            let tid = tree_id(&env, seed);
            assert!(client.get_growth_record(&tid).is_some());
            assert!(client.is_proof_spent(&proof_id(&env, seed)));
        }
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_batch_empty_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        client.batch_submit_growth_proofs(
            &oracle,
            &soroban_sdk::vec![&env],
            &soroban_sdk::vec![&env],
            &soroban_sdk::vec![&env],
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_batch_length_mismatch_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);
        let tid = tree_id(&env, 70);
        client.register_tree(&tid, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proofs = soroban_sdk::vec![&env, valid_proof(&env), valid_proof(&env)];
        let inputs_vec = soroban_sdk::vec![&env, build_inputs(&env, &tid, &rh, 70)];
        let pids = soroban_sdk::vec![&env, proof_id(&env, 70), proof_id(&env, 71)];

        client.batch_submit_growth_proofs(&oracle, &proofs, &inputs_vec, &pids);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_batch_one_invalid_proof_aborts_all() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);

        // Register two trees
        let tid1 = tree_id(&env, 80);
        let tid2 = tree_id(&env, 81);
        client.register_tree(&tid1, &100, &5000);
        client.register_tree(&tid2, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proofs = soroban_sdk::vec![
            &env,
            valid_proof(&env),
            invalid_proof(&env) // this will fail
        ];
        let inputs_vec = soroban_sdk::vec![
            &env,
            build_inputs(&env, &tid1, &rh, 80),
            build_inputs(&env, &tid2, &rh, 81)
        ];
        let pids = soroban_sdk::vec![&env, proof_id(&env, 80), proof_id(&env, 81)];

        client.batch_submit_growth_proofs(&oracle, &proofs, &inputs_vec, &pids);
    }

    /// Atomicity: a batch with a valid first proof and invalid second proof must
    /// reject the entire batch.  We verify this by checking the validation-phase
    /// panic occurs before any state is written (the invalid proof is detected
    /// during the validate-all pass, which runs before the write pass).
    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_batch_atomicity_no_partial_writes() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);

        let tid1 = tree_id(&env, 82);
        let tid2 = tree_id(&env, 83);
        client.register_tree(&tid1, &100, &5000);
        client.register_tree(&tid2, &100, &5000);
        let rh = client.compute_range_hash(&100, &5000);

        let proofs = soroban_sdk::vec![
            &env,
            valid_proof(&env),
            invalid_proof(&env) // detected in validation phase → full batch rejected
        ];
        let inputs_vec = soroban_sdk::vec![
            &env,
            build_inputs(&env, &tid1, &rh, 82),
            build_inputs(&env, &tid2, &rh, 83)
        ];
        let pids = soroban_sdk::vec![&env, proof_id(&env, 82), proof_id(&env, 83)];

        // This panics before any state is written because validate-all runs first
        client.batch_submit_growth_proofs(&oracle, &proofs, &inputs_vec, &pids);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_batch_too_large_panics() {
        let (env, _, client) = setup();
        let oracle = Address::generate(&env);

        let mut proofs = soroban_sdk::vec![&env];
        let mut inputs_vec = soroban_sdk::vec![&env];
        let mut pids = soroban_sdk::vec![&env];

        // Register MAX_BATCH_RANGE + 1 trees
        for seed in 90u8..(90 + MAX_BATCH_RANGE as u8 + 1) {
            let tid = tree_id(&env, seed);
            client.register_tree(&tid, &100, &5000);
            let rh = client.compute_range_hash(&100, &5000);
            proofs.push_back(valid_proof(&env));
            inputs_vec.push_back(build_inputs(&env, &tid, &rh, seed));
            pids.push_back(proof_id(&env, seed));
        }

        client.batch_submit_growth_proofs(&oracle, &proofs, &inputs_vec, &pids);
    }

    #[test]
    fn test_is_proof_spent_false_before_submission() {
        let (env, _, client) = setup();
        assert!(!client.is_proof_spent(&proof_id(&env, 99)));
    }

    #[test]
    fn test_get_growth_record_none_before_proof() {
        let (env, _, client) = setup();
        let tid = tree_id(&env, 100);
        client.register_tree(&tid, &100, &5000);
        assert!(client.get_growth_record(&tid).is_none());
    }
}
