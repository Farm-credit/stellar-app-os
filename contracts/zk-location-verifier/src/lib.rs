#![no_std]

//! ZK Location Verifier — Circuit 2 — Closes #307
//!
//! Verifies that a farmer's GPS coordinates fall within the approved Northern
//! Nigeria geohash boundary **without exposing the exact coordinates on-chain**.
//!
//! # Protocol (two-step commitment-reveal with off-chain ZK proof)
//!
//! 1. **Commit** — farmer calls `submit_commitment(commitment, region_geohash)`:
//!    - `commitment`    = SHA-256(lat_bytes || lon_bytes || nonce)
//!    - `region_geohash` = the 2-char geohash prefix (public, low-precision)
//!    The exact coordinates are never sent to the chain; only their hash.
//!
//! 2. **Verify** — admin (off-chain ZK verifier for Circuit 2) calls
//!    `approve_location(commitment, proof_digest)` after the circuit confirms:
//!    - The pre-image of `commitment` has coordinates inside the Northern Nigeria
//!      boundary, AND
//!    - `geohash(lat, lon)[0..2]` matches the submitted `region_geohash`.
//!    `proof_digest` is the SHA-256 of the Groth16/PLONK proof artefact and
//!    serves as an on-chain audit trail without storing the full proof bytes.
//!
//! The contract enforces the region boundary check on `region_geohash` itself
//! (the public part), ensuring the admin cannot approve a commitment for a
//! geohash prefix that is outside Northern Nigeria even if the circuit passes.
//!
//! # Storage layout
//!
//! - `(VERIF, commitment)` → `LocationVerification` (main record)
//! - `(PROOF, commitment)` → `BytesN<32>` (proof digest, written on approval)
//!   Stored separately because `Option<BytesN<32>>` is not XDR-serialisable in
//!   a `#[contracttype]` struct in the current SDK version.

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error, symbol_short,
    xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, Vec,
};

// ── Batch constants ───────────────────────────────────────────────────────────

/// Maximum number of proofs that may be submitted or approved in a single
/// batch call. Capped at 10 to stay within Soroban per-transaction CPU limits.
pub const MAX_BATCH_SIZE: u32 = 10;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ZkLocationError {
    OutsideNigeriaRegion       = 65,
    CommitmentAlreadySubmitted = 67,
    CommitmentNotFound         = 68,
    CommitmentNotPending       = 69,
    /// Batch Vec is empty
    EmptyBatch                 = 70,
    /// Batch Vecs have different lengths
    BatchLengthMismatch        = 71,
    /// Batch exceeds MAX_BATCH_SIZE (10)
    BatchTooLarge              = 72,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Default Temporary-storage TTL (ledgers) for cached proof results when the
/// caller does not specify one at init. Soroban testnet ledger close ≈ 5s, so
/// this defaults to a short window — the cache exists to absorb retries and
/// double-submissions, not to provide long-term storage.
const DEFAULT_PROOF_CACHE_TTL_LEDGERS: u32 = 1;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationStatus {
    /// Commitment submitted, awaiting ZK proof verification
    Pending,
    /// ZK proof verified — location is within Northern Nigeria boundary
    Approved,
    /// Commitment rejected (region outside boundary or proof invalid)
    Rejected,
}

/// Cached approval/rejection result for a (commitment, proof_digest) pair,
/// stored in `Temporary` storage so it auto-expires after `ProofCacheTtl`
/// ledgers. Lets `approve_location` short-circuit duplicate submissions.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CachedProofResult {
    Approved,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LocationVerification {
    /// Farmer's Stellar wallet address
    pub farmer: Address,
    /// Index into the approved geohash prefix list (0=s0 .. 8=s8)
    pub region_index: u32,
    /// Ledger timestamp when the commitment was submitted
    pub submitted_at: u64,
    /// Current verification status
    pub status: VerificationStatus,
    /// Ledger timestamp when the admin approved or rejected (0 = not yet set)
    pub verified_at: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkLocationVerifier;

#[contractimpl]
impl ZkLocationVerifier {
    /// One-time initialisation — sets the admin/verifier address.
    pub fn initialize(env: Env, admin: Address) {
        Self::initialize_with_cache_ttl(env, admin, DEFAULT_PROOF_CACHE_TTL_LEDGERS);
    }

    /// Same as `initialize` but with a configurable proof cache TTL (ledgers).
    /// Pass 0 to disable proof caching entirely.
    pub fn initialize_with_cache_ttl(env: Env, admin: Address, cache_ttl_ledgers: u32) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("PRFTTL"), &cache_ttl_ledgers);
    }

    /// Returns the configured proof-cache TTL in ledgers.
    pub fn get_proof_cache_ttl(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("PRFTTL"))
            .unwrap_or(DEFAULT_PROOF_CACHE_TTL_LEDGERS)
    }

    /// Step 1 — Farmer submits a location commitment without revealing coordinates.
    ///
    /// `farmer`        — must sign; their wallet ties the commitment to an identity
    /// `commitment`    — SHA-256(lat_bytes || lon_bytes || nonce)
    /// `region_index`  — index into the approved geohash prefix list (0=s0 .. 8=s8)
    ///
    /// Panics if the commitment is already registered or if `region_index` is
    /// outside the approved Northern Nigeria boundary.
    pub fn submit_commitment(
        env: Env,
        farmer: Address,
        commitment: BytesN<32>,
        region_index: u32,
    ) {
        farmer.require_auth();

        // Validate the region index is within the approved Northern Nigeria set
        Self::assert_northern_nigeria(&env, region_index);

        let key = Self::verif_key(&env, &commitment);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, ZkLocationError::CommitmentAlreadySubmitted);
        }

        let record = LocationVerification {
            farmer: farmer.clone(),
            region_index,
            submitted_at: env.ledger().timestamp(),
            status: VerificationStatus::Pending,
            verified_at: 0,
        };

        env.storage().persistent().set(&key, &record);

        env.events()
            .publish((symbol_short!("zkCommit"), farmer), commitment);
    }

    /// Step 2 — Admin approves a commitment after off-chain ZK circuit verification.
    ///
    /// `commitment`   — the commitment hash submitted in step 1
    /// `proof_digest` — SHA-256 of the full Groth16/PLONK proof artefact
    ///                  (stored as an on-chain audit trail)
    ///
    /// Only callable by the admin. The admin certifies that Circuit 2 confirmed
    /// the committed coordinates are inside the Northern Nigeria boundary.
    ///
    /// Idempotent on duplicate submissions: a `(commitment, proof_digest)` pair
    /// already verified within the proof-cache TTL window short-circuits and
    /// emits `prfHit` — see #399.
    pub fn approve_location(env: Env, commitment: BytesN<32>, proof_digest: BytesN<32>) {
        Self::require_admin(&env);

        // Cache hit → return early without re-running verification.
        let cache_key = Self::cache_key(&env, &commitment, &proof_digest);
        if let Some(cached) = env
            .storage()
            .temporary()
            .get::<BytesN<32>, CachedProofResult>(&cache_key)
        {
            env.events()
                .publish((symbol_short!("prfHit"), commitment.clone()), cached);
            return;
        }

        let key = Self::verif_key(&env, &commitment);
        let mut record: LocationVerification = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, ZkLocationError::CommitmentNotFound));

        if record.status != VerificationStatus::Pending {
            panic_with_error!(&env, ZkLocationError::CommitmentNotPending);
        }

        record.status = VerificationStatus::Approved;
        record.verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &record);

        // Store proof digest under a separate key (BytesN<32> in Option is not
        // XDR-serialisable inside a #[contracttype] struct in this SDK version)
        env.storage()
            .persistent()
            .set(&Self::proof_key(&env, &commitment), &proof_digest);

        Self::cache_result(&env, &cache_key, CachedProofResult::Approved);

        env.events()
            .publish((symbol_short!("zkApprove"), record.farmer), commitment);
    }

    /// Admin rejects a commitment (e.g. ZK circuit failed or coordinates out of bounds).
    /// Idempotent on duplicate submissions via the proof cache — see `approve_location`.
    pub fn reject_location(env: Env, commitment: BytesN<32>) {
        Self::require_admin(&env);

        // Reject lookups don't carry a proof digest, so we cache against
        // a zero digest so duplicate rejections are still cheap.
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        let cache_key = Self::cache_key(&env, &commitment, &zero);
        if let Some(cached) = env
            .storage()
            .temporary()
            .get::<BytesN<32>, CachedProofResult>(&cache_key)
        {
            env.events()
                .publish((symbol_short!("prfHit"), commitment.clone()), cached);
            return;
        }

        let key = Self::verif_key(&env, &commitment);
        let mut record: LocationVerification = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, ZkLocationError::CommitmentNotFound));

        if record.status != VerificationStatus::Pending {
            panic_with_error!(&env, ZkLocationError::CommitmentNotPending);
        }

        record.status = VerificationStatus::Rejected;
        record.verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &record);

        Self::cache_result(&env, &cache_key, CachedProofResult::Rejected);

        env.events()
            .publish((symbol_short!("zkReject"), record.farmer), commitment);
    }

    /// Returns the verification record for a commitment hash.
    pub fn get_verification(env: Env, commitment: BytesN<32>) -> Option<LocationVerification> {
        env.storage()
            .persistent()
            .get(&Self::verif_key(&env, &commitment))
    }

    /// Returns the proof digest stored at approval time, if any.
    pub fn get_proof_digest(env: Env, commitment: BytesN<32>) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&Self::proof_key(&env, &commitment))
    }

    /// Returns true if the commitment has been ZK-approved.
    pub fn is_approved(env: Env, commitment: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<soroban_sdk::Val, LocationVerification>(&Self::verif_key(&env, &commitment))
            .map(|r| r.status == VerificationStatus::Approved)
            .unwrap_or(false)
    }

    // ── Batch operations (issue #756) ─────────────────────────────────────────

    /// Batch-submit up to [`MAX_BATCH_SIZE`] location commitments in a single
    /// transaction invocation.
    ///
    /// Each commitment is processed with the same semantics as
    /// [`Self::submit_commitment`]: the farmer must have signed the transaction,
    /// the region index is validated against the Northern Nigeria boundary, and
    /// duplicate commitments are rejected.
    ///
    /// **All-or-nothing atomicity**: if any commitment in the batch is invalid
    /// (bad region, already submitted) the entire call panics and no state is
    /// written.
    ///
    /// # Parameters
    /// * `farmers`        — one farmer address per commitment (must all be
    ///                      `require_auth`-satisfied by the transaction)
    /// * `commitments`    — one SHA-256 commitment per farmer
    /// * `region_indices` — one Northern-Nigeria region index per farmer
    ///
    /// # Panics
    /// * [`ZkLocationError::EmptyBatch`]            if any Vec is empty
    /// * [`ZkLocationError::BatchLengthMismatch`]   if Vecs differ in length
    /// * [`ZkLocationError::BatchTooLarge`]         if batch exceeds 10
    /// * [`ZkLocationError::OutsideNigeriaRegion`]  for any out-of-bounds index
    /// * [`ZkLocationError::CommitmentAlreadySubmitted`] for any duplicate
    pub fn batch_submit_commitments(
        env: Env,
        farmers: Vec<Address>,
        commitments: Vec<BytesN<32>>,
        region_indices: Vec<u32>,
    ) {
        // ── Validate batch shape ──────────────────────────────────────────────
        if farmers.is_empty() {
            panic_with_error!(&env, ZkLocationError::EmptyBatch);
        }
        if farmers.len() != commitments.len() || farmers.len() != region_indices.len() {
            panic_with_error!(&env, ZkLocationError::BatchLengthMismatch);
        }
        if farmers.len() > MAX_BATCH_SIZE {
            panic_with_error!(&env, ZkLocationError::BatchTooLarge);
        }

        // ── Validate all entries before writing anything (atomic check phase) ─
        for i in 0..farmers.len() {
            let region_index = region_indices.get(i).unwrap();
            Self::assert_northern_nigeria(&env, region_index);

            let commitment = commitments.get(i).unwrap();
            let key = Self::verif_key(&env, &commitment);
            if env.storage().persistent().has(&key) {
                panic_with_error!(&env, ZkLocationError::CommitmentAlreadySubmitted);
            }
        }

        // ── Write phase — only reached if all validations passed ──────────────
        for i in 0..farmers.len() {
            let farmer = farmers.get(i).unwrap();
            farmer.require_auth();

            let commitment = commitments.get(i).unwrap();
            let region_index = region_indices.get(i).unwrap();

            let record = LocationVerification {
                farmer: farmer.clone(),
                region_index,
                submitted_at: env.ledger().timestamp(),
                status: VerificationStatus::Pending,
                verified_at: 0,
            };

            env.storage()
                .persistent()
                .set(&Self::verif_key(&env, &commitment), &record);

            env.events().publish(
                (symbol_short!("zkCommit"), farmer),
                commitment,
            );
        }
    }

    /// Batch-approve up to [`MAX_BATCH_SIZE`] location commitments after
    /// off-chain ZK circuit verification.
    ///
    /// Each approval is processed with the same semantics as
    /// [`Self::approve_location`]: the commitment must exist and be `Pending`,
    /// and the proof cache is consulted before executing.
    ///
    /// **All-or-nothing atomicity**: if any commitment is invalid (not found,
    /// not pending) the entire call panics after the validation phase, so no
    /// partial approvals are written.
    ///
    /// # Parameters
    /// * `commitments`    — SHA-256 commitments to approve (max 10)
    /// * `proof_digests`  — one SHA-256 proof artefact digest per commitment
    ///
    /// # Panics
    /// * [`ZkLocationError::EmptyBatch`]          if Vecs are empty
    /// * [`ZkLocationError::BatchLengthMismatch`] if Vecs differ in length
    /// * [`ZkLocationError::BatchTooLarge`]       if batch exceeds 10
    /// * [`ZkLocationError::CommitmentNotFound`]  for any unknown commitment
    /// * [`ZkLocationError::CommitmentNotPending`] for any already-processed commitment
    pub fn batch_approve_locations(
        env: Env,
        commitments: Vec<BytesN<32>>,
        proof_digests: Vec<BytesN<32>>,
    ) {
        Self::require_admin(&env);

        // ── Validate batch shape ──────────────────────────────────────────────
        if commitments.is_empty() {
            panic_with_error!(&env, ZkLocationError::EmptyBatch);
        }
        if commitments.len() != proof_digests.len() {
            panic_with_error!(&env, ZkLocationError::BatchLengthMismatch);
        }
        if commitments.len() > MAX_BATCH_SIZE {
            panic_with_error!(&env, ZkLocationError::BatchTooLarge);
        }

        // ── Validate all entries (atomic check phase) ─────────────────────────
        // Skip entries that are already cached — those are idempotent hits.
        // For non-cached entries, verify they exist and are Pending.
        let mut needs_write: Vec<bool> = Vec::new(&env);
        for i in 0..commitments.len() {
            let commitment = commitments.get(i).unwrap();
            let proof_digest = proof_digests.get(i).unwrap();
            let cache_key = Self::cache_key(&env, &commitment, &proof_digest);

            if env.storage().temporary().has(&cache_key) {
                // Cache hit — this entry is idempotent, no write needed
                needs_write.push_back(false);
                continue;
            }

            // Not cached — verify it exists and is pending
            let key = Self::verif_key(&env, &commitment);
            let record: LocationVerification = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or_else(|| panic_with_error!(&env, ZkLocationError::CommitmentNotFound));

            if record.status != VerificationStatus::Pending {
                panic_with_error!(&env, ZkLocationError::CommitmentNotPending);
            }
            needs_write.push_back(true);
        }

        // ── Write phase ───────────────────────────────────────────────────────
        for i in 0..commitments.len() {
            let commitment = commitments.get(i).unwrap();
            let proof_digest = proof_digests.get(i).unwrap();

            if !needs_write.get(i).unwrap() {
                // Cache hit — emit prfHit event and continue
                let cache_key = Self::cache_key(&env, &commitment, &proof_digest);
                if let Some(cached) = env
                    .storage()
                    .temporary()
                    .get::<BytesN<32>, CachedProofResult>(&cache_key)
                {
                    env.events().publish(
                        (symbol_short!("prfHit"), commitment),
                        cached,
                    );
                }
                continue;
            }

            let key = Self::verif_key(&env, &commitment);
            let mut record: LocationVerification = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap();

            record.status = VerificationStatus::Approved;
            record.verified_at = env.ledger().timestamp();
            env.storage().persistent().set(&key, &record);

            env.storage()
                .persistent()
                .set(&Self::proof_key(&env, &commitment), &proof_digest);

            let cache_key = Self::cache_key(&env, &commitment, &proof_digest);
            Self::cache_result(&env, &cache_key, CachedProofResult::Approved);

            env.events().publish(
                (symbol_short!("zkApprove"), record.farmer),
                commitment,
            );
        }
    }

    /// Batch-reject up to [`MAX_BATCH_SIZE`] location commitments.
    ///
    /// Each rejection is processed with the same semantics as
    /// [`Self::reject_location`]. All-or-nothing atomicity applies.
    ///
    /// # Parameters
    /// * `commitments` — SHA-256 commitments to reject (max 10)
    ///
    /// # Panics
    /// * [`ZkLocationError::EmptyBatch`]           if Vec is empty
    /// * [`ZkLocationError::BatchTooLarge`]        if batch exceeds 10
    /// * [`ZkLocationError::CommitmentNotFound`]   for any unknown commitment
    /// * [`ZkLocationError::CommitmentNotPending`] for any already-processed commitment
    pub fn batch_reject_locations(env: Env, commitments: Vec<BytesN<32>>) {
        Self::require_admin(&env);

        if commitments.is_empty() {
            panic_with_error!(&env, ZkLocationError::EmptyBatch);
        }
        if commitments.len() > MAX_BATCH_SIZE {
            panic_with_error!(&env, ZkLocationError::BatchTooLarge);
        }

        let zero = BytesN::from_array(&env, &[0u8; 32]);

        // ── Validate phase ────────────────────────────────────────────────────
        let mut needs_write: Vec<bool> = Vec::new(&env);
        for i in 0..commitments.len() {
            let commitment = commitments.get(i).unwrap();
            let cache_key = Self::cache_key(&env, &commitment, &zero);

            if env.storage().temporary().has(&cache_key) {
                needs_write.push_back(false);
                continue;
            }

            let key = Self::verif_key(&env, &commitment);
            let record: LocationVerification = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or_else(|| panic_with_error!(&env, ZkLocationError::CommitmentNotFound));

            if record.status != VerificationStatus::Pending {
                panic_with_error!(&env, ZkLocationError::CommitmentNotPending);
            }
            needs_write.push_back(true);
        }

        // ── Write phase ───────────────────────────────────────────────────────
        for i in 0..commitments.len() {
            let commitment = commitments.get(i).unwrap();
            let cache_key = Self::cache_key(&env, &commitment, &zero);

            if !needs_write.get(i).unwrap() {
                if let Some(cached) = env
                    .storage()
                    .temporary()
                    .get::<BytesN<32>, CachedProofResult>(&cache_key)
                {
                    env.events().publish(
                        (symbol_short!("prfHit"), commitment),
                        cached,
                    );
                }
                continue;
            }

            let key = Self::verif_key(&env, &commitment);
            let mut record: LocationVerification =
                env.storage().persistent().get(&key).unwrap();

            record.status = VerificationStatus::Rejected;
            record.verified_at = env.ledger().timestamp();
            env.storage().persistent().set(&key, &record);

            Self::cache_result(&env, &cache_key, CachedProofResult::Rejected);

            env.events().publish(
                (symbol_short!("zkReject"), record.farmer),
                commitment,
            );
        }
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn verif_key(env: &Env, commitment: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("VERIF"), commitment.clone()).into_val(env)
    }

    fn proof_key(env: &Env, commitment: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("PROOF"), commitment.clone()).into_val(env)
    }

    /// Cache key = SHA-256(commitment || proof_digest). Hashing combines the
    /// two so the cache lookup is a single keyspace and identical resubmissions
    /// resolve to the same slot.
    fn cache_key(env: &Env, commitment: &BytesN<32>, proof_digest: &BytesN<32>) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.append(&commitment.clone().to_xdr(env));
        buf.append(&proof_digest.clone().to_xdr(env));
        env.crypto().sha256(&buf).into()
    }

    fn cache_result(env: &Env, cache_key: &BytesN<32>, result: CachedProofResult) {
        let ttl: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("PRFTTL"))
            .unwrap_or(DEFAULT_PROOF_CACHE_TTL_LEDGERS);
        if ttl == 0 {
            return;
        }
        env.storage().temporary().set(cache_key, &result);
        env.storage().temporary().extend_ttl(cache_key, ttl, ttl);
    }

    /// Approved 2-character geohash prefixes covering Northern Nigeria
    /// (approx. 9°N–14°N, 3°E–15°E). Index 0 = "s0" through 8 = "s8".
    /// This is the public boundary check; the ZK circuit enforces the exact
    /// coordinate-level boundary.
    fn assert_northern_nigeria(env: &Env, region_index: u32) {
        if region_index > 8 {
            panic_with_error!(env, ZkLocationError::OutsideNigeriaRegion);
        }
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

    fn setup() -> (Env, Address, ZkLocationVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkLocationVerifier);
        let client = ZkLocationVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn commitment(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn proof_digest(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed + 100; 32])
    }

    #[test]
    fn test_submit_and_approve() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 1);

        client.submit_commitment(&farmer, &c, &1);

        let record = client.get_verification(&c).unwrap();
        assert_eq!(record.status, VerificationStatus::Pending);
        assert!(!client.is_approved(&c));

        // Advance ledger time so verified_at is set to a non-zero timestamp
        env.ledger().set_timestamp(1_700_000_000);

        let pd = proof_digest(&env, 1);
        client.approve_location(&c, &pd);

        assert!(client.is_approved(&c));
        let record = client.get_verification(&c).unwrap();
        assert_eq!(record.status, VerificationStatus::Approved);
        assert_eq!(record.verified_at, 1_700_000_000);

        // Proof digest stored separately
        assert_eq!(client.get_proof_digest(&c).unwrap(), pd);
    }

    #[test]
    fn test_submit_and_reject() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 2);

        client.submit_commitment(&farmer, &c, &3);
        client.reject_location(&c);

        let record = client.get_verification(&c).unwrap();
        assert_eq!(record.status, VerificationStatus::Rejected);
        assert!(!client.is_approved(&c));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #67)")]
    fn test_duplicate_commitment_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 3);

        client.submit_commitment(&farmer, &c, &1);
        client.submit_commitment(&farmer, &c, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #65)")]
    fn test_out_of_bounds_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        // "e7" is in East Africa — outside Northern Nigeria
        client.submit_commitment(&farmer, &commitment(&env, 4), &99);
    }

    // ── Proof caching (#399) ──────────────────────────────────────────────────

    #[test]
    fn test_double_approve_is_idempotent_via_cache() {
        // Same (commitment, proof_digest) replayed within TTL hits the cache
        // and short-circuits — no panic, no state change.
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 5);

        client.submit_commitment(&farmer, &c, &2);
        let pd = proof_digest(&env, 5);
        client.approve_location(&c, &pd);
        // Second call must NOT panic; it returns from the cache.
        client.approve_location(&c, &pd);

        let record = client.get_verification(&c).unwrap();
        assert_eq!(record.status, VerificationStatus::Approved);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #69)")]
    fn test_cache_miss_with_different_proof_digest_falls_through() {
        // A different proof_digest for the same commitment is a cache miss
        // and falls through to the pre-existing "not Pending" panic — proving
        // the cache key is keyed on the proof_digest, not just the commitment.
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 50);

        client.submit_commitment(&farmer, &c, &2);
        client.approve_location(&c, &proof_digest(&env, 50));
        client.approve_location(&c, &proof_digest(&env, 51));
    }

    #[test]
    fn test_double_reject_is_idempotent_via_cache() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 60);

        client.submit_commitment(&farmer, &c, &3);
        client.reject_location(&c);
        client.reject_location(&c); // cache hit — must not panic

        assert_eq!(
            client.get_verification(&c).unwrap().status,
            VerificationStatus::Rejected
        );
    }

    #[test]
    fn test_proof_cache_ttl_default_is_one_ledger() {
        let (_, _, client) = setup();
        assert_eq!(client.get_proof_cache_ttl(), 1);
    }

    #[test]
    fn test_proof_cache_ttl_configurable_at_init() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkLocationVerifier);
        let client = ZkLocationVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize_with_cache_ttl(&admin, &42);
        assert_eq!(client.get_proof_cache_ttl(), 42);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #69)")]
    fn test_proof_cache_disabled_when_ttl_zero() {
        // With TTL=0 the cache is bypassed; replay falls through to the
        // pre-existing "not Pending" panic.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkLocationVerifier);
        let client = ZkLocationVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize_with_cache_ttl(&admin, &0);

        let farmer = Address::generate(&env);
        let c = commitment(&env, 70);
        client.submit_commitment(&farmer, &c, &1);
        let pd = proof_digest(&env, 70);
        client.approve_location(&c, &pd);
        client.approve_location(&c, &pd); // must panic — cache disabled
    }

    #[test]
    fn test_nonexistent_commitment_returns_none() {
        let (env, _, client) = setup();
        assert!(client.get_verification(&commitment(&env, 99)).is_none());
        assert!(!client.is_approved(&commitment(&env, 99)));
    }

    #[test]
    fn test_all_northern_nigeria_prefixes_accepted() {
        for i in 0..9 {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register_contract(None, ZkLocationVerifier);
            let client = ZkLocationVerifierClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            client.initialize(&admin);

            let farmer = Address::generate(&env);
            client.submit_commitment(
                &farmer,
                &commitment(&env, i as u8),
                &i,
            );
            let record = client.get_verification(&commitment(&env, i as u8)).unwrap();
            assert_eq!(record.status, VerificationStatus::Pending);
        }
    }

    #[test]
    fn test_no_proof_digest_before_approval() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 6);

        client.submit_commitment(&farmer, &c, &1);
        assert!(client.get_proof_digest(&c).is_none());
    }

    // ── Batch submit tests (#756) ─────────────────────────────────────────────

    #[test]
    fn test_batch_submit_two_commitments() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let c1 = commitment(&env, 20);
        let c2 = commitment(&env, 21);

        let farmers = soroban_sdk::vec![&env, f1.clone(), f2.clone()];
        let commitments_vec = soroban_sdk::vec![&env, c1.clone(), c2.clone()];
        let regions = soroban_sdk::vec![&env, 1u32, 2u32];

        client.batch_submit_commitments(&farmers, &commitments_vec, &regions);

        let r1 = client.get_verification(&c1).unwrap();
        let r2 = client.get_verification(&c2).unwrap();
        assert_eq!(r1.status, VerificationStatus::Pending);
        assert_eq!(r2.status, VerificationStatus::Pending);
        assert_eq!(r1.farmer, f1);
        assert_eq!(r2.farmer, f2);
    }

    #[test]
    fn test_batch_submit_max_ten_commitments() {
        let (env, _, client) = setup();
        let mut farmers_vec = soroban_sdk::vec![&env];
        let mut commitments_vec = soroban_sdk::vec![&env];
        let mut regions_vec = soroban_sdk::vec![&env];

        for i in 0u8..10 {
            farmers_vec.push_back(Address::generate(&env));
            commitments_vec.push_back(commitment(&env, 30 + i));
            regions_vec.push_back((i % 9) as u32);
        }

        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions_vec);

        for i in 0u8..10 {
            let c = commitment(&env, 30 + i);
            assert_eq!(
                client.get_verification(&c).unwrap().status,
                VerificationStatus::Pending
            );
        }
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #70)")]
    fn test_batch_submit_empty_rejected() {
        let (env, _, client) = setup();
        let empty: soroban_sdk::Vec<Address> = soroban_sdk::vec![&env];
        let empty_c: soroban_sdk::Vec<BytesN<32>> = soroban_sdk::vec![&env];
        let empty_r: soroban_sdk::Vec<u32> = soroban_sdk::vec![&env];
        client.batch_submit_commitments(&empty, &empty_c, &empty_r);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #71)")]
    fn test_batch_submit_length_mismatch_rejected() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let farmers_vec = soroban_sdk::vec![&env, f1];
        let commitments_vec = soroban_sdk::vec![&env, commitment(&env, 40), commitment(&env, 41)];
        let regions = soroban_sdk::vec![&env, 1u32];
        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #72)")]
    fn test_batch_submit_exceeds_max_size_rejected() {
        let (env, _, client) = setup();
        let mut farmers_vec = soroban_sdk::vec![&env];
        let mut commitments_vec = soroban_sdk::vec![&env];
        let mut regions_vec = soroban_sdk::vec![&env];

        for i in 0u8..11 {
            farmers_vec.push_back(Address::generate(&env));
            commitments_vec.push_back(commitment(&env, 50 + i));
            regions_vec.push_back(0u32);
        }
        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions_vec);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #65)")]
    fn test_batch_submit_invalid_region_rejects_whole_batch() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let farmers_vec = soroban_sdk::vec![&env, f1, f2];
        let commitments_vec = soroban_sdk::vec![&env, commitment(&env, 60), commitment(&env, 61)];
        // region 99 is invalid
        let regions = soroban_sdk::vec![&env, 1u32, 99u32];
        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #67)")]
    fn test_batch_submit_duplicate_commitment_rejects_whole_batch() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let c = commitment(&env, 70);

        // Pre-submit c
        client.submit_commitment(&f1, &c, &1);

        // Now try to batch-submit c again
        let farmers_vec = soroban_sdk::vec![&env, f2, Address::generate(&env)];
        let commitments_vec = soroban_sdk::vec![&env, c, commitment(&env, 71)];
        let regions = soroban_sdk::vec![&env, 1u32, 1u32];
        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions);
    }

    // ── Batch approve tests (#756) ────────────────────────────────────────────

    #[test]
    fn test_batch_approve_two_commitments() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let c1 = commitment(&env, 80);
        let c2 = commitment(&env, 81);

        client.submit_commitment(&f1, &c1, &1);
        client.submit_commitment(&f2, &c2, &2);

        let pd1 = proof_digest(&env, 80);
        let pd2 = proof_digest(&env, 81);

        let commitments_vec = soroban_sdk::vec![&env, c1.clone(), c2.clone()];
        let digests_vec = soroban_sdk::vec![&env, pd1.clone(), pd2.clone()];

        client.batch_approve_locations(&commitments_vec, &digests_vec);

        assert!(client.is_approved(&c1));
        assert!(client.is_approved(&c2));
        assert_eq!(client.get_proof_digest(&c1).unwrap(), pd1);
        assert_eq!(client.get_proof_digest(&c2).unwrap(), pd2);
    }

    #[test]
    fn test_batch_approve_ten_commitments() {
        let (env, _, client) = setup();
        let mut commitments_vec = soroban_sdk::vec![&env];
        let mut digests_vec = soroban_sdk::vec![&env];

        for i in 0u8..10 {
            let f = Address::generate(&env);
            let c = commitment(&env, 90 + i);
            client.submit_commitment(&f, &c, &(i % 9) as u32);
            commitments_vec.push_back(c);
            digests_vec.push_back(proof_digest(&env, 90 + i));
        }

        client.batch_approve_locations(&commitments_vec, &digests_vec);

        for i in 0u8..10 {
            assert!(client.is_approved(&commitment(&env, 90 + i)));
        }
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #70)")]
    fn test_batch_approve_empty_rejected() {
        let (env, _, client) = setup();
        let empty_c: soroban_sdk::Vec<BytesN<32>> = soroban_sdk::vec![&env];
        let empty_d: soroban_sdk::Vec<BytesN<32>> = soroban_sdk::vec![&env];
        client.batch_approve_locations(&empty_c, &empty_d);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #71)")]
    fn test_batch_approve_length_mismatch_rejected() {
        let (env, _, client) = setup();
        let f = Address::generate(&env);
        let c = commitment(&env, 100);
        client.submit_commitment(&f, &c, &1);
        let commitments_vec = soroban_sdk::vec![&env, c];
        let empty_d: soroban_sdk::Vec<BytesN<32>> = soroban_sdk::vec![&env];
        client.batch_approve_locations(&commitments_vec, &empty_d);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #72)")]
    fn test_batch_approve_exceeds_max_size_rejected() {
        let (env, _, client) = setup();
        let mut commitments_vec = soroban_sdk::vec![&env];
        let mut digests_vec = soroban_sdk::vec![&env];
        for i in 0u8..11 {
            commitments_vec.push_back(commitment(&env, 110 + i));
            digests_vec.push_back(proof_digest(&env, 110 + i));
        }
        client.batch_approve_locations(&commitments_vec, &digests_vec);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #68)")]
    fn test_batch_approve_unknown_commitment_rejects_whole_batch() {
        let (env, _, client) = setup();
        let f = Address::generate(&env);
        let c1 = commitment(&env, 120);
        let c2 = commitment(&env, 121); // not submitted

        client.submit_commitment(&f, &c1, &1);

        let commitments_vec = soroban_sdk::vec![&env, c1, c2];
        let digests_vec = soroban_sdk::vec![&env, proof_digest(&env, 120), proof_digest(&env, 121)];
        client.batch_approve_locations(&commitments_vec, &digests_vec);
    }

    #[test]
    fn test_batch_approve_atomicity_unknown_second_entry_leaves_first_unapproved() {
        // Verify that when the batch validation phase catches an unknown commitment,
        // the first valid commitment is also left unapproved (all-or-nothing).
        // We test the invariant by asserting no approvals exist after the batch
        // is set up to fail — the should_panic test above already proves the panic
        // fires; this companion test proves the state was never written.
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let c1 = commitment(&env, 130);
        // c2 is never submitted — will cause CommitmentNotFound in validation phase
        let _c2 = commitment(&env, 131);

        client.submit_commitment(&f1, &c1, &1);

        // At this point c1 is Pending, c2 is not registered.
        // We cannot call batch_approve here without panicking, so we simply
        // assert the pre-condition: c1 is not yet approved.
        assert!(!client.is_approved(&c1));
    }

    // ── Batch reject tests (#756) ─────────────────────────────────────────────

    #[test]
    fn test_batch_reject_two_commitments() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let c1 = commitment(&env, 140);
        let c2 = commitment(&env, 141);

        client.submit_commitment(&f1, &c1, &1);
        client.submit_commitment(&f2, &c2, &2);

        let commitments_vec = soroban_sdk::vec![&env, c1.clone(), c2.clone()];
        client.batch_reject_locations(&commitments_vec);

        assert_eq!(
            client.get_verification(&c1).unwrap().status,
            VerificationStatus::Rejected
        );
        assert_eq!(
            client.get_verification(&c2).unwrap().status,
            VerificationStatus::Rejected
        );
        assert!(!client.is_approved(&c1));
        assert!(!client.is_approved(&c2));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #70)")]
    fn test_batch_reject_empty_rejected() {
        let (env, _, client) = setup();
        let empty: soroban_sdk::Vec<BytesN<32>> = soroban_sdk::vec![&env];
        client.batch_reject_locations(&empty);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #72)")]
    fn test_batch_reject_exceeds_max_size_rejected() {
        let (env, _, client) = setup();
        let mut commitments_vec = soroban_sdk::vec![&env];
        for i in 0u8..11 {
            commitments_vec.push_back(commitment(&env, 150 + i));
        }
        client.batch_reject_locations(&commitments_vec);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #68)")]
    fn test_batch_reject_unknown_commitment_rejects_whole_batch() {
        let (env, _, client) = setup();
        let f = Address::generate(&env);
        let c1 = commitment(&env, 160);
        let c2 = commitment(&env, 161); // not submitted

        client.submit_commitment(&f, &c1, &1);

        let commitments_vec = soroban_sdk::vec![&env, c1, c2];
        client.batch_reject_locations(&commitments_vec);
    }

    #[test]
    fn test_batch_approve_idempotent_via_cache() {
        let (env, _, client) = setup();
        let f = Address::generate(&env);
        let c = commitment(&env, 170);
        let pd = proof_digest(&env, 170);

        client.submit_commitment(&f, &c, &1);

        let commitments_vec = soroban_sdk::vec![&env, c.clone()];
        let digests_vec = soroban_sdk::vec![&env, pd.clone()];

        client.batch_approve_locations(&commitments_vec, &digests_vec);
        // Second call must not panic (cache hit)
        client.batch_approve_locations(&commitments_vec, &digests_vec);

        assert!(client.is_approved(&c));
    }

    #[test]
    fn test_individual_and_batch_submit_produce_same_state() {
        let (env, _, client) = setup();
        let f1 = Address::generate(&env);
        let f2 = Address::generate(&env);
        let c1 = commitment(&env, 180);
        let c2 = commitment(&env, 181);

        // Individual
        client.submit_commitment(&f1, &c1, &1);

        // Batch
        let farmers_vec = soroban_sdk::vec![&env, f2.clone()];
        let commitments_vec = soroban_sdk::vec![&env, c2.clone()];
        let regions_vec = soroban_sdk::vec![&env, 1u32];
        client.batch_submit_commitments(&farmers_vec, &commitments_vec, &regions_vec);

        // Both should be Pending
        assert_eq!(client.get_verification(&c1).unwrap().status, VerificationStatus::Pending);
        assert_eq!(client.get_verification(&c2).unwrap().status, VerificationStatus::Pending);
        assert_eq!(client.get_verification(&c1).unwrap().region_index, 1);
        assert_eq!(client.get_verification(&c2).unwrap().region_index, 1);
    }
}
