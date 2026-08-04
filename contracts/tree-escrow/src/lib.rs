#![no_std]
#![allow(dead_code)]

//! Tree Escrow Contract — issue #749: Cross-Contract Reentrancy Guard
//!
//! Holds donor funds and releases them in two tranches:
//!   • Tranche 1 (75%) — released on verified planting
//!   • Tranche 2 (25%) — released after 6-month survival (≥ 70% survival rate)
//!
//! Every state-mutating function is protected by [`reentrancy::ReentrancyGuard`]
//! which stores a boolean lock in Instance storage. If a cross-contract callback
//! attempts to re-enter any guarded function before the outer call completes,
//! the transaction panics with error code 200 (`ReentrancyError::Reentrancy`).
//!
//! # Reentrancy guard integration pattern
//! ```rust
//! pub fn deposit(env: Env, ...) {
//!     let _guard = ReentrancyGuard::acquire(&env); // acquire lock — panics if re-entered
//!     donor.require_auth();
//!     // ... state mutations and cross-contract calls ...
//! } // _guard drops here → lock released
//! ```

pub mod reentrancy;

use reentrancy::ReentrancyGuard;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env,
};
use harvesta_errors::HarvestaError;


// ── Constants ─────────────────────────────────────────────────────────────────

const TRANCHE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE: u32 = 70;
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

// ── Types ─────────────────────────────────────────────────────────────────────

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

/// Recurring milestone payment stream record — Closes #773.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneStream {
    pub stream_id: u64,
    pub farmer: Address,
    pub funder: Address,
    pub token: Address,
    pub total_amount: i128,
    pub released_amount: i128,
    pub total_milestones: u32,
    pub milestone_interval_secs: u64,
    pub start_time: u64,
    pub verifier_approved_count: u32,
    pub active: bool,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token)
    Config,
    /// Per-farmer escrow record
    Escrow(Address),
}

    Escrow(Address),
}

    AdminTree,
    Oracle,
    SurvivalThreshold,
    /// Minimum planting density (trees per hectare) for large jobs
    MinDensity,
    /// Job size threshold (hectares) above which density rules apply
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
    MilestoneStreamSeq,
    MilestoneStream(u64),
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
    /// One-time initialisation.
    ///
    /// `admin`       — verifier/admin address
    /// `tree_token`  — TREE SAC token; this contract must be its admin
    ///
    /// Not guarded: no state that can be reentrantly exploited exists yet.
    pub fn initialize(env: Env, admin: Address, tree_token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if token::StellarAssetClient::new(&env, &tree_token).admin()
            != env.current_contract_address()
        {
            panic_with_error!(&env, HarvestaError::ContractMustBeTreeTokenAdmin);
        }
        env.storage().instance().set(&DataKey::Config, &(admin, tree_token));
    }

    // ── Recurring Milestone Payment Stream (Closes #773) ──────────────────────

    /// Create an automated recurring milestone payment stream.
    ///
    /// REENTRANCY GUARD: The token transfer is a cross-contract call. A malicious
    /// token contract could call back into `deposit` before this invocation
    /// completes. The guard prevents that scenario.
    ///
    /// REENTRANCY GUARD: The token transfer is a cross-contract call. A malicious
    /// token contract could call back into `deposit` before this invocation
    /// completes. The guard prevents that scenario.
    ///
    /// # Authorization
    /// `donor` must sign the transaction.
    pub fn deposit(
    /// The `funder` deposits `total_amount` into escrow. Funds are unlocked in `total_milestones`
    /// tranches as elapsed time reaches `milestone_interval_secs` and `verifier` approves green lights.
    pub fn create_milestone_stream(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        donor.require_auth();

        if amount <= 0 { panic_with_error!(&env, HarvestaError::AmountMustBePositive); }
        if tree_count <= 0 { panic_with_error!(&env, HarvestaError::TreeCountMustBePositive); }

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        // Cross-contract call — guard prevents reentrant deposit
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );


        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        // Cross-contract call — guard prevents reentrant deposit
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        total_amount: i128,
        total_milestones: u32,
        milestone_interval_secs: u64,
    ) -> u64 {
        funder.require_auth();

        if total_amount <= 0 {
            panic!("total amount must be positive");
        }
        if total_milestones == 0 {
            panic!("milestones must be greater than zero");
        }
        if milestone_interval_secs == 0 {
            panic!("milestone interval must be greater than zero");
        }

        // Transfer funds from funder into escrow
        token::Client::new(&env, &token).transfer(&funder, &env.current_contract_address(), &total_amount);

        let stream_seq: u64 = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneStreamSeq)
            .unwrap_or(0);
        let stream_id = stream_seq + 1;

        let stream = MilestoneStream {
            stream_id,
            farmer: farmer.clone(),
            funder: funder.clone(),
            token,
            total_amount,
            released_amount: 0,
            total_milestones,
            milestone_interval_secs,
            start_time: env.ledger().timestamp(),
            verifier_approved_count: 0,
            active: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::MilestoneStream(stream_id), &stream);
        env.storage()
            .instance()
            .set(&DataKey::MilestoneStreamSeq, &stream_id);

        env.events()
            .publish((symbol_short!("strm_crtd"), stream_id), (funder, farmer, total_amount));

        stream_id
    }

    /// Verifier approves green light for a milestone stream tranche.
    pub fn approve_milestone_greenlight(env: Env, verifier: Address, stream_id: u64) {
        verifier.require_auth();

        let mut stream: MilestoneStream = env
            .storage()
            .persistent()
            .get(&DataKey::MilestoneStream(stream_id))
            .expect("stream not found");

        if !stream.active {
            panic!("stream is inactive");
        }

        stream.verifier_approved_count += 1;

        env.storage()
            .persistent()
            .set(&DataKey::MilestoneStream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("strm_appr"), stream_id),
            (verifier, stream.verifier_approved_count),
        );
    }

    /// Release unlocked milestone stream payment to farmer based on elapsed time and verifier approvals.
    pub fn release_stream_payment(env: Env, stream_id: u64) -> i128 {
        let mut stream: MilestoneStream = env
            .storage()
            .persistent()
            .get(&DataKey::MilestoneStream(stream_id))
            .expect("stream not found");

        if !stream.active {
            panic!("stream is inactive");
        }

        let current_time = env.ledger().timestamp();
        let elapsed = current_time.saturating_sub(stream.start_time);
        let time_eligible_milestones = (elapsed / stream.milestone_interval_secs) as u32;

        // Eligible milestones capped by verifier greenlight approvals and total_milestones
        let eligible_milestones = time_eligible_milestones
            .min(stream.verifier_approved_count)
            .min(stream.total_milestones);

        if eligible_milestones == 0 {
            return 0;
        }

        let amount_per_milestone = stream.total_amount / (stream.total_milestones as i128);
        let target_release = amount_per_milestone * (eligible_milestones as i128);
        let payout = target_release.saturating_sub(stream.released_amount);

        if payout <= 0 {
            return 0;
        }

        stream.released_amount += payout;
        if eligible_milestones == stream.total_milestones {
            stream.active = false;
        }

        env.storage()
            .persistent()
            .set(&DataKey::MilestoneStream(stream_id), &stream);

        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &stream.farmer,
            &payout,
        );

        env.events().publish(
            (symbol_short!("strm_payout"), stream_id),
            (stream.farmer.clone(), payout, stream.released_amount),
        );

        payout
    }

    /// Returns the milestone stream record by ID.
    pub fn get_milestone_stream(env: Env, stream_id: u64) -> Option<MilestoneStream> {
        env.storage()
            .persistent()
            .get(&DataKey::MilestoneStream(stream_id))
    }

    // ── Soroban Instance Storage Auto-Bump Helpers (Closes #774) ─────────────

    /// Extend the contract instance storage TTL to prevent expiration.
    pub fn extend_instance_ttl(env: Env, threshold: u32, extend_to: u32) {
        env.storage().instance().extend_ttl(threshold, extend_to);
    }

    /// Bump the contract instance storage TTL using default parameters (1 day threshold, 30 days extension).
    pub fn bump_instance_ttl(env: Env) {
        env.storage().instance().extend_ttl(17_280, 518_400);
    }

    /// Donor deposits `amount` of `token` into escrow for `farmer`.

    ///
    /// REENTRANCY GUARD: The token transfer is a cross-contract call. A malicious
    /// token contract could call back into `deposit` before this invocation
    /// completes. The guard prevents that scenario.
    ///
    /// # Authorization
    /// `donor` must sign the transaction.
    pub fn deposit(
        env: Env,
        donor: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        donor.require_auth();

        if amount <= 0 { panic_with_error!(&env, HarvestaError::AmountMustBePositive); }
        if tree_count <= 0 { panic_with_error!(&env, HarvestaError::TreeCountMustBePositive); }

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        // Cross-contract call — guard prevents reentrant deposit
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        env.storage().persistent().set(&key, &EscrowRecord {
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
            planting_proof: zero_hash.clone(),
            survival_proof: zero_hash,
            survival_rate_percent: 0,
        });

        env.events().publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Admin verifies planting. Releases 75% to the farmer and mints TREE tokens.
    ///
    /// REENTRANCY GUARD: Two cross-contract calls (token transfer + mint).
    /// A malicious token could re-enter `verify_planting` between them.
    ///
    ///
    /// REENTRANCY GUARD: Two cross-contract calls (token transfer + mint).
    /// A malicious token could re-enter `verify_planting` between them.
    ///
    ///
    /// REENTRANCY GUARD: Two cross-contract calls (token transfer + mint).
    /// A malicious token could re-enter `verify_planting` between them.
    ///
    /// # Authorization
    /// Admin must sign.
    pub fn verify_planting(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        verified_tree_count: i128,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        let (admin, tree_token) = Self::config(&env);
        admin.require_auth();

        if verified_tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::VerifiedCountMustBePositive);
        }

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Funded {
            panic_with_error!(&env, HarvestaError::PlantingAlreadyVerified);
        }
        if verified_tree_count > rec.tree_count {
            panic_with_error!(&env, HarvestaError::VerifiedCountExceedsDonation);
        }

        let tranche1 = (rec.total_amount * TRANCHE_1_BPS) / BPS_DENOM;
        let tree_unit = Self::token_unit(&env, &tree_token);
        let tree_tokens = verified_tree_count
            .checked_mul(tree_unit)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::TreeTokenMintOverflow));

        // CEI: update state before cross-contract calls
        rec.released += tranche1;
        rec.verified_tree_count = verified_tree_count;
        rec.tree_tokens_minted = tree_tokens;
        rec.status = EscrowStatus::Planted;
        rec.planted_at = env.ledger().timestamp();
        rec.planting_proof = proof_hash;
        env.storage().persistent().set(&key, &rec);

        // Cross-contract calls — guard prevents reentrant exploitation
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(), &rec.farmer, &tranche1,
        );
        token::StellarAssetClient::new(&env, &tree_token).mint(&rec.donor, &tree_tokens);

        env.events().publish((symbol_short!("planted"), farmer), tranche1);
        env.events().publish((symbol_short!("treemint"), rec.donor), tree_tokens);
    }


    /// Admin verifies 6-month survival. Releases remaining 25% to the farmer.
    ///
    /// REENTRANCY GUARD: Token transfer is a cross-contract call.
    ///
    /// # Authorization
    /// Admin must sign.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        proof_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        let (admin, _tree_token) = Self::config(&env);
        admin.require_auth();

        if survival_rate_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalRateOutOfRange);
        }
        if survival_rate_percent < MIN_SURVIVAL_RATE {
            panic_with_error!(&env, HarvestaError::SurvivalRateBelowMinimum);
        }

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Planted {
            panic_with_error!(&env, HarvestaError::PlantingNotVerified);
        }
        if env.ledger().timestamp() < rec.planted_at + SIX_MONTHS_SECS {
            panic_with_error!(&env, HarvestaError::SurvivalPeriodNotElapsed);
        }

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 { panic_with_error!(&env, HarvestaError::NothingToRelease); }

        // CEI: update state before cross-contract call
        rec.released += tranche2;
        rec.status = EscrowStatus::Completed;
        rec.survival_proof = proof_hash;
        rec.survival_rate_percent = survival_rate_percent;
        env.storage().persistent().set(&key, &rec);

        // Cross-contract call — guard prevents reentrant exploitation
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(), &rec.farmer, &tranche2,
        );

        env.events().publish((symbol_short!("survived"), farmer), tranche2);
    }

    /// Admin refunds a Funded escrow to the donor (e.g. planting abandoned).
    ///
    /// REENTRANCY GUARD: Token transfer is a cross-contract call.
    ///
    /// # Authorization
    /// Admin must sign.
    pub fn refund(env: Env, farmer: Address) {
        let _guard = ReentrancyGuard::acquire(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env.storage().persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Funded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
        }

        let refund_amount = rec.total_amount;
        let token = rec.token.clone();
        let donor = rec.donor.clone();

        // CEI: mark refunded before cross-contract call
        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        // Cross-contract call — guard prevents reentrant exploitation
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(), &donor, &refund_amount,
        );

        env.events().publish((symbol_short!("refund"), farmer), refund_amount);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /// Returns the escrow record for `farmer`, or `None`.
    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage().persistent().get(&DataKey::Escrow(farmer))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage().instance().get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn token_unit(env: &Env, token: &Address) -> i128 {
        let decimals = token::Client::new(env, token).decimals();
        let mut unit = 1i128;
        for _ in 0..decimals {
            unit = unit.checked_mul(10)
                .unwrap_or_else(|| panic_with_error!(env, HarvestaError::TokenUnitOverflow));
        }
        unit
    }
}


// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use reentrancy::{ReentrancyError, ReentrancyGuard};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    // ── Test context ──────────────────────────────────────────────────────────

    #[allow(dead_code)]
    struct Ctx {
        env: Env,
        admin: Address,
        donor: Address,
        farmer: Address,
        token: Address,
        tree_token: Address,
        client: TreeEscrowClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeEscrow);
        let client = TreeEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
        token::StellarAssetClient::new(&env, &token).mint(&donor, &100_000);

        // Tree token must have this contract as its admin
        let tree_token = env.register_stellar_asset_contract_v2(contract_id.clone()).address();

        client.initialize(&admin, &tree_token);

        Ctx { env, admin, donor, farmer, token, tree_token, client }
    }

    fn proof(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn bal(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Reentrancy guard unit tests ───────────────────────────────────────────

    #[test]
    fn test_guard_acquires_and_releases_lock() {
        let env = Env::default();
        assert!(!ReentrancyGuard::is_locked(&env));
        {
            let _g = ReentrancyGuard::acquire(&env);
            assert!(ReentrancyGuard::is_locked(&env));
        }
        // Guard dropped — lock must be cleared
        assert!(!ReentrancyGuard::is_locked(&env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #200)")]
    fn test_guard_panics_on_reentrant_acquire() {
        let env = Env::default();
        let _g1 = ReentrancyGuard::acquire(&env);
        // Simulates a reentrant call — second acquire must panic
        let _g2 = ReentrancyGuard::acquire(&env);
    }

    #[test]
    fn test_guard_lock_cleared_after_panic() {
        let env = Env::default();
        // Acquire lock, then simulate panic by dropping guard explicitly
        let g = ReentrancyGuard::acquire(&env);
        assert!(ReentrancyGuard::is_locked(&env));
        drop(g);
        assert!(!ReentrancyGuard::is_locked(&env));
        // Can re-acquire after release
        let _g2 = ReentrancyGuard::acquire(&env);
        assert!(ReentrancyGuard::is_locked(&env));
    }

    #[test]
    fn test_guard_sequential_acquires_succeed() {
        let env = Env::default();
        for _ in 0..5 {
            let _g = ReentrancyGuard::acquire(&env);
            assert!(ReentrancyGuard::is_locked(&env));
            // _g drops here, lock cleared before next iteration
        }
        assert!(!ReentrancyGuard::is_locked(&env));
    }

    // ── deposit ───────────────────────────────────────────────────────────────

    #[test]
    fn test_deposit_creates_escrow_record() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.total_amount, 10_000);
        assert_eq!(rec.released, 0);
        assert_eq!(rec.status, EscrowStatus::Funded);
        assert_eq!(rec.tree_count, 5);
        assert_eq!(rec.donor, ctx.donor);
        assert_eq!(rec.farmer, ctx.farmer);
    }

    #[test]
    fn test_deposit_transfers_tokens_to_contract() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_deposit_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &0, &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_deposit_zero_tree_count_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_duplicate_deposit_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2);
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2);
    }

    // ── verify_planting ───────────────────────────────────────────────────────

    #[test]
    fn test_verify_planting_releases_75_percent() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &10);
        let before = bal(&ctx.env, &ctx.token, &ctx.farmer);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &10);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.farmer), before + 7_500);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.status, EscrowStatus::Planted);
    }

    #[test]
    fn test_verify_planting_mints_tree_tokens_to_donor() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &10);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &10);
        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.donor), 10 * tree_unit);
    }

    #[test]
    fn test_verify_planting_stores_proof_hash() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        let p = proof(&ctx.env, 42);
        ctx.client.verify_planting(&ctx.farmer, &p, &5);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.planting_proof, p);
        assert!(rec.planted_at > 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_double_planting_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 2), &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_verify_planting_exceeds_tree_count_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &6);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_verify_planting_zero_count_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &0);
    }

    // ── verify_survival ───────────────────────────────────────────────────────

    #[test]
    fn test_verify_survival_releases_remaining_25_percent() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        let before = bal(&ctx.env, &ctx.token, &ctx.farmer);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.farmer), before + 2_500);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.released, 10_000);
        assert_eq!(rec.status, EscrowStatus::Completed);
    }

    #[test]
    fn test_verify_survival_stores_proof_and_rate() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 9), &75);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.survival_proof, proof(&ctx.env, 9));
        assert_eq!(rec.survival_rate_percent, 75);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_survival_too_early_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(86_400); // 1 day — far too early
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_survival_below_70_percent_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &69);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #22)")]
    fn test_survival_rate_above_100_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &101);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_survival_without_planting_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    // ── refund ────────────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_planting_returns_funds_to_donor() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.refund(&ctx.farmer);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before);
        assert_eq!(ctx.client.get_record(&ctx.farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn test_refund_after_planting_rejected() {
        let ctx = setup();
        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.client.refund(&ctx.farmer);
    }

    // ── full lifecycle ────────────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle_fund_plant_survive() {
        let ctx = setup();

        ctx.client.deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &3);
        assert_eq!(ctx.client.get_record(&ctx.farmer).unwrap().status, EscrowStatus::Funded);

        ctx.client.verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &3);
        assert_eq!(ctx.client.get_record(&ctx.farmer).unwrap().status, EscrowStatus::Planted);

        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client.verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &90);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Completed);
        assert_eq!(rec.released, 10_000);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.farmer), 10_000);
    }

    // ── initialize guard ──────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.tree_token);
    }
}
