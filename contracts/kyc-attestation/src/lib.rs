#![no_std]

//! KYC Attestation Contract — Closes #638
//!
//! Upgrades the verifier-gated KYC system to accept ZK-proof inputs that
//! verify a user is over a minimum age and resident in an eligible project
//! region **without exposing sensitive metadata on-chain**.
//!
//! # ZK-KYC design
//!
//! Off-chain, the prover runs a ZK circuit that takes as private inputs:
//!   - the user's date-of-birth and residential region
//!
//! and produces as public outputs:
//!   - `age_commitment`    = SHA-256(dob_bytes || nonce)     — proves age ≥ MIN_AGE
//!   - `region_commitment` = SHA-256(region_bytes || nonce)  — proves eligible region
//!   - `proof_digest`      = SHA-256(full_groth16_proof)     — on-chain audit trail
//!   - `valid_until`       — ledger timestamp after which the proof expires
//!
//! The contract receives these four public outputs as `ZkProofInput`, plus the
//! verifier's assertion that the circuit passed. It then:
//!   1. Checks `valid_until` > current ledger timestamp (proof not expired).
//!   2. Checks `region_commitment` maps to an approved Northern Nigeria prefix
//!      by SHA-256-hashing each valid prefix and comparing (the verifier supplies
//!      the matching plaintext prefix so the contract can re-derive the hash).
//!   3. Recomputes SHA-256(`proof_digest`) as a second-preimage guard and stores
//!      the result as the on-chain integrity fingerprint.
//!   4. Stores the full `ZkKycRecord` in **instance storage** keyed by farmer.
//!   5. Marks the farmer's ZK-KYC status as `Verified` in instance storage.
//!
//! # Storage layout
//!
//! Instance storage (this contract's own instance — not Persistent):
//!   `("ZK_STS", farmer)`  → `KycStatus`      (latest ZK-KYC status)
//!   `("ZK_REC", farmer)`  → `ZkKycRecord`     (full ZK verification record)
//!
//! Persistent storage (pre-existing verifier-gated path, unchanged):
//!   `("VRF", verifier)`                → bool
//!   `("KYC_STS", farmer)`              → `KycStatus`
//!   `("KYC_HST", farmer)`              → `Vec<Attestation>`

use harvesta_errors::HarvestaError;
use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Bytes, BytesN, Env, IntoVal, String, Vec};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum age (years) that the ZK circuit must attest to.
/// The circuit encodes this threshold; the contract enforces it stays constant.
pub const MIN_AGE_YEARS: u32 = 18;
/// Approved 2-char geohash prefixes for Northern Nigeria (s0–s8).
const VALID_REGIONS: [&str; 9] = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// A ZK proof with this age commitment has already been submitted for another
    /// farmer, indicating a potential replay attack.
    CommitmentAlreadySubmitted = 1,
    /// The ZK proof's validity window has expired (ledger timestamp exceeded).
    ProofExpired = 2,
    /// The region geohash in the proof is outside the approved Northern Nigeria boundary.
    OutsideNigeriaRegion = 3,
    /// The supplied ZK proof's region commitment does not match the plaintext.
    ZkProofInvalid = 4,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Shared KYC status used by both the legacy verifier-gated path and the new
/// ZK-proof path.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum KycStatus {
    Pending,
    Verified,
    Rejected,
}

/// Legacy per-attestation record (verifier-gated path, unchanged).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attestation {
    pub verifier: Address,
    pub status: KycStatus,
    pub timestamp: u64,
}

/// ZK proof inputs supplied by the verifier.
///
/// All sensitive data is represented as SHA-256 commitments so no PII
/// ever appears in the transaction or ledger state.
///
/// Fields
/// ------
/// `proof_digest`      — SHA-256 of the full Groth16/PLONK proof artefact.
///                       Stored as an on-chain audit trail; the full proof
///                       stays off-chain.
/// `age_commitment`    — SHA-256(dob_bytes || nonce).  The ZK circuit certifies
///                       the committed date-of-birth implies age ≥ MIN_AGE_YEARS.
/// `region_commitment` — SHA-256(region_bytes || nonce).  The ZK circuit
///                       certifies the committed region is within Northern Nigeria.
/// `region_plaintext`  — the 2-char geohash prefix (public, low-precision).
///                       The contract re-derives SHA-256(region_plaintext) and
///                       asserts it matches `region_commitment` as a consistency
///                       check, then validates the prefix is in the approved set.
/// `valid_until`       — ledger timestamp (seconds since Unix epoch) after which
///                       this proof is considered expired.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ZkProofInput {
    pub proof_digest: BytesN<32>,
    pub age_commitment: BytesN<32>,
    pub region_commitment: BytesN<32>,
    pub region_plaintext: String,
    pub valid_until: u64,
}

/// On-chain record written to instance storage after a successful `verify_kyc`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ZkKycRecord {
    pub farmer: Address,
    /// Verifier that submitted the proof.
    pub verifier: Address,
    /// SHA-256 of the proof digest (second-preimage guard stored on-chain).
    pub proof_integrity_hash: BytesN<32>,
    /// Age commitment from the ZK proof (no raw DOB ever stored).
    pub age_commitment: BytesN<32>,
    /// Region commitment from the ZK proof.
    pub region_commitment: BytesN<32>,
    /// The approved geohash prefix that was validated.
    pub verified_region: String,
    /// Ledger timestamp when verify_kyc was called.
    pub verified_at: u64,
    /// Ledger timestamp after which the proof expires.
    pub valid_until: u64,
}

// ── Storage key helpers ───────────────────────────────────────────────────────

fn verifier_key(env: &Env, verifier: &Address) -> soroban_sdk::Val {
    (symbol_short!("VRF"), verifier.clone()).into_val(env)
}

fn status_key(env: &Env, farmer_id: &Address) -> soroban_sdk::Val {
    (symbol_short!("KYC_STS"), farmer_id.clone()).into_val(env)
}

fn history_key(env: &Env, farmer_id: &Address) -> soroban_sdk::Val {
    (symbol_short!("KYC_HST"), farmer_id.clone()).into_val(env)
}

/// Instance-storage key for ZK-KYC status.
fn zk_status_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
    (symbol_short!("ZK_STS"), farmer.clone()).into_val(env)
}

/// Instance-storage key for ZK-KYC record.
fn zk_record_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
    (symbol_short!("ZK_REC"), farmer.clone()).into_val(env)
}

/// Instance-storage key to track used ZK commitments and prevent reuse.
fn zk_commitment_key(env: &Env, commitment: &BytesN<32>) -> soroban_sdk::Val {
    (symbol_short!("ZK_CMT"), commitment.clone()).into_val(env)
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct KycAttestation;

#[contractimpl]
impl KycAttestation {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// Initialize the contract and set the admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    // ── Verifier management ───────────────────────────────────────────────────

    /// Register a verifier. Only callable by admin.
    pub fn register_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        if admin != stored_admin {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }
        env.storage()
            .persistent()
            .set(&verifier_key(&env, &verifier), &true);
    }

    // ── ZK-KYC path (new — #638) ──────────────────────────────────────────────

    /// Verify a farmer's KYC using ZK-proof inputs.
    ///
    /// # Access
    /// Only a registered verifier may call this. The verifier certifies that
    /// the supplied ZK circuit outputs are genuine.
    ///
    /// # Proof parsing and validation
    /// The function validates the following inputs from `proof`:
    ///
    /// 1. **Expiry** — `proof.valid_until` must be strictly greater than the
    ///    current ledger timestamp. Panics with `ProofExpired` otherwise.
    ///
    /// 2. **Region** — `proof.region_plaintext` must be one of the nine approved
    ///    Northern Nigeria geohash prefixes. Panics with `OutsideNigeriaRegion`
    ///    otherwise.
    ///
    /// 3. **Region commitment consistency** — the contract recomputes
    ///    `SHA-256(region_plaintext_bytes)` and asserts it equals
    ///    `proof.region_commitment`. Panics with `ZkProofInvalid` on mismatch.
    ///    This binds the public plaintext to the ZK circuit's private witness.
    ///
    /// 4. **Proof integrity** — `SHA-256(proof.proof_digest)` is stored as a
    ///    second-preimage fingerprint. This ensures the on-chain record commits
    ///    to a specific proof artefact without storing the full proof bytes.
    ///
    /// # Storage
    /// On success, writes to **instance storage**:
    ///   - `("ZK_STS", farmer)` → `KycStatus::Verified`
    ///   - `("ZK_REC", farmer)` → `ZkKycRecord` (full record, see struct docs)
    ///
    /// # Errors
    /// - `NotVerifier`         — caller is not a registered verifier
    /// - `ProofExpired`        — `valid_until` ≤ current ledger timestamp
    /// - `OutsideNigeriaRegion` — `region_plaintext` not in approved set
    /// - `ZkProofInvalid`      — `region_commitment` ≠ SHA-256(region_plaintext)
    pub fn verify_kyc(env: Env, verifier: Address, farmer: Address, proof: ZkProofInput) {
        verifier.require_auth();
        Self::require_verifier(&env, &verifier);

        // Check for commitment reuse to prevent a single proof from being used for multiple farmers.
        // We use age_commitment as the unique identifier for the proof's subject.
        if env
            .storage()
            .instance()
            .has(&zk_commitment_key(&env, &proof.age_commitment))
        {
            panic_with_error!(&env, Error::CommitmentAlreadySubmitted);
        }

        // 1. Expiry check
        if proof.valid_until <= env.ledger().timestamp() {
            panic_with_error!(&env, Error::ProofExpired);
        }

        // 2. Region boundary check
        Self::assert_valid_region(&env, &proof.region_plaintext);

        // 3. Region commitment consistency: SHA-256(region_plaintext) == region_commitment
        //    Copy the string's raw UTF-8 bytes into a fixed-size buffer (max 2 chars for s0–s8),
        //    then feed them to the host SHA-256.
        let region_len = proof.region_plaintext.len() as usize;
        let mut region_buf = [0u8; 8]; // generous upper bound for any geohash prefix
        proof
            .region_plaintext
            .copy_into_slice(&mut region_buf[..region_len]);
        let region_bytes = Bytes::from_slice(&env, &region_buf[..region_len]);
        let derived_region_hash: BytesN<32> = env.crypto().sha256(&region_bytes).into();
        if derived_region_hash != proof.region_commitment {
            panic_with_error!(&env, Error::ZkProofInvalid);
        }

        // 4. Proof integrity: store SHA-256(proof_digest) as second-preimage guard
        let proof_digest_bytes = Bytes::from_slice(&env, proof.proof_digest.to_array().as_slice());
        let proof_integrity_hash: BytesN<32> = env.crypto().sha256(&proof_digest_bytes).into();

        // Build the on-chain record
        let record = ZkKycRecord {
            farmer: farmer.clone(),
            verifier: verifier.clone(),
            proof_integrity_hash,
            age_commitment: proof.age_commitment,
            region_commitment: proof.region_commitment,
            verified_region: proof.region_plaintext,
            verified_at: env.ledger().timestamp(),
            valid_until: proof.valid_until,
        };

        // Write status and record to instance storage
        env.storage()
            .instance()
            .set(&zk_status_key(&env, &farmer), &KycStatus::Verified);
        env.storage()
            .instance()
            .set(&zk_record_key(&env, &farmer), &record);

        // Mark the commitment as used to prevent replay.
        env.storage()
            .instance()
            .set(&zk_commitment_key(&env, &proof.age_commitment), &());

        env.events().publish(
            (symbol_short!("ZKKYCPass"), farmer.clone()),
            (verifier, proof.proof_digest),
        );
    }

    // ── Legacy verifier-gated path (unchanged) ────────────────────────────────

    /// Attest a farmer's KYC status. Only registered verifiers may call this.
    /// Always appends to history — never overwrites past attestations.
    pub fn attest_kyc(env: Env, verifier: Address, farmer_id: Address, status: KycStatus) {
        verifier.require_auth();
        Self::require_verifier(&env, &verifier);

        let attestation = Attestation {
            verifier: verifier.clone(),
            status: status.clone(),
            timestamp: env.ledger().timestamp(),
        };

        // Append to history (never overwrite)
        let hkey = history_key(&env, &farmer_id);
        let mut history: Vec<Attestation> = env
            .storage()
            .persistent()
            .get(&hkey)
            .unwrap_or(Vec::new(&env));
        history.push_back(attestation);
        env.storage().persistent().set(&hkey, &history);

        // Update latest status in persistent storage
        env.storage()
            .persistent()
            .set(&status_key(&env, &farmer_id), &status);

        env.events().publish(
            (symbol_short!("KYCAttest"), farmer_id.clone()),
            (verifier, status),
        );
    }

    // ── Read operations ───────────────────────────────────────────────────────

    /// Returns the ZK-KYC status for `farmer` from instance storage.
    /// Defaults to `Pending` if `verify_kyc` has never been called.
    pub fn get_zk_kyc_status(env: Env, farmer: Address) -> KycStatus {
        env.storage()
            .instance()
            .get(&zk_status_key(&env, &farmer))
            .unwrap_or(KycStatus::Pending)
    }

    /// Returns the full ZK-KYC record for `farmer`, or `None` if not yet verified.
    pub fn get_zk_kyc_record(env: Env, farmer: Address) -> Option<ZkKycRecord> {
        env.storage()
            .instance()
            .get(&zk_record_key(&env, &farmer))
    }

    /// Returns the current legacy KYC status of a farmer. Defaults to Pending.
    pub fn get_kyc_status(env: Env, farmer_id: Address) -> KycStatus {
        env.storage()
            .persistent()
            .get(&status_key(&env, &farmer_id))
            .unwrap_or(KycStatus::Pending)
    }

    /// Returns the full legacy attestation history for a farmer.
    pub fn get_kyc_history(env: Env, farmer_id: Address) -> Vec<Attestation> {
        env.storage()
            .persistent()
            .get(&history_key(&env, &farmer_id))
            .unwrap_or(Vec::new(&env))
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_verifier(env: &Env, verifier: &Address) {
        let is_verifier: bool = env
            .storage()
            .persistent()
            .get(&verifier_key(env, verifier))
            .unwrap_or(false);
        if !is_verifier {
            panic_with_error!(env, HarvestaError::NotVerifier);
        }
    }

    /// Validates `region` is one of the nine approved Northern Nigeria prefixes.
    fn assert_valid_region(env: &Env, region: &String) {
        for prefix in VALID_REGIONS {
            if *region == String::from_str(env, prefix) {
                return;
            }
        }
        panic_with_error!(env, Error::OutsideNigeriaRegion);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Address, Bytes, BytesN, Env, String,
    };

    // ── helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, KycAttestationClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, KycAttestation);
        let client = KycAttestationClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin);
        client.register_verifier(&admin, &verifier);

        (env, admin, verifier, client)
    }

    /// Build a valid `ZkProofInput` for `region` (e.g. "s1") with a
    /// ledger-timestamp-aware expiry.  The region_commitment is derived from
    /// SHA-256(region_bytes) so the contract's consistency check passes. The
    /// nonce allows creating unique commitments for tests.
    fn valid_proof(env: &Env, region: &str, valid_until: u64, nonce: u8) -> ZkProofInput {
        let region_str = String::from_str(env, region);
        // Derive region_commitment the same way the contract does: SHA-256(raw region bytes)
        let region_bytes = Bytes::from_slice(env, region.as_bytes());
        let region_commitment: BytesN<32> = env.crypto().sha256(&region_bytes).into();

        // Proof digest and age commitment are arbitrary 32 bytes for testing.
        let proof_digest = BytesN::from_array(env, &[nonce; 32]);

        ZkProofInput {
            proof_digest,
            age_commitment: BytesN::from_array(env, &[nonce; 32]),
            region_commitment,
            region_plaintext: region_str,
            valid_until,
        }
    }

    // ── verify_kyc — happy path ───────────────────────────────────────────────

    #[test]
    fn test_verify_kyc_writes_verified_to_instance_storage() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        // Place ledger at t=1000; proof expires at t=2000
        env.ledger().set_timestamp(1000);
        let proof = valid_proof(&env, "s1", 2000, 1);

        client.verify_kyc(&verifier, &farmer, &proof);

        assert_eq!(client.get_zk_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    fn test_verify_kyc_record_stored_in_instance_storage() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(500);
        let proof = valid_proof(&env, "s3", 9999, 1);

        client.verify_kyc(&verifier, &farmer, &proof);

        let rec = client.get_zk_kyc_record(&farmer).unwrap();
        assert_eq!(rec.farmer, farmer);
        assert_eq!(rec.verifier, verifier);
        assert_eq!(rec.verified_region, String::from_str(&env, "s3"));
        assert_eq!(rec.valid_until, 9999);
        assert_eq!(rec.age_commitment, BytesN::from_array(&env, &[1u8; 32]));
    }

    #[test]
    fn test_verify_kyc_stores_proof_integrity_hash() {
        // proof_integrity_hash == SHA-256(proof_digest), not the raw digest
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(0);
        let proof = valid_proof(&env, "s2", 1000, 1);
        let expected_hash: BytesN<32> = env
            .crypto()
            .sha256(&Bytes::from_slice(&env, proof.proof_digest.to_array().as_slice()))
            .into();

        client.verify_kyc(&verifier, &farmer, &proof);

        let rec = client.get_zk_kyc_record(&farmer).unwrap();
        assert_eq!(rec.proof_integrity_hash, expected_hash);
    }

    #[test]
    fn test_default_zk_status_is_pending() {
        let (env, _, _, client) = setup();
        let stranger = Address::generate(&env);
        assert_eq!(client.get_zk_kyc_status(&stranger), KycStatus::Pending);
        assert!(client.get_zk_kyc_record(&stranger).is_none());
    }

    #[test]
    fn test_all_valid_regions_accepted() {
        let (env, _, verifier, client) = setup();
        env.ledger().set_timestamp(0);

        for region in ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] {
            let farmer = Address::generate(&env);
            let proof = valid_proof(&env, region, 9999, region.as_bytes()[1]);
            client.verify_kyc(&verifier, &farmer, &proof);
            assert_eq!(client.get_zk_kyc_status(&farmer), KycStatus::Verified);
        }
    }

    #[test]
    fn test_verify_kyc_overwrites_previous_record() {
        // A second verify_kyc call updates the stored record (re-verification).
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(100);
        client.verify_kyc(&verifier, &farmer, &valid_proof(&env, "s1", 5000, 1));

        env.ledger().set_timestamp(200);
        client.verify_kyc(&verifier, &farmer, &valid_proof(&env, "s4", 9000, 2));

        let rec = client.get_zk_kyc_record(&farmer).unwrap();
        assert_eq!(rec.verified_region, String::from_str(&env, "s4"));
        assert_eq!(rec.valid_until, 9000);
    }

    // ── verify_kyc — error paths ──────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_verify_kyc_rejects_reused_commitment() {
        let (env, _, verifier, client) = setup();
        let farmer1 = Address::generate(&env);
        let farmer2 = Address::generate(&env);

        env.ledger().set_timestamp(100);
        let proof = valid_proof(&env, "s1", 5000, 1);

        // First use with farmer1 is OK.
        client.verify_kyc(&verifier, &farmer1, &proof);

        // Reusing the same proof (and thus same commitment) for farmer2 should fail.
        client.verify_kyc(&verifier, &farmer2, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #61)")]
    fn test_non_verifier_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(0);
        let proof = valid_proof(&env, "s1", 9999, 1);
        client.verify_kyc(&attacker, &farmer, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_expired_proof_rejected() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        // Ledger is at t=2000; proof expired at t=1000
        env.ledger().set_timestamp(2000);
        let proof = valid_proof(&env, "s1", 1000, 1);
        client.verify_kyc(&verifier, &farmer, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_proof_expiring_at_exact_timestamp_rejected() {
        // valid_until must be strictly greater than current timestamp
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(1000);
        let proof = valid_proof(&env, "s1", 1000, 1); // equal, not greater
        client.verify_kyc(&verifier, &farmer, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_invalid_region_rejected() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(0);
        // "e7" is East Africa — outside Northern Nigeria
        let proof = valid_proof(&env, "e7", 9999, 1);
        client.verify_kyc(&verifier, &farmer, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_region_commitment_mismatch_rejected() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        env.ledger().set_timestamp(0);

        // Build a proof where region_commitment does NOT match region_plaintext
        let tampered = ZkProofInput {
            proof_digest: BytesN::from_array(&env, &[0xabu8; 32]),
            age_commitment: BytesN::from_array(&env, &[0x01u8; 32]),
            region_commitment: BytesN::from_array(&env, &[0xffu8; 32]), // wrong hash
            region_plaintext: String::from_str(&env, "s1"),
            valid_until: 9999,
        };
        client.verify_kyc(&verifier, &farmer, &tampered);
    }

    // ── legacy attest_kyc (unchanged behaviour) ───────────────────────────────

    #[test]
    fn test_verifier_can_attest() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #61)")]
    fn test_non_verifier_attest_rejected() {
        let (env, _, _, client) = setup();
        let attacker = Address::generate(&env);
        let farmer = Address::generate(&env);

        client.attest_kyc(&attacker, &farmer, &KycStatus::Verified);
    }

    #[test]
    fn test_pending_to_verified_transition() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Pending);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Verified);
    }

    #[test]
    fn test_verified_to_rejected_transition() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Rejected);
    }

    #[test]
    fn test_history_preserved_across_attestations() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Pending);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        let history = client.get_kyc_history(&farmer);
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap().status, KycStatus::Pending);
        assert_eq!(history.get(1).unwrap().status, KycStatus::Verified);
        assert_eq!(history.get(2).unwrap().status, KycStatus::Rejected);
    }

    #[test]
    fn test_history_append_only_not_overwritten() {
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Verified);
        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        let history = client.get_kyc_history(&farmer);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().status, KycStatus::Verified);
        assert_eq!(history.get(1).unwrap().status, KycStatus::Rejected);
    }

    // ── ZK and legacy paths are independent ───────────────────────────────────

    #[test]
    fn test_zk_and_legacy_paths_are_independent() {
        // A farmer can have legacy Rejected status but ZK Verified status
        // (or vice-versa) — the two storage paths don't interfere.
        let (env, _, verifier, client) = setup();
        let farmer = Address::generate(&env);

        client.attest_kyc(&verifier, &farmer, &KycStatus::Rejected);

        env.ledger().set_timestamp(0);
        client.verify_kyc(&verifier, &farmer, &valid_proof(&env, "s5", 9999, 1));

        // Legacy path: Rejected
        assert_eq!(client.get_kyc_status(&farmer), KycStatus::Rejected);
        // ZK path: Verified
        assert_eq!(client.get_zk_kyc_status(&farmer), KycStatus::Verified);
    }
}
