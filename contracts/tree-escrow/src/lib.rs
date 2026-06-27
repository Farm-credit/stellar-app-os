#![no_std]

//! Tree Escrow Contract
//!
//! Two parallel funding flows backed by shared oracle infrastructure:
//!
//! ## Single-donor flow (keyed by farmer address)
//!   • `deposit` / `batch_deposit` — donor funds an escrow for a farmer
//!   • `verify_progress` — admin-verified progress update; streams 10% of
//!     the escrow to the planter on each of 5 calls (50% total).
//!     The first call also mints TREE rewards and records planting proof.
//!   • `verify_survival` releases the remaining escrow (≥6 months past
//!     planting, survival rate ≥ threshold).
//!   • `refund` returns funds to the donor before the first progress update.
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
//!   • The configurable `SurvivalThreshold` (set at init) gates survival
//!     release for both flows.
//!
//! ## Tree ID QR hash — Closes #496
//!   • `register_qr_hash` — admin stores the SHA-256 of a physical QR label
//!     payload against a tree_id for later verification.
//!   • `get_qr_hash` — retrieve the stored hash for off-chain label checking.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Vec,
};
use harvesta_errors::HarvestaError;

// ── Constants ─────────────────────────────────────────────────────────────────

/// Tranche 1: 30% at planting
const TRANCHE_1_BPS: i128 = 3_000;
/// Tranche 2: 40% at 6-month survival
const TRANCHE_2_BPS: i128 = 4_000;
/// Tranche 3: 30% at 1-year milestone
const TRANCHE_3_BPS: i128 = 3_000;
/// 10% per progress update in basis points
const STREAM_BPS: i128 = 1_000;
const BPS_DENOM: i128 = 10_000;

/// Number of verified progress updates before survival release
const PROGRESS_STREAM_COUNT: u32 = 5;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Window in which a sponsor may challenge a verification outcome (#469)
const DISPUTE_WINDOW_SECS: u64 = 60 * 60 * 24 * 7;

/// Maximum slots per batch deposit (Stellar operation limit safety margin)
const MAX_BATCH_SIZE: u32 = 50;

/// Default minimum planting density (trees per hectare) for large jobs
const DEFAULT_MIN_DENSITY: i128 = 1_000;

/// Default job size threshold (in hectares) above which density rules apply
const DEFAULT_JOB_SIZE_THRESHOLD: i128 = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Planted,
    Survived,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    pub donor: Address,
    pub gift_recipient: Option<Address>,
    pub farmer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub tree_count: i128,
    pub area_hectares: i128,
    pub verified_tree_count: i128,
    pub tree_tokens_minted: i128,
    pub released: i128,
    pub progress_updates: u32,
    pub status: EscrowStatus,
    pub planted_at: u64,
    pub planting_proof: BytesN<32>,
    pub survival_proof: BytesN<32>,
    pub survival_rate_percent: u32,
    pub year_proof: BytesN<32>,
}

/// A single slot in a batch deposit: one farmer address and the amount for that tree.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchSlot {
    pub farmer: Address,
    pub amount: i128,
    pub gift_recipient: Option<Address>,
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
    pub sum_ratings: u128, // Sum of all ratings (1-5 each)
    pub average_rating: u32, // Calculated as sum / total (scaled to 0-100)
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
    /// Minimum planting density (trees per hectare) for large jobs
    MinDensity,
    /// Job size threshold (hectares) above which density rules apply
    JobSizeThreshold,
    /// Per-farmer single-donor escrow record
    Escrow(Address),
    /// Per-tree oracle survival report
    OracleReport(u64),
    /// Per-tree co-funded escrow record
    TreeFunding(u64),
    /// Sponsor dispute on a verification outcome (#469)
    Dispute(u64),
    /// DAO members authorised to arbitrate disputes
    DaoMembers,
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
    /// * `min_density` — minimum trees per hectare for jobs above size threshold
    /// * `job_size_threshold` — minimum job size (hectares) for density rules to apply
    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        oracle: Address,
        survival_threshold_percent: u32,
        min_density: i128,
        job_size_threshold: i128,
    ) {
        if env.storage().instance().has(&DataKey::AdminTree) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if survival_threshold_percent > 100 {
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
            panic_with_error!(&env, HarvestaError::ContractMustBeTreeTokenAdmin);
        }

        let tree_decimals = token::Client::new(&env, &tree_token).decimals();

        env.storage()
            .instance()
            .set(&DataKey::AdminTree, &(admin, tree_token, tree_decimals));
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::SurvivalThreshold, &survival_threshold_percent);
        env.storage()
            .instance()
            .set(&DataKey::MinDensity, &min_density);
        env.storage()
            .instance()
            .set(&DataKey::JobSizeThreshold, &job_size_threshold);
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
        area_hectares: i128,
    ) {
        Self::deposit_internal(env, donor, None, farmer, token, amount, tree_count, area_hectares);
    }

    /// Sponsor trees as a gift - NFT receipt and carbon credits go to a different recipient address.
    ///
    /// `recipient_wallet` - the address that will receive the TREE tokens (NFT receipt and carbon credits)
    /// `farmer` - the farmer to plant the trees
    /// `token` - the token to use for payment (XLM or USDC)
    /// `amount` - the total amount to deposit
    /// `tree_count` - the maximum number of trees covered by this donation
    /// `area_hectares` - planting area in hectares
    pub fn sponsor_as_gift(
        env: Env,
        donor: Address,
        recipient_wallet: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
        area_hectares: i128,
    ) {
        Self::deposit_internal(env, donor, Some(recipient_wallet), farmer, token, amount, tree_count, area_hectares);
    }

    fn deposit_internal(
        env: Env,
        donor: Address,
        gift_recipient: Option<Address>,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
        area_hectares: i128,
    ) {
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }
        if tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
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

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        contract_utils::assert_whitelisted(&env, &token);
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                donor: donor.clone(),
                gift_recipient,
                farmer: farmer.clone(),
                token,
                total_amount: amount,
                tree_count,
                area_hectares,
                verified_tree_count: 0,
                tree_tokens_minted: 0,
                released: 0,
                progress_updates: 0,
                status: EscrowStatus::Funded,
                planted_at: 0,
                planting_proof: empty_hash.clone(),
                survival_proof: empty_hash.clone(),
                survival_rate_percent: 0,
                year_proof: empty_hash,
            },
        );

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Batch deposit: donor funds N tree slots in a single contract invocation.
    /// Each slot represents 1 tree on a small area (0.01 hectares for density calculation).
    pub fn batch_deposit(env: Env, donor: Address, token: Address, slots: Vec<BatchSlot>) {
        donor.require_auth();

        let n = slots.len();
        if n == 0 {
            panic_with_error!(&env, HarvestaError::BatchEmpty);
        }
        if n > MAX_BATCH_SIZE {
            panic_with_error!(&env, HarvestaError::BatchTooLarge);
        }

        let mut total: i128 = 0;
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            if slot.amount <= 0 {
                panic_with_error!(&env, HarvestaError::SlotAmountMustBePositive);
            }
            let key = DataKey::Escrow(slot.farmer.clone());
            if env.storage().persistent().has(&key) {
                panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
            }
            total += slot.amount;
        }

        contract_utils::assert_whitelisted(&env, &token);
        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &total);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
            // Batch deposits use a fixed small area (0.01 hectares) per tree
            // This ensures batch deposits are exempt from density rules (below threshold)
            let batch_area_hectares = 1_i128 / 100; // 0.01 hectares per tree
            
            env.storage().persistent().set(
                &key,
                &EscrowRecord {
                    donor: donor.clone(),
                    gift_recipient: slot.gift_recipient.clone(),
                    farmer: slot.farmer.clone(),
                    token: token.clone(),
                    total_amount: slot.amount,
                    tree_count: 1,
                    area_hectares: batch_area_hectares,
                    verified_tree_count: 0,
                    tree_tokens_minted: 0,
                    released: 0,
                    progress_updates: 0,
                    status: EscrowStatus::Funded,
                    planted_at: 0,
                    planting_proof: empty_hash.clone(),
                    survival_proof: empty_hash.clone(),
                    survival_rate_percent: 0,
                    year_proof: empty_hash,
                },
            );
            env.events()
                .publish((symbol_short!("deposit"), slot.farmer), slot.amount);
        }

        env.events().publish((symbol_short!("batch"), donor), total);
    }

    /// Admin-verified planting: releases Tranche 1 (30%) and mints TREE rewards.
    pub fn verify_planting(
    /// Admin-verified progress update: streams 10% of the escrow to the planter.
    ///
    /// May be called up to 5 times per escrow (each releasing exactly 10% of
    /// `total_amount`). The first call transitions the escrow from `Funded` to
    /// `Planted`, mints TREE rewards, and records the planting proof.
    pub fn verify_progress(
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
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status == EscrowStatus::Completed || rec.status == EscrowStatus::Refunded {
            panic!("escrow not active");
        }
        if rec.progress_updates >= PROGRESS_STREAM_COUNT {
            panic!("all progress updates completed");
        }

        // First progress update transitions Funded → Planted and mints TREE rewards.
        if rec.status == EscrowStatus::Funded {
            if verified_tree_count <= 0 {
                panic!("verified tree count must be positive");
            }
            if verified_tree_count > rec.tree_count {
                panic!("verified tree count exceeds donation");
            }

            let tree_unit = Self::compute_token_unit(tree_decimals);
            let tree_tokens = verified_tree_count
                .checked_mul(tree_unit)
                .expect("tree token mint amount overflow");

            let recipient = rec.gift_recipient.clone().unwrap_or_else(|| rec.donor.clone());
            token::StellarAssetClient::new(&env, &tree_token).mint(&recipient, &tree_tokens);

            rec.verified_tree_count = verified_tree_count;
            rec.tree_tokens_minted = tree_tokens;
            rec.status = EscrowStatus::Planted;
            rec.planted_at = env.ledger().timestamp();
            rec.planting_proof = proof_hash;

            env.events()
                .publish((symbol_short!("treemint"), recipient), tree_tokens);
        }

        // Stream 10% of the original total_amount to the planter.
        let stream_amount = (rec.total_amount * STREAM_BPS) / BPS_DENOM;
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &stream_amount,
        );

        rec.released += stream_amount;
        rec.progress_updates += 1;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("progress"), farmer), (rec.progress_updates, stream_amount));
    }

    /// Admin-verified survival check: releases Tranche 2 (40%) once 6 months
    /// have elapsed and the reported survival rate ≥ the configured threshold.
    /// Admin-verified survival check: releases the remaining escrow once 6 months
    /// have elapsed, all progress updates are completed, and the reported
    /// survival rate ≥ the configured threshold.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let (admin, _tree_token, _decimals) = Self::admin_tree(&env);
        admin.require_auth();

        if survival_rate_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalRateOutOfRange);
        }

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Planted {
            panic_with_error!(&env, HarvestaError::PlantingNotVerified);
        }
        if rec.progress_updates < PROGRESS_STREAM_COUNT {
            panic!("all progress updates must be completed first");
        }

        let now = env.ledger().timestamp();
        if now < rec.planted_at + SIX_MONTHS_SECS {
            panic_with_error!(&env, HarvestaError::SurvivalPeriodNotElapsed);
        }

        let threshold = Self::survival_threshold(&env);
        if survival_rate_percent < threshold {
            panic_with_error!(&env, HarvestaError::SurvivalRateBelowMinimum);
        }

        let tranche2 = (rec.total_amount * TRANCHE_2_BPS) / BPS_DENOM;
        if tranche2 <= 0 {
            panic_with_error!(&env, HarvestaError::NothingToRelease);
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche2,
        );

        rec.released += tranche2;
        rec.status = EscrowStatus::Survived;
        rec.survival_proof = proof_hash;
        rec.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);
    }

    /// Admin-verified 1-year milestone: releases Tranche 3 (30%) once 1 year
    /// has elapsed since planting.
    pub fn verify_year_milestone(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
    ) {
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
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Funded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
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

    // ── Planter rating system (#483) ─────────────────────────────────────────

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
        rep.average_rating = (rep.sum_ratings * 20) / rep.total_ratings as u128; // Scale to 0-100 (5 stars * 20 = 100)

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
        let remaining = funding.total_funded - funding.released;
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

    fn compute_token_unit(decimals: u32) -> i128 {
        let mut unit = 1i128;
        let mut i = 0u32;
        while i < decimals {
            unit = unit
                .checked_mul(10)
                .unwrap_or_else(|| panic_with_error!(env, HarvestaError::TokenUnitOverflow));
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
        assert_eq!(rec.released, 3_000); // 30% of 10,000
        assert_eq!(rec.released, 5_000);
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
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_survival_too_early_rejected() {
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
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_survival_below_threshold_rejected() {
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
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 6), &69);
    }

    #[test]
    fn test_threshold_is_configurable_at_init() {
        let ctx = setup_with_threshold(50);
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
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42);
        for i in 0..5 {
            ctx.client
                .verify_progress(&ctx.farmer, &proof(&ctx.env, i as u8 + 1), &42);
        }
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
    #[should_panic(expected = "cannot refund after planting")]
    fn test_refund_after_progress_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &42);
        ctx.client.refund(&ctx.farmer);
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
    }

    // ── Planter rating tests (#483) ───────────────────────────────────────────

    #[test]
    fn test_rate_planter_after_completion() {
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

        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &5);

        let rep = ctx.client.get_planter_reputation(&ctx.farmer).unwrap();
        assert_eq!(rep.total_ratings, 1);
        assert_eq!(rep.sum_ratings, 5);
        assert_eq!(rep.average_rating, 100); // 5 * 20 = 100
    }

    #[test]
    #[should_panic(expected = "rating must be between 1 and 5")]
    fn test_rating_out_of_range_rejected() {
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

        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &6);
    }

    #[test]
    #[should_panic(expected = "can only rate after escrow is completed")]
    fn test_rating_before_completion_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &42);

        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &5);
    }

    #[test]
    #[should_panic(expected = "only the original donor can rate the planter")]
    fn test_non_donor_cannot_rate() {
        let ctx = setup();
        let impostor = Address::generate(&ctx.env);
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

        ctx.client.rate_planter(&impostor, &ctx.farmer, &5);
    }

    #[test]
    #[should_panic(expected = "sponsor has already rated this planter")]
    fn test_duplicate_rating_rejected() {
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

        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &5);
        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &4);
    }

    #[test]
    fn test_multiple_sponsors_can_rate_same_planter() {
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

        // First sponsor rates
        ctx.client.rate_planter(&ctx.donor, &ctx.farmer, &5);

        // Create a second escrow with different donor
        let donor2 = Address::generate(&ctx.env);
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&donor2, &10_000);
        let farmer2 = ctx.farmer.clone(); // Same farmer
        ctx.client
            .deposit(&donor2, &farmer2, &ctx.token, &10_000, &30, &3);
        ctx.client
            .verify_planting(&farmer2, &proof(&ctx.env, 2), &30);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&farmer2, &proof(&ctx.env, 3), &70);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_year_milestone(&farmer2, &proof(&ctx.env, 4));

        // Second sponsor rates
        ctx.client.rate_planter(&donor2, &farmer2, &4);

        let rep = ctx.client.get_planter_reputation(&ctx.farmer).unwrap();
        assert_eq!(rep.total_ratings, 2);
        assert_eq!(rep.sum_ratings, 9); // 5 + 4
        assert_eq!(rep.average_rating, 90); // (9 * 20) / 2 = 90
    }

    #[test]
    fn test_reputation_calculation_with_various_ratings() {
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

        // Add multiple ratings from different sponsors
        for i in 1..=5 {
            let donor = Address::generate(&ctx.env);
            token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&donor, &10_000);
            let farmer = ctx.farmer.clone();
            ctx.client
                .deposit(&donor, &farmer, &ctx.token, &10_000, &10, &1);
            ctx.client
                .verify_planting(&farmer, &proof(&ctx.env, i + 10), &10);
            ctx.env
                .ledger()
                .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
            ctx.client
                .verify_survival(&farmer, &proof(&ctx.env, i + 20), &70);
            ctx.env
                .ledger()
                .with_mut(|l| l.timestamp += ONE_YEAR_SECS - SIX_MONTHS_SECS + 1);
            ctx.client
                .verify_year_milestone(&farmer, &proof(&ctx.env, i + 30));
            ctx.client.rate_planter(&donor, &farmer, i);
        }

        let rep = ctx.client.get_planter_reputation(&ctx.farmer).unwrap();
        assert_eq!(rep.total_ratings, 5);
        assert_eq!(rep.sum_ratings, 15); // 1+2+3+4+5
        assert_eq!(rep.average_rating, 60); // (15 * 20) / 5 = 60
    }

    #[test]
    fn test_verified_tree_count_controls_tree_mint_amount() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &42, &5);
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
            .verify_progress(&ctx.farmer, &proof(&ctx.env, 1), &43);
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
    fn test_batch_deposit_creates_record_per_slot() {
        let ctx = setup();
        let f1 = Address::generate(&ctx.env);
        let f2 = Address::generate(&ctx.env);
        let slots = vec![
            &ctx.env,
            BatchSlot {
                farmer: f1.clone(),
                amount: 1_500,
                gift_recipient: None,
            },
            BatchSlot {
                farmer: f2.clone(),
                amount: 2_500,
                gift_recipient: None,
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
    #[should_panic(expected = "Error(Contract, #26)")]
    fn test_submit_survival_report_rejects_unauthorized_caller() {
        let ctx = setup();
        let impostor = Address::generate(&ctx.env);
        ctx.client.submit_survival_report(&impostor, &7, &82);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #22)")]
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
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        let b = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 8, &[(a.clone(), 4_000), (b.clone(), 6_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &8, &80);

        ctx.client.release_proportional(&8, &7_500);
        let f = ctx.client.get_tree_funding(&8).unwrap();
        assert_eq!(f.released, 7_500);
        assert_eq!(f.status, TreeFundingStatus::Open);

        ctx.client.release_proportional(&8, &2_500);
        assert_eq!(
            ctx.client.get_tree_funding(&8).unwrap().status,
            TreeFundingStatus::Released
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
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
    #[should_panic(expected = "Error(Contract, #31)")]
    fn test_cofund_contribute_before_register_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        fund(&ctx.env, &ctx.token, &a, 100);
        ctx.client.contribute(&a, &99, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn test_cofund_release_without_oracle_report_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 5, &[(a, 1_000)]);
        ctx.client.release_proportional(&5, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_cofund_release_below_threshold_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 6, &[(a, 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &6, &50);
        ctx.client.release_proportional(&6, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #33)")]
    fn test_cofund_release_after_full_payout_rejected() {
        let ctx = setup();
        let a = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 7, &[(a, 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &7, &80);
        ctx.client.release_proportional(&7, &1_000);
        ctx.client.release_proportional(&7, &1);
    }

    // ── Dispute resolution (#469) ─────────────────────────────────────────────

    #[test]
    fn test_open_dispute_pauses_fund_release() {
        let ctx = setup();
        let sponsor = Address::generate(&ctx.env);
        let dao = Address::generate(&ctx.env);
        ctx.client.set_dao_members(&vec![&ctx.env, dao.clone()]);

        register_and_contribute(&ctx, 20, &[(sponsor.clone(), 5_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &20, &85);

        ctx.client.open_dispute(&sponsor, &20, &proof(&ctx.env, 9));
        assert!(ctx.client.has_open_dispute(&20));

        ctx.client.cast_dao_vote(&dao, &20, &false);
        ctx.client.resolve_dispute(&dao, &20);

        let dispute = ctx.client.get_dispute(&20).unwrap();
        assert!(dispute.resolved);
        assert_eq!(dispute.outcome, DisputeOutcome::VerificationOverturned);
    }

    #[test]
    #[should_panic(expected = "fund release paused: dispute is open")]
    fn test_release_blocked_while_dispute_open() {
        let ctx = setup();
        let sponsor = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 21, &[(sponsor.clone(), 3_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &21, &80);
        ctx.client.open_dispute(&sponsor, &21, &proof(&ctx.env, 10));
        ctx.client.release_proportional(&21, &3_000);
    }

    #[test]
    #[should_panic(expected = "dispute window expired")]
    fn test_open_dispute_rejected_after_seven_days() {
        let ctx = setup();
        let sponsor = Address::generate(&ctx.env);
        register_and_contribute(&ctx, 22, &[(sponsor.clone(), 1_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &22, &80);
        ctx.env
            .ledger()
            .with_mut(|l| l.timestamp += DISPUTE_WINDOW_SECS + 1);
        ctx.client.open_dispute(&sponsor, &22, &proof(&ctx.env, 11));
    }

    #[test]
    fn test_dao_upholds_verification_and_release_proceeds() {
        let ctx = setup();
        let sponsor = Address::generate(&ctx.env);
        let dao = Address::generate(&ctx.env);
        ctx.client.set_dao_members(&vec![&ctx.env, dao.clone()]);

        register_and_contribute(&ctx, 23, &[(sponsor.clone(), 4_000)]);
        ctx.client.submit_survival_report(&ctx.oracle, &23, &90);
        ctx.client.open_dispute(&sponsor, &23, &proof(&ctx.env, 12));

        ctx.client.cast_dao_vote(&dao, &23, &true);
        ctx.client.resolve_dispute(&dao, &23);

        assert!(!ctx.client.has_open_dispute(&23));
        assert_eq!(
            ctx.client.get_dispute(&23).unwrap().outcome,
            DisputeOutcome::VerificationUpheld
        );

        let pre = balance(&ctx.env, &ctx.token, &sponsor);
        ctx.client.release_proportional(&23, &4_000);
        assert_eq!(balance(&ctx.env, &ctx.token, &sponsor) - pre, 4_000);
    }

    use proptest::prelude::*;
    use std::collections::HashSet;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(50))]
        #[test]
        fn test_tree_id_uniqueness_invariant(tree_ids in prop::collection::vec(0u64..1000u64, 1..30)) {
            let ctx = setup();
            let mut registered = HashSet::new();

            for tree_id in tree_ids {
                if registered.contains(&tree_id) {
                    // Try to register the tree again. It must fail.
                    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        ctx.client.register_tree(&tree_id, &ctx.farmer, &ctx.token);
                    }));
                    assert!(res.is_err(), "Expected panic when registering duplicate tree ID {}", tree_id);
                } else {
                    // Register the tree for the first time. It must succeed.
                    ctx.client.register_tree(&tree_id, &ctx.farmer, &ctx.token);
                    registered.insert(tree_id);

                    // Verify that the tree can be retrieved and its info is correct
                    let funding = ctx.client.get_tree_funding(&tree_id).unwrap();
                    assert_eq!(funding.tree_id, tree_id);
                    assert_eq!(funding.farmer, ctx.farmer);
                    assert_eq!(funding.token, ctx.token);
                }
            }

            // Post-condition: check that all registered tree IDs still exist and retrieve correctly
            for tree_id in &registered {
                let funding = ctx.client.get_tree_funding(tree_id).unwrap();
                assert_eq!(funding.tree_id, *tree_id);
            }
        }
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

