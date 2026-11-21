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

use harvesta_errors::HarvestaError;
use reentrancy::ReentrancyGuard;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, BytesN,
    Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TRANCHE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE: u32 = 70;
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;
const ONE_YEAR_SECS: u64 = 365 * 24 * 60 * 60;
const INSURANCE_FEE_BPS: u32 = 200;

/// Orders at or above this tree count are "wholesale" and require multi-signature
/// approval before funds are released into an active escrow (issue #1089).
const WHOLESALE_THRESHOLD_UNITS: i128 = 10_000;
/// Bounded storage guard on the approver set size.
const MAX_APPROVERS: u32 = 16;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Planted,
    Survived,
    Completed,
    Refunded,
    Dead,
    JobExpired,
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
    pub deposit_time: u64,
    pub has_insurance: bool,
    pub insurance_fee: i128,
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

/// Lifecycle state of a wholesale order pending multi-signature approval.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OrderStatus {
    /// Awaiting enough distinct approver signatures.
    PendingApprovals,
    /// Threshold reached; funds moved into an active `EscrowRecord`.
    Approved,
    /// Cancelled by the donor or admin before approval; funds refunded.
    Cancelled,
}

/// A wholesale tree order (≥ [`WHOLESALE_THRESHOLD_UNITS`]) awaiting multi-party
/// approval before its funds become an active escrow — issue #1089.
///
/// The donor's funds are transferred into the contract at proposal time (same as
/// a normal deposit), so risk mitigation comes from gating the *release into an
/// active, farmer-payable escrow* behind independent approvals rather than
/// delaying custody of funds.
#[contracttype]
#[derive(Clone, Debug)]
pub struct WholesaleOrder {
    pub order_id: u64,
    pub donor: Address,
    pub gift_recipient: Option<Address>,
    pub farmer: Address,
    pub token: Address,
    pub amount: i128,
    pub tree_count: i128,
    pub area_hectares: i128,
    pub with_insurance: bool,
    pub insurance_fee: i128,
    pub approvals: Vec<Address>,
    pub status: OrderStatus,
    pub created_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, tree_token)
    Config,
    /// Per-farmer escrow record
    Escrow(Address),
    MilestoneStreamSeq,
    MilestoneStream(u64),
    /// Vec<Address> of accounts authorised to approve wholesale orders.
    ApproverSet,
    /// Required number of distinct approvals (m) to finalise a wholesale order.
    ApprovalThreshold,
    WholesaleOrderSeq,
    WholesaleOrder(u64),
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
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, tree_token));
    }

    // ── Recurring Milestone Payment Stream (Closes #773) ──────────────────────

    /// Create an automated recurring milestone payment stream.
    /// The `funder` deposits `total_amount` into escrow. Funds are unlocked in `total_milestones`
    /// tranches as elapsed time reaches `milestone_interval_secs` and `verifier` approves green lights.
    pub fn create_milestone_stream(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
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
        token::Client::new(&env, &token).transfer(
            &funder,
            &env.current_contract_address(),
            &total_amount,
        );

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

        env.events().publish(
            (symbol_short!("strm_crtd"), stream_id),
            (funder, farmer, total_amount),
        );

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
            (symbol_short!("strm_pay"), stream_id),
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
        area_hectares: i128,
    ) {
        Self::deposit_internal(
            env,
            donor,
            None,
            farmer,
            token,
            amount,
            tree_count,
            area_hectares,
            false,
        );
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
        Self::deposit_internal(
            env,
            donor,
            Some(recipient_wallet),
            farmer,
            token,
            amount,
            tree_count,
            area_hectares,
            false,
        );
    }

    /// Donor deposits funds for a tree with optional 1-year survival insurance (+2% fee).
    /// If the tree dies within 1 year, the donor gets a full refund.
    pub fn deposit_with_insurance(
        env: Env,
        donor: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
    ) {
        Self::deposit_internal(env, donor, None, farmer, token, amount, tree_count, 0, true);
    }

    /// Shared deposit path for `deposit`, `sponsor_as_gift`, and `deposit_with_insurance`.
    ///
    /// Wholesale orders (`tree_count >= WHOLESALE_THRESHOLD_UNITS`) do not create an
    /// active `EscrowRecord` directly — see issue #1089. Funds are still pulled from
    /// the donor immediately (this is an escrow, not an IOU), but they're held against
    /// a `WholesaleOrder` in `PendingApprovals` state until enough configured approvers
    /// sign off via `approve_wholesale_order`. Smaller orders are unaffected and become
    /// an active `Funded` escrow immediately, exactly as before.
    fn deposit_internal(
        env: Env,
        donor: Address,
        gift_recipient: Option<Address>,
        farmer: Address,
        token: Address,
        amount: i128,
        tree_count: i128,
        area_hectares: i128,
        with_insurance: bool,
    ) {
        let _guard = ReentrancyGuard::acquire(&env);
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }
        if tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }

        let key = DataKey::Escrow(farmer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        let mut insurance_fee = 0i128;
        let mut total_transfer = amount;

        if with_insurance {
            insurance_fee = amount
                .checked_mul(INSURANCE_FEE_BPS as i128)
                .expect("insurance fee calculation overflow")
                .checked_div(BPS_DENOM)
                .expect("insurance fee division error");
            total_transfer = amount
                .checked_add(insurance_fee)
                .expect("total deposit calculation overflow");
        }

        // Cross-contract call — guard prevents reentrant deposit
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &total_transfer,
        );

        if tree_count >= WHOLESALE_THRESHOLD_UNITS {
            let order_id: u64 = env
                .storage()
                .instance()
                .get(&DataKey::WholesaleOrderSeq)
                .unwrap_or(0);
            let order_id = order_id + 1;

            let order = WholesaleOrder {
                order_id,
                donor: donor.clone(),
                gift_recipient,
                farmer: farmer.clone(),
                token,
                amount,
                tree_count,
                area_hectares,
                with_insurance,
                insurance_fee,
                approvals: Vec::new(&env),
                status: OrderStatus::PendingApprovals,
                created_at: env.ledger().timestamp(),
            };

            env.storage()
                .persistent()
                .set(&DataKey::WholesaleOrder(order_id), &order);
            env.storage()
                .instance()
                .set(&DataKey::WholesaleOrderSeq, &order_id);

            env.events().publish(
                (symbol_short!("ordr_pnd"), farmer),
                (order_id, amount, tree_count),
            );
            return;
        }

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
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
                planting_proof: zero_hash.clone(),
                survival_proof: zero_hash,
                survival_rate_percent: 0,
                deposit_time: env.ledger().timestamp(),
                has_insurance: with_insurance,
                insurance_fee,
            },
        );

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);
        if with_insurance {
            env.events().publish(
                (symbol_short!("insured"), donor),
                (insurance_fee, env.ledger().timestamp() + ONE_YEAR_SECS),
            );
        }
    }

    // ── Wholesale multi-signature approval (issue #1089) ───────────────────────

    /// Admin configures the approver set and required threshold (m-of-n) for
    /// wholesale orders. Replaces any previously configured set.
    pub fn configure_wholesale_approvers(env: Env, approvers: Vec<Address>, threshold: u32) {
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let count = approvers.len();
        if count == 0 || count > MAX_APPROVERS {
            panic_with_error!(&env, HarvestaError::InvalidSignerSet);
        }
        if threshold == 0 || threshold > count {
            panic_with_error!(&env, HarvestaError::InvalidThreshold);
        }
        for i in 0..approvers.len() {
            for j in (i + 1)..approvers.len() {
                if approvers.get(i).unwrap() == approvers.get(j).unwrap() {
                    panic_with_error!(&env, HarvestaError::InvalidSignerSet);
                }
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::ApproverSet, &approvers);
        env.storage()
            .instance()
            .set(&DataKey::ApprovalThreshold, &threshold);

        env.events()
            .publish((symbol_short!("apr_cfg"),), (threshold, count));
    }

    /// An approver signs off on a pending wholesale order. Duplicate approvals from
    /// the same address are rejected. Once the configured threshold of distinct
    /// approvers is reached, the order is atomically finalised into an active,
    /// `Funded` `EscrowRecord` — same shape a normal deposit would have produced.
    pub fn approve_wholesale_order(env: Env, approver: Address, order_id: u64) {
        let _guard = ReentrancyGuard::acquire(&env);
        approver.require_auth();

        let approver_set: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::ApproverSet)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::InvalidSignerSet));
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ApprovalThreshold)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::InvalidThreshold));

        let mut is_approver = false;
        for i in 0..approver_set.len() {
            if approver_set.get(i).unwrap() == approver {
                is_approver = true;
                break;
            }
        }
        if !is_approver {
            panic_with_error!(&env, HarvestaError::NotAPolicySigner);
        }

        let mut order: WholesaleOrder = env
            .storage()
            .persistent()
            .get(&DataKey::WholesaleOrder(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::WholesaleOrderNotFound));

        if order.status != OrderStatus::PendingApprovals {
            panic_with_error!(&env, HarvestaError::RequestNotOpen);
        }

        for i in 0..order.approvals.len() {
            if order.approvals.get(i).unwrap() == approver {
                panic_with_error!(&env, HarvestaError::AlreadyApproved);
            }
        }
        order.approvals.push_back(approver.clone());

        if order.approvals.len() < threshold {
            env.storage()
                .persistent()
                .set(&DataKey::WholesaleOrder(order_id), &order);
            env.events().publish(
                (symbol_short!("ordr_apr"), order.farmer.clone()),
                (order_id, order.approvals.len(), threshold),
            );
            return;
        }

        // Threshold reached — finalise into an active escrow.
        order.status = OrderStatus::Approved;
        env.storage()
            .persistent()
            .set(&DataKey::WholesaleOrder(order_id), &order);

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        let escrow_key = DataKey::Escrow(order.farmer.clone());
        if env.storage().persistent().has(&escrow_key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }
        env.storage().persistent().set(
            &escrow_key,
            &EscrowRecord {
                donor: order.donor.clone(),
                gift_recipient: order.gift_recipient.clone(),
                farmer: order.farmer.clone(),
                token: order.token.clone(),
                total_amount: order.amount,
                tree_count: order.tree_count,
                area_hectares: order.area_hectares,
                verified_tree_count: 0,
                tree_tokens_minted: 0,
                released: 0,
                progress_updates: 0,
                status: EscrowStatus::Funded,
                planted_at: 0,
                planting_proof: zero_hash.clone(),
                survival_proof: zero_hash,
                survival_rate_percent: 0,
                deposit_time: env.ledger().timestamp(),
                has_insurance: order.with_insurance,
                insurance_fee: order.insurance_fee,
            },
        );

        env.events().publish(
            (symbol_short!("ordr_ok"), order.farmer.clone()),
            (order_id, order.approvals.len()),
        );
    }

    /// Donor or admin cancels a pending wholesale order and refunds the donor in full.
    /// Cannot cancel an order that has already been approved.
    pub fn cancel_wholesale_order(env: Env, caller: Address, order_id: u64) {
        let _guard = ReentrancyGuard::acquire(&env);
        caller.require_auth();

        let mut order: WholesaleOrder = env
            .storage()
            .persistent()
            .get(&DataKey::WholesaleOrder(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::WholesaleOrderNotFound));

        if order.status == OrderStatus::Approved {
            panic_with_error!(&env, HarvestaError::CannotCancelFinalised);
        }
        if order.status == OrderStatus::Cancelled {
            panic_with_error!(&env, HarvestaError::RequestNotOpen);
        }

        let (admin, _) = Self::config(&env);
        if caller != order.donor && caller != admin {
            panic_with_error!(&env, HarvestaError::NotPolicyAdmin);
        }

        order.status = OrderStatus::Cancelled;
        let refund_total = order
            .amount
            .checked_add(order.insurance_fee)
            .expect("refund calculation overflow");
        let token = order.token.clone();
        let donor = order.donor.clone();
        env.storage()
            .persistent()
            .set(&DataKey::WholesaleOrder(order_id), &order);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &donor,
            &refund_total,
        );

        env.events().publish(
            (symbol_short!("ordr_cnl"), order.farmer.clone()),
            (order_id, refund_total),
        );
    }

    /// Returns the wholesale order by ID, or `None`.
    pub fn get_wholesale_order(env: Env, order_id: u64) -> Option<WholesaleOrder> {
        env.storage()
            .persistent()
            .get(&DataKey::WholesaleOrder(order_id))
    }

    /// Returns the configured (approvers, threshold), or `None` if unconfigured.
    pub fn get_wholesale_approvers(env: Env) -> Option<(Vec<Address>, u32)> {
        let approvers: Option<Vec<Address>> = env.storage().instance().get(&DataKey::ApproverSet);
        let threshold: Option<u32> = env.storage().instance().get(&DataKey::ApprovalThreshold);
        match (approvers, threshold) {
            (Some(a), Some(t)) => Some((a, t)),
            _ => None,
        }
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
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
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
            &env.current_contract_address(),
            &rec.farmer,
            &tranche1,
        );
        token::StellarAssetClient::new(&env, &tree_token).mint(&rec.donor, &tree_tokens);

        env.events()
            .publish((symbol_short!("planted"), farmer), tranche1);
        env.events()
            .publish((symbol_short!("treemint"), rec.donor), tree_tokens);
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
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != EscrowStatus::Planted {
            panic_with_error!(&env, HarvestaError::PlantingNotVerified);
        }
        if env.ledger().timestamp() < rec.planted_at + SIX_MONTHS_SECS {
            panic_with_error!(&env, HarvestaError::SurvivalPeriodNotElapsed);
        }

        let tranche2 = rec.total_amount - rec.released;
        if tranche2 <= 0 {
            panic_with_error!(&env, HarvestaError::NothingToRelease);
        }

        // CEI: update state before cross-contract call
        rec.released += tranche2;
        rec.status = EscrowStatus::Completed;
        rec.survival_proof = proof_hash;
        rec.survival_rate_percent = survival_rate_percent;
        env.storage().persistent().set(&key, &rec);

        // Cross-contract call — guard prevents reentrant exploitation
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &tranche2,
        );

        env.events()
            .publish((symbol_short!("survived"), farmer), tranche2);
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
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
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
            &env.current_contract_address(),
            &donor,
            &refund_amount,
        );

        env.events()
            .publish((symbol_short!("refund"), farmer), refund_amount);
    }

    /// Report that an insured tree has died within 1 year, triggering a full refund to the donor.
    /// Admin-only.
    pub fn report_dead_tree(env: Env, farmer: Address) {
        let _guard = ReentrancyGuard::acquire(&env);
        let (admin, _) = Self::config(&env);
        admin.require_auth();

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status == EscrowStatus::Refunded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
        }

        if !rec.has_insurance {
            panic_with_error!(&env, HarvestaError::InsuranceNotActive);
        }

        let start_time = if rec.planted_at > 0 {
            rec.planted_at
        } else {
            rec.deposit_time
        };
        let elapsed = env.ledger().timestamp().saturating_sub(start_time);
        if elapsed > ONE_YEAR_SECS {
            panic_with_error!(&env, HarvestaError::InsurancePeriodExpired);
        }

        let refund_amount = rec.total_amount;
        let token = rec.token.clone();
        let donor = rec.donor.clone();

        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &donor,
            &refund_amount,
        );

        env.events()
            .publish((symbol_short!("insref"), farmer.clone()), refund_amount);
        env.events()
            .publish((symbol_short!("refund"), farmer), refund_amount);
    }

    /// Donor claims full refund under the 1-year survival insurance guarantee if their tree has died.
    pub fn claim_insurance_refund(env: Env, farmer: Address) {
        let _guard = ReentrancyGuard::acquire(&env);

        let key = DataKey::Escrow(farmer.clone());
        let mut rec: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        rec.donor.require_auth();

        if rec.status == EscrowStatus::Refunded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
        }

        if !rec.has_insurance {
            panic_with_error!(&env, HarvestaError::InsuranceNotActive);
        }

        let start_time = if rec.planted_at > 0 {
            rec.planted_at
        } else {
            rec.deposit_time
        };
        let elapsed = env.ledger().timestamp().saturating_sub(start_time);
        if elapsed > ONE_YEAR_SECS {
            panic_with_error!(&env, HarvestaError::InsurancePeriodExpired);
        }

        let refund_amount = rec.total_amount;
        let token = rec.token.clone();
        let donor = rec.donor.clone();

        rec.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &rec);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &donor,
            &refund_amount,
        );

        env.events()
            .publish((symbol_short!("insref"), farmer.clone()), refund_amount);
        env.events()
            .publish((symbol_short!("refund"), farmer), refund_amount);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /// Query insurance status for a farmer's escrow: (has_insurance, insurance_fee, expires_at, is_active)
    pub fn get_insurance_info(env: Env, farmer: Address) -> (bool, i128, u64, bool) {
        if let Some(record) = env
            .storage()
            .persistent()
            .get::<_, EscrowRecord>(&DataKey::Escrow(farmer))
        {
            let start_time = if record.planted_at > 0 {
                record.planted_at
            } else {
                record.deposit_time
            };
            let expires_at = start_time + ONE_YEAR_SECS;
            let now = env.ledger().timestamp();
            let is_active = record.has_insurance
                && record.status != EscrowStatus::Refunded
                && now <= expires_at;
            (
                record.has_insurance,
                record.insurance_fee,
                expires_at,
                is_active,
            )
        } else {
            (false, 0, 0, false)
        }
    }

    /// Returns the escrow record for `farmer`, or `None`.
    pub fn get_record(env: Env, farmer: Address) -> Option<EscrowRecord> {
        env.storage().persistent().get(&DataKey::Escrow(farmer))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn token_unit(env: &Env, token: &Address) -> i128 {
        let decimals = token::Client::new(env, token).decimals();
        let mut unit = 1i128;
        for _ in 0..decimals {
            unit = unit
                .checked_mul(10)
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
        env.ledger().set_timestamp(1);

        let contract_id = env.register_contract(None, TreeEscrow);
        let client = TreeEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &token).mint(&donor, &100_000);

        // Tree token must have this contract as its admin
        let tree_token = env
            .register_stellar_asset_contract_v2(contract_id.clone())
            .address();

        client.initialize(&admin, &tree_token);

        Ctx {
            env,
            admin,
            donor,
            farmer,
            token,
            tree_token,
            client,
        }
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
        let ctx = setup();
        ctx.env.as_contract(&ctx.client.address, || {
            assert!(!ReentrancyGuard::is_locked(&ctx.env));
            {
                let _g = ReentrancyGuard::acquire(&ctx.env);
                assert!(ReentrancyGuard::is_locked(&ctx.env));
            }
            assert!(!ReentrancyGuard::is_locked(&ctx.env));
        });
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #200)")]
    fn test_guard_panics_on_reentrant_acquire() {
        let ctx = setup();
        ctx.env.as_contract(&ctx.client.address, || {
            let _g1 = ReentrancyGuard::acquire(&ctx.env);
            let _g2 = ReentrancyGuard::acquire(&ctx.env);
        });
    }

    #[test]
    fn test_guard_lock_cleared_after_panic() {
        let ctx = setup();
        ctx.env.as_contract(&ctx.client.address, || {
            let g = ReentrancyGuard::acquire(&ctx.env);
            assert!(ReentrancyGuard::is_locked(&ctx.env));
            drop(g);
            assert!(!ReentrancyGuard::is_locked(&ctx.env));
            let _g2 = ReentrancyGuard::acquire(&ctx.env);
            assert!(ReentrancyGuard::is_locked(&ctx.env));
        });
    }

    #[test]
    fn test_guard_sequential_acquires_succeed() {
        let ctx = setup();
        ctx.env.as_contract(&ctx.client.address, || {
            for _ in 0..5 {
                let _g = ReentrancyGuard::acquire(&ctx.env);
                assert!(ReentrancyGuard::is_locked(&ctx.env));
            }
            assert!(!ReentrancyGuard::is_locked(&ctx.env));
        });
    }

    // ── deposit ───────────────────────────────────────────────────────────────

    #[test]
    fn test_deposit_creates_escrow_record() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
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
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_deposit_zero_amount_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &0, &5, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_deposit_zero_tree_count_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &0, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_duplicate_deposit_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2, &0);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2, &0);
    }

    // ── verify_planting ───────────────────────────────────────────────────────

    #[test]
    fn test_verify_planting_releases_75_percent() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &10, &0);
        let before = bal(&ctx.env, &ctx.token, &ctx.farmer);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &10);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.farmer), before + 7_500);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.released, 7_500);
        assert_eq!(rec.status, EscrowStatus::Planted);
    }

    #[test]
    fn test_verify_planting_mints_tree_tokens_to_donor() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &10, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &10);
        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
        assert_eq!(bal(&ctx.env, &ctx.tree_token, &ctx.donor), 10 * tree_unit);
    }

    #[test]
    fn test_verify_planting_stores_proof_hash() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
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
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 2), &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_verify_planting_exceeds_tree_count_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &6);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_verify_planting_zero_count_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &0);
    }

    // ── verify_survival ───────────────────────────────────────────────────────

    #[test]
    fn test_verify_survival_releases_remaining_25_percent() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        let before = bal(&ctx.env, &ctx.token, &ctx.farmer);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.farmer), before + 2_500);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.released, 10_000);
        assert_eq!(rec.status, EscrowStatus::Completed);
    }

    #[test]
    fn test_verify_survival_stores_proof_and_rate() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 9), &75);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.survival_proof, proof(&ctx.env, 9));
        assert_eq!(rec.survival_rate_percent, 75);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_survival_too_early_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(86_400); // 1 day — far too early
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_survival_below_70_percent_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &69);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #22)")]
    fn test_survival_rate_above_100_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &101);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_survival_without_planting_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &80);
    }

    // ── refund ────────────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_planting_returns_funds_to_donor() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client.refund(&ctx.farmer);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn test_refund_after_planting_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &5);
        ctx.client.refund(&ctx.farmer);
    }

    // ── full lifecycle ────────────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle_fund_plant_survive() {
        let ctx = setup();

        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &3, &0);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Funded
        );

        ctx.client
            .verify_planting(&ctx.farmer, &proof(&ctx.env, 1), &3);
        assert_eq!(
            ctx.client.get_record(&ctx.farmer).unwrap().status,
            EscrowStatus::Planted
        );

        ctx.env.ledger().set_timestamp(SIX_MONTHS_SECS + 1);
        ctx.client
            .verify_survival(&ctx.farmer, &proof(&ctx.env, 2), &90);

        let tree_unit = 10i128.pow(token::Client::new(&ctx.env, &ctx.tree_token).decimals());
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

    // ── sponsor insurance (#1021) ─────────────────────────────────────────────

    #[test]
    fn test_deposit_with_insurance_transfers_fee_and_marks_insured() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        // 10_000 + 2% (200) = 10_200 total transferred
        ctx.client
            .deposit_with_insurance(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 10_200);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.total_amount, 10_000);
        assert!(rec.has_insurance);
        assert_eq!(rec.insurance_fee, 200);

        let (insured, fee, expires_at, is_active) = ctx.client.get_insurance_info(&ctx.farmer);
        assert!(insured);
        assert_eq!(fee, 200);
        assert_eq!(expires_at, rec.deposit_time + ONE_YEAR_SECS);
        assert!(is_active);
    }

    // ── Oracle survival reports (#394) ────────────────────────────────────────

    #[test]
    fn test_report_dead_tree_refunds_insured_donor_full_amount() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client
            .deposit_with_insurance(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);

        // Advance 60 days
        ctx.env.ledger().set_timestamp(60 * 24 * 60 * 60);

        // Tree dies within 1 year -> full refund of donation amount
        ctx.client.report_dead_tree(&ctx.farmer);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 200); // Only the 2% insurance fee spent

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    fn test_donor_claim_insurance_refund() {
        let ctx = setup();
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client
            .deposit_with_insurance(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);

        ctx.env.ledger().set_timestamp(100 * 24 * 60 * 60);

        ctx.client.claim_insurance_refund(&ctx.farmer);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 200);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #113)")]
    fn test_report_dead_tree_uninsured_rejected() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5, &0);
        ctx.client.report_dead_tree(&ctx.farmer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #114)")]
    fn test_report_dead_tree_after_1_year_expired_rejected() {
        let ctx = setup();
        ctx.client
            .deposit_with_insurance(&ctx.donor, &ctx.farmer, &ctx.token, &10_000, &5);

        // Advance 1 year + 1 day
        ctx.env.ledger().set_timestamp(ONE_YEAR_SECS + 86400);

        ctx.client.report_dead_tree(&ctx.farmer);
    }

    // ── Issue #1165: Invariant — total XLM locked equals sum of all sponsorships ──

    #[test]
    fn test_invariant_total_xlm_locked_equals_sum_of_sponsorships() {
        let ctx = setup();
        let amount1 = 10_000i128;
        let amount2 = 25_000i128;
        let farmer1 = Address::generate(&ctx.env);
        let farmer2 = Address::generate(&ctx.env);

        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.donor, &(amount1 + amount2));

        ctx.client
            .deposit(&ctx.donor, &farmer1, &ctx.token, &amount1, &5, &0);
        ctx.client
            .deposit(&ctx.donor, &farmer2, &ctx.token, &amount2, &10, &0);

        let total_locked = bal(&ctx.env, &ctx.token, &ctx.client.address);
        assert_eq!(total_locked, amount1 + amount2);
    }

    // ── Issue #1164: Load test — process 10,000 simultaneous sponsorships ──────────

    #[test]
    fn test_load_process_10000_simultaneous_sponsorships() {
        let ctx = setup();
        let count = 10_000u32;
        let single_amount = 1_000i128;
        let total_amount = single_amount * (count as i128);

        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.donor, &total_amount);

        for _ in 0..count {
            let farmer = Address::generate(&ctx.env);
            ctx.client
                .deposit(&ctx.donor, &farmer, &ctx.token, &single_amount, &1, &0);
        }

        let total_locked = bal(&ctx.env, &ctx.token, &ctx.client.address);
        assert_eq!(total_locked, total_amount);
    }

    // ── Issue #1163: Edge case — prevent double sponsoring same tree ──────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_prevent_double_sponsoring_same_tree() {
        let ctx = setup();
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2, &0);
        // Attempting to deposit for the same tree/farmer escrow record fails
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &5_000, &2, &0);
    }

    // ── Issue #1089: Wholesale multi-signature approval ────────────────────────

    /// Configures a 2-of-3 approver set and mints enough token balance on `ctx`
    /// for a wholesale-sized deposit. Returns the three approver addresses.
    fn setup_wholesale(ctx: &Ctx) -> (Address, Address, Address) {
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.donor, &1_000_000);
        let a1 = Address::generate(&ctx.env);
        let a2 = Address::generate(&ctx.env);
        let a3 = Address::generate(&ctx.env);
        let mut approvers = Vec::new(&ctx.env);
        approvers.push_back(a1.clone());
        approvers.push_back(a2.clone());
        approvers.push_back(a3.clone());
        ctx.client.configure_wholesale_approvers(&approvers, &2);
        (a1, a2, a3)
    }

    #[test]
    fn test_deposit_below_wholesale_threshold_creates_escrow_immediately() {
        let ctx = setup();
        // One unit below the wholesale threshold — behaves exactly like a normal deposit.
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &50_000, &9_999, &0);
        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Funded);
        assert_eq!(rec.tree_count, 9_999);
    }

    #[test]
    fn test_deposit_at_wholesale_threshold_creates_pending_order_not_escrow() {
        let ctx = setup();
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.donor, &1_000_000);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        // No active escrow record yet — it's gated behind approvals.
        assert!(ctx.client.get_record(&ctx.farmer).is_none());

        let order = ctx.client.get_wholesale_order(&1).unwrap();
        assert_eq!(order.status, OrderStatus::PendingApprovals);
        assert_eq!(order.tree_count, 10_000);
        assert_eq!(order.amount, 500_000);
        assert_eq!(order.farmer, ctx.farmer);
        assert_eq!(order.approvals.len(), 0);
    }

    #[test]
    fn test_wholesale_deposit_locks_funds_in_contract_immediately() {
        let ctx = setup();
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.donor, &1_000_000);
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before - 500_000);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.client.address), 500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_configure_approvers_zero_threshold_rejected() {
        let ctx = setup();
        let mut approvers = Vec::new(&ctx.env);
        approvers.push_back(Address::generate(&ctx.env));
        ctx.client.configure_wholesale_approvers(&approvers, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #103)")]
    fn test_configure_approvers_duplicate_signers_rejected() {
        let ctx = setup();
        let a1 = Address::generate(&ctx.env);
        let mut approvers = Vec::new(&ctx.env);
        approvers.push_back(a1.clone());
        approvers.push_back(a1);
        ctx.client.configure_wholesale_approvers(&approvers, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #102)")]
    fn test_configure_approvers_threshold_above_signer_count_rejected() {
        let ctx = setup();
        let mut approvers = Vec::new(&ctx.env);
        approvers.push_back(Address::generate(&ctx.env));
        ctx.client.configure_wholesale_approvers(&approvers, &2);
    }

    #[test]
    fn test_approve_wholesale_order_below_threshold_stays_pending() {
        let ctx = setup();
        let (a1, _a2, _a3) = setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        ctx.client.approve_wholesale_order(&a1, &1);

        let order = ctx.client.get_wholesale_order(&1).unwrap();
        assert_eq!(order.status, OrderStatus::PendingApprovals);
        assert_eq!(order.approvals.len(), 1);
        assert!(ctx.client.get_record(&ctx.farmer).is_none());
    }

    #[test]
    fn test_approve_wholesale_order_reaching_threshold_finalises_escrow() {
        let ctx = setup();
        let (a1, a2, _a3) = setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        ctx.client.approve_wholesale_order(&a1, &1);
        ctx.client.approve_wholesale_order(&a2, &1);

        let order = ctx.client.get_wholesale_order(&1).unwrap();
        assert_eq!(order.status, OrderStatus::Approved);
        assert_eq!(order.approvals.len(), 2);

        let rec = ctx.client.get_record(&ctx.farmer).unwrap();
        assert_eq!(rec.status, EscrowStatus::Funded);
        assert_eq!(rec.total_amount, 500_000);
        assert_eq!(rec.tree_count, 10_000);
        assert_eq!(rec.donor, ctx.donor);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #105)")]
    fn test_approve_wholesale_order_by_non_approver_rejected() {
        let ctx = setup();
        setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        let stranger = Address::generate(&ctx.env);
        ctx.client.approve_wholesale_order(&stranger, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #104)")]
    fn test_approve_wholesale_order_duplicate_approval_rejected() {
        let ctx = setup();
        let (a1, _a2, _a3) = setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        ctx.client.approve_wholesale_order(&a1, &1);
        ctx.client.approve_wholesale_order(&a1, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #106)")]
    fn test_approve_already_finalised_order_rejected() {
        let ctx = setup();
        let (a1, a2, a3) = setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        ctx.client.approve_wholesale_order(&a1, &1);
        ctx.client.approve_wholesale_order(&a2, &1); // finalises at threshold=2
        ctx.client.approve_wholesale_order(&a3, &1); // order no longer open
    }

    #[test]
    fn test_cancel_wholesale_order_refunds_donor_in_full() {
        let ctx = setup();
        setup_wholesale(&ctx);
        let before = bal(&ctx.env, &ctx.token, &ctx.donor);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);

        ctx.client.cancel_wholesale_order(&ctx.donor, &1);

        let order = ctx.client.get_wholesale_order(&1).unwrap();
        assert_eq!(order.status, OrderStatus::Cancelled);
        assert_eq!(bal(&ctx.env, &ctx.token, &ctx.donor), before);
        assert!(ctx.client.get_record(&ctx.farmer).is_none());
    }

    #[test]
    fn test_cancel_wholesale_order_by_admin_allowed() {
        let ctx = setup();
        setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);
        ctx.client.cancel_wholesale_order(&ctx.admin, &1);
        let order = ctx.client.get_wholesale_order(&1).unwrap();
        assert_eq!(order.status, OrderStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #108)")]
    fn test_cancel_wholesale_order_by_stranger_rejected() {
        let ctx = setup();
        setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);
        let stranger = Address::generate(&ctx.env);
        ctx.client.cancel_wholesale_order(&stranger, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #111)")]
    fn test_cancel_already_approved_order_rejected() {
        let ctx = setup();
        let (a1, a2, _a3) = setup_wholesale(&ctx);
        ctx.client
            .deposit(&ctx.donor, &ctx.farmer, &ctx.token, &500_000, &10_000, &0);
        ctx.client.approve_wholesale_order(&a1, &1);
        ctx.client.approve_wholesale_order(&a2, &1); // finalises
        ctx.client.cancel_wholesale_order(&ctx.donor, &1);
    }
}
