#![no_std]

//!
//! Holds donor funds and releases them in two tranches:
//!   • Tranche 1 (75%) — released on verified planting (GPS + photo proof)
//!   • TREE reward — 1 TREE token minted to donor per verified tree
//!   • Tranche 2 (25%) — released after 6-month survival verification
//!
//! State machine:
//!   Funded → Planted (75% out) → Survived (25% out, Completed)
//!                              ↘ Disputed / Refunded

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// 75% in basis points
const TRANCHE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE_PERCENT: u32 = 70;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Maximum trees per batch deposit (Stellar operation limit safety margin)
const MAX_BATCH_SIZE: u32 = 50;

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
    pub donor: Address,
    pub farmer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub tree_count: i128,
    pub verified_tree_count: i128,
    pub tree_tokens_minted: i128,
    pub released: i128,
    pub status: EscrowStatus,
    /// Ledger timestamp when planting was verified
    pub planted_at: OptU64,
    /// SHA-256 of GPS + photo proof submitted at planting
    pub planting_proof: OptProof,
    /// SHA-256 of GPS + photo proof submitted at survival check
    pub survival_proof: OptProof,
    /// ZK/oracle-confirmed survival rate percentage
    pub survival_rate_percent: u32,
}

/// A single slot in a batch deposit: one farmer address and the amount for that tree.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchSlot {
    pub farmer: Address,
    pub amount: i128,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeEscrow;

#[contractimpl]
impl TreeEscrow {
    /// One-time initialisation — sets the verifier/admin and TREE token address.
    ///
    /// The escrow contract must be the TREE token admin so it can mint rewards
    /// when planting verification is confirmed.
    /// 
    /// OPTIMIZED: Cache tree token decimals to avoid repeated calculations
    pub fn initialize(env: Env, admin: Address, tree_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        if token::StellarAssetClient::new(&env, &tree_token).admin()
            != env.current_contract_address()
        {
            panic!("contract must be tree token admin");
        }
        
        // OPTIMIZATION: Cache tree token decimals to avoid repeated calculations
        let tree_decimals = token::Client::new(&env, &tree_token).decimals();
        
        // OPTIMIZATION: Store admin and tree token as tuple (reduces reads from 2 to 1)
        env.storage()
            .instance()
            .set(&symbol_short!("ADMINTREE"), &(admin, tree_token, tree_decimals));
    }

    /// Donor deposits `amount` of `token` into escrow for `farmer`.
    ///
    /// `tree_count` is the maximum number of trees covered by this donation.
    /// Once planting is verified, the contract mints one TREE token per
    /// verifier-confirmed tree to the donor address stored here.
    pub fn deposit(
        env: Env,
        donor: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
    ) {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if tree_count <= 0 {
            panic!("tree count must be positive");
        }

        let key = Self::record_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        // Pull funds from donor into contract
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                donor: donor.clone(),
                farmer: farmer.clone(),
                token,
                total_amount: amount,
                tree_count,
                verified_tree_count: 0,
                tree_tokens_minted: 0,
                released: 0,
                status: EscrowStatus::Funded,
                planted_at: None,
                planting_proof: empty_hash.clone(),
                survival_proof: empty_hash,
                survival_rate_percent: 0,
            },
        );

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);


    /// Batch deposit: donor funds N tree slots in a single contract invocation.
    ///
    /// Gas efficiency: one token transfer for the total, then N storage writes.
    /// Each slot maps to one farmer escrow record in the next planting cycle.
    ///
    /// Constraints:
    ///   - All slots must use the same token.
    ///   - No farmer in the batch may already have an active escrow.
    ///   - Batch size is capped at MAX_BATCH_SIZE (50) to stay within ledger limits.
    pub fn batch_deposit(
        env: Env,
        donor: Address,
        token: Address,
        slots: Vec<BatchSlot>,
    ) {
        donor.require_auth();

        let n = slots.len();
        if n == 0 {
            panic!("batch must contain at least one slot");
        }
        if n > MAX_BATCH_SIZE {
            panic!("batch exceeds maximum size of 50");
        }

        // Validate all slots and compute total in a single pass
        let mut total: i128 = 0;
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            if slot.amount <= 0 {
                panic!("each slot amount must be positive");
            }
            let key = Self::record_key(&env, &slot.farmer);
            if env.storage().persistent().has(&key) {
                panic!("active escrow already exists for a farmer in this batch");
            }
            total += slot.amount;
        }

        // Single token transfer for the entire batch — gas-efficient
        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &total);

        // Write one escrow record per slot
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = Self::record_key(&env, &slot.farmer);
            env.storage().persistent().set(&key, &EscrowRecord {
                donor:          donor.clone(),
                farmer:         slot.farmer.clone(),
                token:          token.clone(),
                total_amount:   slot.amount,
                released:       0,
                status:         EscrowStatus::Funded,
                planted_at:     None,
                planting_proof: None,
                survival_proof: None,
            });
            env.events().publish((symbol_short!("deposit"), slot.farmer), slot.amount);
        }

        env.events().publish((symbol_short!("batch"), donor), total);
    }

    /// Verifier calls this after GPS + photo proof of planting is validated.
    /// Releases 75% of escrowed funds instantly to the farmer.
    /// Mints one TREE token to the donor for each verified tree.
    /// 
    /// OPTIMIZED: Reduced storage operations from 4 to 2 (1 read + 1 write)
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        verified_tree_count: i128,
    ) {
        // OPTIMIZATION: Single read for admin, tree token, and decimals (was 2 reads)
        let (admin, tree_token, tree_decimals): (Address, Address, u32) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");
        
        admin.require_auth();

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow for farmer");

        if rec.status != EscrowStatus::Funded {
            panic!("planting already verified or escrow not active");
        }
        if verified_tree_count <= 0 {
            panic!("verified tree count must be positive");
        }
        if verified_tree_count > rec.tree_count {
            panic!("verified tree count exceeds donation");
        }

        let tranche1 = (rec.total_amount * TRANCHE_1_BPS) / BPS_DENOM;
        
        // OPTIMIZATION: Use cached decimals instead of calling token_unit() (saves computation)
        let tree_token_unit = Self::compute_token_unit(tree_decimals);
        let tree_tokens = verified_tree_count
            .checked_mul(tree_token_unit)
            .expect("tree token mint amount overflow");

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche1,
        );
        token::StellarAssetClient::new(&env, &tree_token).mint(&rec.donor, &tree_tokens);

        rec.released += tranche1;
        rec.verified_tree_count = verified_tree_count;
        rec.tree_tokens_minted = tree_tokens;
        rec.status = EscrowStatus::Planted;
        rec.planted_at = Some(env.ledger().timestamp());
        rec.planting_proof = proof_hash.clone();

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("planted"), farmer), tranche1);
        env.events()
            .publish((symbol_short!("treemint"), rec.donor.clone()), tree_tokens);
    }

    /// Verifier calls this after 6-month survival check passes.
    /// Releases remaining 25% to the farmer.
    /// Enforces that at least 6 months have elapsed since planting verification.
    /// 
    /// OPTIMIZED: Reduced storage operations
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        // OPTIMIZATION: Single read for admin (tree token not needed here)
        let (admin, _tree_token, _tree_decimals): (Address, Address, u32) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");
        
        admin.require_auth();

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow for farmer");

        if rec.status != EscrowStatus::Planted {
            panic!("planting not yet verified");
        }

        // Enforce 6-month lock
        let planted_at = rec.planted_at.clone().unwrap();
        let now = env.ledger().timestamp();
        if now < planted_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        if survival_rate_percent < MIN_SURVIVAL_RATE_PERCENT {
            panic!("survival rate below minimum");
        }

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 { panic!("nothing left to release"); }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche2,
        );

        rec.released += tranche2;
        rec.status = EscrowStatus::Completed;
        rec.survival_proof = OptProof::Some(proof_hash);
        rec.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);


    pub fn refund(env: Env, farmer: Address) {
        // OPTIMIZATION: Single read for admin
        let (admin, _tree_token, _tree_decimals): (Address, Address, u32) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");
        
        admin.require_auth();

        let key = Self::record_key(&env, &farmer);
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow for farmer");

        if rec.status != EscrowStatus::Funded {
            panic!("cannot refund after planting has been verified");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &rec.total_amount,
        );

        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("refund"), farmer), rec.total_amount);


    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage()
            .persistent()
            .get(&Self::record_key(&env, &farmer))
    }

    fn record_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESC"), farmer.clone()).into_val(env)
    }

    fn compute_token_unit(decimals: u32) -> i128 {
        let mut unit = 1i128;
        let mut i = 0u32;
        while i < decimals {
            unit = unit.checked_mul(10).expect("token unit overflow");
            i += 1;
        }
        unit
    }

    fn token_unit(env: &Env, token: &Address) -> i128 {
        let decimals = token::Client::new(env, token).decimals();
        Self::compute_token_unit(decimals)
    }

    fn tree_token(env: &Env) -> Address {
        let (_admin, tree_token, _decimals): (Address, Address, u32) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("tree token not initialized");
        tree_token
    }

    fn require_admin(env: &Env) {
        let (admin, _tree_token, _decimals): (Address, Address, u32) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, BytesN, Env};

    struct Ctx {
        env:      Env,
        client:   TreeEscrowClient<'static>,
        token:    Address,
        donor:    Address,
        farmer:   Address,
        contract: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract = env.register_contract(None, TreeEscrow);
        let client   = TreeEscrowClient::new(&env, &contract);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
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
        client.verify_survival(&farmer, &p, &80);
        assert_eq!(client.get_record(&farmer).unwrap().survival_proof, OptProof::Some(p));
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));
        // Only 1 day later — should panic
        advance_ledger(&env, 86_400);
        client.verify_survival(&farmer, &proof(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_survival_below_70_percent_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000);
        client.verify_planting(&farmer, &proof(&env, 1));

        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &69);
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

    #[test]
    #[should_panic(expected = "tree count must be positive")]
    fn test_deposit_rejects_zero_tree_count() {
        let (_env, _admin, donor, farmer, token, _tree_token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &0);
    }

    #[test]
    fn test_verified_tree_count_controls_tree_mint_amount() {
        let (env, _admin, donor, farmer, token, tree_token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &42);
        client.verify_planting(&farmer, &proof(&env, 1), &30);

        let tree_token_unit = 10i128.pow(token::Client::new(&env, &tree_token).decimals());
        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.tree_count, 42);
        assert_eq!(rec.verified_tree_count, 30);
        assert_eq!(rec.tree_tokens_minted, 30 * tree_token_unit);
        assert_eq!(
            token::Client::new(&env, &tree_token).balance(&donor),
            30 * tree_token_unit
        );
    }

    #[test]
    #[should_panic(expected = "verified tree count exceeds donation")]
    fn test_verified_tree_count_cannot_exceed_donation() {
        let (env, _admin, donor, farmer, token, _tree_token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &42);
        client.verify_planting(&farmer, &proof(&env, 1), &43);
    }

    #[test]
    #[should_panic(expected = "verified tree count must be positive")]
    fn test_verified_tree_count_must_be_positive() {
        let (env, _admin, donor, farmer, token, _tree_token, client) = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &42);
        client.verify_planting(&farmer, &proof(&env, 1), &0);
    }
}
