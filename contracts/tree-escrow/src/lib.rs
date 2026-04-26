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

const TRANCHE_1_BPS: i128  = 7_500;
const BPS_DENOM: i128      = 10_000;
pub const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Soroban's #[contracttype] does not support Option<BytesN<32>> directly.
/// Use a two-variant enum as a workaround.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptProof {
    None,
    Some(BytesN<32>),
}

impl OptProof {
    pub fn is_some(&self) -> bool { matches!(self, OptProof::Some(_)) }
    pub fn unwrap(self) -> BytesN<32> {
        match self { OptProof::Some(v) => v, OptProof::None => panic!("unwrap on None") }
    }
}

/// Same wrapper for optional timestamps.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptU64 {
    None,
    Some(u64),
}

impl OptU64 {
    pub fn is_some(&self) -> bool { matches!(self, OptU64::Some(_)) }
    pub fn unwrap(self) -> u64 {
        match self { OptU64::Some(v) => v, OptU64::None => panic!("unwrap on None") }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Planted,
    Completed,
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
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    pub fn deposit(env: Env, donor: Address, farmer: Address, token: Address, amount: i128) {
        donor.require_auth();
        if amount <= 0 { panic!("amount must be positive"); }

        let key = Self::record_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &amount);

        env.storage().persistent().set(&key, &EscrowRecord {
            donor:          donor.clone(),
            farmer:         farmer.clone(),
            token: token.clone(),
            total_amount:   amount,
            released:       0,
            status:         EscrowStatus::Funded,
            planted_at:     OptU64::None,
            planting_proof: OptProof::None,
            survival_proof: OptProof::None,
        });

        env.events().publish(
            (Symbol::new(&env, "DonationReceived"), donor, farmer),
            (amount, token),
        );
    }

    pub fn verify_planting(env: Env, farmer: Address, proof_hash: BytesN<32>) {
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

    pub fn verify_survival(env: Env, farmer: Address, proof_hash: BytesN<32>) {
        Self::require_admin(&env);

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key).expect("no escrow for farmer");

        if rec.status != EscrowStatus::Planted {
            panic!("planting not yet verified");
        }

        let planted_at = rec.planted_at.clone().unwrap();
        let now        = env.ledger().timestamp();
        if now < planted_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 { panic!("nothing left to release"); }

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

    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage().persistent().get(&Self::record_key(&env, &farmer))
    }

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

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract = env.register_contract(None, TreeEscrow);
        let client   = TreeEscrowClient::new(&env, &contract);

        let admin  = Address::generate(&env);
        let donor  = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token = env.register_stellar_asset_contract(admin.clone());
        token::StellarAssetClient::new(&env, &token).mint(&donor, &10_000);

        client.initialize(&admin);
        Ctx { env, client, token, donor, farmer, contract }
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32]).into()
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    fn advance_ledger(env: &Env, secs: u64) {
        env.ledger().with_mut(|l| l.timestamp += secs);
    }

    // ── Full lifecycle with balance assertions ────────────────────────────────

    #[test]
    fn test_full_lifecycle_with_balances() {
        let Ctx { env, client, token, donor, farmer, contract } = setup();

        // Step 1: Donation → funds locked
        assert_eq!(balance(&env, &token, &donor),    10_000);
        assert_eq!(balance(&env, &token, &contract), 0);
        assert_eq!(balance(&env, &token, &farmer),   0);

        client.deposit(&donor, &farmer, &token, &10_000);

        assert_eq!(balance(&env, &token, &donor),    0,      "donor drained");
        assert_eq!(balance(&env, &token, &contract), 10_000, "contract holds full amount");
        assert_eq!(balance(&env, &token, &farmer),   0,      "farmer not yet paid");

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status,       EscrowStatus::Funded);
        assert_eq!(rec.total_amount, 10_000);
        assert_eq!(rec.released,     0);

        // Step 2: Planting verification → 75% released
        client.verify_planting(&farmer, &proof(&env, 1));

        assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer),   7_500, "farmer received 75%");

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status,   EscrowStatus::Planted);
        assert_eq!(rec.released, 7_500);
        assert!(rec.planting_proof.is_some());
        assert!(rec.planted_at.is_some());

        // Step 3: Fast-forward 6 months
        advance_ledger(&env, SIX_MONTHS_SECS + 1);

        // Step 4: Survival verification → remaining 25% released
        client.verify_survival(&farmer, &proof(&env, 2));

        assert_eq!(balance(&env, &token, &contract), 0,      "contract fully drained");
        assert_eq!(balance(&env, &token, &farmer),   10_000, "farmer received 100%");

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status,   EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
        assert!(rec.survival_proof.is_some());
    }

    #[test]
    fn test_tranche_amounts_non_round_deposit() {
        let Ctx { env, client, token, donor, farmer, contract } = setup();
        token::StellarAssetClient::new(&env, &token).mint(&donor, &1_001);
        client.deposit(&donor, &farmer, &token, &1_001);

        client.verify_planting(&farmer, &proof(&env, 1));
        let tranche1 = (1_001_i128 * 7_500) / 10_000; // = 750
        assert_eq!(balance(&env, &token, &farmer), tranche1);

        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2));

        assert_eq!(balance(&env, &token, &farmer),   1_001);
        assert_eq!(balance(&env, &token, &contract), 0);
    }

    #[test]
    fn test_planting_proof_hash_stored() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        let p = proof(&env, 42);
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &p);
        assert_eq!(client.get_record(&farmer).unwrap().planting_proof, OptProof::Some(p));
    }

    #[test]
    fn test_survival_proof_hash_stored() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        let p = proof(&env, 99);
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &p);
        assert_eq!(client.get_record(&farmer).unwrap().survival_proof, OptProof::Some(p));
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        advance_ledger(&env, 86_400); // only 1 day
        client.verify_survival(&farmer, &proof(&env, 2));
    }

    #[test]
    #[should_panic(expected = "planting already verified")]
    fn test_double_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        client.verify_planting(&farmer, &proof(&env, 1));
    }

    #[test]
    #[should_panic(expected = "planting not yet verified")]
    fn test_survival_without_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_rejected() {
        let Ctx { client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &0);
    }

    #[test]
    #[should_panic(expected = "active escrow already exists")]
    fn test_duplicate_deposit_rejected() {
        let Ctx { client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &5_000);
        client.deposit(&donor, &farmer, &token, &5_000);
    }

    // ── Refund paths ──────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_planting_restores_donor_balance() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        assert_eq!(balance(&env, &token, &donor), 0);

        client.refund(&farmer);

        assert_eq!(balance(&env, &token, &donor),  10_000, "donor fully refunded");
        assert_eq!(balance(&env, &token, &farmer),  0,     "farmer got nothing");
        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after planting")]
    fn test_refund_after_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        client.refund(&farmer);
    }

    // ── Init guard ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_rejected() {
        let Ctx { env, client, .. } = setup();
        client.initialize(&Address::generate(&env));
    }
}
