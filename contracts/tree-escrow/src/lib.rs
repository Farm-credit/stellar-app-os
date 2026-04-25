#![no_std]

//! Tree Escrow Contract — Closes #310
//!
//! Holds donor funds and releases them in two tranches:
//!   • Tranche 1 (75%) — released on verified planting (GPS + photo proof)
//!   • Tranche 2 (25%) — released after 6-month survival verification
//!
//! State machine:
//!   Funded → Planted (75% out) → Survived (25% out, Completed)
//!                              ↘ Disputed / Refunded

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, BytesN, Env, IntoVal,
    Symbol,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// 75% in basis points
const TRANCHE_1_BPS: i128 = 7_500;
/// 25% in basis points
const TRANCHE_2_BPS: i128 = 2_500;
const BPS_DENOM: i128     = 10_000;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    /// Funds deposited, awaiting planting proof
    Funded,
    /// Planting verified, 75% released — awaiting 6-month survival check
    Planted,
    /// Survival verified, 25% released — fully complete
    Completed,
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
    pub planting_proof:     Option<Bytes>,
    /// SHA-256 of GPS + photo proof submitted at survival check
    pub survival_proof:     Option<Bytes>,
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
            token: token.clone(),
            total_amount:   amount,
            released:       0,
            status:         EscrowStatus::Funded,
            planted_at:     None,
            planting_proof: None,
            survival_proof: None,
        });

        env.events().publish(
            (Symbol::new(&env, "DonationReceived"), donor, farmer),
            (amount, token),
        );
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
        rec.planting_proof  = Some(proof_hash.clone().into());

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (Symbol::new(&env, "PlantingVerified"), farmer),
            (tranche1, proof_hash),
        );
    }

    /// Verifier calls this after 6-month survival check passes.
    /// Releases remaining 25% to the farmer.
    /// Enforces that at least 6 months have elapsed since planting verification.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
    ) {
        Self::require_admin(&env);

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

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 {
            panic!("nothing left to release");
        }

        token::Client::new(&env, &rec.token)
            .transfer(&env.current_contract_address(), &rec.farmer, &tranche2);

        rec.released      += tranche2;
        rec.status         = EscrowStatus::Completed;
        rec.survival_proof = Some(proof_hash.clone().into());

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (Symbol::new(&env, "SurvivalVerified"), farmer),
            (tranche2, proof_hash),
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

        env.events().publish(
            (Symbol::new(&env, "DonationRefunded"), rec.donor, farmer),
            rec.total_amount,
        );
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
    use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, BytesN, Env};

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
        BytesN::from_array(env, &[seed; 32]).into()
    }

    #[test]
    fn test_full_lifecycle() {
        let (env, _admin, donor, farmer, token, client) = setup();

        // Deposit
        client.deposit(&donor, &farmer, &token, &10_000);
        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Funded);

        // Verify planting → 75% released
        client.verify_planting(&farmer, &proof(&env, 1));
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.status, EscrowStatus::Planted);

        // Fast-forward ledger by 6 months
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        // Verify survival → remaining 25% released
        client.verify_survival(&farmer, &proof(&env, 2));
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.released, 10_000);
        assert_eq!(rec.status, EscrowStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));

        // Only 1 day later — should panic
        env.ledger().with_mut(|l| l.timestamp += 86_400);
        client.verify_survival(&farmer, &proof(&env, 2));
    }

    #[test]
    #[should_panic(expected = "planting already verified")]
    fn test_double_planting_rejected() {
        let (env, _admin, donor, farmer, token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        client.verify_planting(&farmer, &proof(&env, 1)); // must panic
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
        client.refund(&farmer); // must panic
    }
}
