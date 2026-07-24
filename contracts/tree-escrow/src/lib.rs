#![no_std]

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
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal, Vec,
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
/// 1 year in seconds (approx 52 weeks)
const ONE_YEAR_SECS: u64 = 60 * 60 * 24 * 7 * 52;
/// Window in which a sponsor may challenge a verification outcome (#469)
const DISPUTE_WINDOW_SECS: u64 = 60 * 60 * 24 * 7;

/// 14 days in seconds — unaccepted jobs expire after this window (Closes #517)
const JOB_EXPIRY_SECS: u64 = 60 * 60 * 24 * 14;

/// 1 year in seconds
const ONE_YEAR_SECS: u64 = 60 * 60 * 24 * 365;

/// 90 days: planting must be confirmed before admin may transition Pending → Failed.
const PLANTING_TIMEOUT_SECS: u64 = 60 * 60 * 24 * 90;

/// Maximum slots per batch deposit (Stellar operation limit safety margin)
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
    /// Ledger timestamp when planting was verified
    pub planted_at: OptU64,
    /// SHA-256 of GPS + photo proof submitted at planting
    pub planting_proof: OptProof,
    /// SHA-256 of GPS + photo proof submitted at survival check
    pub survival_proof: OptProof,
    /// ZK/oracle-confirmed survival rate percentage
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
    /// DAO upheld the verification — pending fund release may proceed.
    VerificationUpheld,
    /// DAO overturned the verification — funds remain locked for refund.
    VerificationOverturned,
}

/// Sponsor dispute record keyed by tree_id.
#[contracttype]
#[derive(Clone, Debug)]
pub struct DisputeRecord {
    pub tree_id: u64,
    pub sponsor: Address,
    /// Content-address hash of off-chain evidence (IPFS CID digest).
    pub evidence_cid: BytesN<32>,
    pub opened_at: u64,
    pub resolved: bool,
    pub outcome: DisputeOutcome,
    /// DAO votes that the verification should stand.
    pub votes_uphold: u32,
    /// DAO votes that the verification should be overturned.
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
    pub rating: u32, // 1-5 stars
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
    /// Minimum planting density (trees per hectare) for large jobs
    MinDensity,
    /// Job size threshold (hectares) above which density rules apply
    JobSizeThreshold,
    /// Per-farmer single-donor escrow record
    MinDensity,
    JobSizeThreshold,
    Paused,
    Escrow(Address),
    OracleReport(u64),
    TreeFunding(u64),
    /// Track used proof hashes for replay attack prevention (#481)
    UsedProof(BytesN<32>),
    /// Sponsor dispute on a verification outcome (#469)
    Dispute(u64),
    DaoMembers,
    /// Registered arbiter address (#649)
    Arbiter,
    SponsorRating(Address, Address),
    PlanterReputation(Address),
    PayoutHistory(Address),
    CorpBatchSeq,
    CorpBatch(u64),
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
    pub fn initialize(env: Env, admin: Address, tree_token: Address, amm: Address, xlm: Address, usdc: Address) {
        if env.storage().instance().has(&symbol_short!("ADMINTREE")) {
            panic!("already initialized");
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

        // OPTIMIZATION: Cache tree token decimals to avoid repeated calculations
        let tree_decimals = token::Client::new(&env, &tree_token).decimals();

        // OPTIMIZATION: Store admin and tree token as tuple (reduces reads from 2 to 1)
        env.storage().instance().set(
            &symbol_short!("ADMINTREE"),
            &(admin, tree_token, tree_decimals, amm, xlm, usdc),
        );
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
        if area_hectares <= 0 {
            panic!("area hectares must be positive");
        }

        // Enforce minimum planting density for large jobs
        let job_size_threshold = Self::job_size_threshold(&env);
        if area_hectares >= job_size_threshold {
            let min_density = Self::min_density(&env);
            let actual_density = tree_count / area_hectares;
            if actual_density < min_density {
                panic!("planting density below minimum for job size");
            }
        }

        let key = Self::record_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        // Pull funds from donor into contract
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);

        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        
        let fee = (amount * 200) / 10_000;
        let net_amount = amount - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_amount);

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
                panic_with_error!(&env, HarvestaError::SlotAmountMustBePositive);
            }
            let key = Self::record_key(&env, &slot.farmer);
            if env.storage().persistent().has(&key) {
                panic!("active escrow already exists for a farmer in this batch");
            }
            total += slot.amount;
        }

        // Single token transfer for the entire batch — gas-efficient
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &total);

        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        
        let fee = (total * 200) / 10_000;
        let net_total = total - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_total);
        let mut allocated_shares = 0;

        // Write one escrow record per slot
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = Self::record_key(&env, &slot.farmer);
            let slot_net = slot.amount - (slot.amount * 200) / 10_000;
            let mut slot_shares = if net_total > 0 { (slot_net * total_lp_shares) / net_total } else { 0 };
            if i == n - 1 {
                slot_shares = total_lp_shares - allocated_shares;
            } else {
                allocated_shares += slot_shares;
            }
            let key = DataKey::Escrow(slot.farmer.clone());
            // Batch deposits use a fixed small area (0.01 hectares) per tree
            // This ensures batch deposits are exempt from density rules (below threshold)
            let batch_area_hectares = 1_i128 / 100; // 0.01 hectares per tree
            
            env.storage().persistent().set(
                &key,
                &EscrowRecord {
                    donor: donor.clone(),
                    farmer: slot.farmer.clone(),
                    token: token.clone(),
                    total_amount: slot_net,
                    tree_count: 1,
                    area_hectares: batch_area_hectares,
                    area_hectares: 1_i128 / 100,
                    verified_tree_count: 0,
                    tree_tokens_minted: 0,
                    released: 0,
                    status: EscrowStatus::Funded,
                    planted_at: OptU64::None,
                    planting_proof: OptProof::None,
                    survival_proof: OptProof::None,
                    survival_rate_percent: 0,
                    lp_shares: slot_shares,
                    year_proof: empty_hash,
                    year_proof: zero_hash.clone(),
                    expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,
                },
            );
            env.events()
                .publish((symbol_short!("deposit"), slot.farmer), slot_net);
        }

        env.events().publish((symbol_short!("batch"), donor), net_total);
    }

    /// Verifier calls this after GPS + photo proof of planting is validated.
    /// Releases 75% of escrowed funds instantly to the farmer.
    /// Mints one TREE token to the donor for each verified tree.
    /// 
    /// OPTIMIZED: Reduced storage operations from 4 to 2 (1 read + 1 write)
    /// Admin-verified planting: releases Tranche 1 (30%) and mints TREE rewards.
    pub fn verify_planting(
    /// Admin-verified progress update: streams 10% of the escrow to the planter.
    ///
    /// OPTIMIZED: Reduced storage operations from 4 to 2 (1 read + 1 write)
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        verified_tree_count: i128,
    ) {
        // OPTIMIZATION: Single read for admin, tree token, and decimals (was 2 reads)
        let (admin, tree_token, tree_decimals, amm, _xlm, _usdc): (Address, Address, u32, Address, Address, Address) = env
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
        let tranche1_shares = (rec.lp_shares * TRANCHE_1_BPS) / BPS_DENOM;
        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &tranche1_shares);

        // OPTIMIZATION: Use cached decimals instead of calling token_unit() (saves computation)
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
        // OPTIMIZATION: Single read for admin (tree token not needed here)
        let (admin, _tree_token, _tree_decimals, amm, _xlm, _usdc): (Address, Address, u32, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");

        admin.require_auth();

        if survival_rate_percent > 100 {
            panic!("survival_rate must be between 0 and 100");
        }

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
        let remaining_shares = rec.lp_shares;
        if tranche2 <= 0 {
            panic!("nothing left to release");
        }

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &remaining_shares);
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &withdrawn_amount,
        );

        rec.released += tranche2;
        rec.lp_shares = 0;
        rec.status = EscrowStatus::Completed;
        rec.survival_proof = OptProof::Some(proof_hash);
        rec.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);
    }

    pub fn refund(env: Env, farmer: Address) {
        // OPTIMIZATION: Single read for admin
        let (admin, _tree_token, _tree_decimals, amm, _xlm, _usdc): (Address, Address, u32, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");
            .persistent()
            .get(&key)
            .expect("no escrow for farmer");

        if rec.status != EscrowStatus::Survived {
            panic!("survival not yet verified");
        }

        let now = env.ledger().timestamp();
        if now < rec.planted_at + ONE_YEAR_SECS {
            panic!("1-year milestone period not yet elapsed");
        }

        let tranche3 = rec.total_amount - rec.released;
        if tranche3 <= 0 {
            panic!("nothing left to release");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche3,
        );

        rec.released += tranche3;
        rec.status = EscrowStatus::Completed;
        rec.year_proof = proof_hash;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("year_milestone"), farmer), tranche3);
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

        if rec.status != EscrowStatus::Survived {
            panic!("survival not yet verified");
        }

        let now = env.ledger().timestamp();
        if now < rec.planted_at + ONE_YEAR_SECS {
            panic!("1-year milestone period not yet elapsed");
        }

        let tranche3 = rec.total_amount - rec.released;
        if tranche3 <= 0 {
            panic!("nothing left to release");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche3,
        );

        rec.released += tranche3;
        rec.status = EscrowStatus::Completed;
        rec.year_proof = proof_hash;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("yearmile"), farmer), tranche3);
    }

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

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &rec.lp_shares);
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
        let (_admin, tree_token, _decimals, _amm, _xlm, _usdc): (Address, Address, u32, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("tree token not initialized");
        tree_token
    }

    fn require_admin(env: &Env) {
        let (admin, _tree_token, _decimals, _amm, _xlm, _usdc): (Address, Address, u32, Address, Address, Address) = env
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
    /// Sponsor rates a planter after job completion. Rating must be 1-5 stars.
    /// Only callable by the original donor after escrow is completed.
    pub fn rate_planter(
        env: Env,
        sponsor: Address,
        farmer: Address,
        rating: u32,
    ) {
        sponsor.require_auth();

        if rating < 1 || rating > 5 {
            panic!("rating must be between 1 and 5");
        }

        // Check if escrow exists and is completed
        let escrow_key = DataKey::Escrow(farmer.clone());
        let rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&escrow_key)
            .expect("no escrow for farmer");

        if rec.donor != sponsor {
            panic!("only the original donor can rate the planter");
        }

        if rec.status != EscrowStatus::Completed {
            panic!("can only rate after escrow is completed");
        }

        // Prevent duplicate ratings from same sponsor
        let rating_key = DataKey::SponsorRating(sponsor.clone(), farmer.clone());
        if env.storage().persistent().has(&rating_key) {
            panic!("sponsor has already rated this planter");
        }

        // Store the individual rating
        let rating_record = PlanterRating {
            sponsor: sponsor.clone(),
            farmer: farmer.clone(),
            rating,
            rated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&rating_key, &rating_record);

        // Update aggregated reputation
        let rep_key = DataKey::PlanterReputation(farmer.clone());
        let mut rep: PlanterReputation = env
            .storage()
            .persistent()
            .get(&rep_key)
            .unwrap_or(PlanterReputation {
                farmer: farmer.clone(),
                total_ratings: 0,
                sum_ratings: 0,
                average_rating: 0,
            });

        rep.total_ratings += 1;
        rep.sum_ratings += rating as u128;
        rep.average_rating = ((rep.sum_ratings * 20) / rep.total_ratings as u128) as u32; // Scale to 0-100 (5 stars * 20 = 100)

        env.storage().persistent().set(&rep_key, &rep);

        env.events()
            .publish((symbol_short!("rated"), farmer), (sponsor, rating));
    }

    pub fn get_planter_reputation(env: Env, farmer: Address) -> Option<PlanterReputation> {
        env.storage().persistent().get(&DataKey::PlanterReputation(farmer))
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
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        if oracle != registered_oracle {
            panic_with_error!(&env, HarvestaError::UnauthorizedOracle);
        }
        oracle.require_auth();

        if survival_rate_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalRateOutOfRange);
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
        contract_utils::assert_whitelisted(&env, &token);

        let key = DataKey::TreeFunding(tree_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::TreeAlreadyRegistered);
        }

        let funding = TreeFunding {
            tree_id,
            farmer,
            token,
            contributions: Vec::new(&env),
            total_funded: 0,
            released: 0,
            status: TreeFundingStatus::Open,
            tree_status: TreeStatus::Pending,
            registered_at: env.ledger().timestamp(),
            planted_at: 0,
            verified_at: 0,
        };
        env.storage().persistent().set(&key, &funding);

        env.events()
            .publish((symbol_short!("treereg"), tree_id), funding.farmer);
    }

    /// A funder contributes `amount` to the pool for `tree_id`. If the funder
    /// already has a contribution, their share is added to (not overwritten).
    pub fn contribute(env: Env, funder: Address, tree_id: u64, amount: i128) {
        funder.require_auth();

        if Self::is_paused(&env) {
            panic!("contract is paused - contributions are not allowed");
        }

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let key = DataKey::TreeFunding(tree_id);
        let mut funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::TreeNotRegistered));

        if funding.status != TreeFundingStatus::Open {
            panic_with_error!(&env, HarvestaError::TreeNotOpenForContributions);
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
                c.amount = c.amount.checked_add(amount).expect("contribution amount overflow");
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

        funding.total_funded = funding.total_funded.checked_add(amount).expect("total funded overflow");
        env.storage().persistent().set(&key, &funding);

        env.events()
            .publish((symbol_short!("cofunded"), tree_id), (funder, amount));
    }

    /// Pays out `payout_amount` from the pool, splitting it proportionally
    /// across each contributor by their share of `total_funded`.
    pub fn release_proportional(env: Env, tree_id: u64, payout_amount: i128) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let report: OracleReport = env
            .storage()
            .persistent()
            .get(&DataKey::OracleReport(tree_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NoOracleReport));

        let threshold = Self::survival_threshold(&env);
        if report.survival_rate_percent < threshold {
            panic_with_error!(&env, HarvestaError::SurvivalRateBelowMinimum);
        }

        let key = DataKey::TreeFunding(tree_id);
        let mut funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::TreeNotRegistered));

        if funding.status != TreeFundingStatus::Open {
            panic_with_error!(&env, HarvestaError::TreeNotOpenForRelease);
        }
        if Self::dispute_is_open(&env, tree_id) {
            panic!("fund release paused: dispute is open");
        }
        if funding.total_funded <= 0 {
            panic_with_error!(&env, HarvestaError::NoFundsToRelease);
        }
        let remaining = funding.total_funded.checked_sub(funding.released).expect("remaining calculation underflow");
        if payout_amount <= 0 || payout_amount > remaining {
            panic_with_error!(&env, HarvestaError::InvalidPayoutAmount);
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

        let mut paid_so_far: i128 = 0;
        for i in 0..n {
            if i == largest_idx {
                continue;
            }
            let c = funding.contributions.get(i).unwrap();
            let payout = (c.amount.checked_mul(payout_amount).expect("payout calculation overflow")).checked_div(funding.total_funded).expect("payout division error");
            if payout > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &c.funder,
                    &payout,
                );
            }
            paid_so_far = paid_so_far.checked_add(payout).expect("paid_so_far overflow");
            env.events()
                .publish((symbol_short!("propayout"), tree_id), (c.funder, payout));
        }

        let largest = funding.contributions.get(largest_idx).unwrap();
        let largest_payout = payout_amount.checked_sub(paid_so_far).expect("largest payout calculation underflow");
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

        funding.released = funding.released.checked_add(payout_amount).expect("released amount overflow");
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

    // ── Tree lifecycle state machine (#462) ───────────────────────────────────

    /// Admin transitions a co-funded tree through its physical lifecycle states.
    ///
    ///   Pending  → Planted   admin confirms physical planting
    ///   Pending  → Failed    only after PLANTING_TIMEOUT_SECS (90 days)
    ///   Planted  → Verified  admin confirms survival milestone
    ///
    /// Verified and Failed are terminal.
    pub fn update_status(env: Env, tree_id: u64, new_status: TreeStatus) {
        let (admin, _, _) = Self::admin_tree(&env);
        admin.require_auth();

        let key = DataKey::TreeFunding(tree_id);
        let mut funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::TreeNotRegistered));

        let now = env.ledger().timestamp();

        match (&funding.tree_status, &new_status) {
            (TreeStatus::Pending, TreeStatus::Planted) => {
                funding.planted_at = now;
            }
            (TreeStatus::Pending, TreeStatus::Failed) => {
                if now < funding.registered_at + PLANTING_TIMEOUT_SECS {
                    panic_with_error!(&env, HarvestaError::PlantingTimeoutNotReached);
                }
            }
            (TreeStatus::Planted, TreeStatus::Verified) => {
                funding.verified_at = now;
            }
            _ => {
                panic_with_error!(&env, HarvestaError::InvalidTreeStatusTransition);
            }
        }

        funding.tree_status = new_status.clone();
        env.storage().persistent().set(&key, &funding);

        env.events().publish(
            (symbol_short!("statchg"), tree_id),
            (new_status, now),
        );
    }

    /// Returns the current physical lifecycle status of a co-funded tree.
    pub fn get_tree_status(env: Env, tree_id: u64) -> TreeStatus {
        let key = DataKey::TreeFunding(tree_id);
        let funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::TreeNotRegistered));
        funding.tree_status
    }

    // ── Dispute resolution (#469) ─────────────────────────────────────────────

    /// Admin configures the DAO member set that may vote on verification disputes.
    pub fn set_dao_members(env: Env, members: soroban_sdk::Vec<Address>) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::DaoMembers, &members);
    }

    pub fn get_dao_members(env: Env) -> soroban_sdk::Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::SurvivalThreshold)
            .expect("contract not initialized")
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

    fn compute_token_unit(decimals: u32) -> i128 {
        let mut unit = 1i128;
        let mut i = 0u32;
        while i < decimals {
            unit = unit.checked_mul(10).expect("token unit overflow");
            i += 1;
        }
        unit
            .get(&DataKey::DaoMembers)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Sponsor opens a dispute within 7 days of an oracle verification report.
    /// Pauses any pending proportional fund release for the tree.
    pub fn open_dispute(
        env: Env,
        sponsor: Address,
        tree_id: u64,
        evidence_cid: BytesN<32>,
    ) {
        sponsor.require_auth();

        let report: OracleReport = env
            .storage()
            .persistent()
            .get(&DataKey::OracleReport(tree_id))
            .expect("no verification report for tree");

        let now = env.ledger().timestamp();
        if now > report.reported_at + DISPUTE_WINDOW_SECS {
            panic!("dispute window expired");
        }

        let dispute_key = DataKey::Dispute(tree_id);
        if let Some(existing) = env.storage().persistent().get::<_, DisputeRecord>(&dispute_key) {
            if !existing.resolved {
                panic!("dispute already open for tree");
            }
        }

        let funding: TreeFunding = env
            .storage()
            .persistent()
            .get(&DataKey::TreeFunding(tree_id))
            .expect("tree not registered");

        if !Self::is_tree_contributor(&funding, &sponsor) {
            panic!("only a tree contributor may open a dispute");
        }

        let dispute = DisputeRecord {
            tree_id,
            sponsor: sponsor.clone(),
            evidence_cid,
            opened_at: now,
            resolved: false,
            outcome: DisputeOutcome::VerificationUpheld,
            votes_uphold: 0,
            votes_overturn: 0,
        };

        env.storage().persistent().set(&dispute_key, &dispute);

        env.events().publish(
            (symbol_short!("DispOpen"), tree_id),
            sponsor,
        );
    }

    /// DAO member casts an arbitration vote on an open dispute.
    pub fn cast_dao_vote(env: Env, voter: Address, tree_id: u64, uphold_verification: bool) {
        voter.require_auth();

        if !Self::is_dao_member(&env, &voter) {
            panic!("caller is not a DAO member");
        }

        let dispute_key = DataKey::Dispute(tree_id);
        let mut dispute: DisputeRecord = env
            .storage()
            .persistent()
            .get(&dispute_key)
            .expect("no dispute for tree");

        if dispute.resolved {
            panic!("dispute already resolved");
        }

        if uphold_verification {
            dispute.votes_uphold += 1;
        } else {
            dispute.votes_overturn += 1;
        }

        env.storage().persistent().set(&dispute_key, &dispute);

        env.events().publish(
            (symbol_short!("DaoVote"), tree_id),
            (voter, uphold_verification),
        );
    }

    /// Tally DAO votes and resolve the dispute. Emits `DisputeResolved`.
    pub fn resolve_dispute(env: Env, resolver: Address, tree_id: u64) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        if resolver != admin && !Self::is_dao_member(&env, &resolver) {
            panic!("unauthorized resolver");
        }
        resolver.require_auth();

        let dispute_key = DataKey::Dispute(tree_id);
        let mut dispute: DisputeRecord = env
            .storage()
            .persistent()
            .get(&dispute_key)
            .expect("no dispute for tree");

        if dispute.resolved {
            panic!("dispute already resolved");
        }

        let total_votes = dispute.votes_uphold + dispute.votes_overturn;
        if total_votes == 0 {
            panic!("no DAO votes cast");
        }

        let outcome = if dispute.votes_overturn > dispute.votes_uphold {
            DisputeOutcome::VerificationOverturned
        } else {
            DisputeOutcome::VerificationUpheld
        };

        dispute.resolved = true;
        dispute.outcome = outcome.clone();
        env.storage().persistent().set(&dispute_key, &dispute);

        env.events().publish(
            (symbol_short!("DispResol"), tree_id),
            outcome,
        );
    }

    pub fn get_dispute(env: Env, tree_id: u64) -> Option<DisputeRecord> {
        env.storage().persistent().get(&DataKey::Dispute(tree_id))
    }

    pub fn has_open_dispute(env: Env, tree_id: u64) -> bool {
        Self::dispute_is_open(&env, tree_id)
    }

    // ── Arbiter dispute resolution (#649) ─────────────────────────────────────

    /// Admin registers a trusted third-party arbiter.
    /// Only one arbiter is active at a time; calling again replaces the previous one.
    pub fn register_arbiter(env: Env, arbiter: Address) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        let record = ArbiterRecord {
            arbiter: arbiter.clone(),
            registered_at: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Arbiter, &record);

        env.events()
            .publish((symbol_short!("arbReg"), arbiter), ());
    }

    /// Returns the currently registered arbiter record, if any.
    pub fn get_arbiter(env: Env) -> Option<ArbiterRecord> {
        env.storage().instance().get(&DataKey::Arbiter)
    }

    /// Arbiter overrides the verification result for a single-donor escrow,
    /// moving a locked/Planted escrow back to Funded so a refund can proceed,
    /// or forcing it to Completed so the remaining balance is released.
    ///
    /// * `tree_released` — `true` to release remaining funds to the farmer
    ///   (treats as completed); `false` to revert to Funded so the donor can
    ///   reclaim via `refund`.
    pub fn arbiter_override(env: Env, arbiter: Address, farmer: Address, tree_released: bool) {
        arbiter.require_auth();
        Self::assert_is_arbiter(&env, &arbiter);

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status == EscrowStatus::Completed || rec.status == EscrowStatus::Refunded {
            panic!("escrow already finalised");
        }

        if tree_released {
            // Release remaining balance to farmer
            let remaining = rec.total_amount.checked_sub(rec.released).expect("underflow");
            if remaining > 0 {
                token::Client::new(&env, &rec.token).transfer(
                    &env.current_contract_address(),
                    &rec.farmer,
                    &remaining,
                );
                rec.released = rec.total_amount;
            }
            rec.status = EscrowStatus::Completed;
        } else {
            // Revert to Funded so donor may call refund
            rec.status = EscrowStatus::Funded;
        }

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("arbOvrd"), farmer), tree_released);
    }

    /// Arbiter resolves a co-funded tree dispute, bypassing the DAO vote
    /// requirement. Sets the dispute outcome directly and unblocks or
    /// permanently locks fund release for `tree_id`.
    ///
    /// * `uphold` — `true` to uphold the verification (release can proceed);
    ///   `false` to overturn it (funds remain locked for contributor refund).
    pub fn arbiter_resolve(env: Env, arbiter: Address, tree_id: u64, uphold: bool) {
        arbiter.require_auth();
        Self::assert_is_arbiter(&env, &arbiter);

        let dispute_key = DataKey::Dispute(tree_id);
        let mut dispute: DisputeRecord = env
            .storage()
            .persistent()
            .get(&dispute_key)
            .expect("no dispute for tree");

        if dispute.resolved {
            panic!("dispute already resolved");
        }

        let outcome = if uphold {
            DisputeOutcome::VerificationUpheld
        } else {
            DisputeOutcome::VerificationOverturned
        };

        dispute.resolved = true;
        dispute.outcome = outcome.clone();
        env.storage().persistent().set(&dispute_key, &dispute);

        env.events()
            .publish((symbol_short!("arbRes"), tree_id), outcome);
    }

    // ── Whitelist management ──────────────────────────────────────────────────

    /// Add `addr` to the contract whitelist. Restricted to admin.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();
        contract_utils::add_to_whitelist(&env, &addr);
    }

    /// Remove `addr` from the contract whitelist. Restricted to admin.
    pub fn remove_from_whitelist(env: Env, addr: Address) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();
        contract_utils::remove_from_whitelist(&env, &addr);
    }

    /// Returns `true` if `addr` is whitelisted.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        contract_utils::is_whitelisted(&env, &addr)
    }

    /// Panics if `addr` is not whitelisted.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        contract_utils::assert_whitelisted(&env, &addr);
    }

    // ── internal helpers ──────────────────────────────────────────────────────

    fn admin_tree(env: &Env) -> (Address, Address, u32) {
        env.storage()
            .instance()
            .get(&DataKey::AdminTree)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
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

    fn compute_token_unit(decimals: u32) -> i128 {
        let mut unit = 1i128;
        let mut i = 0u32;
        while i < decimals {
            unit = unit.checked_mul(10).expect("token unit overflow");
            i += 1;
        }
        unit
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
            .expect("not initialized")
    }

    fn job_size_threshold(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::JobSizeThreshold)
            .expect("not initialized")
    }

    // ── Sponsor cancellation — closes #482 ───────────────────────────────────

    /// Sponsor cancels their tree order before any planter has accepted.
    /// Returns the full escrowed amount to the sponsor.
    /// Only valid while the escrow is in `Funded` status.
    pub fn sponsor_cancel(env: Env, sponsor: Address, farmer: Address) {
        sponsor.require_auth();

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.donor != sponsor {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }
        if rec.status != EscrowStatus::Funded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
        }

        let refund_amount = rec.total_amount;
        let token = rec.token.clone();

        // CEI: mark as refunded and persist before external transfer.
        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &refund_amount,
        );

        env.events()
            .publish((symbol_short!("spcncl"), farmer), refund_amount);
    }

    // ── Corporate bulk sponsorship — closes #487 ─────────────────────────────

    /// Org wallet batch-sponsors up to 500 trees.
    ///
    /// Creates individual per-farmer escrow records (the normal payout flow)
    /// and a single `CorpBatchRecord` that acts as an aggregated on-chain
    /// receipt / carbon certificate for the sponsoring organisation.
    ///
    /// Returns the corporate batch ID.
    pub fn corporate_batch_deposit(
        env: Env,
        sponsor: Address,
        token: Address,
        slots: Vec<BatchSlot>,
    ) -> u64 {
        sponsor.require_auth();

        if Self::is_paused(&env) {
            panic!("contract is paused - deposits are not allowed");
        }

        let n = slots.len();
        if n == 0 {
            panic_with_error!(&env, HarvestaError::BatchEmpty);
        }
        if n > CORP_BATCH_SIZE {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        let mut total_amount: i128 = 0;
        let mut total_trees: i128 = 0;
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            if slot.amount <= 0 {
                panic_with_error!(&env, HarvestaError::SlotAmountMustBePositive);
            }
            let key = DataKey::Escrow(slot.farmer.clone());
            if env.storage().persistent().has(&key) {
                panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
            }
            total_amount = total_amount.checked_add(slot.amount).expect("batch total overflow");
            total_trees = total_trees.checked_add(1).expect("tree count overflow");
        }

        contract_utils::assert_whitelisted(&env, &token);
        token::Client::new(&env, &token)
            .transfer(&sponsor, &env.current_contract_address(), &total_amount);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
            env.storage().persistent().set(
                &key,
                &EscrowRecord {
                    donor: sponsor.clone(),
                    gift_recipient: slot.gift_recipient.clone(),
                    farmer: slot.farmer.clone(),
                    token: token.clone(),
                    total_amount: slot.amount,
                    tree_count: 1,
                    area_hectares: 1_i128 / 100,
                    verified_tree_count: 0,
                    tree_tokens_minted: 0,
                    released: 0,
                    progress_updates: 0,
                    status: EscrowStatus::Funded,
                    planted_at: 0,
                    planting_proof: empty_hash.clone(),
                    survival_proof: empty_hash.clone(),
                    survival_rate_percent: 0,
                    year_proof: empty_hash.clone(),
                    expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,
                },
            );
            env.events()
                .publish((symbol_short!("corpslot"), slot.farmer), slot.amount);
        }

        // Assign batch ID and persist the aggregated receipt.
        let batch_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CorpBatchSeq)
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("corp batch seq overflow");
        env.storage().instance().set(&DataKey::CorpBatchSeq, &batch_id);

        let receipt = CorpBatchRecord {
            batch_id,
            sponsor: sponsor.clone(),
            token,
            total_trees,
            total_amount,
            farmer_count: n,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::CorpBatch(batch_id), &receipt);

        env.events()
            .publish((symbol_short!("corpbatch"), sponsor), (batch_id, total_trees, total_amount));

        batch_id
    }

    /// Retrieve the corporate batch receipt by ID.
    pub fn get_corp_batch(env: Env, batch_id: u64) -> Option<CorpBatchRecord> {
        env.storage().persistent().get(&DataKey::CorpBatch(batch_id))
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

    fn setup_with_density(threshold: u32, min_density: i128, job_size_threshold: i128) -> Ctx {
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

        client.initialize(&admin, &tree_token_id, &oracle, &threshold, &min_density, &job_size_threshold);
        client.add_to_whitelist(&tree_token_id);
        client.add_to_whitelist(&token_id);
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

    fn setup_with_threshold(threshold: u32) -> Ctx {
        setup_with_density(threshold, DEFAULT_MIN_DENSITY, DEFAULT_JOB_SIZE_THRESHOLD)
    }

    fn setup_with_density(threshold: u32, min_density: i128, job_size_threshold: i128) -> Ctx {
    /// Complete all 5 progress updates for a farmer's escrow.
    fn complete_progress(ctx: &Ctx, farmer: &Address, verified_count: i128, seed_offset: u8) {
        for i in 0..5u8 {
            ctx.client.verify_progress(farmer, &proof(&ctx.env, seed_offset + i), &verified_count);
        }
    }

    // ── initialise ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
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

        client.initialize(&admin, &tree_token_id, &oracle, &70, &DEFAULT_MIN_DENSITY, &DEFAULT_JOB_SIZE_THRESHOLD);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #21)")]
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
        client.initialize(&admin, &tree_token_id, &oracle, &101, &DEFAULT_MIN_DENSITY, &DEFAULT_JOB_SIZE_THRESHOLD);
    }

        client.initialize(&admin, &tree_token_id, &oracle, &threshold, &min_density, &job_size_threshold);
        client.initialize(&admin, &tree_token_id, &oracle, &threshold);
        client.add_to_whitelist(&tree_token_id);
        client.add_to_whitelist(&token_id);
        Ctx {
            env,
            admin,
            oracle,
            donor,
            farmer,
            token: token_id,
            tree_token: tree_token_id,
            client,
    // ── Single-donor lifecycle ────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle() {
        let ctx = setup();
        let stream_10pct = 1_000; // 10% of 10_000

        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );

        // 5 progress updates, each streaming 10%
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
            let rec = ctx.client.get_record(&ctx.farmer).unwrap();
            assert_eq!(rec.progress_updates, i + 1);
            assert_eq!(rec.released, stream_10pct * (i as i128 + 1));
        }

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.released, 5_000); // 50% (5 × 10%)
        assert_eq!(rec.progress_updates, 5);
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
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Survived);
        assert_eq!(rec.released, 9_000); // 50% + 40% = 90%
        assert_eq!(rec.survival_rate_percent, 70);

        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);

        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000); // 100%
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_survival_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_survival_below_threshold_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &69);
    }

    #[test]
    fn test_threshold_is_configurable_at_init() {
        let ctx = setup_with_threshold(50);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &55);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Survived);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Completed
        );
    }

    #[test]
    #[should_panic(expected = "all progress updates completed")]
    fn test_extra_progress_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        // 6th call should be rejected
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 6), &42);
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

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn test_refund_after_progress_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.client.refund(&ctx.farmer);
    }

    // ── expire_job (#517) ─────────────────────────────────────────────────────

    #[test]
    fn test_expire_job_happy_path() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &1);

        // Advance time past the 14-day deadline.
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += JOB_EXPIRY_SECS + 1);

        let pre_balance = balance(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client.expire_job(&ctx.farmer);

        // Sponsor refunded in full.
        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.donor) - pre_balance,
            10_000
        );
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::JobExpired
        );
    }

    #[test]
    #[should_panic(expected = "expiry deadline has not yet passed")]
    fn test_expire_job_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &1);

        // Only 1 day has passed — well before the 14-day deadline.
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client.expire_job(&ctx.farmer);
    }

    #[test]
    #[should_panic(expected = "job cannot be expired: planting already started or job already closed")]
    fn test_expire_job_after_planting_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &1);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &5);

        // Even if time has elapsed, a planted job cannot be expired.
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += JOB_EXPIRY_SECS + 1);
        ctx.client.expire_job(&ctx.farmer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_deposit_rejects_zero_tree_count() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &0, &5);
    }

    // ── 1-year milestone tests (#494) ───────────────────────────────────────────

    #[test]
    #[should_panic(expected = "survival not yet verified")]
    fn test_year_milestone_before_survival_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 6));
    }

    #[test]
    #[should_panic(expected = "1-year milestone period not yet elapsed")]
    fn test_year_milestone_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));
    }

    #[test]
    fn test_year_milestone_at_one_year_accepted() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Completed
        );
    }

    #[test]
    #[should_panic(expected = "survival not yet verified")]
    fn test_year_milestone_double_call_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 8));
    }

    // ── Planter rating tests (#483) ───────────────────────────────────────────

    struct Ctx {
        env: Env,
        client: TreeEscrowClient<'static>,
        token: Address,
        tree_token: Address,
        donor: Address,
        farmer: Address,
        contract: Address,
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
        pub fn swap(env: Env, from: Address, token_in: Address, _token_out: Address, amount_in: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token_in).transfer(&from, &caller, &amount_in);
            amount_in
        }
    }

fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let contract = env.register_contract(None, TreeEscrow);
        let client   = TreeEscrowClient::new(&env, &contract);
    #[test]
    #[should_panic(expected = "only the original donor can rate the planter")]
    fn test_non_donor_cannot_rate() {
        let ctx = setup();
        let impostor = Address::generate(&ctx.env);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));

        client.initialize(&admin, &tree_token_id, &oracle, &70, &DEFAULT_MIN_DENSITY, &DEFAULT_JOB_SIZE_THRESHOLD);
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
        client.initialize(&admin, &tree_token_id, &oracle, &101, &DEFAULT_MIN_DENSITY, &DEFAULT_JOB_SIZE_THRESHOLD);
    }
        ctx.client.rate_planter(&impostor, &ctx.farmer, &5);
    }

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let tree_token = env
            .register_stellar_asset_contract_v2(contract.clone())
            .address();
        let amm = env.register_contract(None, MockAmm);
        token::StellarAssetClient::new(&env, &token).mint(&donor, &10_000);

        let xlm = token.clone();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        client.initialize(&admin, &tree_token, &amm, &xlm, &usdc);
        Ctx {
            env,
            client,
            token,
            tree_token,
            donor,
            farmer,
            contract,
    #[test]
    fn test_multiple_sponsors_can_rate_same_planter() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));

        // First sponsor rates
        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &5);

        // Create a second escrow with different donor and a fresh farmer
        let donor2 = Address::generate(&ctx.env);
        let farmer2 = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&donor2, &10_000);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
            .deposit(&donor2, &farmer2, &ctx.token, &10_000, &30, &3);
        complete_progress(&ctx, &farmer2, 30, 11);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&farmer2, &proof(&ctx.env, 20), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&farmer2, &proof(&ctx.env, 21));

        // Second sponsor rates their own farmer
        ctx.client.rate_planter(&donor2, &farmer2, &4);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.released, 3_000); // 30% of 10,000
        assert_eq!(rec.released, 5_000);
        assert_eq!(rec.progress_updates, 5);
        assert_eq!(rec.tree_count, 42);
        assert_eq!(rec.verified_tree_count, 42);
        let rep1 = ctx.client.get_planter_reputation(&ctx.farmer).unwrap();
        assert_eq!(rep1.total_ratings, 1);
        assert_eq!(rep1.sum_ratings, 5);
        assert_eq!(rep1.average_rating, 100); // 5 * 20 = 100

        let rep2 = ctx.client.get_planter_reputation(&farmer2).unwrap();
        assert_eq!(rep2.total_ratings, 1);
        assert_eq!(rep2.sum_ratings, 4);
        assert_eq!(rep2.average_rating, 80); // 4 * 20 = 80
    }

    #[test]
    fn test_reputation_calculation_with_various_ratings() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        complete_progress(&ctx, &ctx.farmer, 42, 1);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &70);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Survived);
        assert_eq!(rec.released, 7_000); // 30% + 40% = 70%
        assert_eq!(rec.survival_rate_percent, 70);

        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);

        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 3));
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000); // 100%
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 7));

        // Rate the main farmer from the original donor
        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &3_u32);

        // Add ratings from other sponsors (each using a fresh farmer)
        for i in 1u32..=4 {
            let donor = Address::generate(&ctx.env);
            let farmer = Address::generate(&ctx.env);
            token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&donor, &10_000);
            ctx.client.deposit(&donor, &farmer, &ctx.token, &10_000, &10, &1);
            complete_progress(&ctx, &farmer, 10, 50 + (i as u8 - 1) * 5);
            ctx.env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
            ctx.client.verify_survival(&farmer, &proof(&ctx.env, (i * 10) as u8), &70);
            ctx.env.ledger().with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
            ctx.client.verify_year_milestone(&farmer, &proof(&ctx.env, (i * 10 + 1) as u8));
            ctx.client.rate_planter(&donor, &farmer, &i);
        }
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32]).into()
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    fn advance_ledger(env: &Env, secs: u64) {
        env.ledger().with_mut(|l| l.timestamp += secs);
    #[test]
    fn test_verified_tree_count_controls_tree_mint_amount() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
        }
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &30);

        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.verified_tree_count, 30);
        assert_eq!(rec.tree_tokens_minted, 30 * tree_unit);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_verified_tree_count_cannot_exceed_donation() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
        }
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &43);
    }

    // ── Planting density tests (#514) ───────────────────────────────────────────

    #[test]
    fn test_small_job_exempt_from_density_rules() {
        // Job size (5 hectares) is below threshold (10 hectares)
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
        }
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &55);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Survived);
        
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 3));
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &55);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &100, &5);
        // Density = 100/5 = 20 trees/hectare, which is below min_density (1000)
        // But since job is small, it should be accepted
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

    // ── Full lifecycle with balance assertions ────────────────────────────────

    #[test]
    fn test_full_lifecycle_with_balances() {
        let Ctx { env, client, token, donor, farmer, contract, .. } = setup();

        // Step 1: Donation → funds locked
        assert_eq!(balance(&env, &token, &donor),    10_000);
        // assert_eq!(balance(&env, &token, &contract), 0);
        assert_eq!(balance(&env, &token, &farmer),   0);
    #[test]
    fn test_large_job_above_minimum_density_accepted() {
        // Job size (10 hectares) meets threshold
        // Density = 15000 trees / 10 hectares = 1500 trees/hectare (above minimum)
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
        }
        // 6th call should be rejected
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &15_000, &10);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

        client.deposit(&donor, &farmer, &token, &10_000, &1);

        assert_eq!(balance(&env, &token, &donor),    0,      "donor drained");
        // contract deposits to amm, so amm holds the balance
        // assert_eq!(balance(&env, &token, &contract), 10_000, "contract holds full amount");
        assert_eq!(balance(&env, &token, &farmer),   0,      "farmer not yet paid");

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status,       EscrowStatus::Funded);
        assert_eq!(rec.total_amount, 9_800);
        assert_eq!(rec.released,     0);

        // Step 2: Planting verification → 75% released
        client.verify_planting(&farmer, &proof(&env, 1), &1);

        // assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer),   7_350, "farmer received 75%");
    /// Helper: deposit + verify planting, leaving the escrow in `Planted`.
    fn deposit_and_plant(ctx: &Ctx) {
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client.refund(&ctx.farmer);
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
    }

    #[test]
    fn test_verify_dead_marks_escrow_dead_without_moving_funds() {
        let ctx = setup();
        deposit_and_plant(&ctx);

        let contract_balance_before = balance(&ctx.env, &ctx.token, &ctx.client.address);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Dead);
        assert_eq!(rec.death_proof, proof(&ctx.env, 3));
        assert_eq!(rec.replant_count, 0);
        // The retained Tranche 2 balance (25%) stays in escrow.
        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.client.address),
            contract_balance_before
        );
        assert_eq!(rec.released, 7_500);
    }

    #[test]
    #[should_panic(expected = "tree must be planted to be marked dead")]
    fn test_verify_dead_rejected_before_planting() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));
    }

    #[test]
    #[should_panic(expected = "tree must be planted to be marked dead")]
    fn test_verify_dead_rejected_after_completion() {
        let ctx = setup();
        deposit_and_plant(&ctx);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.client.refund(&ctx.farmer);
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
        // Completed escrows keep no balance and cannot be marked dead.
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));
    }

    #[test]
    fn test_request_replant_restarts_survival_cycle_for_free() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &0, &5);
    }

    // ── 1-year milestone tests (#494) ───────────────────────────────────────────

    #[test]
    #[should_panic(expected = "survival not yet verified")]
    fn test_year_milestone_before_survival_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 2));
    }

    #[test]
    #[should_panic(expected = "1-year milestone period not yet elapsed")]
    fn test_year_milestone_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &70);
        ctx.env.ledger().with_mut(|l| l.timestamp += 86_400);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 3));
    }

    #[test]
    fn test_year_milestone_at_one_year_accepted() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 3));
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Completed
        );
    }

    #[test]
    #[should_panic(expected = "nothing left to release")]
    fn test_year_milestone_double_call_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 3));
        ctx.client
            .verify_year_milestone(&ctx.farmer, &proof(&ctx.env, 4));
        deposit_and_plant(&ctx);

        let donor_balance_after_plant = balance(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));

        // Advance time so we can prove the survival clock resets on replant.
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client.request_replant(&ctx.farmer);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.replant_count, 1);
        assert_eq!(rec.planted_at, ctx.env.ledger().timestamp());
        assert_eq!(rec.survival_rate_percent, 0);
        // The sponsor paid nothing for the replant.
        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.donor),
            donor_balance_after_plant
        );
    }

    #[test]
    fn test_replanted_tree_releases_remainder_on_survival() {
        let ctx = setup();
        deposit_and_plant(&ctx);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));
        ctx.client.request_replant(&ctx.farmer);

        let farmer_before = balance(&ctx.env, &ctx.token, &ctx.farmer);
        // Six months must elapse from the *replant*, not the original planting.
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &30);
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
        // Remaining 25% is released to the farmer for the surviving replant.
        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.farmer) - farmer_before,
            2_500
        );
    }

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_replant_resets_survival_clock() {
        let ctx = setup();
        deposit_and_plant(&ctx);
        // Let the original 6 months nearly elapse before death.
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));
        ctx.client.request_replant(&ctx.farmer);
        // Survival immediately after replant must fail: the clock restarted.
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &43);
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    // ── Planting density tests (#514) ───────────────────────────────────────────

    #[test]
    fn test_small_job_exempt_from_density_rules() {
        // Job size (5 hectares) is below threshold (10 hectares)
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &100, &5);
        // Density = 100/5 = 20 trees/hectare, which is below min_density (1000)
        // But since job is small, it should be accepted
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

    #[test]
    #[should_panic(expected = "planting density below minimum for job size")]
    fn test_large_job_below_minimum_density_rejected() {
        // Job size (10 hectares) meets threshold
        // Density must be >= 1000 trees/hectare
        let ctx = setup();
        // 5000 trees / 10 hectares = 500 trees/hectare (below 1000 minimum)
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5_000, &10);
    }

    #[test]
    fn test_large_job_at_minimum_density_accepted() {
        // Job size (10 hectares) meets threshold
        // Density = 10000 trees / 10 hectares = 1000 trees/hectare (meets minimum)
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &10_000, &10);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

    #[test]
    fn test_large_job_above_minimum_density_accepted() {
        // Job size (10 hectares) meets threshold
        // Density = 15000 trees / 10 hectares = 1500 trees/hectare (above minimum)
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &15_000, &10);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

    #[test]
    fn test_custom_density_threshold() {
        // Test with custom density threshold of 500 trees/hectare
        let ctx = setup_with_density(70, 500, 5);
        // Job size (5 hectares) meets custom threshold
        // Density = 2000 trees / 5 hectares = 400 trees/hectare (below 500 minimum)
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &2_000, &5);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );
    }

    #[test]
    #[should_panic(expected = "area hectares must be positive")]
    fn test_deposit_rejects_zero_area() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &0);
    }

    #[test]
    fn test_repeated_death_and_replant() {
        let ctx = setup();
        deposit_and_plant(&ctx);

        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 3));
        ctx.client.request_replant(&ctx.farmer);
        ctx.client.verify_dead(&ctx.farmer, &proof(&ctx.env, 4));
        ctx.client.request_replant(&ctx.farmer);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.replant_count, 2);
        assert_eq!(rec.status, EscrowStatus::Planted);
    }

    #[test]
    #[should_panic(expected = "tree is not marked dead")]
    fn test_request_replant_rejected_when_not_dead() {
        let ctx = setup();
        deposit_and_plant(&ctx);
        ctx.client.request_replant(&ctx.farmer);
    }

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Planted);
        assert_eq!(rec.released, 7_350);
        assert!(rec.planting_proof.is_some());
        assert!(rec.planted_at.is_some());

        // Step 3: Fast-forward 6 months
        advance_ledger(&env, SIX_MONTHS_SECS + 1);

        // Step 4: Survival verification → remaining 25% released
        client.verify_survival(&farmer, &proof(&env, 2), &80);

        // assert_eq!(balance(&env, &token, &contract), 0,      "contract fully drained");
        assert_eq!(balance(&env, &token, &farmer),   9_800, "farmer received 100%");

        let rec = client.get_record(&farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 9_800);
        assert!(rec.survival_proof.is_some());
    }

    #[test]
    fn test_tranche_amounts_non_round_deposit() {
        let Ctx { env, client, token, donor, farmer, contract, .. } = setup();
        token::StellarAssetClient::new(&env, &token).mint(&donor, &1_001);
        client.deposit(&donor, &farmer, &token, &1_001, &1);

        client.verify_planting(&farmer, &proof(&env, 1), &1);
        let tranche1 = (1_001_i128 * 7_500) / 10_000; // = 750
        assert_eq!(balance(&env, &token, &farmer), 735);

        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &80);

        assert_eq!(balance(&env, &token, &farmer),   981);
        // assert_eq!(balance(&env, &token, &contract), 0);
    }

    #[test]
    fn test_planting_proof_hash_stored() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        let p = proof(&env, 42);
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &p, &1);
        assert_eq!(client.get_record(&farmer).unwrap().planting_proof, OptProof::Some(p));
    }

    #[test]
    fn test_survival_proof_hash_stored() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        let p = proof(&env, 99);
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);
        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &p, &80);
        assert_eq!(client.get_record(&farmer).unwrap().survival_proof, OptProof::Some(p));
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);
        // Only 1 day later — should panic
        advance_ledger(&env, 86_400);
        client.verify_survival(&farmer, &proof(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_survival_below_70_percent_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);

        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &69);
    }

    #[test]
    #[should_panic(expected = "planting already verified")]
    fn test_double_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);
    }

    #[test]
    #[should_panic(expected = "planting not yet verified")]
    fn test_survival_without_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        advance_ledger(&env, SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &proof(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_rejected() {
        let Ctx { client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &0, &1);
    }

    #[test]
    #[should_panic(expected = "active escrow already exists")]
    fn test_duplicate_deposit_rejected() {
        let Ctx { client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &5_000, &1);
        client.deposit(&donor, &farmer, &token, &5_000, &1);
    }

    // ── Refund paths ──────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_planting_restores_donor_balance() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        assert_eq!(balance(&env, &token, &donor), 0);

        client.refund(&farmer);

        assert_eq!(balance(&env, &token, &donor), 9_800, "donor fully refunded");
        assert_eq!(balance(&env, &token, &farmer),  0,     "farmer got nothing");
        assert_eq!(client.get_record(&farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after planting")]
    fn test_refund_after_planting_rejected() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();
        client.deposit(&donor, &farmer, &token, &10_000, &1);
        client.verify_planting(&farmer, &proof(&env, 1), &1);
        client.refund(&farmer);
    }

    // ── Init guard ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_rejected() {
        let Ctx { env, client, tree_token, .. } = setup();
        client.initialize(&Address::generate(&env), &tree_token, &Address::generate(&env), &Address::generate(&env), &Address::generate(&env));
    }

    #[test]
    #[should_panic(expected = "tree count must be positive")]
    fn test_deposit_rejects_zero_tree_count() {
        let Ctx { client, token, donor, farmer, .. } = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &0);
    }

    #[test]
    fn test_verified_tree_count_controls_tree_mint_amount() {
        let Ctx { env, client, token, tree_token, donor, farmer, .. } = setup();

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
        let Ctx { env, client, token, donor, farmer, .. } = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &42);
        client.verify_planting(&farmer, &proof(&env, 1), &43);
    }

    #[test]
    #[should_panic(expected = "verified tree count must be positive")]
    fn test_verified_tree_count_must_be_positive() {
        let Ctx { env, client, token, donor, farmer, .. } = setup();

        client.deposit(&donor, &farmer, &token, &10_000, &42);
        client.verify_planting(&farmer, &proof(&env, 1), &0);
    }
}

    fn min_density(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinDensity)
            .expect(" not initialized\)
 }

 fn job_size_threshold(env: &Env) -> i128 {
 env.storage()
 .instance()
 .get(&DataKey::JobSizeThreshold)
 .expect(\not initialized\)
 }

