#![no_std]

//! Aggregate Impact Verifier — Circuit 4 — Closes #319
//!
//! Verifies periodic ZK aggregate impact proofs on-chain.
//! Example: "50,000 trees planted across 200 verified farms"
//! — without revealing individual farm data.
//!
//! # Protocol
//!
//! 1. Off-chain ZK prover aggregates per-farm commitments into a single
//!    Groth16/PLONK proof covering the entire reporting period.
//! 2. Admin submits the proof digest + public aggregate stats via
//!    `submit_aggregate_proof()`.
//! 3. Anyone can query `get_proof()` or `get_period_stats()` for audit.
//!
//! # Privacy guarantee
//!
//! Only aggregate totals (tree_count, farm_count) and the proof digest are
//! stored on-chain. Individual farm addresses and GPS coordinates are never
//! revealed.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, IntoVal,
};

// ── Types ─────────────────────────────────────────────────────────────────────

/// Public aggregate statistics committed to in the ZK proof.
/// Individual farm data is never stored on-chain.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AggregateStats {
    /// Total trees planted across all farms in this period
    pub tree_count: u64,
    /// Number of verified farms included in the aggregate
    pub farm_count: u32,
    /// Reporting period start (Unix timestamp)
    pub period_start: u64,
    /// Reporting period end (Unix timestamp)
    pub period_end: u64,
}

/// On-chain record for a submitted aggregate proof.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AggregateProofRecord {
    /// SHA-256 of the full ZK proof artefact (Groth16/PLONK)
    pub proof_digest: BytesN<32>,
    /// Public aggregate stats committed to in the proof
    pub stats: AggregateStats,
    /// Ledger timestamp when the proof was submitted
    pub submitted_at: u64,
    /// Admin address that submitted the proof
    pub submitted_by: Address,
    /// Whether the proof has been invalidated by admin
    pub revoked: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct AggregateImpactVerifier;

#[contractimpl]
impl AggregateImpactVerifier {
    /// One-time initialisation — sets the admin/oracle address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        // Initialise proof counter
        env.storage().instance().set(&symbol_short!("COUNT"), &0u64);
    }

    /// Submit a ZK aggregate impact proof for a reporting period.
    ///
    /// `proof_digest` — SHA-256 of the full Groth16/PLONK proof artefact.
    ///                  The full proof is verified off-chain; only the digest
    ///                  is stored as an immutable audit trail.
    /// `stats`        — Public aggregate stats committed to in the proof.
    ///
    /// Panics if:
    /// - `stats.tree_count == 0` or `stats.farm_count == 0`
    /// - `stats.period_end <= stats.period_start`
    /// - `proof_digest` already registered (replay protection)
    pub fn submit_aggregate_proof(
        env: Env,
        proof_digest: BytesN<32>,
        stats: AggregateStats,
    ) {
        Self::require_admin(&env);

        if stats.tree_count == 0 {
            panic!("tree_count must be positive");
        }
        if stats.farm_count == 0 {
            panic!("farm_count must be positive");
        }
        if stats.period_end <= stats.period_start {
            panic!("period_end must be after period_start");
        }

        // Replay protection — each proof digest must be unique
        let digest_key = Self::digest_key(&env, &proof_digest);
        if env.storage().persistent().has(&digest_key) {
            panic!("proof digest already registered");
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("not initialized");

        let record = AggregateProofRecord {
            proof_digest: proof_digest.clone(),
            stats: stats.clone(),
            submitted_at: env.ledger().timestamp(),
            submitted_by: admin,
            revoked: false,
        };

        // Store by digest (for lookup) and by sequential index (for enumeration)
        env.storage().persistent().set(&digest_key, &record);

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("COUNT"))
            .unwrap_or(0);
        let idx_key = Self::index_key(&env, count);
        env.storage().persistent().set(&idx_key, &proof_digest);
        env.storage()
            .instance()
            .set(&symbol_short!("COUNT"), &(count + 1));

        env.events().publish(
            (symbol_short!("aggProof"), stats.period_start),
            (proof_digest, stats.tree_count, stats.farm_count),
        );
    }

    /// Admin revokes a previously submitted proof (e.g. data error discovered).
    /// Revoked proofs remain on-chain for audit but are flagged as invalid.
    pub fn revoke_proof(env: Env, proof_digest: BytesN<32>) {
        Self::require_admin(&env);

        let key = Self::digest_key(&env, &proof_digest);
        let mut record: AggregateProofRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("proof not found");

        if record.revoked {
            panic!("proof already revoked");
        }

        record.revoked = true;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("aggRevoke"), proof_digest),
            env.ledger().timestamp(),
        );
    }

    /// Returns the proof record for a given digest, or None.
    pub fn get_proof(env: Env, proof_digest: BytesN<32>) -> Option<AggregateProofRecord> {
        env.storage()
            .persistent()
            .get(&Self::digest_key(&env, &proof_digest))
    }

    /// Returns the proof digest at sequential index `idx` (0-based), or None.
    pub fn get_proof_at(env: Env, idx: u64) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&Self::index_key(&env, idx))
    }

    /// Returns the total number of proofs submitted (including revoked).
    pub fn proof_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("COUNT"))
            .unwrap_or(0)
    }

    /// Returns true if the digest is registered and not revoked.
    pub fn is_valid_proof(env: Env, proof_digest: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<soroban_sdk::Val, AggregateProofRecord>(
                &Self::digest_key(&env, &proof_digest),
            )
            .map(|r| !r.revoked)
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

    fn digest_key(env: &Env, digest: &BytesN<32>) -> soroban_sdk::Val {
        (symbol_short!("DIGEST"), digest.clone()).into_val(env)
    }

    fn index_key(env: &Env, idx: u64) -> soroban_sdk::Val {
        (symbol_short!("IDX"), idx).into_val(env)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup() -> (Env, Address, AggregateImpactVerifierClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AggregateImpactVerifier);
        let client = AggregateImpactVerifierClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn digest(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn sample_stats(tree_count: u64, farm_count: u32) -> AggregateStats {
        AggregateStats {
            tree_count,
            farm_count,
            period_start: 1_700_000_000,
            period_end: 1_702_592_000, // +30 days
        }
    }

    #[test]
    fn test_submit_and_retrieve_proof() {
        let (env, _, client) = setup();
        let d = digest(&env, 1);
        let stats = sample_stats(50_000, 200);

        client.submit_aggregate_proof(&d, &stats);

        let record = client.get_proof(&d).unwrap();
        assert_eq!(record.stats.tree_count, 50_000);
        assert_eq!(record.stats.farm_count, 200);
        assert!(!record.revoked);
        assert!(client.is_valid_proof(&d));
        assert_eq!(client.proof_count(), 1);
    }

    #[test]
    fn test_sequential_index() {
        let (env, _, client) = setup();
        let d1 = digest(&env, 1);
        let d2 = digest(&env, 2);

        client.submit_aggregate_proof(&d1, &sample_stats(10_000, 50));
        client.submit_aggregate_proof(&d2, &sample_stats(20_000, 80));

        assert_eq!(client.get_proof_at(&0).unwrap(), d1);
        assert_eq!(client.get_proof_at(&1).unwrap(), d2);
        assert_eq!(client.proof_count(), 2);
    }

    #[test]
    fn test_revoke_proof() {
        let (env, _, client) = setup();
        let d = digest(&env, 3);

        client.submit_aggregate_proof(&d, &sample_stats(5_000, 20));
        assert!(client.is_valid_proof(&d));

        client.revoke_proof(&d);
        assert!(!client.is_valid_proof(&d));
        assert!(client.get_proof(&d).unwrap().revoked);
    }

    #[test]
    #[should_panic(expected = "proof digest already registered")]
    fn test_replay_rejected() {
        let (env, _, client) = setup();
        let d = digest(&env, 4);

        client.submit_aggregate_proof(&d, &sample_stats(1_000, 10));
        client.submit_aggregate_proof(&d, &sample_stats(2_000, 20));
    }

    #[test]
    #[should_panic(expected = "tree_count must be positive")]
    fn test_zero_tree_count_rejected() {
        let (env, _, client) = setup();
        client.submit_aggregate_proof(&digest(&env, 5), &sample_stats(0, 10));
    }

    #[test]
    #[should_panic(expected = "farm_count must be positive")]
    fn test_zero_farm_count_rejected() {
        let (env, _, client) = setup();
        client.submit_aggregate_proof(&digest(&env, 6), &sample_stats(1_000, 0));
    }

    #[test]
    #[should_panic(expected = "period_end must be after period_start")]
    fn test_invalid_period_rejected() {
        let (env, _, client) = setup();
        let bad_stats = AggregateStats {
            tree_count: 1_000,
            farm_count: 10,
            period_start: 1_700_000_000,
            period_end: 1_699_000_000, // before start
        };
        client.submit_aggregate_proof(&digest(&env, 7), &bad_stats);
    }

    #[test]
    #[should_panic(expected = "proof already revoked")]
    fn test_double_revoke_rejected() {
        let (env, _, client) = setup();
        let d = digest(&env, 8);

        client.submit_aggregate_proof(&d, &sample_stats(1_000, 5));
        client.revoke_proof(&d);
        client.revoke_proof(&d);
    }

    #[test]
    fn test_nonexistent_proof_returns_none() {
        let (env, _, client) = setup();
        assert!(client.get_proof(&digest(&env, 99)).is_none());
        assert!(!client.is_valid_proof(&digest(&env, 99)));
        assert!(client.get_proof_at(&0).is_none());
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_rejected() {
        let (env, _, client) = setup();
        let other = Address::generate(&env);
        client.initialize(&other);
    }
}
