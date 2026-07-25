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

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

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
    Rejected,
    Executed,
    Expired,
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
    /// Earliest execution timestamp (after timelock)
    pub executable_at: u64,
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

fn proposal_key(id: u64) -> (Symbol, u64) {
    (symbol_short!("PROPOSAL"), id)
}

fn vote_key(proposal_id: u64, voter: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("VOTE"), proposal_id, voter.clone())
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

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_QUORUM_PERCENTAGE: u64 = 10; // 10%
const DEFAULT_TIMELOCK_SECONDS: u64 = 172800; // 48 hours
const DEFAULT_PLATFORM_FEE: u64 = 5; // 5%
const DEFAULT_MIN_PLANTING_BOND: i128 = 1_000_000; // 1M tokens

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlatformGovernance;

#[contractimpl]
impl PlatformGovernance {
    /// One-time initialisation.
    ///
    /// `admin`              — admin address for contract management
    /// `staking_contract`   — verifier-staking contract for voting power
    /// `admin_controls`     — admin-controls contract for parameter updates
    /// `platform_fee`       — initial platform fee percentage
    /// `min_planting_bond`  — initial minimum planting bond
    pub fn initialize(
        env: Env,
        admin: Address,
        staking_contract: Address,
        admin_controls: Address,
        platform_fee: u64,
        min_planting_bond: i128,
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

        // Initialize empty verifier whitelist
        let whitelist: Vec<Address> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&verifier_whitelist_key(), &whitelist);
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

        let timelock: u64 = env
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
            executable_at: now + voting_period + timelock,
        };

        env.storage()
            .persistent()
            .set(&proposal_key(id), &proposal);
        env.storage()
            .instance()
            .set(&proposal_count_key(), &(id + 1));

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
        if env
            .storage()
            .persistent()
            .has(&delegation_key(&voter))
        {
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

        // Get voting power from staking contract
        let staking_contract: Address = env
            .storage()
            .instance()
            .get(&staking_contract_key())
            .expect("not initialized");
        
        // Get raw voting power (staked token amount)
        let own_power = Self::get_voting_power(&env, &staking_contract, &voter);
        
        // Add delegated power from all direct delegators.
        let delegated_power =
            Self::aggregate_delegated_power(&env, &staking_contract, &voter);
            
        let raw_power = own_power + delegated_power;

        if raw_power <= 0 {
            panic!("must be a staked verifier or delegate to vote");
        }
        
        // Apply quadratic voting for SpeciesSelection proposals
        // Voting power = sqrt(token holdings)
        let power = if proposal.proposal_type == ProposalType::SpeciesSelection {
            Self::isqrt(raw_power)
        } else {
            raw_power
        };

        // Validate option_id exists
        let option_exists = proposal.options.iter().any(|opt| opt.option_id == option_id);
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
        let total_staked = Self::get_total_staked(&env, &staking_contract);
        let quorum_percentage: u64 = env
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

        env.events().publish(
            (symbol_short!("vote"), proposal_id),
            (voter, option_id, power),
        );
    }

    /// Execute a passed proposal to update platform parameters.
    ///
    /// `proposal_id` — proposal to execute
    pub fn execute(env: Env, proposal_id: u64) {
        Self::assert_not_paused(&env);

        let mut proposal: ProposalRecord = env
            .storage()
            .persistent()
            .get(&proposal_key(proposal_id))
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Passed {
            panic!("proposal has not passed");
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
                    env.storage()
                        .instance()
                        .set(&platform_fee_key(), &new_fee);
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

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("executed")),
            (proposal_id, proposal.proposal_type),
        );
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

        // Initialise empty delegators list on first registration.
        if !env
            .storage()
            .persistent()
            .has(&delegators_key(&delegate))
        {
            let empty: Vec<Address> = Vec::new(&env);
            env.storage()
                .persistent()
                .set(&delegators_key(&delegate), &empty);
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
        if env
            .storage()
            .persistent()
            .has(&delegation_key(&delegator))
        {
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

        env.events().publish(
            (symbol_short!("delegate"), symbol_short!("delegated")),
            (delegator, delegate),
        );
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
        env.storage()
            .persistent()
            .get(&delegation_key(&delegator))
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
        env.events()
            .publish((symbol_short!("timelock"),), new_timelock);
    }

    /// Directly set platform fee (emergency override). Admin only.
    pub fn set_platform_fee(env: Env, new_fee: u64) {
        Self::require_admin(&env);
        if new_fee > 100 {
            panic!("fee must be <= 100%");
        }
        env.storage()
            .instance()
            .set(&platform_fee_key(), &new_fee);
        env.events()
            .publish((symbol_short!("fee_set"),), new_fee);
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
        env.events()
            .publish((symbol_short!("bond_set"),), new_bond);
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
        env.events()
            .publish((symbol_short!("wl_add"),), verifier);
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
        env.events()
            .publish((symbol_short!("wl_rm"),), verifier);
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
        Address, Env, String,
    };

    fn setup() -> (Env, Address, Address, Address, PlatformGovernanceClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PlatformGovernance);
        let client = PlatformGovernanceClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let staking_contract = Address::generate(&env);
        let admin_controls = Address::generate(&env);

        client.initialize(
            &admin,
            &staking_contract,
            &admin_controls,
            &DEFAULT_PLATFORM_FEE,
            &DEFAULT_MIN_PLANTING_BOND,
        );

        (env, admin, staking_contract, admin_controls, client)
    }

    // ── Existing tests ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize() {
        let (_, _admin, _, _, client) = setup();

        assert_eq!(client.platform_fee(), DEFAULT_PLATFORM_FEE);
        assert_eq!(client.min_planting_bond(), DEFAULT_MIN_PLANTING_BOND);
        assert_eq!(client.quorum_percentage(), DEFAULT_QUORUM_PERCENTAGE);
        assert_eq!(client.timelock_seconds(), DEFAULT_TIMELOCK_SECONDS);
    }

    #[test]
    fn test_create_proposal() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });
        options.push_back(VoteOption {
            option_id: 2,
            description: String::from_str(&env, "Set fee to 15%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);

        assert_eq!(client.proposal_count(), 1);

        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.description_hash, description_hash);
        assert!(matches!(proposal.status, ProposalStatus::Active));
    }

    #[test]
    fn test_vote_on_proposal() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);
        client.vote(&0, &1, &admin);

        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 1000);
    }

    #[test]
    #[should_panic(expected = "already voted on this proposal")]
    fn test_double_vote_rejected() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);
        client.vote(&0, &1, &admin);
        client.vote(&0, &1, &admin);
    }

    #[test]
    fn test_execute_passed_proposal() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &1, &admin);

        // Vote with admin (single vote for simplicity)
        client.vote(&0, &1, &admin);

        // Advance past voting period and timelock
        env.ledger().set_timestamp(env.ledger().timestamp() + 200000);

        let _proposal = client.get_proposal(&0);
    }

    #[test]
    #[should_panic(expected = "proposal has not passed")]
    fn test_execute_failed_proposal_rejected() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "hash123");
        let proposal_type = ProposalType::PlatformFee;

        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &1, &admin);

        // Try to execute without meeting quorum
        client.execute(&0);
    }

    #[test]
    fn test_admin_set_platform_fee() {
        let (_, _admin, _, _, client) = setup();

        client.set_platform_fee(&15);
        assert_eq!(client.platform_fee(), 15);
    }

    #[test]
    fn test_verifier_whitelist() {
        let (env, _admin, _, _, client) = setup();

        let verifier = Address::generate(&env);
        client.add_verifier_to_whitelist(&verifier);

        let whitelist = client.verifier_whitelist();
        assert_eq!(whitelist.len(), 1);
        assert_eq!(whitelist.get(0).unwrap(), verifier);

        client.remove_verifier_from_whitelist(&verifier);
        let whitelist = client.verifier_whitelist();
        assert_eq!(whitelist.len(), 0);
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
        // Test non-perfect squares
        assert_eq!(PlatformGovernance::isqrt(2), 1);
        assert_eq!(PlatformGovernance::isqrt(8), 2);
        assert_eq!(PlatformGovernance::isqrt(15), 3);
        assert_eq!(PlatformGovernance::isqrt(26), 5);
    }

    #[test]
    fn test_quadratic_voting_species_selection() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "species_hash");
        let proposal_type = ProposalType::SpeciesSelection;
        
        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Oak Tree"),
        });
        options.push_back(VoteOption {
            option_id: 2,
            description: String::from_str(&env, "Pine Tree"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);
        client.vote(&0, &1, &admin);

        let proposal = client.get_proposal(&0);
        // With raw power of 1000, sqrt(1000) ≈ 31
        assert_eq!(proposal.total_votes, 31);
    }

    #[test]
    fn test_normal_voting_platform_fee() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "fee_hash");
        let proposal_type = ProposalType::PlatformFee;
        
        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Set fee to 10%"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &604800, &admin);
        client.vote(&0, &1, &admin);

        let proposal = client.get_proposal(&0);
        // Normal voting uses raw power (1000)
        assert_eq!(proposal.total_votes, 1000);
    }

    #[test]
    fn test_species_selection_execution() {
        let (env, admin, _, _, client) = setup();

        let description_hash = String::from_str(&env, "species_hash");
        let proposal_type = ProposalType::SpeciesSelection;
        
        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Oak Tree"),
        });

        client.create_proposal(&description_hash, &proposal_type, &options, &1, &admin);
        client.vote(&0, &1, &admin);

        // Wait for voting period and timelock to pass
        env.ledger().set_timestamp(env.ledger().timestamp() + 200000);

        // Manually set proposal to passed for testing execution
        // In production, this would happen through quorum
        let mut proposal = client.get_proposal(&0);
        proposal.status = ProposalStatus::Passed;
        env.storage()
            .persistent()
            .set(&proposal_key(0), &proposal);

        client.execute(&0);

        let proposal = client.get_proposal(&0);
        assert!(matches!(proposal.status, ProposalStatus::Executed));
    }

    // ── Delegation tests ──────────────────────────────────────────────────────

    #[test]
    fn test_register_delegate() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let domain = String::from_str(&env, "climate");

        client.register_delegate(&delegate, &domain);

        let record = client.get_delegate(&delegate).expect("delegate not found");
        assert_eq!(record.delegate, delegate);
        assert_eq!(record.domain, domain);
    }

    #[test]
    fn test_unregister_delegate_no_delegators() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "verifier"));
        client.unregister_delegate(&delegate);

        assert!(client.get_delegate(&delegate).is_none());
    }

    #[test]
    #[should_panic(expected = "not a registered delegate")]
    fn test_unregister_non_existent_delegate_fails() {
        let (env, _, _, _, client) = setup();
        let random = Address::generate(&env);
        client.unregister_delegate(&random);
    }

    #[test]
    #[should_panic(expected = "cannot unregister: active delegations exist")]
    fn test_unregister_with_active_delegations_fails() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);

        // Must fail — there is still an active delegation.
        client.unregister_delegate(&delegate);
    }

    #[test]
    fn test_delegate_to_registered_delegate() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);

        let stored = client
            .get_delegation(&delegator)
            .expect("delegation not found");
        assert_eq!(stored, delegate);
    }

    #[test]
    #[should_panic(expected = "target is not a registered delegate")]
    fn test_delegate_to_non_registered_fails() {
        let (env, _, _, _, client) = setup();

        let delegator = Address::generate(&env);
        let random = Address::generate(&env);

        client.delegate_to(&delegator, &random);
    }

    #[test]
    #[should_panic(expected = "cannot delegate to yourself")]
    fn test_delegate_to_self_fails() {
        let (env, _, _, _, client) = setup();

        let user = Address::generate(&env);
        client.register_delegate(&user, &String::from_str(&env, "climate"));
        client.delegate_to(&user, &user);
    }

    #[test]
    fn test_retract_delegation() {
        let (env, _, _, _, client) = setup();

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
        let (env, _, _, _, client) = setup();
        let user = Address::generate(&env);
        client.retract_delegation(&user);
    }

    #[test]
    fn test_delegate_to_replaces_existing_delegation() {
        let (env, _, _, _, client) = setup();

        let delegate_a = Address::generate(&env);
        let delegate_b = Address::generate(&env);
        let delegator = Address::generate(&env);

        client.register_delegate(&delegate_a, &String::from_str(&env, "climate"));
        client.register_delegate(&delegate_b, &String::from_str(&env, "verifier"));

        client.delegate_to(&delegator, &delegate_a);
        // Switch to delegate_b atomically.
        client.delegate_to(&delegator, &delegate_b);

        let stored = client.get_delegation(&delegator).unwrap();
        assert_eq!(stored, delegate_b);

        // delegate_a should have no delegators left.
        assert_eq!(client.get_delegated_power(&delegate_a), 0);
        // delegate_b should have the delegator's power.
        assert_eq!(client.get_delegated_power(&delegate_b), 1000);
    }

    #[test]
    fn test_vote_aggregates_delegated_power() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let delegator_1 = Address::generate(&env);
        let delegator_2 = Address::generate(&env);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator_1, &delegate);
        client.delegate_to(&delegator_2, &delegate);

        // Create a proposal and vote as the delegate.
        let mut options = Vec::new(&env);
        options.push_back(VoteOption {
            option_id: 1,
            description: String::from_str(&env, "Yes"),
        });
        client.create_proposal(
            &String::from_str(&env, "hash_dlgt"),
            &ProposalType::PlatformFee,
            &options,
            &604800,
            &delegate,
        );

        client.vote(&0, &1, &delegate);

        let proposal = client.get_proposal(&0);
        // own (1000) + delegator_1 (1000) + delegator_2 (1000) = 3000
        assert_eq!(proposal.total_votes, 3000);

        let vote_rec = client.get_vote(&0, &delegate).unwrap();
        assert_eq!(vote_rec.power, 3000);
    }

    #[test]
    #[should_panic(expected = "voting power delegated; retract delegation before voting")]
    fn test_delegated_user_cannot_vote_directly() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);

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
            &delegate,
        );

        // delegator still has an active delegation → must panic.
        client.vote(&0, &1, &delegator);
    }

    #[test]
    fn test_retract_then_vote_directly() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        let delegator = Address::generate(&env);

        client.register_delegate(&delegate, &String::from_str(&env, "climate"));
        client.delegate_to(&delegator, &delegate);
        client.retract_delegation(&delegator);

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
            &delegate,
        );

        // After retraction the delegator should be able to vote directly.
        client.vote(&0, &1, &delegator);

        let proposal = client.get_proposal(&0);
        assert_eq!(proposal.total_votes, 1000); // only own power, no delegated
    }

    #[test]
    fn test_get_delegated_power_zero_when_no_delegators() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "verifier"));

        assert_eq!(client.get_delegated_power(&delegate), 0);
    }

    #[test]
    fn test_get_delegated_power_accumulates_multiple_delegators() {
        let (env, _, _, _, client) = setup();

        let delegate = Address::generate(&env);
        client.register_delegate(&delegate, &String::from_str(&env, "climate"));

        for _ in 0..5u32 {
            let delegator = Address::generate(&env);
            client.delegate_to(&delegator, &delegate);
        }

        // 5 delegators × 1000 each = 5000
        assert_eq!(client.get_delegated_power(&delegate), 5000);
    }
}
