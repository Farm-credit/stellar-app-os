#![no_std]

//! Tree Escrow Contract — Closes #310
//!
//! Holds donor funds and releases them in two tranches:
//!   • Tranche 1 (75%) — released on verified planting (GPS + photo proof)
//!   • Tranche 2 (25%) — released after 6-month survival verification
//!                        ONLY when oracle-confirmed survival rate >= 70%
//!
//! State machine:
//!   Funded → Planted (75% out) → Survived (25% out, Completed)
//!                              ↘ Disputed (survival rate < 70%, 25% held)

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// 75% in basis points
const TRANCHE_1_BPS: i128 = 7_500;
/// 25% in basis points
const TRANCHE_2_BPS: i128 = 2_500;
const BPS_DENOM: i128     = 10_000;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Minimum survival rate (percentage, 0–100) required to release Tranche 2.
/// Oracle must confirm >= 70% of planted trees survived.
const MIN_SURVIVAL_RATE: u32 = 70;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    /// Funds deposited, awaiting planting proof
    Funded,
    /// Planting verified, 75% released — awaiting 6-month survival check
    Planted,
    /// Survival verified at >= 70% rate, 25% released — fully complete
    Completed,
    /// Survival rate < 70% — Tranche 2 held pending dispute resolution
    Disputed,
    /// Refunded to donor (only before Planted)
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    pub donor:              Address,
    pub farmer:             Address,
    pub token:              Address,
    pub total_amount:       i128,
    pub released:           i128,
    pub status:             EscrowStatus,
    /// Ledger timestamp when planting was verified
    pub planted_at:         Option<u64>,
    /// SHA-256 of GPS + photo proof submitted at planting
    pub planting_proof:     Option<BytesN<32>>,
    /// SHA-256 of GPS + photo proof submitted at survival check
    pub survival_proof:     Option<BytesN<32>>,
    /// Oracle-confirmed survival rate (0–100) recorded at survival check
    pub survival_rate:      Option<u32>,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeEscrow;

#[contractimpl]
impl TreeEscrow {
    /// One-time initialisation — sets the verifier/admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    /// Donor deposits `amount` of `token` into escrow for `farmer`.
    pub fn deposit(
        env: Env,
        donor: Address,
        farmer: Address,
        token: Address,
        amount: i128,
    ) {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let key = Self::record_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        // Pull funds from donor into contract
        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &amount);

        env.storage().persistent().set(&key, &EscrowRecord {
            donor:          donor.clone(),
            farmer:         farmer.clone(),
            token,
            total_amount:   amount,
            released:       0,
            status:         EscrowStatus::Funded,
            planted_at:     None,
            planting_proof: None,
            survival_proof: None,
            survival_rate:  None,
        });

        env.events().publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Verifier calls this after GPS + photo proof of planting is validated.
    /// Releases 75% of escrowed funds instantly to the farmer.
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
    ) {
        Self::require_admin(&env);

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key).expect("no escrow for farmer");

        if rec.status != EscrowStatus::Funded {
            panic!("planting already verified or escrow not active");
        }

        let tranche1 = (rec.total_amount * TRANCHE_1_BPS) / BPS_DENOM;

        token::Client::new(&env, &rec.token)
            .transfer(&env.current_contract_address(), &rec.farmer, &tranche1);

        rec.released       += tranche1;
        rec.status          = EscrowStatus::Planted;
        rec.planted_at      = Some(env.ledger().timestamp());
        rec.planting_proof  = Some(proof_hash.clone());

        env.storage().persistent().set(&key, &rec);

        env.events().publish((symbol_short!("planted"), farmer), tranche1);
    }

    /// Verifier calls this after 6-month survival check passes.
    ///
    /// `survival_rate` is the oracle-confirmed percentage (0–100) of planted
    /// trees that survived.  Must be >= 70% to release Tranche 2.
    ///
    /// - survival_rate >= 70% → releases remaining 25%, status → Completed
    /// - survival_rate <  70% → status → Disputed, Tranche 2 held
    ///
    /// Enforces that at least 6 months have elapsed since planting verification.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate: u32,
    ) {
        Self::require_admin(&env);

        if survival_rate > 100 {
            panic!("survival_rate must be between 0 and 100");
        }

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key).expect("no escrow for farmer");

        if rec.status != EscrowStatus::Planted {
            panic!("planting not yet verified");
        }

        // Enforce 6-month lock
        let planted_at = rec.planted_at.expect("planted_at missing");
        let now        = env.ledger().timestamp();
        if now < planted_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        // Record proof and rate regardless of outcome
        rec.survival_proof = Some(proof_hash.clone());
        rec.survival_rate  = Some(survival_rate);

        if survival_rate >= MIN_SURVIVAL_RATE {
            // ── Happy path: release Tranche 2 (25%) ──────────────────────────
            let tranche2 = rec.total_amount - rec.released;
            if tranche2 <= 0 {
                panic!("nothing left to release");
            }

            token::Client::new(&env, &rec.token)
                .transfer(&env.current_contract_address(), &rec.farmer, &tranche2);

            rec.released += tranche2;
            rec.status    = EscrowStatus::Completed;

            env.storage().persistent().set(&key, &rec);

            env.events().publish(
                (symbol_short!("survived"), farmer.clone()),
                (tranche2, survival_rate),
            );
        } else {
            // ── Below threshold: mark Disputed, hold Tranche 2 ───────────────
            rec.status = EscrowStatus::Disputed;

            env.storage().persistent().set(&key, &rec);

            env.events().publish(
                (symbol_short!("disputed"), farmer.clone()),
                survival_rate,
            );
        }
    }

    /// Admin resolves a Disputed escrow.
    ///
    /// `release_to_farmer` — if true, releases the held 25% to the farmer
    /// (e.g. after manual review).  If false, refunds it to the donor.
    pub fn resolve_dispute(env: Env, farmer: Address, release_to_farmer: bool) {
        Self::require_admin(&env);

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key).expect("no escrow for farmer");

        if rec.status != EscrowStatus::Disputed {
            panic!("escrow is not in Disputed state");
        }

        let remainder = rec.total_amount - rec.released;
        if remainder <= 0 {
            panic!("nothing left to release");
        }

        let recipient = if release_to_farmer { &rec.farmer } else { &rec.donor };

        token::Client::new(&env, &rec.token)
            .transfer(&env.current_contract_address(), recipient, &remainder);

        rec.released += remainder;
        rec.status    = EscrowStatus::Completed;

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("resolved"), farmer),
            (remainder, release_to_farmer),
        );
    }

    /// Refund full amount to donor — only allowed before planting is verified.
    pub fn refund(env: Env, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key).expect("no escrow for farmer");

        if rec.status != EscrowStatus::Funded {
            panic!("cannot refund after planting has been verified");
        }

        token::Client::new(&env, &rec.token)
            .transfer(&env.current_contract_address(), &rec.donor, &rec.total_amount);

        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        env.events().publish((symbol_short!("refund"), farmer), rec.total_amount);
    }

    /// Read escrow record for a farmer.
    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage().persistent().get(&Self::record_key(&env, &farmer))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn record_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESC"), farmer.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

    fn setup() -> (Env, Address, Address, Address, Address, TreeEscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeEscrow);
        let client      = TreeEscrowClient::new(&env, &contract_id);

        let admin  = Address::generate(&env);
        let donor  = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract(admin.clone());
        token::StellarAssetClient::new(&env, &token_id).mint(&donor, &10_000);

        client.initialize(&admin);
        (env, admin, donor, farmer, token_id, client)
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_full_lifecycle_passing_survival() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Funded);

        // Verify planting → 75% released
        client.verify_planting(&farmer, &proof(&env, 1));
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.status, EscrowStatus::Planted);

        // Fast-forward ledger by 6 months
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        // Verify survival at 85% → Tranche 2 released
        client.verify_survival(&farmer, &proof(&env, 2), &85u32);
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.released, 10_000);
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.survival_rate, Some(85u32));
    }

    #[test]
    fn test_survival_at_exactly_70_percent_passes() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        // Exactly 70% — boundary condition, must pass
        client.verify_survival(&farmer, &proof(&env, 2), &70u32);
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
    }

    #[test]
    fn test_survival_below_70_percent_disputes() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        // 69% — below threshold, must move to Disputed
        client.verify_survival(&farmer, &proof(&env, 2), &69u32);
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Disputed);
        // Only Tranche 1 released — Tranche 2 still held
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.survival_rate, Some(69u32));
    }

    #[test]
    fn test_dispute_resolved_to_farmer() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &60u32);

        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Disputed);

        // Admin resolves in farmer's favour
        client.resolve_dispute(&farmer, &true);
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
    }

    #[test]
    fn test_dispute_resolved_to_donor() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &50u32);

        // Admin refunds Tranche 2 to donor
        client.resolve_dispute(&farmer, &false);
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000); // total accounted for
    }

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));

        env.ledger().with_mut(|l| l.timestamp += 86_400);
        client.verify_survival(&farmer, &proof(&env, 2), &80u32);
    }

    #[test]
    #[should_panic(expected = "planting already verified")]
    fn test_double_planting_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        client.verify_planting(&farmer, &proof(&env, 1));
    }

    #[test]
    #[should_panic(expected = "survival_rate must be between 0 and 100")]
    fn test_invalid_survival_rate_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &101u32);
    }

    #[test]
    fn test_refund_before_planting() {
        let (_env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.refund(&farmer);
        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after planting")]
    fn test_refund_after_planting_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        client.refund(&farmer);
    }
}
