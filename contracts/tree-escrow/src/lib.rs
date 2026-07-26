#![no_std]
#![allow(dead_code)]

//!
//! Holds donor funds and releases them in two tranches:
//!   • Tranche 1 (75%) — released on verified planting (GPS + photo proof)
//!   • TREE reward — 1 TREE token minted to donor per verified tree
//!   • Tranche 2 (25%) — released after 6-month survival verification
//!                        ONLY when oracle-confirmed survival rate >= 70%
//!
//! State machine:
//!   Funded → Planted (75% out) → Survived (25% out, Completed)
//!                              ↘ Disputed (survival rate < 70%, 25% held)

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, BytesN,
    Env, Vec,
};
use harvesta_errors::HarvestaError;

// ── Constants ─────────────────────────────────────────────────────────────────

/// 75% in basis points
const TRANCHE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE_PERCENT: u32 = 70;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Window in which a sponsor may challenge a verification outcome (#469)
const DISPUTE_WINDOW_SECS: u64 = 60 * 60 * 24 * 7;

/// 14 days in seconds — unaccepted jobs expire after this window (Closes #517)
const JOB_EXPIRY_SECS: u64 = 60 * 60 * 24 * 14;

/// 1 year in seconds (second / correct version: 365 days)
const ONE_YEAR_SECS: u64 = 60 * 60 * 24 * 365;

/// 90 days: planting must be confirmed before admin may transition Pending → Failed.
const PLANTING_TIMEOUT_SECS: u64 = 60 * 60 * 24 * 90;

/// Maximum slots per batch deposit (Stellar operation limit safety margin) — second version
const MAX_BATCH_SIZE: u32 = 50;

/// Corporate batch size limit
const CORP_BATCH_SIZE: u32 = 500;

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
    pub fn is_some(&self) -> bool {
        matches!(self, OptProof::Some(_))
    }
    pub fn unwrap(self) -> BytesN<32> {
        match self {
            OptProof::Some(v) => v,
            OptProof::None => panic!("unwrap on None"),
        }
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
    pub fn is_some(&self) -> bool {
        matches!(self, OptU64::Some(_))
    }
    pub fn unwrap(self) -> u64 {
        match self {
            OptU64::Some(v) => v,
            OptU64::None => panic!("unwrap on None"),
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Planted,
    Completed,
    Refunded,
    Survived,
    Dead,
    JobExpired,
}

#[soroban_sdk::contractclient(name = "AmmClient")]
pub trait AmmInterface {
    fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128;
    fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;
    fn swap(env: Env, from: Address, token_in: Address, token_out: Address, amount_in: i128) -> i128;
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
    pub planted_at: OptU64,
    pub planting_proof: OptProof,
    pub survival_proof: OptProof,
    pub survival_rate_percent: u32,
    pub lp_shares: i128,
}

/// A single slot in a batch deposit: one farmer address and the amount for that tree.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchSlot {
    pub farmer: Address,
    pub amount: i128,
    pub gift_recipient: Option<Address>,
    pub referrer: Option<Address>,
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

/// Physical lifecycle state of a co-funded tree.
/// Distinct from `TreeFundingStatus` which tracks payment state.
///
/// Valid transitions:
///   Pending  → Planted   admin confirms physical planting
///   Pending  → Failed    admin marks timeout; only after PLANTING_TIMEOUT_SECS
///   Planted  → Verified  admin confirms survival milestone
///
/// Verified and Failed are terminal — no further transitions allowed.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TreeStatus {
    Pending,
    Planted,
    Verified,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Contribution {
    pub funder: Address,
    pub amount: i128,
}

/// Outcome of a sponsor-initiated verification dispute (#469).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DisputeOutcome {
    VerificationUpheld,
    VerificationOverturned,
}

/// Sponsor dispute record keyed by tree_id.
#[contracttype]
#[derive(Clone, Debug)]
pub struct DisputeRecord {
    pub tree_id: u64,
    pub sponsor: Address,
    pub evidence_cid: BytesN<32>,
    pub opened_at: u64,
    pub resolved: bool,
    pub outcome: DisputeOutcome,
    pub votes_uphold: u32,
    pub votes_overturn: u32,
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
    pub tree_status: TreeStatus,
    pub registered_at: u64,
    pub planted_at: u64,
    pub verified_at: u64,
}

/// Sponsor rating for a planter (1-5 stars)
#[contracttype]
#[derive(Clone, Debug)]
pub struct PlanterRating {
    pub sponsor: Address,
    pub farmer: Address,
    pub rating: u32,
    pub rated_at: u64,
}

/// Aggregated reputation score for a planter
#[contracttype]
#[derive(Clone, Debug)]
pub struct PlanterReputation {
    pub farmer: Address,
    pub total_ratings: u32,
    pub sum_ratings: u128,
    pub average_rating: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PayoutType {
    Tranche2,
    Tranche3,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Payout {
    pub planter: Address,
    pub amount: i128,
    pub payout_type: PayoutType,
    pub timestamp: u64,
}

/// Aggregated on-chain receipt for a corporate bulk sponsorship — closes #487.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CorpBatchRecord {
    pub batch_id: u64,
    pub sponsor: Address,
    pub token: Address,
    pub total_trees: i128,
    pub total_amount: i128,
    pub farmer_count: u32,
    pub created_at: u64,
}

/// Registered arbiter record — a trusted third party that can override
/// verification results and resolve locked disputes (#649).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ArbiterRecord {
    pub arbiter: Address,
    pub registered_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    AdminTree,
    Oracle,
    SurvivalThreshold,
    MinDensity,
    JobSizeThreshold,
    Paused,
    Escrow(Address),
    OracleReport(u64),
    TreeFunding(u64),
    UsedProof(BytesN<32>),
    Dispute(u64),
    DaoMembers,
    Arbiter,
    SponsorRating(Address, Address),
    PlanterReputation(Address),
    PayoutHistory(Address),
    CorpBatchSeq,
    CorpBatch(u64),
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
    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        amm: Address,
        xlm: Address,
        usdc: Address,
        survival_threshold: u32,
        min_density: i128,
        job_size_threshold: i128,
    ) {
        if env.storage().instance().has(&DataKey::AdminTree) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if survival_threshold > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalThresholdOutOfRange);
        }
        if min_density <= 0 {
            panic!("min density must be positive");
        }
        if job_size_threshold <= 0 {
            panic!("job size threshold must be positive");
        }
        if token::StellarAssetClient::new(&env, &tree_token).admin()
            != env.current_contract_address()
        {
            panic!("contract must be tree token admin");
        }

        let tree_decimals = token::Client::new(&env, &tree_token).decimals();

        env.storage().instance().set(
            &DataKey::AdminTree,
            &(
                admin.clone(),
                tree_token.clone(),
                tree_decimals,
                amm.clone(),
                xlm.clone(),
                usdc.clone(),
            ),
        );
        env.storage()
            .instance()
            .set(&DataKey::SurvivalThreshold, &survival_threshold);
        env.storage()
            .instance()
            .set(&DataKey::MinDensity, &min_density);
        env.storage()
            .instance()
            .set(&DataKey::JobSizeThreshold, &job_size_threshold);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Donor deposits `amount` of `token` into escrow for `farmer`.
    ///
    /// `tree_count` is the maximum number of trees covered by this donation.
    /// `area_hectares` is the job area in hectares for density enforcement.
    /// Once planting is verified, the contract mints one TREE token per
    /// verifier-confirmed tree to the donor address stored here.
    pub fn deposit(
        env: Env,
        donor: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
        area_hectares: i128,
    ) {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if tree_count <= 0 {
            panic!("tree count must be positive");
        }
        if area_hectares <= 0 {
            panic!("area hectares must be positive");
        }

        let job_size_threshold = Self::job_size_threshold(&env);
        if area_hectares >= job_size_threshold {
            let min_density = Self::min_density(&env);
            let actual_density = tree_count / area_hectares;
            if actual_density < min_density {
                panic!("planting density below minimum for job size");
            }
        }

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");

        let fee = (amount * 200) / 10_000;
        let net_amount = amount - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(
                &env.current_contract_address(),
                &xlm,
                &usdc,
                &swap_amount,
            );
        }

        let lp_shares =
            AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_amount);

        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                donor: donor.clone(),
                farmer: farmer.clone(),
                token,
                total_amount: net_amount,
                tree_count,
                verified_tree_count: 0,
                tree_tokens_minted: 0,
                released: 0,
                status: EscrowStatus::Funded,
                planted_at: OptU64::None,
                planting_proof: OptProof::None,
                survival_proof: OptProof::None,
                survival_rate_percent: 0,
                lp_shares,
            },
        );

        env.events()
            .publish((symbol_short!("deposit"), farmer), net_amount);
    }

    /// Batch deposit: donor funds N tree slots in a single contract invocation.
    ///
    /// Gas efficiency: one token transfer for the total, then N storage writes.
    /// Each slot maps to one farmer escrow record in the next planting cycle.
    ///
    /// Constraints:
    ///   - All slots must use the same token.
    ///   - No farmer in the batch may already have an active escrow.
    ///   - Batch size is capped at MAX_BATCH_SIZE (50) to stay within ledger limits.
    /// Each slot represents 1 tree on a small area (0.01 hectares for density calculation).
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

        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");

        let fee = (total * 200) / 10_000;
        let net_total = total - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(
                &env.current_contract_address(),
                &xlm,
                &usdc,
                &swap_amount,
            );
        }

        let total_lp_shares =
            AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_total);
        let mut allocated_shares = 0;

        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
            let slot_net = slot.amount - (slot.amount * 200) / 10_000;
            let mut slot_shares = if net_total > 0 {
                (slot_net * total_lp_shares) / net_total
            } else {
                0
            };
            if i == n - 1 {
                slot_shares = total_lp_shares - allocated_shares;
            } else {
                allocated_shares += slot_shares;
            }

            env.storage().persistent().set(
                &key,
                &EscrowRecord {
                    donor: donor.clone(),
                    farmer: slot.farmer.clone(),
                    token: token.clone(),
                    total_amount: slot_net,
                    tree_count: 1,
                    verified_tree_count: 0,
                    tree_tokens_minted: 0,
                    released: 0,
                    status: EscrowStatus::Funded,
                    planted_at: OptU64::None,
                    planting_proof: OptProof::None,
                    survival_proof: OptProof::None,
                    survival_rate_percent: 0,
                    lp_shares: slot_shares,
                },
            );
            env.events()
                .publish((symbol_short!("deposit"), slot.farmer), slot_net);
        }

        env.events()
            .publish((symbol_short!("batch"), donor), net_total);
    }

    /// Verifier calls this after GPS + photo proof of planting is validated.
    /// Releases 75% of escrowed funds instantly to the farmer.
    /// Mints one TREE token to the donor for each verified tree.
    ///
    /// OPTIMIZED: Reduced storage operations from 4 to 2 (1 read + 1 write)
    /// Admin-verified planting: releases Tranche 1 (75%) and mints TREE rewards.
    /// Admin-verified progress update: streams 10% of the escrow to the planter.
    ///
    /// OPTIMIZED: Reduced storage operations from 4 to 2 (1 read + 1 write)
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        verified_tree_count: i128,
    ) {
        let (admin, tree_token, tree_decimals, amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");

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
        let tranche1_shares = (rec.lp_shares * TRANCHE_1_BPS) / BPS_DENOM;
        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(
            &env.current_contract_address(),
            &rec.token,
            &tranche1_shares,
        );

        let tree_token_unit = Self::compute_token_unit(tree_decimals);
        let tree_tokens = verified_tree_count
            .checked_mul(tree_token_unit)
            .expect("tree token mint amount overflow");

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &withdrawn_amount,
        );
        token::StellarAssetClient::new(&env, &tree_token).mint(&rec.donor, &tree_tokens);

        rec.released += tranche1;
        rec.lp_shares -= tranche1_shares;
        rec.verified_tree_count = verified_tree_count;
        rec.tree_tokens_minted = tree_tokens;
        rec.status = EscrowStatus::Planted;
        rec.planted_at = OptU64::Some(env.ledger().timestamp());
        rec.planting_proof = OptProof::Some(proof_hash.clone());

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("planted"), farmer), tranche1);
        env.events()
            .publish((symbol_short!("treemint"), rec.donor.clone()), tree_tokens);
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
    ///
    /// OPTIMIZED: Reduced storage operations
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let (admin, _tree_token, _tree_decimals, amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");

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

        let planted_at = rec.planted_at.clone().unwrap();
        let now = env.ledger().timestamp();
        if now < planted_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        let threshold = Self::survival_threshold(&env);
        if survival_rate_percent < threshold {
            panic!("survival rate below minimum");
        }

        let tranche2 = rec.total_amount - rec.released;
        let remaining_shares = rec.lp_shares;
        if tranche2 <= 0 {
            panic!("nothing left to release");
        }

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(
            &env.current_contract_address(),
            &rec.token,
            &remaining_shares,
        );
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &withdrawn_amount,
        );

        rec.released += tranche2;
        rec.lp_shares = 0;
        rec.status = EscrowStatus::Survived;
        rec.survival_proof = OptProof::Some(proof_hash);
        rec.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);
    }

    /// Donor (via admin) can refund an escrow before planting is verified.
    /// Withdraws LP shares from AMM and returns remaining balance to the donor.
    pub fn refund(env: Env, farmer: Address) {
        let (admin, _tree_token, _tree_decimals, amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");

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

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(
            &env.current_contract_address(),
            &rec.token,
            &rec.lp_shares,
        );
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &withdrawn_amount,
        );

        rec.status = EscrowStatus::Refunded;
        rec.lp_shares = 0;
        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("refund"), farmer), rec.total_amount);
    }

    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(farmer))
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
        let (_admin, tree_token, _decimals, _amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("tree token not initialized");
        tree_token
    }

    fn require_admin(env: &Env) {
        let (admin, _tree_token, _decimals, _amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .expect("contract not initialized");
        admin.require_auth();
    }

    fn admin_tree(env: &Env) -> (Address, Address, u32) {
        let (admin, tree_token, decimals, _amm, _xlm, _usdc): (
            Address,
            Address,
            u32,
            Address,
            Address,
            Address,
        ) = env
            .storage()
            .instance()
            .get(&DataKey::AdminTree)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        (admin, tree_token, decimals)
    }

    fn survival_threshold(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SurvivalThreshold)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn dispute_is_open(env: &Env, tree_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, DisputeRecord>(&DataKey::Dispute(tree_id))
            .map(|d| !d.resolved)
            .unwrap_or(false)
    }

    fn is_dao_member(env: &Env, address: &Address) -> bool {
        let members: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::DaoMembers)
            .unwrap_or_else(|| soroban_sdk::Vec::new(env));

        for i in 0..members.len() {
            if members.get(i).unwrap() == *address {
                return true;
            }
        }
        false
    }

    fn is_tree_contributor(funding: &TreeFunding, address: &Address) -> bool {
        for i in 0..funding.contributions.len() {
            if funding.contributions.get(i).unwrap().funder == *address {
                return true;
            }
        }
        false
    }

    fn assert_is_arbiter(env: &Env, address: &Address) {
        let record: ArbiterRecord = env
            .storage()
            .instance()
            .get(&DataKey::Arbiter)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotArbiter));
        if record.arbiter != *address {
            panic_with_error!(env, HarvestaError::NotArbiter);
        }
    }

    fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    fn record_payout(env: &Env, planter: Address, amount: i128, payout_type: PayoutType) {
        let key = DataKey::PayoutHistory(planter.clone());
        let mut payouts: Vec<Payout> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));

        let payout = Payout {
            planter,
            amount,
            payout_type,
            timestamp: env.ledger().timestamp(),
        };

        payouts.push_back(payout);
        env.storage().persistent().set(&key, &payouts);
    }

    fn min_density(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinDensity)
            .expect("contract not initialized")
    }

    fn job_size_threshold(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::JobSizeThreshold)
            .expect("contract not initialized")
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
    const DEFAULT_MIN_DENSITY: i128 = 1_000;
    const DEFAULT_JOB_SIZE_THRESHOLD: i128 = 10;

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
        setup_with_density(threshold, DEFAULT_MIN_DENSITY, DEFAULT_JOB_SIZE_THRESHOLD)
    }

    fn setup_with_density(
        threshold: u32,
        min_density: i128,
        job_size_threshold: i128,
    ) -> Ctx {
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

        let amm_id = env.register_contract(None, MockAmm);
        let amm = amm_id.clone();
        let xlm = token_id.clone();
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        client.initialize(
            &admin,
            &tree_token_id,
            &amm,
            &xlm,
            &usdc,
            &threshold,
            &min_density,
            &job_size_threshold,
        );
        contract_utils::add_to_whitelist(&env, &tree_token_id);
        contract_utils::add_to_whitelist(&env, &token_id);

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

    #[contract]
    pub struct MockAmm;
    #[contractimpl]
    impl MockAmm {
        pub fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&from, &caller, &amount);
            amount
        }
        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }
        pub fn swap(
            env: Env,
            from: Address,
            token_in: Address,
            _token_out: Address,
            amount_in: i128,
        ) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token_in).transfer(&from, &caller, &amount_in);
            amount_in
        }
    }

    #[test]
    fn test_full_lifecycle() {
        let ctx = setup();

        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );

        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.tree_count, 42);
        assert_eq!(rec.verified_tree_count, 42);

        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Survived);
        assert_eq!(rec.survival_rate_percent, 70);
    }

    #[test]
    fn test_refund_before_planting() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client.refund(&ctx.farmer);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Refunded
        );
    }
}
