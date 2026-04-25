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

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, IntoVal, String,
};

// ── Types ─────────────────────────────────────────────────────────────────────

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

#[contracttype]
#[derive(Clone, Debug)]
pub struct LocationVerification {
    /// Farmer's Stellar wallet address
    pub farmer: Address,
    /// SHA-256(lat || lon || nonce) — exact coordinates never stored on-chain
    pub commitment: BytesN<32>,
    /// 2-char geohash prefix submitted by farmer (public, low-precision)
    pub region_geohash: String,
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
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Step 1 — Farmer submits a location commitment without revealing coordinates.
    ///
    /// `farmer`         — must sign; their wallet ties the commitment to an identity
    /// `commitment`     — SHA-256(lat_bytes || lon_bytes || nonce)
    /// `region_geohash` — 2-char Northern Nigeria prefix (e.g. "s1")
    ///
    /// Panics if the commitment is already registered or if `region_geohash` is
    /// outside the approved Northern Nigeria boundary.
    pub fn submit_commitment(
        env: Env,
        farmer: Address,
        commitment: BytesN<32>,
        region_geohash: String,
    ) {
        farmer.require_auth();

        // Validate the public geohash prefix before accepting the commitment
        Self::assert_northern_nigeria(&env, &region_geohash);

        let key = Self::verif_key(&env, &commitment);
        if env.storage().persistent().has(&key) {
            panic!("commitment already submitted");
        }

        let record = LocationVerification {
            farmer: farmer.clone(),
            commitment: commitment.clone(),
            region_geohash,
            submitted_at: env.ledger().timestamp(),
            status: VerificationStatus::Pending,
            verified_at: 0,
        };

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("zkCommit"), farmer),
            commitment,
        );
    }

    /// Step 2 — Admin approves a commitment after off-chain ZK circuit verification.
    ///
    /// `commitment`   — the commitment hash submitted in step 1
    /// `proof_digest` — SHA-256 of the full Groth16/PLONK proof artefact
    ///                  (stored as an on-chain audit trail)
    ///
    /// Only callable by the admin. The admin certifies that Circuit 2 confirmed
    /// the committed coordinates are inside the Northern Nigeria boundary.
    pub fn approve_location(
        env: Env,
        commitment: BytesN<32>,
        proof_digest: BytesN<32>,
    ) {
        Self::require_admin(&env);

        let key = Self::verif_key(&env, &commitment);
        let mut record: LocationVerification = env
            .storage()
            .persistent()
            .get(&key)
            .expect("commitment not found");

        if record.status != VerificationStatus::Pending {
            panic!("commitment is not in Pending state");
        }

        record.status = VerificationStatus::Approved;
        record.verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &record);

        // Store proof digest under a separate key (BytesN<32> in Option is not
        // XDR-serialisable inside a #[contracttype] struct in this SDK version)
        env.storage()
            .persistent()
            .set(&Self::proof_key(&env, &commitment), &proof_digest);

        env.events().publish(
            (symbol_short!("zkApprove"), record.farmer),
            commitment,
        );
    }

    /// Admin rejects a commitment (e.g. ZK circuit failed or coordinates out of bounds).
    pub fn reject_location(env: Env, commitment: BytesN<32>) {
        Self::require_admin(&env);

        let key = Self::verif_key(&env, &commitment);
        let mut record: LocationVerification = env
            .storage()
            .persistent()
            .get(&key)
            .expect("commitment not found");

        if record.status != VerificationStatus::Pending {
            panic!("commitment is not in Pending state");
        }

        record.status = VerificationStatus::Rejected;
        record.verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("zkReject"), record.farmer),
            commitment,
        );
    }

    /// Returns the verification record for a commitment hash.
    pub fn get_verification(env: Env, commitment: BytesN<32>) -> Option<LocationVerification> {
        env.storage().persistent().get(&Self::verif_key(&env, &commitment))
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

    // ── internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }

    fn verif_key(env: &Env, commitment: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("VERIF"), commitment.clone()).into_val(env)
    }

    fn proof_key(env: &Env, commitment: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("PROOF"), commitment.clone()).into_val(env)
    }

    /// Approved 2-character geohash prefixes covering Northern Nigeria
    /// (approx. 9°N–14°N, 3°E–15°E). This is the public boundary check;
    /// the ZK circuit enforces the exact coordinate-level boundary.
    fn assert_northern_nigeria(env: &Env, region: &String) {
        const VALID: [&str; 9] = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
        for prefix in VALID {
            if *region == String::from_str(env, prefix) {
                return;
            }
        }
        panic!("region_geohash is outside the approved Northern Nigeria boundary");
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, BytesN, Env, String};

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

        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s1"));

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

        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s3"));
        client.reject_location(&c);

        let record = client.get_verification(&c).unwrap();
        assert_eq!(record.status, VerificationStatus::Rejected);
        assert!(!client.is_approved(&c));
    }

    #[test]
    #[should_panic(expected = "commitment already submitted")]
    fn test_duplicate_commitment_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 3);

        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s1"));
        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s1"));
    }

    #[test]
    #[should_panic(expected = "region_geohash is outside the approved Northern Nigeria boundary")]
    fn test_out_of_bounds_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);

        // "e7" is in East Africa — outside Northern Nigeria
        client.submit_commitment(&farmer, &commitment(&env, 4), &String::from_str(&env, "e7"));
    }

    #[test]
    #[should_panic(expected = "commitment is not in Pending state")]
    fn test_double_approve_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 5);

        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s2"));
        client.approve_location(&c, &proof_digest(&env, 5));
        client.approve_location(&c, &proof_digest(&env, 5)); // must panic
    }

    #[test]
    fn test_nonexistent_commitment_returns_none() {
        let (env, _, client) = setup();
        assert!(client.get_verification(&commitment(&env, 99)).is_none());
        assert!(!client.is_approved(&commitment(&env, 99)));
    }

    #[test]
    fn test_all_northern_nigeria_prefixes_accepted() {
        let prefixes = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
        for (i, prefix) in prefixes.iter().enumerate() {
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
                &String::from_str(&env, prefix),
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

        client.submit_commitment(&farmer, &c, &String::from_str(&env, "s1"));
        assert!(client.get_proof_digest(&c).is_none());
    }
}
