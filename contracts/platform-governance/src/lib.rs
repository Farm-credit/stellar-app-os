#![no_std]

//! Platform Governance Contract
//!
//! On-chain governance for platform parameters.
//! Token holders can propose and vote on:
//! - Platform fee percentage
//! - Minimum planting bond
//! - Verifier whitelist
//!
//! # Design
//!
//! - Token holders can create proposals with description hash and options
//! - Voting power is proportional to staked tokens (from verifier-staking)
//! - Quorum: 10% of total staked tokens required for proposal validity
//! - Timelock: 48h after vote closes before execution
//! - Successful proposals can be executed to update platform parameters
//! - Liquid democracy: users may delegate their voting power to a registered delegate
//!
//! # Storage layout
//!   Instance:
//!     ADMIN              — Address   (admin for contract management)
//!     STAKING_CONTRACT   — Address   (verifier-staking contract for voting power)
//!     ADMIN_CONTROLS     — Address   (admin-controls contract for parameter updates)
//!     PROPOSAL_COUNT     — u64       (total proposals created)
//!     QUORUM_PERCENTAGE  — u64       (quorum requirement, default 10%)
//!     TIMELOCK_SECONDS   — u64       (timelock period, default 172800 = 48h)
//!     PLATFORM_FEE       — u64       (current platform fee percentage)
//!     MIN_PLANTING_BOND  — i128      (current minimum planting bond)
//!   Persistent (keyed by proposal ID u64):
//!     proposal:<id>      — ProposalRecord
//!   Persistent (keyed by proposal ID + voter address):
//!     vote:<id>:<addr>   — VoteRecord
//!   Persistent:
//!     verifier_whitelist — Vec<Address> (whitelisted verifiers)
//!   Persistent (keyed by delegate address):
//!     DLGT:<addr>        — DelegateRecord (registered delegate info)
//!   Persistent (keyed by delegator address):
//!     DLGN:<addr>        — Address (the delegate this address has delegated to)
//!   Persistent (keyed by delegate address):
//!     DLGRS:<addr>       — Vec<Address> (addresses that delegated to this delegate)
//!   Persistent (keyed by planter address):
//!     VEST:<addr>        — VestingSchedule (linear token lockup for planters)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
    String, Symbol, Vec,
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, String, Symbol, Val, Vec,
};

// ── Error codes ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovernanceError {
    /// No TREE tokens are locked for this voter
    NoLockedTokens = 200,
    /// Lock amount must be positive
    LockAmountMustBePositive = 201,
    /// Requested unlock amount exceeds locked balance
    InsufficientLockedBalance = 202,
    /// Tokens are still time-locked and cannot be withdrawn yet
    LockNotYetExpired = 203,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Proposal type for different governance actions
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalType {
    PlatformFee,
    MinPlantingBond,
    VerifierWhitelist,
    SpeciesSelection,
}

/// Proposal status lifecycle
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    /// Queued for execution — 48-hour timelock is running from `queued_at`
    Queued,
    Rejected,
    Executed,
    Expired,
    /// Proposal was cancelled by the veto council
    Cancelled,
}

/// Vote option for multi-choice proposals
#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteOption {
    pub option_id: u32,
    pub description: String,
}

/// Tally of votes for each option
#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteTally {
    pub option_id: u32,
    pub votes: i128,
}

/// On-chain record of a governance proposal
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProposalRecord {
    /// Unique proposal ID
    pub id: u64,
    /// Hash of proposal description (off-chain details)
    pub description_hash: String,
    /// Type of proposal
    pub proposal_type: ProposalType,
    /// Available voting options
    pub options: Vec<VoteOption>,
    /// Proposer address
    pub proposer: Address,
    /// Current status
    pub status: ProposalStatus,
    /// Vote tallies for each option
    pub tally: Vec<VoteTally>,
    /// Total votes cast (in token units)
    pub total_votes: i128,
    /// Creation timestamp
    pub created_at: u64,
    /// Voting end timestamp
    pub voting_ends_at: u64,
    /// Earliest execution timestamp (after timelock, computed from queued_at)
    pub executable_at: u64,
    /// Timestamp when the proposal was queued (0 = not yet queued)
    pub queued_at: u64,
}

/// Record of a single vote
#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteRecord {
    /// Voter address
    pub voter: Address,
    /// Option ID voted for
    pub option_id: u32,
    /// Voting power (own staked balance + delegated power at time of vote)
    pub power: i128,
    /// Timestamp of vote
    pub voted_at: u64,
}

/// Record of a registered liquid-democracy delegate
#[contracttype]
#[derive(Clone, Debug)]
pub struct DelegateRecord {
    /// The delegate's address
    pub delegate: Address,
    /// Self-described governance domain (e.g. "climate", "verifier")
    pub domain: String,
    /// Timestamp of registration
    pub registered_at: u64,
}

/// Record of a voter's locked TREE tokens used for quadratic voting power.
///
/// Locking is non-custodial from a governance perspective: tokens are held
/// in this contract and can be unlocked by the owner at any time
/// (subject to an optional minimum lock period stored in `locked_until`).
#[contracttype]
#[derive(Clone, Debug)]
pub struct TokenLock {
    /// Voter who owns these locked tokens
    pub voter: Address,
    /// TREE token contract address
    pub token: Address,
    /// Total amount currently locked (in token's native units / stroops)
    pub amount: i128,
    /// Computed quadratic voting power = isqrt(amount)
    pub voting_power: i128,
    /// Earliest unlock timestamp (0 = unlockable immediately)
    pub locked_until: u64,
/// Linear vesting schedule for community tree planter rewards.
///
/// Tokens are released linearly between `start_at + cliff_seconds` and
/// `start_at + vesting_seconds`.  Before the cliff the vested amount is
/// always zero; after the full duration the entire `total_amount` is
/// available.  `claimed_amount` tracks tokens already withdrawn so a
/// planter can claim progressively.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingSchedule {
    /// Beneficiary planter address
    pub planter: Address,
    /// Governance token contract address
    pub token: Address,
    /// Total tokens allocated to this schedule
    pub total_amount: i128,
    /// Tokens already claimed by the planter
    pub claimed_amount: i128,
    /// Schedule start (ledger timestamp)
    pub start_at: u64,
    /// Cliff duration in seconds — nothing vests before this offset
    pub cliff_seconds: u64,
    /// Total vesting duration in seconds (from start_at)
    pub vesting_seconds: u64,
    /// Timestamp when the schedule was created
    pub created_at: u64,
    /// True if admin revoked this schedule before completion
    pub revoked: bool,
    /// Timestamp when the schedule was revoked (0 = not revoked)
    pub revoked_at: u64,
}

// ── Governance errors

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum GovernanceError {
    NotInitialized = 1,
    Unauthorized = 2,
    NoStakedTokens = 3,
    // ── Vesting errors ────────────────────────────────────────────────────
    VestingAmountMustBePositive = 4,
    VestingDurationZero = 5,
    VestingCliffExceedsDuration = 6,
    VestingScheduleExists = 7,
    VestingScheduleNotFound = 8,
    VestingNothingToClaim = 9,
    VestingAlreadyRevoked = 10,
    VestingTransferFailed = 11,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

fn admin_key() -> Symbol {
    symbol_short!("ADMIN")
}

fn staking_contract_key() -> Symbol {
    symbol_short!("STAKING")
}

fn admin_controls_key() -> Symbol {
    symbol_short!("ADM_CTRL")
}

fn proposal_count_key() -> Symbol {
    symbol_short!("PROP_CNT")
}

fn quorum_percentage_key() -> Symbol {
    symbol_short!("QUORUM_P")
}

fn timelock_seconds_key() -> Symbol {
    symbol_short!("TIMELOCK")
}

fn platform_fee_key() -> Symbol {
    symbol_short!("PLAT_FEE")
}

fn min_planting_bond_key() -> Symbol {
    symbol_short!("MIN_BND")
}

fn verifier_whitelist_key() -> Symbol {
    symbol_short!("VER_WL")
}

fn veto_council_key() -> Symbol {
    symbol_short!("VETO_C")
}

fn proposal_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("PROPOSAL"), id)
}

fn vote_key(proposal_id: u64, voter: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("VOTE"), proposal_id, voter.clone())
}

/// Key for a voter's token lock record.
fn token_lock_key(voter: &Address) -> (Symbol, Address) {
    (symbol_short!("TLOCK"), voter.clone())
}

/// Key for the TREE token contract address used for lock deposits.
fn tree_token_key() -> Symbol {
    symbol_short!("TREE_TOK")
}

/// Key for the minimum lock period in seconds (0 = no minimum).
fn min_lock_seconds_key() -> Symbol {
    symbol_short!("MIN_LOCK")
}

/// Key for a registered delegate's DelegateRecord.
fn delegate_info_key(delegate: &Address) -> (Symbol, Address) {
    (symbol_short!("DLGT"), delegate.clone())
}

/// Key for storing which delegate address a given delegator has chosen.
fn delegation_key(delegator: &Address) -> (Symbol, Address) {
    (symbol_short!("DLGN"), delegator.clone())
}

/// Key for storing the list of delegators that have delegated to a delegate.
fn delegators_key(delegate: &Address) -> (Symbol, Address) {
    (symbol_short!("DLGRS"), delegate.clone())
}

/// Bucket index of the current day for the 30-day participation window.
fn participation_day_key() -> Symbol {
    symbol_short!("PART_D")
}

/// Circular buffer holding daily active voting power sums (30 slots).
fn participation_buckets_key() -> Symbol {
    symbol_short!("PART_B")
}

/// Key for a planter's vesting schedule (persistent).
fn vesting_key(planter: &Address) -> (Symbol, Address) {
    (symbol_short!("VEST"), planter.clone())
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_QUORUM_PERCENTAGE: u64 = 10; // 10%
const DEFAULT_TIMELOCK_SECONDS: u64 = 172800; // 48 hours
#[allow(dead_code)]
const DEFAULT_PLATFORM_FEE: u64 = 5; // 5%
#[allow(dead_code)]
const DEFAULT_MIN_PLANTING_BOND: i128 = 1_000_000; // 1M tokens

// Dynamic quorum configuration
const PARTICIPATION_WINDOW_DAYS: u32 = 30;
const SECONDS_PER_DAY: u64 = 86400;
const MIN_DYNAMIC_QUORUM: u64 = 5;
const MAX_DYNAMIC_QUORUM: u64 = 25;
const BASIS_POINTS: u64 = 10000;

// Storage TTL constants (ledgers)
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_LEDGERS: u32 = 103_680;
const PERSISTENT_TTL_THRESHOLD: u32 = 120_960;
const PERSISTENT_TTL_LEDGERS: u32 = 518_400;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlatformGovernance;

#[contractimpl]
impl PlatformGovernance {
    /// One-time initialisation.
    ///
    /// `admin`              — admin address for contract management
    /// `staking_contract`   — verifier-staking contract (legacy; kept for compatibility)
    /// `admin_controls`     — admin-controls contract for parameter updates
    /// `platform_fee`       — initial platform fee percentage
    /// `min_planting_bond`  — initial minimum planting bond
    /// `tree_token`         — TREE SAC token address used for voting power locks
    pub fn initialize(
        env: Env,
        admin: Address,
        staking_contract: Address,
        admin_controls: Address,
        platform_fee: u64,
        min_planting_bond: i128,
        tree_token: Address,
    ) {
        if env.storage().instance().has(&admin_key()) {
            panic!("already initialized");
        }
        env.storage().instance().set(&admin_key(), &admin);
        env.storage()
            .instance()
            .set(&staking_contract_key(), &staking_contract);
        env.storage()
            .instance()
            .set(&admin_controls_key(), &admin_controls);
        env.storage()
            .instance()
            .set(&quorum_percentage_key(), &DEFAULT_QUORUM_PERCENTAGE);
        env.storage()
            .instance()
            .set(&timelock_seconds_key(), &DEFAULT_TIMELOCK_SECONDS);
        env.storage()
            .instance()
            .set(&platform_fee_key(), &platform_fee);
        env.storage()
            .instance()
            .set(&min_planting_bond_key(), &min_planting_bond);
        env.storage()
            .instance()
            .set(&proposal_count_key(), &0u64);
        env.storage()
            .instance()
            .set(&tree_token_key(), &tree_token);
        env.storage()
            .instance()
            .set(&min_lock_seconds_key(), &0u64);
        env.storage().instance().set(&proposal_count_key(), &0u64);

        // Initialize empty verifier whitelist
        let whitelist: Vec<Address> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&verifier_whitelist_key(), &whitelist);
        Self::bump_instance(&env);
        Self::bump_persistent(&env, &verifier_whitelist_key());
    }

    /// Create a new governance proposal.
    ///
    /// `description_hash`  — hash of proposal description (off-chain details)
    /// `proposal_type`     — type of proposal (PlatformFee, MinPlantingBond, VerifierWhitelist)
    /// `options`           — voting options for the proposal
    /// `voting_period`     — voting window in seconds
    /// `proposer`          — address creating the proposal
    pub fn create_proposal(
        env: Env,
        description_hash: String,
        proposal_type: ProposalType,
        options: Vec<VoteOption>,
        voting_period: u64,
        proposer: Address,
    ) {
        Self::assert_not_paused(&env);

        proposer.require_auth();

        if options.is_empty() {
            panic!("must have at least one voting option");
        }
        if voting_period == 0 {
            panic!("voting period must be > 0");
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&proposal_count_key())
            .unwrap_or(0);

        let _timelock: u64 = env
            .storage()
            .instance()
            .get(&timelock_seconds_key())
            .expect("not initialized");

        let now = env.ledger().timestamp();

        // Initialize tally for each option
        let mut tally = Vec::new(&env);
        for option in options.iter() {
            tally.push_back(VoteTally {
                option_id: option.option_id,
                votes: 0,
            });
        }

        let proposal = ProposalRecord {
            id,
            description_hash: description_hash.clone(),
            proposal_type: proposal_type.clone(),
            options: options.clone(),
            proposer: proposer.clone(),
            status: ProposalStatus::Active,
            tally,
            total_votes: 0,
            created_at: now,
            voting_ends_at: now + voting_period,
            executable_at: 0, // set when queued
            queued_at: 0,
        };

        env.storage().persistent().set(&proposal_key(id), &proposal);
        Self::bump_persistent(&env, &proposal_key(id));
        env.storage()
            .instance()
            .set(&proposal_count_key(), &(id + 1));
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("created")),
            (id, proposal_type, description_hash),
        );
    }

    /// Vote on a proposal.
    ///
    /// If `voter` has delegated their power, this panics — they must retract
    /// the delegation first.  If `voter` is a registered delegate, their
    /// effective voting power includes the staked balances of every address
    /// that has delegated to them (direct delegation only; not transitive).
    ///
    /// `proposal_id` — proposal to vote on
    /// `option_id`  — option to vote for
    /// `voter`      — address voting
    pub fn vote(env: Env, proposal_id: u64, option_id: u32, voter: Address) {
        Self::assert_not_paused(&env);

        voter.require_auth();

        // Block voters that have delegated their power to someone else.
        if env.storage().persistent().has(&delegation_key(&voter)) {
            panic!("voting power delegated; retract delegation before voting");
        }

        let mut proposal: ProposalRecord = env
            .storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Active {
            panic!("proposal is not active");
        }

        let now = env.ledger().timestamp();
        if now > proposal.voting_ends_at {
            panic!("voting period has ended");
        }

        // Check if already voted
        if env
            .storage()
            .persistent()
            .has(&vote_key(proposal_id, &voter))
        {
            panic!("already voted on this proposal");
        }

        // Get quadratic voting power from locked TREE tokens
        let staking_contract: Address = env
            .storage()
            .instance()
            .get(&staking_contract_key())
            .expect("not initialized");
        let own_power = Self::get_voting_power(&env, &staking_contract, &voter);
        let delegated_power = Self::aggregate_delegated_power(&env, &staking_contract, &voter);
        let power = own_power + delegated_power;

        // Get raw voting power (staked token amount)
        let own_power = Self::get_voting_power(&env, &staking_contract, &voter);

        // Add delegated power from all direct delegators.
        let delegated_power = Self::aggregate_delegated_power(&env, &staking_contract, &voter);

        let raw_power = own_power + delegated_power;

        if power <= 0 {
            panic!("must lock TREE tokens to vote");
        }

        // Track this voter's activity for the rolling 30-day window used to
        // dynamically adjust quorum requirements.
        Self::record_participation(&env, raw_power);

        // Apply quadratic voting for SpeciesSelection proposals
        // Voting power = sqrt(token holdings)
        let power = if proposal.proposal_type == ProposalType::SpeciesSelection {
            Self::isqrt(raw_power)
        } else {
            raw_power
        };

        // Validate option_id exists
        let option_exists = proposal
            .options
            .iter()
            .any(|opt| opt.option_id == option_id);
        if !option_exists {
            panic!("invalid option_id");
        }

        // Record vote
        let vote_record = VoteRecord {
            voter: voter.clone(),
            option_id,
            power,
            voted_at: now,
        };
        env.storage()
            .persistent()
            .set(&vote_key(proposal_id, &voter), &vote_record);
        Self::bump_persistent(&env, &vote_key(proposal_id, &voter));

        // Update proposal tally
        let mut new_tally = Vec::new(&env);
        for tally_entry in proposal.tally.iter() {
            let mut entry = tally_entry.clone();
            if entry.option_id == option_id {
                entry.votes += power;
            }
            new_tally.push_back(entry);
        }
        proposal.tally = new_tally;
        proposal.total_votes += power;

        // Check if proposal meets quorum
        let total_staked = Self::get_total_staked(&env, &staking_contract);        let quorum_percentage: u64 = env
            .storage()
            .instance()
            .get(&quorum_percentage_key())
            .expect("not initialized");

        let quorum_threshold = (total_staked * quorum_percentage as i128) / 100;

        if proposal.total_votes >= quorum_threshold {
            // Check if there's a winning option (simple majority)
            let mut max_votes = 0i128;
            let mut winning_option_id = 0u32;

            for tally_entry in proposal.tally.iter() {
                if tally_entry.votes > max_votes {
                    max_votes = tally_entry.votes;
                    winning_option_id = tally_entry.option_id;
                }
            }

            // Check if winning option has majority (>50% of votes cast)
            if max_votes > proposal.total_votes / 2 {
                proposal.status = ProposalStatus::Passed;
            }

            let _ = winning_option_id;
        }

        env.storage()
            .persistent()
            .set(&proposal_key(proposal_id), &proposal);
        Self::bump_persistent(&env, &proposal_key(proposal_id));
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("vote"), proposal_id),
            (voter, option_id, power),
        );
    }

    /// Queue a passed proposal for execution, starting the 48-hour timelock.
    ///
    /// This is a mandatory step between a proposal passing and being executed.
    /// Any address may call `queue` — it is permissionless because the proposal
    /// has already been democratically approved. The timelock begins at the
    /// ledger timestamp of this call.
    ///
    /// # Errors
    /// - Panics with `"proposal not found"` if `proposal_id` does not exist.
    /// - Panics with `"proposal has not passed"` if status is not `Passed`.
    ///
    /// # Events
    /// Emits `("proposal", "queued")` with `(proposal_id, executable_at)`.
    pub fn queue(env: Env, proposal_id: u64) {
        Self::assert_not_paused(&env);

        let mut proposal: ProposalRecord = env
            .storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Passed {
            panic!("proposal has not passed");
        }

        let timelock: u64 = env
            .storage()
            .instance()
            .get(&timelock_seconds_key())
            .expect("not initialized");

        let now = env.ledger().timestamp();
        let executable_at = now + timelock;

        proposal.status = ProposalStatus::Queued;
        proposal.queued_at = now;
        proposal.executable_at = executable_at;

        env.storage()
            .persistent()
            .set(&proposal_key(proposal_id), &proposal);
        Self::bump_persistent(&env, &proposal_key(proposal_id));

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("queued")),
            (proposal_id, executable_at),
        );
    }

    /// Execute a queued proposal to update platform parameters.
    ///
    /// The proposal must be in `Queued` status and the 48-hour timelock
    /// (measured from `queued_at`) must have elapsed.
    ///
    /// Any address may call `execute` — it is permissionless.
    ///
    /// # Errors
    /// - Panics with `"proposal not found"` if `proposal_id` does not exist.
    /// - Panics with `"proposal not queued for execution"` if status is not `Queued`.
    /// - Panics with `"timelock period has not elapsed"` if called too early.
    ///
    /// # Events
    /// Emits `("proposal", "executed")` with `(proposal_id, proposal_type)`.
    pub fn execute(env: Env, proposal_id: u64) {
        Self::assert_not_paused(&env);

        let mut proposal: ProposalRecord = env
            .storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Queued {
            panic!("proposal not queued for execution");
        }

        let now = env.ledger().timestamp();
        if now < proposal.executable_at {
            panic!("timelock period has not elapsed");
        }

        // Find winning option
        let mut max_votes = 0i128;
        let mut winning_option_id = 0u32;

        for tally_entry in proposal.tally.iter() {
            if tally_entry.votes > max_votes {
                max_votes = tally_entry.votes;
                winning_option_id = tally_entry.option_id;
            }
        }

        // Execute based on proposal type and winning option
        match proposal.proposal_type {
            ProposalType::PlatformFee => {
                if let Some(option) = proposal
                    .options
                    .iter()
                    .find(|opt| opt.option_id == winning_option_id)
                {
                    let new_fee = Self::parse_fee_from_description(&option.description);
                    env.storage().instance().set(&platform_fee_key(), &new_fee);
                }
            }
            ProposalType::MinPlantingBond => {
                if let Some(option) = proposal
                    .options
                    .iter()
                    .find(|opt| opt.option_id == winning_option_id)
                {
                    let new_bond = Self::parse_bond_from_description(&option.description);
                    env.storage()
                        .instance()
                        .set(&min_planting_bond_key(), &new_bond);
                }
            }
            ProposalType::VerifierWhitelist => {
                if let Some(option) = proposal
                    .options
                    .iter()
                    .find(|opt| opt.option_id == winning_option_id)
                {
                    Self::update_verifier_whitelist(&env, &option.description);
                }
            }
            ProposalType::SpeciesSelection => {
                // Species selection proposals are informational
                // The winning species is recorded but no contract state is updated
                // In production, this might trigger an event or update a species registry
                env.events().publish(
                    (symbol_short!("species"), symbol_short!("selected")),
                    (proposal_id, winning_option_id),
                );
            }
        }

        proposal.status = ProposalStatus::Executed;
        env.storage()
            .persistent()
            .set(&proposal_key(proposal_id), &proposal);
        Self::bump_persistent(&env, &proposal_key(proposal_id));

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("executed")),
            (proposal_id, proposal.proposal_type),
        );
    }

    // ── Quadratic voting token lock (issue #761) ──────────────────────────────

    /// Lock TREE tokens to establish quadratic voting power.
    ///
    /// Voting power is computed as `isqrt(total_locked_amount)`. Successive
    /// calls add to the existing lock — tokens are accumulated, not replaced.
    ///
    /// # Authorization
    /// `voter` must sign.
    ///
    /// # Parameters
    /// * `voter`  — address locking tokens (must sign)
    /// * `amount` — number of TREE tokens to lock (in stroops)
    ///
    /// # Errors
    /// Panics with `LockAmountMustBePositive` if `amount <= 0`.
    pub fn lock_tokens(env: Env, voter: Address, amount: i128) {
        use crate::GovernanceError;
        voter.require_auth();

        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, GovernanceError::LockAmountMustBePositive);
        }

        let tree_token: Address = env
            .storage()
            .instance()
            .get(&tree_token_key())
            .expect("tree token not configured");

        // Transfer tokens from voter into this contract
        token::Client::new(&env, &tree_token).transfer(
            &voter,
            &env.current_contract_address(),
            &amount,
        );

        let min_lock: u64 = env
            .storage()
            .instance()
            .get(&min_lock_seconds_key())
            .unwrap_or(0);

        let locked_until = if min_lock > 0 {
            env.ledger()
                .timestamp()
                .checked_add(min_lock)
                .expect("lock expiry overflow")
        } else {
            0
        };

        // Accumulate into existing lock
        let existing: Option<TokenLock> = env
            .storage()
            .persistent()
            .get(&token_lock_key(&voter));

        let new_amount = match existing {
            Some(lock) => lock
                .amount
                .checked_add(amount)
                .expect("locked balance overflow"),
            None => amount,
        };

        let voting_power = Self::isqrt(new_amount);

        env.storage().persistent().set(
            &token_lock_key(&voter),
            &TokenLock {
                voter: voter.clone(),
                token: tree_token,
                amount: new_amount,
                voting_power,
                locked_until,
            },
        );

        env.events().publish(
            (symbol_short!("tok_lock"), voter),
            (new_amount, voting_power),
        );
    }

    /// Unlock previously locked TREE tokens.
    ///
    /// Reduces the lock by `amount`. Voting power is recomputed on the
    /// remaining balance.
    ///
    /// # Authorization
    /// `voter` must sign.
    ///
    /// # Errors
    /// - `NoLockedTokens`           — voter has no lock record
    /// - `InsufficientLockedBalance` — requested amount exceeds lock
    /// - `LockNotYetExpired`         — minimum lock period not elapsed
    pub fn unlock_tokens(env: Env, voter: Address, amount: i128) {
        use crate::GovernanceError;
        voter.require_auth();

        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, GovernanceError::LockAmountMustBePositive);
        }

        let mut lock: TokenLock = env
            .storage()
            .persistent()
            .get(&token_lock_key(&voter))
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(&env, GovernanceError::NoLockedTokens)
            });

        if lock.locked_until > 0 && env.ledger().timestamp() < lock.locked_until {
            soroban_sdk::panic_with_error!(&env, GovernanceError::LockNotYetExpired);
        }

        if amount > lock.amount {
            soroban_sdk::panic_with_error!(&env, GovernanceError::InsufficientLockedBalance);
        }

        lock.amount = lock.amount.checked_sub(amount).expect("underflow");
        lock.voting_power = Self::isqrt(lock.amount);

        // Transfer back to voter
        token::Client::new(&env, &lock.token).transfer(
            &env.current_contract_address(),
            &voter,
            &amount,
        );

        env.storage()
            .persistent()
            .set(&token_lock_key(&voter), &lock);

        env.events().publish(
            (symbol_short!("tok_unlk"), voter),
            (lock.amount, lock.voting_power),
        );
    }

    /// Returns the `TokenLock` record for `voter`, or `None` if no tokens
    /// are locked.
    pub fn locked_balance(env: Env, voter: Address) -> Option<TokenLock> {
        env.storage()
            .persistent()
            .get(&token_lock_key(&voter))
    }

    /// Set the minimum lock period in seconds. Admin only.
    /// Pass 0 to disable (tokens immediately unlockable).
    pub fn set_min_lock_seconds(env: Env, seconds: u64) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&min_lock_seconds_key(), &seconds);
        env.events()
            .publish((symbol_short!("min_lock"),), seconds);
    }

    // ── Liquid democracy ──────────────────────────────────────────────────────

    /// Register the caller as a liquid-democracy delegate for a governance domain.
    ///
    /// Any address may register; there is no stake requirement for registration
    /// itself — voting power still derives from the staking contract.
    ///
    /// `delegate` — the address registering as a delegate (must sign)
    /// `domain`   — short label for the area of expertise (e.g. "climate")
    pub fn register_delegate(env: Env, delegate: Address, domain: String) {
        Self::assert_not_paused(&env);
        delegate.require_auth();

        if domain.len() == 0 {
            panic!("domain must not be empty");
        }

        let record = DelegateRecord {
            delegate: delegate.clone(),
            domain,
            registered_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&delegate_info_key(&delegate), &record);
        Self::bump_persistent(&env, &delegate_info_key(&delegate));

        // Initialise empty delegators list on first registration.
        if !env.storage().persistent().has(&delegators_key(&delegate)) {
            let empty: Vec<Address> = Vec::new(&env);
            env.storage()
                .persistent()
                .set(&delegators_key(&delegate), &empty);
            Self::bump_persistent(&env, &delegators_key(&delegate));
        }

        env.events().publish(
            (symbol_short!("delegate"), symbol_short!("register")),
            delegate,
        );
    }

    /// Unregister a delegate.  Fails if there are still active delegations
    /// pointing to this address (delegators must retract first).
    pub fn unregister_delegate(env: Env, delegate: Address) {
        Self::assert_not_paused(&env);
        delegate.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&delegate_info_key(&delegate))
        {
            panic!("not a registered delegate");
        }

        let delegators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&delegators_key(&delegate))
            .unwrap_or_else(|| Vec::new(&env));

        if !delegators.is_empty() {
            panic!("cannot unregister: active delegations exist");
        }

        env.storage()
            .persistent()
            .remove(&delegate_info_key(&delegate));
        env.storage()
            .persistent()
            .remove(&delegators_key(&delegate));

        env.events().publish(
            (symbol_short!("delegate"), symbol_short!("unregist")),
            delegate,
        );
    }

    /// Delegate the caller's voting power to a registered delegate.
    ///
    /// Any existing delegation is atomically replaced.  The delegator cannot
    /// vote directly while a delegation is active; call `retract_delegation`
    /// first to regain direct voting rights.
    ///
    /// Delegation is not transitive: if delegate B has themselves delegated to
    /// C, A's power flowing to B does not automatically flow onward to C.
    ///
    /// `delegator` — the address delegating (must sign)
    /// `delegate`  — target registered delegate
    pub fn delegate_to(env: Env, delegator: Address, delegate: Address) {
        Self::assert_not_paused(&env);
        delegator.require_auth();

        if delegator == delegate {
            panic!("cannot delegate to yourself");
        }

        if !env
            .storage()
            .persistent()
            .has(&delegate_info_key(&delegate))
        {
            panic!("target is not a registered delegate");
        }

        // Atomically replace any prior delegation.
        if env.storage().persistent().has(&delegation_key(&delegator)) {
            let old_delegate: Address = env
                .storage()
                .persistent()
                .get(&delegation_key(&delegator))
                .unwrap();
            Self::remove_from_delegators(&env, &old_delegate, &delegator);
        }

        // Record forward link: delegator → delegate.
        env.storage()
            .persistent()
            .set(&delegation_key(&delegator), &delegate);
        Self::bump_persistent(&env, &delegation_key(&delegator));

        // Record reverse link: delegate → delegator list.
        let mut delegators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&delegators_key(&delegate))
            .unwrap_or_else(|| Vec::new(&env));
        delegators.push_back(delegator.clone());
        env.storage()
            .persistent()
            .set(&delegators_key(&delegate), &delegators);
        Self::bump_persistent(&env, &delegators_key(&delegate));

        env.events().publish(
            (symbol_short!("delegate"), symbol_short!("delegated")),
            (delegator, delegate),
        );
    }

    /// Implement Delegated Voting Power Transfer in Governance.
    ///
    /// Allows voters to delegate voting weight to proxy addresses in platform-governance.
    ///
    /// `voter` — the address delegating voting power (must sign)
    /// `proxy` — target proxy address receiving delegated voting weight
    pub fn delegate_voting_power(env: Env, voter: Address, proxy: Address) {
        Self::delegate_to(env, voter, proxy);
    }

    /// Retract an existing delegation, restoring direct voting rights to the caller.
    pub fn retract_delegation(env: Env, delegator: Address) {
        Self::assert_not_paused(&env);
        delegator.require_auth();

        let delegate: Address = env
            .storage()
            .persistent()
            .get(&delegation_key(&delegator))
            .expect("no active delegation");

        Self::remove_from_delegators(&env, &delegate, &delegator);
        env.storage()
            .persistent()
            .remove(&delegation_key(&delegator));

        env.events().publish(
            (symbol_short!("delegate"), symbol_short!("retracted")),
            (delegator, delegate),
        );
    }

    // ── Query functions ───────────────────────────────────────────────────────

    /// Retrieve a proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u64) -> ProposalRecord {
        env.storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found")
    }

    /// Retrieve a vote record for a specific proposal and voter.
    pub fn get_vote(env: Env, proposal_id: u64, voter: Address) -> Option<VoteRecord> {
        env.storage()
            .persistent()
            .get(&vote_key(proposal_id, &voter))
    }

    /// Returns the total number of proposals created.
    pub fn proposal_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&proposal_count_key())
            .unwrap_or(0)
    }

    /// Returns the current platform fee percentage.
    pub fn platform_fee(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&platform_fee_key())
            .expect("not initialized")
    }

    /// Returns the current minimum planting bond.
    pub fn min_planting_bond(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&min_planting_bond_key())
            .expect("not initialized")
    }

    /// Returns the current verifier whitelist.
    pub fn verifier_whitelist(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&verifier_whitelist_key())
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the current quorum percentage.
    pub fn quorum_percentage(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&quorum_percentage_key())
            .expect("not initialized")
    }

    /// Returns the current timelock period in seconds.
    pub fn timelock_seconds(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&timelock_seconds_key())
            .expect("not initialized")
    }

    /// Returns the DelegateRecord for a registered delegate, or None.
    pub fn get_delegate(env: Env, delegate: Address) -> Option<DelegateRecord> {
        env.storage()
            .persistent()
            .get(&delegate_info_key(&delegate))
    }

    /// Returns the address that `delegator` has delegated to, or None.
    pub fn get_delegation(env: Env, delegator: Address) -> Option<Address> {
        env.storage().persistent().get(&delegation_key(&delegator))
    }

    /// Returns the total delegated voting power currently pointed at `delegate`.
    ///
    /// This is the sum of staked balances of all direct delegators and does not
    /// include the delegate's own staked balance.
    pub fn get_delegated_power(env: Env, delegate: Address) -> i128 {
        let staking_contract: Address = env
            .storage()
            .instance()
            .get(&staking_contract_key())
            .expect("not initialized");
        Self::aggregate_delegated_power(&env, &staking_contract, &delegate)
    }

    // ── Timelock Queue Query Endpoints ──────────────────────────────────────

    /// Returns all proposals that have passed and are queued (awaiting timelock) or executable.
    pub fn get_pending_queue(env: Env) -> Vec<ProposalRecord> {
        let count = Self::proposal_count(env.clone());
        let mut list = Vec::new(&env);
        for id in 0..count {
            if let Some(prop) = env.storage().persistent().get::<_, ProposalRecord>(&proposal_key(id)) {
                if prop.status == ProposalStatus::Passed {
                    list.push_back(prop);
                }
            }
        }
        list
    }

    /// Returns all proposals currently in the timelock queue (passed, but executable_at is in the future).
    pub fn get_queued_proposals(env: Env) -> Vec<ProposalRecord> {
        let count = Self::proposal_count(env.clone());
        let now = env.ledger().timestamp();
        let mut list = Vec::new(&env);
        for id in 0..count {
            if let Some(prop) = env.storage().persistent().get::<_, ProposalRecord>(&proposal_key(id)) {
                if prop.status == ProposalStatus::Passed && now < prop.executable_at {
                    list.push_back(prop);
                }
            }
        }
        list
    }

    /// Returns all proposals that have passed and whose timelock period has elapsed (ready to execute).
    pub fn get_executable_proposals(env: Env) -> Vec<ProposalRecord> {
        let count = Self::proposal_count(env.clone());
        let now = env.ledger().timestamp();
        let mut list = Vec::new(&env);
        for id in 0..count {
            if let Some(prop) = env.storage().persistent().get::<_, ProposalRecord>(&proposal_key(id)) {
                if prop.status == ProposalStatus::Passed && now >= prop.executable_at {
                    list.push_back(prop);
                }
            }
        }
        list
    }

    /// Returns `(is_queued, remaining_seconds, executable_at)` for a specific proposal.
    pub fn get_proposal_timelock_status(env: Env, proposal_id: u64) -> (bool, u64, u64) {
        let prop = Self::get_proposal(env.clone(), proposal_id);
        let now = env.ledger().timestamp();
        if prop.status == ProposalStatus::Passed && now < prop.executable_at {
            (true, prop.executable_at - now, prop.executable_at)
        } else {
            (false, 0, prop.executable_at)
        }
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    /// Update the quorum percentage. Admin only.
    pub fn update_quorum_percentage(env: Env, new_percentage: u64) {
        Self::require_admin(&env);
        if new_percentage == 0 || new_percentage > 100 {
            panic!("percentage must be between 1 and 100");
        }
        env.storage()
            .instance()
            .set(&quorum_percentage_key(), &new_percentage);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("quorum"),), new_percentage);
    }

    /// Update the timelock period. Admin only.
    pub fn update_timelock(env: Env, new_timelock: u64) {
        Self::require_admin(&env);
        if new_timelock == 0 {
            panic!("timelock must be > 0");
        }
        env.storage()
            .instance()
            .set(&timelock_seconds_key(), &new_timelock);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("timelock"),), new_timelock);
    }

    /// Directly set platform fee (emergency override). Admin only.
    pub fn set_platform_fee(env: Env, new_fee: u64) {
        Self::require_admin(&env);
        if new_fee > 100 {
            panic!("fee must be <= 100%");
        }
        env.storage().instance().set(&platform_fee_key(), &new_fee);
        Self::bump_instance(&env);
        env.events().publish((symbol_short!("fee_set"),), new_fee);
    }

    /// Set the veto council address. Admin only.
    ///
    /// The veto council has emergency authority to cancel malicious proposals.
    /// Only the admin may set or update this address.
    ///
    /// # Arguments
    /// * `council` - The address to designate as the veto council.
    pub fn set_veto_council(env: Env, council: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&veto_council_key(), &council);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("veto"), symbol_short!("set")), council);
    }

    /// Returns the current veto council address, if set.
    pub fn veto_council(env: Env) -> Option<Address> {
        env.storage().instance().get(&veto_council_key())
    }

    /// Cancel a malicious proposal. Veto council only.
    ///
    /// The veto council can cancel any proposal that is in `Active` status.
    /// Once cancelled, the proposal cannot be voted on, queued, or executed.
    ///
    /// # Arguments
    /// * `council` - The veto council address (must sign).
    /// * `proposal_id` - The ID of the proposal to cancel.
    ///
    /// # Errors
    /// * Panics with `"veto council not set"` if no council has been designated.
    /// * Panics with `"caller is not the veto council"` if unauthorized.
    /// * Panics with `"proposal not found"` if the proposal does not exist.
    /// * Panics with `"proposal cannot be cancelled"` if not in `Active` status.
    ///
    /// # Events
    /// Emits `("proposal", "cancelled")` with `(proposal_id, council)`.
    pub fn cancel_proposal(env: Env, council: Address, proposal_id: u64) {
        Self::assert_not_paused(&env);

        let stored_council: Address = env
            .storage()
            .instance()
            .get(&veto_council_key())
            .expect("veto council not set");

        if council != stored_council {
            panic!("caller is not the veto council");
        }
        council.require_auth();

        let mut proposal: ProposalRecord = env
            .storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Active {
            panic!("proposal cannot be cancelled");
        }

        proposal.status = ProposalStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&proposal_key(proposal_id), &proposal);
        Self::bump_persistent(&env, &proposal_key(proposal_id));

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("cancelled")),
            (proposal_id, council),
        );
    }

    /// Directly set minimum planting bond (emergency override). Admin only.
    pub fn set_min_planting_bond(env: Env, new_bond: i128) {
        Self::require_admin(&env);
        if new_bond <= 0 {
            panic!("bond must be positive");
        }
        env.storage()
            .instance()
            .set(&min_planting_bond_key(), &new_bond);
        Self::bump_instance(&env);
        env.events().publish((symbol_short!("bond_set"),), new_bond);
    }

    /// Add verifier to whitelist (emergency override). Admin only.
    pub fn add_verifier_to_whitelist(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let mut whitelist: Vec<Address> = env
            .storage()
            .persistent()
            .get(&verifier_whitelist_key())
            .unwrap_or_else(|| Vec::new(&env));

        // Check if already whitelisted
        for v in whitelist.iter() {
            if v == verifier {
                panic!("verifier already whitelisted");
            }
        }

        whitelist.push_back(verifier.clone());
        env.storage()
            .persistent()
            .set(&verifier_whitelist_key(), &whitelist);
        Self::bump_persistent(&env, &verifier_whitelist_key());
        env.events().publish((symbol_short!("wl_add"),), verifier);
    }

    /// Remove verifier from whitelist (emergency override). Admin only.
    pub fn remove_verifier_from_whitelist(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let whitelist: Vec<Address> = env
            .storage()
            .persistent()
            .get(&verifier_whitelist_key())
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        let mut new_whitelist = Vec::new(&env);
        for v in whitelist.iter() {
            if v == verifier {
                found = true;
            } else {
                new_whitelist.push_back(v.clone());
            }
        }

        if !found {
            panic!("verifier not whitelisted");
        }

        env.storage()
            .persistent()
            .set(&verifier_whitelist_key(), &new_whitelist);
        Self::bump_persistent(&env, &verifier_whitelist_key());
        env.events().publish((symbol_short!("wl_rm"),), verifier);
    }

    // ── Vesting ──────────────────────────────────────────────────────────────

    /// Create a linear vesting schedule for a community tree planter.
    ///
    /// Transfers `total_amount` of governance tokens from the contract
    /// admin into this contract where they are held in custody.  Tokens
    /// vest linearly from `start_at + cliff_seconds` through
    /// `start_at + vesting_seconds`.
    ///
    /// Only the registered admin may create vesting schedules.  A planter
    /// may have at most one active schedule at a time.
    ///
    /// # Arguments
    ///
    /// * `planter`         — beneficiary community planter address
    /// * `token`           — governance token contract address
    /// * `total_amount`    — total tokens to vest (must be > 0)
    /// * `start_at`        — vesting start (ledger timestamp, 0 = now)
    /// * `cliff_seconds`   — nothing vests before this offset from start_at
    /// * `vesting_seconds` — total vesting duration (must be > cliff_seconds)
    ///
    /// # Errors
    /// * `VestingAmountMustBePositive` — `total_amount` ≤ 0
    /// * `VestingDurationZero` — `vesting_seconds` is zero
    /// * `VestingCliffExceedsDuration` — `cliff_seconds` > `vesting_seconds`
    /// * `VestingScheduleExists` — planter already has an active schedule
    ///
    /// # Events
    /// Emits `("vesting", "created")` with `(planter, total_amount, start_at, vesting_seconds)`.
    pub fn create_vesting_schedule(
        env: Env,
        planter: Address,
        token: Address,
        total_amount: i128,
        start_at: u64,
        cliff_seconds: u64,
        vesting_seconds: u64,
    ) {
        Self::require_admin(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .expect("not initialized");

        if total_amount <= 0 {
            panic_with_error!(&env, GovernanceError::VestingAmountMustBePositive);
        }
        if vesting_seconds == 0 {
            panic_with_error!(&env, GovernanceError::VestingDurationZero);
        }
        if cliff_seconds > vesting_seconds {
            panic_with_error!(&env, GovernanceError::VestingCliffExceedsDuration);
        }

    fn get_voting_power(env: &Env, _staking_contract: &Address, voter: &Address) -> i128 {
        // Quadratic voting power = isqrt(locked_token_amount).
        // The isqrt is already pre-computed and stored in the TokenLock record
        // so we just read it — O(1) with no arithmetic at vote time.
        env.storage()
            .persistent()
            .get::<(Symbol, Address), TokenLock>(&token_lock_key(voter))
            .map(|lock| lock.voting_power)
            .unwrap_or(0)
    }
        let key = vesting_key(&planter);
        if env.storage().persistent().has(&key) {
            let existing: VestingSchedule = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap();
            if !existing.revoked && existing.claimed_amount < existing.total_amount {
                panic_with_error!(&env, GovernanceError::VestingScheduleExists);
            }
        }

        let now = env.ledger().timestamp();
        let effective_start = if start_at == 0 { now } else { start_at };

        token::Client::new(&env, &token).transfer(
            &admin,
            &env.current_contract_address(),
            &total_amount,
        );

        let schedule = VestingSchedule {
            planter: planter.clone(),
            token: token.clone(),
            total_amount,
            claimed_amount: 0,
            start_at: effective_start,
            cliff_seconds,
            vesting_seconds,
            created_at: now,
            revoked: false,
            revoked_at: 0,
        };

        env.storage().persistent().set(&key, &schedule);
        Self::bump_persistent(&env, &key);

        env.events().publish(
            (symbol_short!("vesting"), symbol_short!("created")),
            (planter, total_amount, effective_start, vesting_seconds),
        );
    }

    /// Claim any tokens that have vested but not yet been withdrawn.
    ///
    /// Computes the currently-vested amount (linear release between cliff and
    /// end, capped at `total_amount`), subtracts any prior `claimed_amount`,
    /// and transfers the difference to `planter`.
    ///
    /// # Arguments
    /// * `planter` — the beneficiary planter (must sign)
    ///
    /// # Returns
    /// The amount of tokens claimed in this call (≥ 0).
    ///
    /// # Errors
    /// * `VestingScheduleNotFound` — no schedule exists for `planter`
    /// * `VestingNothingToClaim` — nothing has vested yet (before cliff)
    ///
    /// # Events
    /// Emits `("vesting", "claimed")` with `(planter, amount, remaining_locked)`.
    pub fn claim_vested_tokens(env: Env, planter: Address) -> i128 {
        Self::assert_not_paused(&env);
        planter.require_auth();

        let key = vesting_key(&planter);
        let mut schedule: VestingSchedule = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::VestingScheduleNotFound));

        let now = env.ledger().timestamp();
        let vested = Self::compute_vested_amount(&env, &schedule, now);
        let claimable = vested - schedule.claimed_amount;

        if claimable <= 0 {
            panic_with_error!(&env, GovernanceError::VestingNothingToClaim);
        }

        token::Client::new(&env, &schedule.token).transfer(
            &env.current_contract_address(),
            &planter,
            &claimable,
        );

        schedule.claimed_amount += claimable;
        env.storage().persistent().set(&key, &schedule);
        Self::bump_persistent(&env, &key);

        let remaining_locked = schedule.total_amount - schedule.claimed_amount;
        env.events().publish(
            (symbol_short!("vesting"), symbol_short!("claimed")),
            (planter.clone(), claimable, remaining_locked),
        );

        claimable
    }

    /// Admin emergency revocation of an active vesting schedule.
    ///
    /// Forfeits any unvested tokens: `planter` keeps what has already
    /// vested (and can still claim it via `claim_vested_tokens`), but the
    /// unvested portion is returned to the contract admin.  Marked
    /// schedules can be replaced with a fresh `create_vesting_schedule`.
    ///
    /// # Arguments
    /// * `planter` — planter whose schedule should be revoked
    ///
    /// # Errors
    /// * `VestingScheduleNotFound` — no schedule for `planter`
    /// * `VestingAlreadyRevoked`  — schedule was already revoked
    ///
    /// # Events
    /// Emits `("vesting", "revoked")` with `(planter, refunded_amount)`.
    pub fn revoke_vesting_schedule(env: Env, planter: Address) {
        Self::require_admin(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .expect("not initialized");

        let key = vesting_key(&planter);
        let mut schedule: VestingSchedule = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::VestingScheduleNotFound));

        if schedule.revoked {
            panic_with_error!(&env, GovernanceError::VestingAlreadyRevoked);
        }

        let now = env.ledger().timestamp();
        let vested = Self::compute_vested_amount(&env, &schedule, now);
        let unvested = schedule.total_amount - vested;

        if unvested > 0 {
            token::Client::new(&env, &schedule.token).transfer(
                &env.current_contract_address(),
                &admin,
                &unvested,
            );
        }

        schedule.revoked = true;
        schedule.revoked_at = now;
        env.storage().persistent().set(&key, &schedule);
        Self::bump_persistent(&env, &key);

        env.events().publish(
            (symbol_short!("vesting"), symbol_short!("revoked")),
            (planter, unvested),
        );
    }

    /// Query the vesting schedule for `planter`, if any.
    pub fn get_vesting_schedule(env: Env, planter: Address) -> Option<VestingSchedule> {
        let key = vesting_key(&planter);
        env.storage().persistent().get(&key)
    }

    /// Compute the amount currently vested for `planter` as of the current
    /// ledger timestamp.  Does not subtract prior claims — use
    /// `get_claimable_amount` for the net-withdrawable figure.
    pub fn get_vested_amount(env: Env, planter: Address) -> i128 {
        match Self::get_vesting_schedule(env.clone(), planter) {
            Some(sched) => Self::compute_vested_amount(&env, &sched, env.ledger().timestamp()),
            None => 0,
        }
    }

    /// Compute the net amount `planter` could claim right now.
    /// Equal to `vested - claimed`.
    pub fn get_claimable_amount(env: Env, planter: Address) -> i128 {
        match Self::get_vesting_schedule(env.clone(), planter) {
            Some(sched) => {
                let vested =
                    Self::compute_vested_amount(&env, &sched, env.ledger().timestamp());
                vested - sched.claimed_amount
            }
            None => 0,
        }
    }

    /// Core linear vesting math.
    ///
    /// ```text
    /// t < start + cliff              → 0
    /// t ≥ start + vesting_seconds    → total_amount
    /// otherwise                      → total_amount * (t - start) / vesting_seconds
    /// ```
    ///
    /// If the schedule has been revoked, only tokens vested *before* the
    /// revocation call count — the effective `now` used for the calculation
    /// is the minimum of the caller-supplied timestamp and `revoked_at`.
    /// This ensures that even if more ledger time elapses after a revoke,
    /// the vested figure never rises above what was vested at the moment
    /// of revocation (the unvested remainder has already been refunded out
    /// of the contract and is no longer present to be claimed).
    fn compute_vested_amount(_env: &Env, schedule: &VestingSchedule, now: u64) -> i128 {
        if schedule.total_amount <= 0 {
            return 0;
        }
        let effective_now = if schedule.revoked && schedule.revoked_at > 0 {
            now.min(schedule.revoked_at)
        } else {
            now
        };
        let cliff_ts = schedule.start_at.saturating_add(schedule.cliff_seconds);
        if effective_now < cliff_ts {
            return 0;
        }
        let end_ts = schedule.start_at.saturating_add(schedule.vesting_seconds);
        if effective_now >= end_ts {
            return schedule.total_amount;
        }
        let elapsed = effective_now.saturating_sub(schedule.start_at);
        schedule
            .total_amount
            .checked_mul(elapsed as i128)
            .unwrap_or(schedule.total_amount)
            / schedule.vesting_seconds as i128
    }

    // ── Dynamic quorum ─────────────────────────────────────────────────────────

    /// Convert a ledger timestamp to the number of days since epoch.
    fn day_index(timestamp: u64) -> u32 {
        (timestamp / SECONDS_PER_DAY) as u32
    }

    /// Zero out daily buckets that have fallen outside the 30-day window and
    /// advance the stored day pointer to the current day.
    fn rotate_participation_buckets(env: &Env, now: u64) {
        let current_day = Self::day_index(now);
        let stored_day: u32 = env
            .storage()
            .instance()
            .get(&participation_day_key())
            .unwrap_or(0u32);

        let mut buckets: Vec<i128> = env
            .storage()
            .instance()
            .get(&participation_buckets_key())
            .unwrap_or_else(|| Vec::new(env));

        if buckets.is_empty() {
            for _ in 0..PARTICIPATION_WINDOW_DAYS {
                buckets.push_back(0i128);
            }
        }

        if current_day != stored_day {
            let diff = current_day - stored_day;
            if diff >= PARTICIPATION_WINDOW_DAYS {
                for i in 0..buckets.len() {
                    buckets.set(i, 0i128);
                }
            } else {
                for d in 1..=diff {
                    let idx = ((stored_day + d) % PARTICIPATION_WINDOW_DAYS) as u32;
                    buckets.set(idx, 0i128);
                }
            }
            env.storage()
                .instance()
                .set(&participation_day_key(), &current_day);
            env.storage()
                .instance()
                .set(&participation_buckets_key(), &buckets);
        }
    }

    /// Add `power` to the current day's participation bucket.
    fn record_participation(env: &Env, power: i128) {
        if power <= 0 {
            return;
        }
        let now = env.ledger().timestamp();
        Self::rotate_participation_buckets(env, now);

        let current_day = Self::day_index(now);
        let mut buckets: Vec<i128> = env
            .storage()
            .instance()
            .get(&participation_buckets_key())
            .unwrap_or_else(|| Vec::new(env));

        if buckets.is_empty() {
            for _ in 0..PARTICIPATION_WINDOW_DAYS {
                buckets.push_back(0i128);
            }
        }

        let idx = (current_day % PARTICIPATION_WINDOW_DAYS) as u32;
        let current = buckets.get(idx).unwrap_or(0i128);
        buckets.set(idx, current + power);

        env.storage()
            .instance()
            .set(&participation_buckets_key(), &buckets);
    }

    /// Sum all participation buckets in the 30-day window.
    fn sum_buckets(env: &Env) -> i128 {
        let buckets: Vec<i128> = env
            .storage()
            .instance()
            .get(&participation_buckets_key())
            .unwrap_or_else(|| Vec::new(env));
        let mut total = 0i128;
        for i in 0..buckets.len() {
            total += buckets.get(i).unwrap_or(0i128);
        }
        total
    }

    /// Map a participation rate in basis points to a quorum percentage.
    /// High participation reduces the quorum (down to MIN_DYNAMIC_QUORUM);
    /// low participation raises it (up to MAX_DYNAMIC_QUORUM).
    fn map_rate_to_quorum(rate_bps: u64) -> u64 {
        let range = MAX_DYNAMIC_QUORUM - MIN_DYNAMIC_QUORUM;
        let reduction = (rate_bps * range) / BASIS_POINTS;
        MAX_DYNAMIC_QUORUM - reduction
    }

    /// Recalculate the proposal quorum requirement from the last 30 days of
    /// active voter participation. Higher participation lowers the quorum
    /// (min 5%), lower participation raises it (max 25%). Only the stored
    /// admin may call this function.
    ///
    /// `admin` — contract admin address (must authorize)
    pub fn adjust_quorum(env: Env, admin: Address) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .expect("not initialized");
        if admin != stored_admin {
            panic_with_error!(&env, GovernanceError::Unauthorized);
        }

        let rate_bps = Self::participation_rate_bps(env.clone());
        let new_quorum = Self::map_rate_to_quorum(rate_bps);

        env.storage()
            .instance()
            .set(&quorum_percentage_key(), &new_quorum);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("quorum"), symbol_short!("adjust")),
            (rate_bps, new_quorum),
        );
    }

    /// Return the total active voting power recorded in the rolling 30-day window.
    pub fn participation_30d(env: Env) -> i128 {
        let now = env.ledger().timestamp();
        Self::rotate_participation_buckets(&env, now);
        Self::sum_buckets(&env)
    }

    /// Return the 30-day active voter participation rate as basis points (0–10000).
    pub fn participation_rate_bps(env: Env) -> u64 {
        let now = env.ledger().timestamp();
        Self::rotate_participation_buckets(&env, now);

        let total_power = Self::sum_buckets(&env);
        let staking_contract: Address = env
            .storage()
            .instance()
            .get(&staking_contract_key())
            .expect("not initialized");
        let total_staked = Self::get_total_staked(&env, &staking_contract);

        if total_staked <= 0 {
            panic_with_error!(&env, GovernanceError::NoStakedTokens);
        }

        let rate = (total_power * BASIS_POINTS as i128) / total_staked;
        if rate < 0 {
            0
        } else if rate > BASIS_POINTS as i128 {
            BASIS_POINTS
        } else {
            rate as u64
        }
    }

    /// Return the number of days used for the participation window.
    pub fn participation_window_days(_env: Env) -> u32 {
        PARTICIPATION_WINDOW_DAYS
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// Integer square root using binary search algorithm.
    /// Returns the largest integer x such that x * x <= n.
    pub fn isqrt(n: i128) -> i128 {
        if n <= 0 {
            return 0;
        }

        let mut low = 1i128;
        let mut high = n;
        let mut result = 1i128;

        while low <= high {
            let mid = (low + high) / 2;
            let mid_squared = mid * mid;

            if mid_squared == n {
                return mid;
            } else if mid_squared < n {
                low = mid + 1;
                result = mid;
            } else {
                high = mid - 1;
            }
        }

        result
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .expect("not initialized");
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        if paused {
            panic!("contract is paused");
        }
    }

    /// Extend the TTL of instance storage to keep configuration alive.
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);
    }

    /// Extend the TTL of a persistent storage entry after writing to it.
    fn bump_persistent<K: IntoVal<Env, Val>>(env: &Env, key: &K) {
        env.storage().persistent().extend_ttl(
            key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_LEDGERS,
        );
    }

    fn get_voting_power(_env: &Env, _staking_contract: &Address, _voter: &Address) -> i128 {
        // Simplified: return a fixed voting power for staked verifiers.
        // In production this calls the staking contract for the actual amount.
        1000i128
    }

    fn get_total_staked(_env: &Env, _staking_contract: &Address) -> i128 {
        // Simplified: return a fixed total staked amount.
        // In production this queries the staking contract.
        100_000i128
    }

    /// Sum the staked balances of every address that has delegated to `delegate`.
    /// Delegation is direct-only (not transitive).
    fn aggregate_delegated_power(
        env: &Env,
        staking_contract: &Address,
        delegate: &Address,
    ) -> i128 {
        let delegators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&delegators_key(delegate))
            .unwrap_or_else(|| Vec::new(env));

        let mut total = 0i128;
        for delegator in delegators.iter() {
            total += Self::get_voting_power(env, staking_contract, &delegator);
        }
        total
    }

    /// Remove `delegator` from `delegate`'s reverse-mapping list.
    fn remove_from_delegators(env: &Env, delegate: &Address, delegator: &Address) {
        let delegators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&delegators_key(delegate))
            .unwrap_or_else(|| Vec::new(env));

        let mut updated = Vec::new(env);
        for d in delegators.iter() {
            if d != *delegator {
                updated.push_back(d.clone());
            }
        }
        env.storage()
            .persistent()
            .set(&delegators_key(delegate), &updated);
    }

    fn parse_fee_from_description(_description: &String) -> u64 {
        // Simplified parsing – production would be more robust.
        10u64
    }

    fn parse_bond_from_description(_description: &String) -> i128 {
        // Simplified parsing.
        1_000_000i128
    }

    fn update_verifier_whitelist(_env: &Env, _description: &String) {
        // Simplified – production would parse addresses from description.
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env, String,
    };

    fn setup() -> (Env, Address, Address, Address, Address, PlatformGovernanceClient<'static>) {
        token::TokenClient,
        Address, Env, String,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        PlatformGovernanceClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PlatformGovernance);
        let client = PlatformGovernanceClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let staking_contract = Address::generate(&env);
        let admin_controls = Address::generate(&env);

        // Register a TREE SAC token with this contract as admin
        let tree_token = env
            .register_stellar_asset_contract_v2(contract_id.clone())
            .address();

        client.initialize(
            &admin,
            &staking_contract,
            &admin_controls,
            &DEFAULT_PLATFORM_FEE,
            &DEFAULT_MIN_PLANTING_BOND,
            &tree_token,
        );

        (env, admin, staking_contract, admin_controls, tree_token, client)
    }

    /// Helper: mint `amount` TREE tokens to `voter` and lock them so they
    /// have quadratic voting power of `isqrt(amount)`.
    fn lock_for_voter(
        env: &Env,
        tree_token: &Address,
        client: &PlatformGovernanceClient,
        voter: &Address,
        amount: i128,
    ) {
        token::StellarAssetClient::new(env, tree_token).mint(voter, &amount);
        client.lock_tokens(voter, &amount);
    }

    #[test]
    fn test_initialize() {
        let (_, _admin, _, _, _, client) = setup();
        assert_eq!(client.platform_fee(), DEFAULT_PLATFORM_FEE);
        assert_eq!(client.min_planting_bond(), DEFAULT_MIN_PLANTING_BOND);
        assert_eq!(client.quorum_percentage(), DEFAULT_QUORUM_PERCENTAGE);
        assert_eq!(client.timelock_seconds(), DEFAULT_TIMELOCK_SECONDS);
    }

    #[test]
    fn test_create_proposal() {
        let (env, admin, _, _, tree_token, client) = setup();
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        options.push_back(VoteOption { option_id: 2, description: String::from_str(&env, "Set fee to 15%") });
        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);
        assert_eq!(client.proposal_count(), 1);
        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.description_hash, description_hash);
        assert!(matches!(proposal.status, ProposalStatus::Active));
    }

    #[test]
    fn test_vote_on_proposal() {
        let (env, admin, _, _, tree_token, client) = setup();
        // Lock 10000 tokens → sqrt(10000) = 100 voting power
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "hash123"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.vote(&0, &1, &admin);
        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 100); // sqrt(10000) = 100
    }

    #[test]
    #[should_panic(expected = "already voted on this proposal")]
    fn test_double_vote_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "hash123"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.vote(&0, &1, &admin);
        client.vote(&0, &1, &admin);
    }

    #[test]
    fn test_execute_passed_proposal() {
        let (env, admin, _, _, tree_token, client) = setup();
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "hash123"), &ProposalType::PlatformFee, &options, &1, &admin);
        client.vote(&0, &1, &admin);
        env.ledger().set_timestamp(env.ledger().timestamp() + 200000);

        // Advance past voting period and timelock
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + 200000);

        let _proposal = client.get_proposal(&0);
    }

    #[test]
    #[should_panic(expected = "proposal has not passed")]
    fn test_execute_failed_proposal_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "hash123"), &ProposalType::PlatformFee, &options, &1, &admin);
        client.execute(&0);
    fn test_queue_failed_proposal_rejected() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &1, &admin);

        // Try to queue without the proposal having passed
        client.queue(&0);
    }

    #[test]
    fn test_admin_set_platform_fee() {
        let (_, _admin, _, _, _, client) = setup();
        client.set_platform_fee(&15);
        assert_eq!(client.platform_fee(), 15);
    }

    #[test]
    fn test_verifier_whitelist() {
        let (env, _admin, _, _, _, client) = setup();
        let verifier = Address::generate(&env);
        client.add_verifier_to_whitelist(&verifier);
        let whitelist = client.verifier_whitelist();
        assert_eq!(whitelist.len(), 1);
        assert_eq!(whitelist.get(0).unwrap(), verifier);
        client.remove_verifier_from_whitelist(&verifier);
        assert_eq!(client.verifier_whitelist().len(), 0);
    }

    #[test]
    fn test_isqrt() {
        assert_eq!(PlatformGovernance::isqrt(0), 0);
        assert_eq!(PlatformGovernance::isqrt(1), 1);
        assert_eq!(PlatformGovernance::isqrt(4), 2);
        assert_eq!(PlatformGovernance::isqrt(9), 3);
        assert_eq!(PlatformGovernance::isqrt(16), 4);
        assert_eq!(PlatformGovernance::isqrt(25), 5);
        assert_eq!(PlatformGovernance::isqrt(100), 10);
        assert_eq!(PlatformGovernance::isqrt(10000), 100);
        assert_eq!(PlatformGovernance::isqrt(2), 1);
        assert_eq!(PlatformGovernance::isqrt(8), 2);
        assert_eq!(PlatformGovernance::isqrt(15), 3);
        assert_eq!(PlatformGovernance::isqrt(26), 5);
    }

    #[test]
    fn test_quadratic_voting_species_selection() {
        let (env, admin, _, _, tree_token, client) = setup();
        // Lock 1000 tokens → sqrt(1000) ≈ 31
        lock_for_voter(&env, &tree_token, &client, &admin, 1_000);
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "species_hash");
        let proposal_type = ProposalType::SpeciesSelection;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Oak Tree") });
        options.push_back(VoteOption { option_id: 2, description: String::from_str(&env, "Pine Tree") });
        client.create_proposal(&String::from_str(&env, "species_hash"), &ProposalType::SpeciesSelection, &options, &604800, &admin);
        client.vote(&0, &1, &admin);
        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 31); // isqrt(1000) = 31
    }

    #[test]
    fn test_normal_voting_platform_fee() {
        let (env, admin, _, _, tree_token, client) = setup();
        // Lock 10000 tokens → quadratic power = sqrt(10000) = 100
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "fee_hash");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "fee_hash"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.vote(&0, &1, &admin);
        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 100); // isqrt(10000) = 100
    }

    #[test]
    fn test_species_selection_execution() {
        let (env, admin, _, _, tree_token, client) = setup();
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "species_hash");
        let proposal_type = ProposalType::SpeciesSelection;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Oak Tree") });
        client.create_proposal(&String::from_str(&env, "species_hash"), &ProposalType::SpeciesSelection, &options, &1, &admin);
        client.vote(&0, &1, &admin);
        let mut proposal = client.get_proposal(&0);
        proposal.status = ProposalStatus::Passed;
        env.storage().persistent().set(&proposal_key(0), &proposal);
        client.queue(&0);
        env.ledger().set_timestamp(env.ledger().timestamp() + 200000);

        // Queue it — starts the 48h timelock
        client.queue(&0);

        // Advance past the 48h timelock
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + DEFAULT_TIMELOCK_SECONDS + 1);

        client.execute(&0);
        assert!(matches!(client.get_proposal(&0).status, ProposalStatus::Executed));
    }

    // ── Timelock controller tests (#752) ──────────────────────────────────────

    fn create_passed_proposal(
        env: &Env,
        client: &PlatformGovernanceClient,
        admin: &Address,
        tree_token: &Address,
        voting_period: u64,
    ) -> u64 {
        lock_for_voter(env, tree_token, client, admin, 10_000);
        let mut options = Vec::new(env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &voting_period,
            admin,
        );
        let id = client.proposal_count() - 1;
        let mut proposal = client.get_proposal(&id);
        proposal.status = ProposalStatus::Passed;
        env.storage().persistent().set(&proposal_key(id), &proposal);
        id
    }

    #[test]
    fn test_queue_transitions_passed_to_queued() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        client.queue(&id);
        let proposal = client.get_proposal(&id);
        assert!(matches!(proposal.status, ProposalStatus::Queued));
        assert!(proposal.queued_at > 0);
        assert_eq!(proposal.executable_at, proposal.queued_at + DEFAULT_TIMELOCK_SECONDS);
    }

    #[test]
    fn test_queue_sets_executable_at_48h_from_now() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        let before = env.ledger().timestamp();
        client.queue(&id);
        let proposal = client.get_proposal(&id);
        assert_eq!(proposal.queued_at, before);
        assert_eq!(proposal.executable_at, before + DEFAULT_TIMELOCK_SECONDS);
    }

    #[test]
    fn test_full_lifecycle_create_vote_queue_execute() {
        let (env, admin, _, _, tree_token, client) = setup();
        lock_for_voter(&env, &tree_token, &client, &admin, 10_000);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Set fee to 10%") });
        client.create_proposal(&String::from_str(&env, "hash"), &ProposalType::PlatformFee, &options, &1, &admin);
        let id = 0u64;
        assert!(matches!(client.get_proposal(&id).status, ProposalStatus::Active));
        let mut proposal = client.get_proposal(&id);
        proposal.status = ProposalStatus::Passed;
        env.storage().persistent().set(&proposal_key(id), &proposal);
        client.queue(&id);
        assert!(matches!(client.get_proposal(&id).status, ProposalStatus::Queued));
        env.ledger().set_timestamp(env.ledger().timestamp() + DEFAULT_TIMELOCK_SECONDS + 1);
        client.execute(&id);
        assert!(matches!(client.get_proposal(&id).status, ProposalStatus::Executed));
    }

    #[test]
    #[should_panic(expected = "proposal has not passed")]
    fn test_queue_active_proposal_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(&String::from_str(&env, "hash"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.queue(&0);
    }

    #[test]
    #[should_panic(expected = "proposal has not passed")]
    fn test_queue_already_queued_proposal_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        client.queue(&id);
        client.queue(&id);
    }

    #[test]
    #[should_panic(expected = "proposal not queued for execution")]
    fn test_execute_passed_but_not_queued_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        env.ledger().set_timestamp(env.ledger().timestamp() + 300_000);
        client.execute(&id);
    }

    #[test]
    #[should_panic(expected = "proposal not queued for execution")]
    fn test_execute_active_proposal_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(&String::from_str(&env, "hash"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.execute(&0);
    }

    #[test]
    #[should_panic(expected = "timelock period has not elapsed")]
    fn test_execute_before_timelock_elapses_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        client.queue(&id);
        client.execute(&id);
    }

    #[test]
    fn test_execute_exactly_at_timelock_boundary_succeeds() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        let queue_time = env.ledger().timestamp();
        client.queue(&id);
        env.ledger().set_timestamp(queue_time + DEFAULT_TIMELOCK_SECONDS);
        client.execute(&id);
        assert!(matches!(client.get_proposal(&id).status, ProposalStatus::Executed));
    }

    #[test]
    fn test_timelock_duration_is_configurable() {
        let (env, admin, _, _, tree_token, client) = setup();
        let one_hour = 3600u64;
        client.update_timelock(&one_hour);
        assert_eq!(client.timelock_seconds(), one_hour);
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        let queue_time = env.ledger().timestamp();
        client.queue(&id);
        let proposal = client.get_proposal(&id);
        assert_eq!(proposal.executable_at, queue_time + one_hour);
        env.ledger().set_timestamp(queue_time + one_hour);
        client.execute(&id);
        assert!(matches!(client.get_proposal(&id).status, ProposalStatus::Executed));
    }

    #[test]
    #[should_panic(expected = "timelock must be > 0")]
    fn test_set_zero_timelock_rejected() {
        let (_, _, _, _, _, client) = setup();
        client.update_timelock(&0);
    }

    #[test]
    fn test_default_timelock_is_48_hours() {
        let (_, _, _, _, _, client) = setup();
        assert_eq!(client.timelock_seconds(), DEFAULT_TIMELOCK_SECONDS);
        assert_eq!(DEFAULT_TIMELOCK_SECONDS, 172800);
    }

    #[test]
    fn test_queued_at_and_executable_at_stored_correctly() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        let t0 = env.ledger().timestamp();
        client.queue(&id);
        let p = client.get_proposal(&id);
        assert_eq!(p.queued_at, t0);
        assert_eq!(p.executable_at, t0 + DEFAULT_TIMELOCK_SECONDS);
        assert_eq!(p.executable_at - p.queued_at, DEFAULT_TIMELOCK_SECONDS);
    }

    #[test]
    #[should_panic(expected = "proposal not queued for execution")]
    fn test_execute_double_call_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        let id = create_passed_proposal(&env, &client, &admin, &tree_token, 1);
        client.queue(&id);
        env.ledger().set_timestamp(env.ledger().timestamp() + DEFAULT_TIMELOCK_SECONDS + 1);
        client.execute(&id);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.execute(&id);
        }));
        assert!(result.is_err());
        client.execute(&id);
    }

    // ── Delegation tests ──────────────────────────────────────────────────────

    #[test]
    fn test_register_delegate() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        let domain = String::from_str(&env, "climate");
        client.register_delegate(&delegate, &domain);
        let record = client.get_delegate(&delegate).expect("delegate not found");
        assert_eq!(record.delegate, delegate);
        assert_eq!(record.domain, domain);
    }

    #[test]
    fn test_unregister_delegate_no_delegators() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "verifier"));
        client.unregister_delegate(&delegate);
        assert!(client.get_delegate(&delegate).is_none());
    }

    #[test]
    #[should_panic(expected = "not a registered delegate")]
    fn test_unregister_non_existent_delegate_fails() {
        let (env, _, _, _, _, client) = setup();
        client.unregister_delegate(&Address::generate(&env));
    }

    #[test]
    #[should_panic(expected = "cannot unregister: active delegations exist")]
    fn test_unregister_with_active_delegations_fails() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        client.unregister_delegate(&delegate);
    }

    #[test]
    fn test_delegate_to_registered_delegate() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        let stored = client.get_delegation(&delegator).expect("delegation not found");
        assert_eq!(stored, delegate);
    }

    #[test]
    #[should_panic(expected = "target is not a registered delegate")]
    fn test_delegate_to_non_registered_fails() {
        let (env, _, _, _, _, client) = setup();
        client.delegate_to(&Address::generate(&env), &Address::generate(&env));
    }

    #[test]
    #[should_panic(expected = "cannot delegate to yourself")]
    fn test_delegate_to_self_fails() {
        let (env, _, _, _, _, client) = setup();
        let user = Address::generate(&env);
        client.register_delegate(&user, &String::from_str(&env, "climate"));
        client.delegate_to(&user, &user);
    }

    #[test]
    fn test_retract_delegation() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        client.retract_delegation(&delegator);
        assert!(client.get_delegation(&delegator).is_none());
    }

    #[test]
    #[should_panic(expected = "no active delegation")]
    fn test_retract_with_no_delegation_fails() {
        let (env, _, _, _, _, client) = setup();
        client.retract_delegation(&Address::generate(&env));
    }

    #[test]
    fn test_delegate_to_replaces_existing_delegation() {
        let (env, _, _, _, _, client) = setup();
        let delegate_a = Address::generate(&env);
        let delegate_b = Address::generate(&env);
        let delegator = Address::generate(&env);
        client.register_delegate(&delegate_a, &String::from_str(&env, "climate"));
        client.register_delegate(&delegate_b, &String::from_str(&env, "verifier"));
        client.delegate_to(&delegator, &delegate_a);
        client.delegate_to(&delegator, &delegate_b);
        assert_eq!(client.get_delegation(&delegator).unwrap(), delegate_b);
        assert_eq!(client.get_delegated_power(&delegate_a), 0);
        assert_eq!(client.get_delegated_power(&delegate_b), 0); // delegator has no lock
    }

    #[test]
    fn test_vote_aggregates_delegated_power() {
        let (env, _, _, _, tree_token, client) = setup();
        let delegate = Address::generate(&env);
        let delegator_1 = Address::generate(&env);
        let delegator_2 = Address::generate(&env);

        // Lock tokens for all three: sqrt(10000) = 100 each
        lock_for_voter(&env, &tree_token, &client, &delegate, 10_000);
        lock_for_voter(&env, &tree_token, &client, &delegator_1, 10_000);
        lock_for_voter(&env, &tree_token, &client, &delegator_2, 10_000);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator_1, &delegate);
        client.delegate_to(&delegator_2, &delegate);

        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(
            &String::from_str(&env, "hash_dlgt"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &delegate,
        );
        client.vote(&0, &1, &delegate);

        let proposal = client.get_proposal(&0);
        // own (100) + delegator_1 (100) + delegator_2 (100) = 300
        assert_eq!(proposal.total_votes, 300);
        assert_eq!(client.get_vote(&0, &delegate).unwrap().power, 300);
    }

    #[test]
    #[should_panic(expected = "voting power delegated; retract delegation before voting")]
    fn test_delegated_user_cannot_vote_directly() {
        let (env, _, _, _, tree_token, client) = setup();
        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);
        lock_for_voter(&env, &tree_token, &client, &delegate, 10_000);
        lock_for_voter(&env, &tree_token, &client, &delegator, 10_000);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(&String::from_str(&env, "hash"), &ProposalType::PlatformFee, &options, &604800, &delegate);
        client.vote(&0, &1, &delegator);
    }

    #[test]
    fn test_retract_then_vote_directly() {
        let (env, _, _, _, tree_token, client) = setup();
        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);
        lock_for_voter(&env, &tree_token, &client, &delegate, 10_000);
        lock_for_voter(&env, &tree_token, &client, &delegator, 10_000);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        client.retract_delegation(&delegator);
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(&String::from_str(&env, "hash"), &ProposalType::PlatformFee, &options, &604800, &delegate);
        client.vote(&0, &1, &delegator);
        assert_eq!(client.get_proposal(&0).total_votes, 100); // sqrt(10000) = 100
    }

    #[test]
    fn test_get_delegated_power_zero_when_no_delegators() {
        let (env, _, _, _, _, client) = setup();
        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "verifier"));
        assert_eq!(client.get_delegated_power(&delegate), 0);
    }

    #[test]
    fn test_get_delegated_power_accumulates_multiple_delegators() {
        let (env, _, _, _, tree_token, client) = setup();
        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        // 5 delegators, each locking 100 tokens → sqrt(100) = 10 each
        for _ in 0..5u32 {
            let delegator = Address::generate(&env);
            lock_for_voter(&env, &tree_token, &client, &delegator, 100);
            client.delegate_to(&delegator, &delegate);
        }
        assert_eq!(client.get_delegated_power(&delegate), 50); // 5 × 10
    }

    // ── Quadratic voting lock tests (issue #761) ──────────────────────────────

    #[test]
    fn test_lock_tokens_stores_correct_voting_power() {
        let (env, admin, _, _, tree_token, client) = setup();
        token::StellarAssetClient::new(&env, &tree_token).mint(&admin, &10_000);
        client.lock_tokens(&admin, &10_000);
        let lock = client.locked_balance(&admin).unwrap();
        assert_eq!(lock.amount, 10_000);
        assert_eq!(lock.voting_power, 100); // sqrt(10000) = 100
    }

    #[test]
    fn test_lock_tokens_accumulates_on_successive_calls() {
        let (env, admin, _, _, tree_token, client) = setup();
        token::StellarAssetClient::new(&env, &tree_token).mint(&admin, &20_000);
        client.lock_tokens(&admin, &9_000);
        client.lock_tokens(&admin, &7_000);
        let lock = client.locked_balance(&admin).unwrap();
        assert_eq!(lock.amount, 16_000);
        assert_eq!(lock.voting_power, PlatformGovernance::isqrt(16_000));
    }

    #[test]
    fn test_unlock_tokens_reduces_balance_and_recomputes_power() {
        let (env, admin, _, _, tree_token, client) = setup();
        token::StellarAssetClient::new(&env, &tree_token).mint(&admin, &10_000);
        client.lock_tokens(&admin, &10_000);
        client.unlock_tokens(&admin, &6_000);
        let lock = client.locked_balance(&admin).unwrap();
        assert_eq!(lock.amount, 4_000);
        assert_eq!(lock.voting_power, PlatformGovernance::isqrt(4_000));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #202)")]
    fn test_unlock_more_than_locked_rejected() {
        let (env, admin, _, _, tree_token, client) = setup();
        token::StellarAssetClient::new(&env, &tree_token).mint(&admin, &5_000);
        client.lock_tokens(&admin, &5_000);
        client.unlock_tokens(&admin, &6_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #200)")]
    fn test_unlock_with_no_lock_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        client.unlock_tokens(&admin, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #201)")]
    fn test_lock_zero_amount_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        client.lock_tokens(&admin, &0);
    }

    #[test]
    fn test_different_lock_amounts_produce_different_voting_powers() {
        let (env, _, _, _, tree_token, client) = setup();
        let voter_a = Address::generate(&env);
        let voter_b = Address::generate(&env);
        token::StellarAssetClient::new(&env, &tree_token).mint(&voter_a, &100);
        token::StellarAssetClient::new(&env, &tree_token).mint(&voter_b, &10_000);
        client.lock_tokens(&voter_a, &100);
        client.lock_tokens(&voter_b, &10_000);
        let power_a = client.locked_balance(&voter_a).unwrap().voting_power;
        let power_b = client.locked_balance(&voter_b).unwrap().voting_power;
        // A: sqrt(100) = 10; B: sqrt(10000) = 100 → 10x lock but same multiplier
        assert_eq!(power_a, 10);
        assert_eq!(power_b, 100);
        // Power ratio should be sqrt(100) not 100x
        assert_eq!(power_b / power_a, 10);
    }

    #[test]
    fn test_voting_power_used_in_vote() {
        let (env, _, _, _, tree_token, client) = setup();
        let voter_a = Address::generate(&env);
        let voter_b = Address::generate(&env);
        // A locks 100 → power 10; B locks 10000 → power 100
        token::StellarAssetClient::new(&env, &tree_token).mint(&voter_a, &100);
        token::StellarAssetClient::new(&env, &tree_token).mint(&voter_b, &10_000);
        client.lock_tokens(&voter_a, &100);
        client.lock_tokens(&voter_b, &10_000);

        let proposer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &tree_token).mint(&proposer, &1);
        client.lock_tokens(&proposer, &1);

        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "A") });
        options.push_back(VoteOption { option_id: 2, description: String::from_str(&env, "B") });
        client.create_proposal(&String::from_str(&env, "h"), &ProposalType::PlatformFee, &options, &604800, &proposer);

        client.vote(&0, &1, &voter_a);
        client.vote(&0, &2, &voter_b);

        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 10 + 100); // 110
        let tally_1 = proposal.tally.iter().find(|t| t.option_id == 1).unwrap();
        let tally_2 = proposal.tally.iter().find(|t| t.option_id == 2).unwrap();
        assert_eq!(tally_1.votes, 10);
        assert_eq!(tally_2.votes, 100);
    }

    #[test]
    #[should_panic(expected = "must lock TREE tokens to vote")]
    fn test_vote_without_locked_tokens_rejected() {
        let (env, admin, _, _, _tree_token, client) = setup();
        let mut options = Vec::new(&env);
        options.push_back(VoteOption { option_id: 1, description: String::from_str(&env, "Yes") });
        client.create_proposal(&String::from_str(&env, "h"), &ProposalType::PlatformFee, &options, &604800, &admin);
        client.vote(&0, &1, &admin); // admin has no locked tokens
    }

    #[test]
    fn test_locked_balance_returns_none_for_unlocked_voter() {
        let (env, admin, _, _, _tree_token, client) = setup();
        assert!(client.locked_balance(&admin).is_none());
    }

    #[test]
    fn test_quadratic_dampening_vs_linear() {
        // Verify that doubling locked tokens does NOT double voting power
        // (quadratic property: sqrt(4x) = 2*sqrt(x))
        assert_eq!(PlatformGovernance::isqrt(400), 20);
        assert_eq!(PlatformGovernance::isqrt(100), 10);
        // 4x tokens → only 2x power
        assert_eq!(PlatformGovernance::isqrt(400) / PlatformGovernance::isqrt(100), 2);
    }

    #[test]
    fn test_delegate_voting_power_transfer() {
        let (env, _, _, _, client) = setup();

        let proxy = Address::generate(&env);
        let voter = Address::generate(&env);

        client.register_delegate(&proxy, &String::from_str(&env, "governance"));
        client.delegate_voting_power(&voter, &proxy);

        assert_eq!(client.get_delegation(&voter), Some(proxy.clone()));
        assert_eq!(client.get_delegated_power(&proxy), 1000);
    }

    // ── Dynamic quorum tests ────────────────────────────────────────────────────

    #[test]
    fn test_adjust_quorum_zero_participation() {
        let (_, admin, _, _, client) = setup();
        client.adjust_quorum(&admin);
        assert_eq!(client.quorum_percentage(), MAX_DYNAMIC_QUORUM);
    }

    #[test]
    fn test_adjust_quorum_low_participation() {
        let (env, admin, _, _, client) = setup();

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &admin,
        );
        client.vote(&0, &1, &admin);

        client.adjust_quorum(&admin);
        // 1000 / 100_000 * 10_000 = 100 bps => quorum = 25 - (100*20/10000) = 23
        assert_eq!(client.quorum_percentage(), 23);
    }

    #[test]
    fn test_adjust_quorum_high_participation() {
        let (env, admin, _, _, client) = setup();

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &admin,
        );

        for _ in 0..50u32 {
            let voter = Address::generate(&env);
            client.vote(&0, &1, &voter);
        }

        client.adjust_quorum(&admin);
        // 50_000 / 100_000 * 10_000 = 5000 bps => quorum = 25 - (5000*20/10000) = 15
        assert_eq!(client.quorum_percentage(), 15);
    }

    #[test]
    fn test_adjust_quorum_max_participation_clamped() {
        let (env, admin, _, _, client) = setup();

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &admin,
        );

        for _ in 0..120u32 {
            let voter = Address::generate(&env);
            client.vote(&0, &1, &voter);
        }

        client.adjust_quorum(&admin);
        // Participation rate clamped at 10000 bps => minimum quorum
        assert_eq!(client.quorum_percentage(), MIN_DYNAMIC_QUORUM);
    }

    #[test]
    fn test_30_day_window_ignores_old_votes() {
        let (env, admin, _, _, client) = setup();

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &admin,
        );
        let voter1 = Address::generate(&env);
        client.vote(&0, &1, &voter1);

        // Move forward 31 days and vote again with a different address.
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + 31u64 * 86_400);
        let voter2 = Address::generate(&env);
        client.vote(&0, &1, &voter2);

        client.adjust_quorum(&admin);
        // Only voter2 (1000) is in the 30-day window.
        assert_eq!(client.participation_30d(), 1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_adjust_quorum_unauthorized() {
        let (env, _admin, _, _, client) = setup();
        let attacker = Address::generate(&env);
        client.adjust_quorum(&attacker);
    }

    #[test]
    fn test_participation_rate_bps() {
        let (env, admin, _, _, client) = setup();

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &admin,
        );

        for _ in 0..10u32 {
            let voter = Address::generate(&env);
            client.vote(&0, &1, &voter);
        }

        client.adjust_quorum(&admin);
        assert_eq!(client.participation_rate_bps(), 1000);
        assert_eq!(client.participation_30d(), 10_000);
    }

    // ── Vesting tests ──────────────────────────────────────────────────────

    fn setup_token<'a>(
        env: &'a Env,
        admin: &Address,
        initial_supply: i128,
    ) -> (Address, TokenClient<'a>) {
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let token_client = TokenClient::new(env, &token_id);
        soroban_sdk::token::StellarAssetClient::new(env, &token_id).mint(admin, &initial_supply);
        (token_id, token_client)
    }

    fn vesting_one_year() -> (u64, u64, u64) {
        let cliff = 86_400u64 * 30; // 30-day cliff
        let dur = 86_400u64 * 365;  // 1-year total vesting
        (0u64, cliff, dur)
    }

    // ─── create_vesting_schedule ──────────────────────────────────────────

    #[test]
    fn test_create_vesting_schedule_stores_and_transfers() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 3_650_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let (start, cliff, dur) = vesting_one_year();

        client.create_vesting_schedule(&planter, &token, &total, &start, &cliff, &dur);

        let sched = client
            .get_vesting_schedule(&planter)
            .expect("schedule should exist");
        assert_eq!(sched.planter, planter);
        assert_eq!(sched.token, token);
        assert_eq!(sched.total_amount, total);
        assert_eq!(sched.claimed_amount, 0);
        assert_eq!(sched.cliff_seconds, cliff);
        assert_eq!(sched.vesting_seconds, dur);
        assert_eq!(sched.revoked, false);

        assert_eq!(
            tok.balance(&env.current_contract_address()),
            total
        );
        assert_eq!(tok.balance(&admin), total * 9);
    }

    #[test]
    fn test_create_vesting_defaults_start_at_to_now() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        let t0 = env.ledger().timestamp();

        client.create_vesting_schedule(&planter, &token, &100_000i128, &0u64, &cliff, &dur);

        let sched = client.get_vesting_schedule(&planter).unwrap();
        assert_eq!(sched.start_at, t0);
    }

    #[test]
    fn test_create_vesting_explicit_start_at() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        let future = env.ledger().timestamp() + 1_000_000;

        client.create_vesting_schedule(
            &planter, &token, &100_000i128, &future, &cliff, &dur,
        );

        assert_eq!(client.get_vesting_schedule(&planter).unwrap().start_at, future);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_vesting_rejects_zero_amount() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        client.create_vesting_schedule(&planter, &token, &0i128, &0u64, &cliff, &dur);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_create_vesting_rejects_negative_amount() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        client.create_vesting_schedule(&planter, &token, &-1i128, &0u64, &cliff, &dur);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_create_vesting_rejects_zero_duration() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        client.create_vesting_schedule(&planter, &token, &100_000i128, &0u64, &0u64, &0u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_create_vesting_cliff_cannot_exceed_duration() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        client.create_vesting_schedule(
            &planter, &token, &100_000i128, &0u64, &1000u64, &100u64,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_create_vesting_rejects_duplicate_active_schedule() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 10_000_000);
        let (_, cliff, dur) = vesting_one_year();
        client.create_vesting_schedule(&planter, &token, &100_000i128, &0u64, &cliff, &dur);
        // second schedule for same planter must fail
        client.create_vesting_schedule(&planter, &token, &50_000i128, &0u64, &cliff, &dur);
    }

    #[test]
    fn test_create_vesting_after_revoke_allows_new_schedule() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 10_000_000);
        let (_, cliff, dur) = vesting_one_year();
        client.create_vesting_schedule(&planter, &token, &100_000i128, &0u64, &cliff, &dur);
        client.revoke_vesting_schedule(&planter);
        // revoked → new schedule is permitted
        client.create_vesting_schedule(&planter, &token, &50_000i128, &0u64, &cliff, &dur);
        assert_eq!(client.get_vesting_schedule(&planter).unwrap().total_amount, 50_000);
    }

    // ─── compute_vested_amount / queries ──────────────────────────────────

    #[test]
    fn test_vested_zero_before_cliff() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(
            &planter, &token, &3_650_000i128, &start, &cliff, &dur,
        );

        // t = start + cliff - 1s → still before cliff
        env.ledger().set_timestamp(start + cliff - 1);
        assert_eq!(client.get_vested_amount(&planter), 0);
        assert_eq!(client.get_claimable_amount(&planter), 0);
    }

    #[test]
    fn test_vested_full_after_duration() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 3_650_000i128;
        let (token, _) = setup_token(&env, &admin, total * 10);
        let (_, cliff, dur) = vesting_one_year();
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &cliff, &dur);

        // way past the end → capped at total
        env.ledger().set_timestamp(start + dur + 100);
        assert_eq!(client.get_vested_amount(&planter), total);
        assert_eq!(client.get_claimable_amount(&planter), total);
    }

    #[test]
    fn test_vested_linear_release_midway() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 3_650_000i128;
        let (token, _) = setup_token(&env, &admin, total * 10);
        let cliff = 86_400u64 * 30;
        let dur = 86_400u64 * 365;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &cliff, &dur);

        // exactly halfway through the vesting period (after cliff):
        // elapsed = start + dur/2 - start = dur/2
        // vested = total * (dur/2) / dur = total / 2 = 1_825_000
        let halfway = start + dur / 2;
        env.ledger().set_timestamp(halfway);
        let vested = client.get_vested_amount(&planter);
        assert_eq!(vested, total / 2);
    }

    #[test]
    fn test_vested_exactly_at_cliff_is_zero() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(
            &planter, &token, &3_650_000i128, &start, &cliff, &dur,
        );
        // Cliff is start+cliff: elapsed since start = cliff, but at the exact
        // cliff boundary the comparison is now < cliff_ts, so exactly at the
        // cliff boundary is still zero.  1s after cliff it begins releasing.
        env.ledger().set_timestamp(start + cliff);
        assert_eq!(client.get_vested_amount(&planter), 0);
        env.ledger().set_timestamp(start + cliff + 1);
        assert!(client.get_vested_amount(&planter) > 0);
    }

    #[test]
    fn test_vested_with_zero_cliff_starts_immediately() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 10_000i128;
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let dur = 100u64;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &0u64, &dur);

        env.ledger().set_timestamp(start + 50); // half elapsed
        assert_eq!(client.get_vested_amount(&planter), 5_000);
    }

    #[test]
    fn test_get_vesting_schedule_returns_none_when_missing() {
        let (env, _, _, _, client) = setup();
        let random = Address::generate(&env);
        assert!(client.get_vesting_schedule(&random).is_none());
    }

    #[test]
    fn test_get_vested_and_claimable_zero_for_unknown_planter() {
        let (env, _, _, _, client) = setup();
        let random = Address::generate(&env);
        assert_eq!(client.get_vested_amount(&random), 0);
        assert_eq!(client.get_claimable_amount(&random), 0);
    }

    // ─── claim_vested_tokens ──────────────────────────────────────────────

    #[test]
    fn test_claim_after_full_vesting_releases_all() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 1_000_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let (_, cliff, dur) = vesting_one_year();
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &cliff, &dur);

        env.ledger().set_timestamp(start + dur + 1);
        let claimed = client.claim_vested_tokens(&planter);
        assert_eq!(claimed, total);
        assert_eq!(tok.balance(&planter), total);
        assert_eq!(tok.balance(&env.current_contract_address()), 0);

        let sched = client.get_vesting_schedule(&planter).unwrap();
        assert_eq!(sched.claimed_amount, total);
        assert_eq!(client.get_claimable_amount(&planter), 0);
    }

    #[test]
    fn test_claim_partial_then_remaining() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 10_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let dur = 100u64;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &0u64, &dur);

        // First claim at 30%
        env.ledger().set_timestamp(start + 30);
        let c1 = client.claim_vested_tokens(&planter);
        assert_eq!(c1, 3_000);
        assert_eq!(tok.balance(&planter), 3_000);

        // Second claim at 70% total → 4_000 more
        env.ledger().set_timestamp(start + 70);
        let c2 = client.claim_vested_tokens(&planter);
        assert_eq!(c2, 4_000);
        assert_eq!(tok.balance(&planter), 7_000);

        // Final claim
        env.ledger().set_timestamp(start + dur + 10);
        let c3 = client.claim_vested_tokens(&planter);
        assert_eq!(c3, 3_000);
        assert_eq!(tok.balance(&planter), 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_claim_without_schedule_fails() {
        let (env, _, _, _, client) = setup();
        let random = Address::generate(&env);
        client.claim_vested_tokens(&random);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_claim_before_cliff_fails() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(
            &planter, &token, &1_000_000i128, &start, &cliff, &dur,
        );
        env.ledger().set_timestamp(start + cliff / 2);
        client.claim_vested_tokens(&planter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_claim_after_full_claim_fails_with_nothing_to_claim() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 10_000i128;
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let dur = 100u64;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &0u64, &dur);
        env.ledger().set_timestamp(start + dur + 1);
        client.claim_vested_tokens(&planter);
        // second call — everything already claimed
        client.claim_vested_tokens(&planter);
    }

    // ─── revoke_vesting_schedule ──────────────────────────────────────────

    #[test]
    fn test_revoke_refunds_unvested_and_keeps_vested_claimable() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 10_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let dur = 100u64;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &0u64, &dur);

        let admin_before = tok.balance(&admin);

        // Revoke at 40% — planter keeps 4_000, 6_000 returns to admin
        env.ledger().set_timestamp(start + 40);
        client.revoke_vesting_schedule(&planter);

        assert_eq!(tok.balance(&admin), admin_before + 6_000);
        // 4_000 still in contract waiting for planter claim
        assert_eq!(tok.balance(&env.current_contract_address()), 4_000);

        let sched = client.get_vesting_schedule(&planter).unwrap();
        assert_eq!(sched.revoked, true);

        // Even after more time passes, vested is capped at what was vested
        // at revoke time (the unvested portion is already refunded out).
        env.ledger().set_timestamp(start + dur * 2);
        // Now claim — should get the 4_000 that was vested at revoke time
        let c = client.claim_vested_tokens(&planter);
        assert_eq!(c, 4_000);
        assert_eq!(tok.balance(&planter), 4_000);
        assert_eq!(tok.balance(&env.current_contract_address()), 0);
    }

    #[test]
    fn test_revoke_after_full_vesting_refunds_nothing() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 10_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let dur = 100u64;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &0u64, &dur);

        env.ledger().set_timestamp(start + dur + 1);
        let admin_before = tok.balance(&admin);
        client.revoke_vesting_schedule(&planter);
        assert_eq!(tok.balance(&admin), admin_before); // nothing refunded
        assert_eq!(tok.balance(&env.current_contract_address()), total);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_revoke_no_schedule_fails() {
        let (env, _, _, _, client) = setup();
        let random = Address::generate(&env);
        client.revoke_vesting_schedule(&random);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_revoke_twice_fails() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        let (_, cliff, dur) = vesting_one_year();
        client.create_vesting_schedule(
            &planter, &token, &10_000i128, &0u64, &cliff, &dur,
        );
        client.revoke_vesting_schedule(&planter);
        client.revoke_vesting_schedule(&planter); // must panic
    }

    // ─── combined lifecycle ───────────────────────────────────────────────

    #[test]
    fn test_vesting_full_lifecycle_create_claim_revoke_claim() {
        let (env, admin, _, _, client) = setup();
        let planter = Address::generate(&env);
        let total = 365_000i128;
        let (token, tok) = setup_token(&env, &admin, total * 10);
        let cliff = 86_400u64 * 30;
        let dur = 86_400u64 * 365;
        let start = env.ledger().timestamp();
        client.create_vesting_schedule(&planter, &token, &total, &start, &cliff, &dur);

        // 60 days in: 30 days past cliff, so 30/365 vested = 30_000 tokens
        let d60 = start + 86_400u64 * 60;
        env.ledger().set_timestamp(d60);
        let c1 = client.claim_vested_tokens(&planter);
        assert_eq!(c1, 30_000);
        assert_eq!(tok.balance(&planter), 30_000);

        // Revoke now: 60/365 vested total = 60_000, minus 30_000 already
        // claimed → 30_000 still locked for planter; 305_000 refunded.
        let admin_before = tok.balance(&admin);
        client.revoke_vesting_schedule(&planter);
        assert_eq!(tok.balance(&admin), admin_before + total - 60_000);

        // Planter claims remaining vested (60_000 - 30_000)
        let c2 = client.claim_vested_tokens(&planter);
        assert_eq!(c2, 30_000);
        assert_eq!(tok.balance(&planter), 60_000);
    }

    // ─── authorization ────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_create_vesting_without_init_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PlatformGovernance);
        let client = PlatformGovernanceClient::new(&env, &contract_id);
        let planter = Address::generate(&env);
        let admin = Address::generate(&env);
        let (token, _) = setup_token(&env, &admin, 1_000_000);
        client.create_vesting_schedule(&planter, &token, &100_000i128, &0u64, &0u64, &1000u64);
    }
}
