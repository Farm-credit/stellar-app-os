#![no_std]

//! Tree Escrow Contract
//!
//! Two parallel funding flows backed by shared oracle infrastructure:
//!
//! ## Single-donor flow (keyed by farmer address)
//!   • `deposit` / `batch_deposit` — donor funds an escrow for a farmer
//!   • `verify_planting` releases 75% (Tranche 1) and mints TREE rewards
//!   • `verify_survival` releases the remaining 25% (Tranche 2) once the
//!     ledger is ≥ 6 months past planting AND the survival rate ≥ threshold
//!   • `refund` returns funds to the donor before planting is verified
//!
//! ## Co-funded flow (keyed by tree_id) — Closes #402
//!   • `register_tree` — admin opens a co-fundable tree escrow
//!   • `contribute` — any funder adds to the pool
//!   • `release_proportional` — pays each contributor proportional to their
//!     share of the total pool, gated by an oracle-confirmed survival rate
//!     ≥ threshold. The integer-division remainder goes to the largest
//!     contributor.
//!
//! ## Oracle survival verification — Closes #394
//!   • `submit_survival_report` — registered oracle attests on-chain to a
//!     tree's survival rate. Stored as an `OracleReport` keyed by tree_id.
//!   • The configurable `SurvivalThreshold` (set at init) gates Tranche 2
//!     release for both flows.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// 75% in basis points
const TRANCHE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128 = 10_000;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Maximum slots per batch deposit (Stellar operation limit safety margin)
const MAX_BATCH_SIZE: u32 = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

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
    pub planted_at: u64,
    pub planting_proof: BytesN<32>,
    pub survival_proof: BytesN<32>,
    pub survival_rate_percent: u32,
}

/// A single slot in a batch deposit: one farmer address and the amount for that tree.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchSlot {
    pub farmer: Address,
    pub amount: i128,
}

/// Oracle-submitted survival report for a single tree.
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleReport {
    pub tree_id: u64,
    pub survival_rate_percent: u32,
    pub reported_at: u64,
    pub oracle: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TreeFundingStatus {
    Open,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Contribution {
    pub funder: Address,
    pub amount: i128,
}

/// Co-funded tree escrow record: multiple contributors share a single pool
/// with proportional payouts on release.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TreeFunding {
    pub tree_id: u64,
    pub farmer: Address,
    pub token: Address,
    pub contributions: Vec<Contribution>,
    pub total_funded: i128,
    pub released: i128,
    pub status: TreeFundingStatus,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token, tree_token_decimals)
    AdminTree,
    /// Address authorised to call `submit_survival_report`
    Oracle,
    /// Minimum oracle-confirmed survival rate (0..=100) to release Tranche 2.
    SurvivalThreshold,
    /// Per-farmer single-donor escrow record
    Escrow(Address),
    /// Per-tree oracle survival report
    OracleReport(u64),
    /// Per-tree co-funded escrow record
    TreeFunding(u64),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeEscrow;

#[contractimpl]
impl TreeEscrow {
    /// One-time initialisation.
    ///
    /// * `admin` — controls planting verification, refunds, and tree registration
    /// * `tree_token` — TREE reward token; the contract must be its admin
    /// * `oracle` — the only address allowed to submit survival reports
    /// * `survival_threshold_percent` — minimum survival rate (0..=100) for Tranche 2 release
    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        oracle: Address,
        survival_threshold_percent: u32,
    ) {
        if env.storage().instance().has(&DataKey::AdminTree) {
            panic!("already initialized");
        }
        if survival_threshold_percent > 100 {
            panic!("survival threshold must be 0..=100");
        }
        if token::StellarAssetClient::new(&env, &tree_token).admin()
            != env.current_contract_address()
        {
            panic!("contract must be tree token admin");
        }

        let tree_decimals = token::Client::new(&env, &tree_token).decimals();

        env.storage()
            .instance()
            .set(&DataKey::AdminTree, &(admin, tree_token, tree_decimals));
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::SurvivalThreshold, &survival_threshold_percent);
    }

    // ── Single-donor flow ─────────────────────────────────────────────────────

    /// Donor deposits `amount` of `token` into escrow for `farmer`.
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

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

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
                planted_at: 0,
                planting_proof: empty_hash.clone(),
                survival_proof: empty_hash,
                survival_rate_percent: 0,
            },
        );

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Batch deposit: donor funds N tree slots in a single contract invocation.
    pub fn batch_deposit(env: Env, donor: Address, token: Address, slots: Vec<BatchSlot>) {
        donor.require_auth();

        let n = slots.len();
        if n == 0 {
            panic!("batch must contain at least one slot");
        }
        if n > MAX_BATCH_SIZE {
            panic!("batch exceeds maximum size of 50");
        }

        let mut total: i128 = 0;
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            if slot.amount <= 0 {
                panic!("each slot amount must be positive");
            }
            let key = DataKey::Escrow(slot.farmer.clone());
            if env.storage().persistent().has(&key) {
                panic!("active escrow already exists for a farmer in this batch");
            }
            total += slot.amount;
        }

        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &total);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
            env.storage().persistent().set(
                &key,
                &EscrowRecord {
                    donor: donor.clone(),
                    farmer: slot.farmer.clone(),
                    token: token.clone(),
                    total_amount: slot.amount,
                    tree_count: 1,
                    verified_tree_count: 0,
                    tree_tokens_minted: 0,
                    released: 0,
                    status: EscrowStatus::Funded,
                    planted_at: 0,
                    planting_proof: empty_hash.clone(),
                    survival_proof: empty_hash.clone(),
                    survival_rate_percent: 0,
                },
            );
            env.events()
                .publish((symbol_short!("deposit"), slot.farmer), slot.amount);
        }

        env.events().publish((symbol_short!("batch"), donor), total);
    }

    /// Admin-verified planting: releases Tranche 1 (75%) and mints TREE rewards.
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        verified_tree_count: i128,
    ) {
        let (admin, tree_token, tree_decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let key = DataKey::Escrow(farmer.clone());
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
        let tree_unit = Self::compute_token_unit(tree_decimals);
        let tree_tokens = verified_tree_count
            .checked_mul(tree_unit)
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
        rec.planted_at = env.ledger().timestamp();
        rec.planting_proof = proof_hash;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("planted"), farmer), tranche1);
        env.events()
            .publish((symbol_short!("treemint"), rec.donor.clone()), tree_tokens);
    }

    /// Admin-verified survival check: releases Tranche 2 (25%) once 6 months
    /// have elapsed and the reported survival rate ≥ the configured threshold.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        if survival_rate_percent > 100 {
            panic!("survival_rate must be between 0 and 100");
        }

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no escrow for farmer");

        if rec.status != EscrowStatus::Planted {
            panic!("planting not yet verified");
        }

        let now = env.ledger().timestamp();
        if now < rec.planted_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        let threshold = Self::survival_threshold(&env);
        if survival_rate_percent < threshold {
            panic!("survival rate below minimum");
        }

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 {
            panic!("nothing left to release");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche2,
        );

        rec.released += tranche2;
        rec.status = EscrowStatus::Completed;
        rec.survival_proof = proof_hash;
        rec.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);
    }

    pub fn refund(env: Env, farmer: Address) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let key = DataKey::Escrow(farmer.clone());
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
    }

    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage().persistent().get(&DataKey::Escrow(farmer))
    }

    // ── Oracle survival reports (#394) ────────────────────────────────────────

    /// Oracle-submitted on-chain attestation of a tree's survival rate.
    /// Overwrites any prior report for the same tree (latest wins).
    pub fn submit_survival_report(
        env: Env,
        oracle: Address,
        tree_id: u64,
        survival_rate_percent: u32,
    ) {
        let registered_oracle: Address = env
            .storage()
            .instance()
            .get(&DataKey::Oracle)
            .expect("contract not initialized");

        if oracle != registered_oracle {
            panic!("unauthorized oracle");
        }
        oracle.require_auth();

        if survival_rate_percent > 100 {
            panic!("survival_rate must be between 0 and 100");
        }

        let report = OracleReport {
            tree_id,
            survival_rate_percent,
            reported_at: env.ledger().timestamp(),
            oracle: oracle.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::OracleReport(tree_id), &report);

        env.events().publish(
            (symbol_short!("oraclerp"), oracle),
            (tree_id, survival_rate_percent),
        );
    }

    pub fn get_oracle_report(env: Env, tree_id: u64) -> Option<OracleReport> {
        env.storage()
            .persistent()
            .get(&DataKey::OracleReport(tree_id))
    }

    pub fn get_survival_threshold(env: Env) -> u32 {
        Self::survival_threshold(&env)
    }

    // ── Co-funded flow (#402) ─────────────────────────────────────────────────

    /// Admin opens a tree as co-fundable. Sets the farmer payout address and
    /// the funding token. After registration, anyone may `contribute`.
    pub fn register_tree(env: Env, tree_id: u64, farmer: Address, token: Address) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let key = DataKey::TreeFunding(tree_id);
        if env.storage().persistent().has(&key) {
            panic!("tree already registered");
        }

        let funding = TreeFunding {
            tree_id,
            farmer,
            token,
            contributions: Vec::new(&env),
            total_funded: 0,
            released: 0,
            status: TreeFundingStatus::Open,
        };
        env.storage().persistent().set(&key, &funding);

        env.events()
            .publish((symbol_short!("treereg"), tree_id), funding.farmer);
    }

    /// A funder contributes `amount` to the pool for `tree_id`. If the funder
    /// already has a contribution, their share is added to (not overwritten).
    pub fn contribute(env: Env, funder: Address, tree_id: u64, amount: i128) {
        funder.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let key = DataKey::TreeFunding(tree_id);
        let mut funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .expect("tree not registered");

        if funding.status != TreeFundingStatus::Open {
            panic!("tree not open for contributions");
        }

        token::Client::new(&env, &funding.token).transfer(
            &funder,
            &env.current_contract_address(),
            &amount,
        );

        // Merge with existing contribution from this funder, if any.
        let n = funding.contributions.len();
        let mut found = false;
        for i in 0..n {
            let mut c = funding.contributions.get(i).unwrap();
            if c.funder == funder {
                c.amount += amount;
                funding.contributions.set(i, c);
                found = true;
                break;
            }
        }
        if !found {
            funding.contributions.push_back(Contribution {
                funder: funder.clone(),
                amount,
            });
        }

        funding.total_funded += amount;
        env.storage().persistent().set(&key, &funding);

        env.events()
            .publish((symbol_short!("cofunded"), tree_id), (funder, amount));
    }

    /// Pays out `payout_amount` from the pool, splitting it proportionally
    /// across each contributor by their share of `total_funded`. Gated on an
    /// oracle-submitted survival report ≥ the configured threshold.
    /// The integer-division remainder goes to the largest contributor (ties
    /// broken by earliest-recorded). Supports partial payouts; the funding
    /// is marked `Released` once `released >= total_funded`.
    pub fn release_proportional(env: Env, tree_id: u64, payout_amount: i128) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let report: OracleReport = env
            .storage()
            .persistent()
            .get(&DataKey::OracleReport(tree_id))
            .expect("no oracle report for tree");

        let threshold = Self::survival_threshold(&env);
        if report.survival_rate_percent < threshold {
            panic!("survival rate below minimum");
        }

        let key = DataKey::TreeFunding(tree_id);
        let mut funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .expect("tree not registered");

        if funding.status != TreeFundingStatus::Open {
            panic!("tree not open for release");
        }
        if funding.total_funded <= 0 {
            panic!("no funds to release");
        }
        let remaining = funding.total_funded - funding.released;
        if payout_amount <= 0 || payout_amount > remaining {
            panic!("invalid payout amount");
        }

        let token_client = token::Client::new(&env, &funding.token);
        let n = funding.contributions.len();

        // Identify the largest contributor (earliest-recorded wins ties).
        let mut largest_idx: u32 = 0;
        let mut largest_amount: i128 = 0;
        for i in 0..n {
            let c = funding.contributions.get(i).unwrap();
            if c.amount > largest_amount {
                largest_amount = c.amount;
                largest_idx = i;
            }
        }

        // Pay each non-largest contributor their proportional share. The
        // largest is paid last so any integer-division remainder folds into
        // their payout.
        let mut paid_so_far: i128 = 0;
        for i in 0..n {
            if i == largest_idx {
                continue;
            }
            let c = funding.contributions.get(i).unwrap();
            let payout = (c.amount * payout_amount) / funding.total_funded;
            if payout > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &c.funder,
                    &payout,
                );
            }
            paid_so_far += payout;
            env.events()
                .publish((symbol_short!("propayout"), tree_id), (c.funder, payout));
        }

        let largest = funding.contributions.get(largest_idx).unwrap();
        let largest_payout = payout_amount - paid_so_far;
        if largest_payout > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &largest.funder,
                &largest_payout,
            );
        }
        env.events().publish(
            (symbol_short!("propayout"), tree_id),
            (largest.funder, largest_payout),
        );

        funding.released += payout_amount;
        if funding.released >= funding.total_funded {
            funding.status = TreeFundingStatus::Released;
        }
        env.storage().persistent().set(&key, &funding);
    }

    pub fn get_tree_funding(env: Env, tree_id: u64) -> Option<TreeFunding> {
        env.storage()
            .persistent()
            .get(&DataKey::TreeFunding(tree_id))
    }

    // ── internal helpers ──────────────────────────────────────────────────────

    fn admin_tree(env: &Env) -> (Address, Address, u32) {
        env.storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized")
    }

    fn survival_threshold(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SurvivalThreshold)
            .expect("contract not initialized")
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
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, vec, Address, BytesN, Env,
    };

    const DEFAULT_THRESHOLD: u32 = 70;

    #[allow(dead_code)]
    struct Ctx {
        env: Env,
        admin: Address,
        oracle: Address,
        donor: Address,
        farmer: Address,
        token: Address,
        tree_token: Address,
        client: TreeEscrowClient<'static>,
    }

    fn setup() -> Ctx {
        setup_with_threshold(DEFAULT_THRESHOLD)
    }

    fn setup_with_threshold(threshold: u32) -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeEscrow);
        let client = TreeEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let donor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &token_id).mint(&donor, &10_000);

        let tree_token_id = env
            .register_stellar_asset_contract_v2(contract_id.clone())
            .address();

        client.initialize(&admin, &tree_token_id, &oracle, &threshold);
        Ctx {
            env,
            admin,
            oracle,
            donor,
            farmer,
            token: token_id,
            tree_token: tree_token_id,
            client,
        }
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    fn fund(env: &Env, token: &Address, who: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(who, &amount);
    }

    // ── initialise ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "contract must be tree token admin")]
    fn test_initialize_requires_contract_as_tree_token_admin() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeEscrow);
        let client = TreeEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let tree_token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        client.initialize(&admin, &tree_token_id, &oracle, &70);
    }

    #[test]
    #[should_panic(expected = "survival threshold must be 0..=100")]
    fn test_initialize_rejects_threshold_above_100() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TreeEscrow);
        let client = TreeEscrowClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let tree_token_id = env
            .register_stellar_asset_contract_v2(contract_id.clone())
            .address();
        client.initialize(&admin, &tree_token_id, &oracle, &101);
    }

    // ── Single-donor lifecycle ────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle() {
        let ctx = setup();

        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );

        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.tree_count, 42);
        assert_eq!(rec.verified_tree_count, 42);

        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
        assert_eq!(rec.tree_tokens_minted, 42 * tree_unit);
        assert_eq!(
            balance(&ctx.env, &ctx.tree_token, &ctx.donor),
            42 * tree_unit
        );

        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &70);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
        assert_eq!(rec.survival_rate_percent, 70);
    }

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_survival_below_threshold_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &69);
    }

    #[test]
    fn test_threshold_is_configurable_at_init() {
        // Lower the threshold to 50 — survival of 55% must now succeed.
        let ctx = setup_with_threshold(50);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &55);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Completed
        );
    }

    #[test]
    #[should_panic(expected = "planting already verified")]
    fn test_double_planting_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
    }

    #[test]
    fn test_refund_before_planting() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client.refund(&ctx.farmer);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "cannot refund after planting")]
    fn test_refund_after_planting_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.client.refund(&ctx.farmer);
    }

    #[test]
    #[should_panic(expected = "tree count must be positive")]
    fn test_deposit_rejects_zero_tree_count() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &0);
    }

    #[test]
    fn test_verified_tree_count_controls_tree_mint_amount() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &30);

        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.verified_tree_count, 30);
        assert_eq!(rec.tree_tokens_minted, 30 * tree_unit);
    }

    #[test]
    #[should_panic(expected = "verified tree count exceeds donation")]
    fn test_verified_tree_count_cannot_exceed_donation() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &43);
    }

    #[test]
    fn test_batch_deposit_creates_record_per_slot() {
        let ctx = setup();
        let f1 = Address::generate(&ctx.env);
        let f2 = Address::generate(&ctx.env);
        let slots = vec![
            &ctx.env,
            BatchSlot {
                farmer: f1.clone(),
                amount: 1_500,
            },
            BatchSlot {
                farmer: f2.clone(),
                amount: 2_500,
            },
        ];
        ctx.client.batch_deposit(&ctx.donor, &ctx.token, &slots);

        let r1 = ctx.client.get_record(&f1).unwrap();
        assert_eq!(r1.total_amount, 1_500);
        assert_eq!(r1.status, EscrowStatus::Funded);
        let r2 = ctx.client.get_record(&f2).unwrap();
        assert_eq!(r2.total_amount, 2_500);
    }

    // ── Oracle survival reports (#394) ────────────────────────────────────────

    #[test]
    fn test_submit_survival_report_records_report() {
        let ctx = setup();
        ctx.client.submit_survival_report(&ctx.oracle, &7, &82);

        let r = ctx.client.get_oracle_report(&7).unwrap();
        assert_eq!(r.tree_id, 7);
        assert_eq!(r.survival_rate_percent, 82);
        assert_eq!(r.oracle, ctx.oracle);
    }

    #[test]
    #[should_panic(expected = "unauthorized oracle")]
    fn test_submit_survival_report_rejects_unauthorized_caller() {
        let ctx = setup();
        let impostor = Address::generate(&ctx.env);
        ctx.client.submit_survival_report(&impostor, &7, &82);
    }

    #[test]
    #[should_panic(expected = "survival_rate must be between 0 and 100")]
    fn test_submit_survival_report_rejects_above_100() {
        let ctx = setup();
        ctx.client.submit_survival_report(&ctx.oracle, &7, &101);
    }

    #[test]
    fn test_oracle_report_overwrites_on_resubmission() {
        let ctx = setup();
        ctx.client.submit_survival_report(&ctx.oracle, &9, &50);
        ctx.client.submit_survival_report(&ctx.oracle, &9, &90);
        assert_eq!(
            ctx.client.get_oracle_report(&9).unwrap().survival_rate_percent,
            90
        );
    }

    #[test]
    fn test_survival_threshold_is_queryable() {
        let ctx = setup_with_threshold(85);
        assert_eq!(ctx.client.get_survival_threshold(), 85);
    }

    // ── Co-funded flow (#402) ─────────────────────────────────────────────────

    fn register_and_contribute(ctx: &Ctx, tree_id: u64, contribs: &[(Address, i128)]) {
        ctx.client.register_tree(&tree_id, &ctx.farmer, &ctx.token);
        for (funder, amount) in contribs {
            fund(&ctx.env, &ctx.token, funder, *amount);
            ctx.client.contribute(funder, &tree_id, amount);
        }
    }

    #[test]
    fn test_cofund_two_funders_full_pool_payout() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        // 4_000 and 6_000 → 10_000 pool. Releasing the full pool yields exact
        // contribution-sized payouts (no rounding).
        register_and_contribute(&ctx, 1, &[(a.clone(), 4_000), (b.clone(), 6_000)]);

        let funding = ctx.client.get_tree_funding(&1).unwrap();
        assert_eq!(funding.total_funded, 10_000);
        assert_eq!(funding.contributions.len(), 2);

        ctx.client.submit_survival_report(&ctx.oracle, &1, &80);
        let pre_a = balance(&ctx.env, &ctx.token, &a);
        let pre_b = balance(&ctx.env, &ctx.token, &b);

        ctx.client.release_proportional(&1, &10_000);

        assert_eq!(balance(&ctx.env, &ctx.token, &a) - pre_a, 4_000);
        assert_eq!(balance(&ctx.env, &ctx.token, &b) - pre_b, 6_000);
        assert_eq!(
            ctx.client.get_tree_funding(&1).unwrap().status,
            TreeFundingStatus::Released
        );
    }

    #[test]
    fn test_cofund_three_funders_remainder_goes_to_largest() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        let c = Address::generate(&ctx.env);
        // Pool 301 (100 + 100 + 101). Pay out 100 → integer shares are
        // 33, 33, 33 = 99; the 1-unit remainder goes to c (the largest).
        register_and_contribute(
            &ctx,
            2,
            &[(a.clone(), 100), (b.clone(), 100), (c.clone(), 101)],
        );

        let pre_a = balance(&ctx.env, &ctx.token, &a);
        let pre_b = balance(&ctx.env, &ctx.token, &b);
        let pre_c = balance(&ctx.env, &ctx.token, &c);

        ctx.client.submit_survival_report(&ctx.oracle, &2, &80);
        ctx.client.release_proportional(&2, &100);

        assert_eq!(balance(&ctx.env, &ctx.token, &a) - pre_a, 33);
        assert_eq!(balance(&ctx.env, &ctx.token, &b) - pre_b, 33);
        assert_eq!(balance(&ctx.env, &ctx.token, &c) - pre_c, 34);

        // Tree is still Open because only 100 of 301 has been released.
        let f = ctx.client.get_tree_funding(&2).unwrap();
        assert_eq!(f.status, TreeFundingStatus::Open);
        assert_eq!(f.released, 100);
    }

    #[test]
    fn test_cofund_single_funder_receives_full_pool() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 3, &[(a.clone(), 7_777)]);

        let pre_a = balance(&ctx.env, &ctx.token, &a);
        ctx.client.submit_survival_report(&ctx.oracle, &3, &80);
        ctx.client.release_proportional(&3, &7_777);

        assert_eq!(balance(&ctx.env, &ctx.token, &a) - pre_a, 7_777);
    }

    #[test]
    fn test_cofund_partial_release_then_full_release() {
        // 75% / 25% tranche-style payout across two contributors.
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 8, &[(a.clone(), 4_000), (b.clone(), 6_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &8, &80);

        ctx.client.release_proportional(&8, &7_500); // Tranche 1
        let f = ctx.client.get_tree_funding(&8).unwrap();
        assert_eq!(f.released, 7_500);
        assert_eq!(f.status, TreeFundingStatus::Open);

        ctx.client.release_proportional(&8, &2_500); // Tranche 2
        assert_eq!(
            ctx.client.get_tree_funding(&8).unwrap().status,
            TreeFundingStatus::Released
        );
    }

    #[test]
    #[should_panic(expected = "invalid payout amount")]
    fn test_cofund_release_exceeding_remaining_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 9, &[(a, 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &9, &80);
        ctx.client.release_proportional(&9, &1_001);
    }

    #[test]
    fn test_cofund_same_funder_contributes_twice_share_merges() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        ctx.client.register_tree(&4, &ctx.farmer, &ctx.token);
        fund(&ctx.env, &ctx.token, &a, 1_000);
        ctx.client.contribute(&a, &4, &1_000);
        fund(&ctx.env, &ctx.token, &a, 500);
        ctx.client.contribute(&a, &4, &500);

        let funding = ctx.client.get_tree_funding(&4).unwrap();
        assert_eq!(funding.contributions.len(), 1);
        assert_eq!(funding.contributions.get(0).unwrap().amount, 1_500);
        assert_eq!(funding.total_funded, 1_500);
    }

    #[test]
    #[should_panic(expected = "tree not registered")]
    fn test_cofund_contribute_before_register_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        fund(&ctx.env, &ctx.token, &a, 100);
        ctx.client.contribute(&a, &99, &100);
    }

    #[test]
    #[should_panic(expected = "no oracle report for tree")]
    fn test_cofund_release_without_oracle_report_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 5, &[(a, 1_000)]);
        ctx.client.release_proportional(&5, &1_000);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_cofund_release_below_threshold_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 6, &[(a, 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &6, &50);
        ctx.client.release_proportional(&6, &1_000);
    }

    #[test]
    #[should_panic(expected = "tree not open for release")]
    fn test_cofund_release_after_full_payout_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 7, &[(a, 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &7, &80);
        ctx.client.release_proportional(&7, &1_000);
        ctx.client.release_proportional(&7, &1);
    }
}
