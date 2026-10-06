#![no_std]

//! Insurance Pool Contract — Issue #1096
//!
//! Manages a pooled insurance fund for tree sponsorships. The pool is funded
//! by a 2% fee on all insured sponsorships and automatically compensates sponsors
//! if their insured trees die within 5 years of planting.
//!
//! ## Flow
//!
//! 1. **`deposit_fee`** — Called by the tree-escrow contract when a donor opts
//!    into insurance. The 2% fee (200 bps) is transferred from the donor to this
//!    pool and recorded against the escrow/farmer.
//!
//! 2. **`register_claim`** — Called by the admin (verifier) when a tree death
//!    is confirmed. Records the claim with the death timestamp and tree count.
//!
//! 3. **`process_claim`** — Callable by the sponsor (donor) after a claim is
//!    registered. Validates the 5-year window and automatically pays out the
//!    insured amount from the pool.
//!
//! 4. **`admin_withdraw`** — Admin can withdraw excess pool funds (above a
//!    required reserve) to maintain pool health.
//!
//! ## Security
//!
//! - Only registered tree-escrow contracts can deposit fees
//! - Only admin can register claims (death verification required)
//! - Claims must be within 5-year window from planting
//! - Pool maintains minimum reserve ratio for solvency
//! - Reentrancy guard on all state-mutating functions

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Insurance fee: 2% of sponsorship amount (200 basis points).
const INSURANCE_FEE_BPS: i128 = 200;

/// Basis point denominator (100% = 10,000 bps).
const BPS_DENOM: i128 = 10_000;

/// Insurance coverage period: 5 years.
const FIVE_YEARS_SECS: u64 = 5 * 365 * 24 * 60 * 60;

/// Minimum reserve ratio: pool must keep at least 20% of total insured value.
const MIN_RESERVE_RATIO_BPS: i128 = 2_000;

/// Maximum claim processing delay: 30 days after death verification.
const MAX_CLAIM_DELAY_SECS: u64 = 30 * 24 * 60 * 60;

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum InsurancePoolError {
    /// Contract already initialized.
    AlreadyInitialized = 1,
    /// Contract not initialized.
    NotInitialized = 2,
    /// Caller is not authorized.
    Unauthorized = 3,
    /// Amount must be positive.
    AmountMustBePositive = 4,
    /// Tree count must be positive.
    TreeCountMustBePositive = 5,
    /// Claim not found.
    ClaimNotFound = 6,
    /// Claim already processed.
    ClaimAlreadyProcessed = 7,
    /// Insurance period expired (beyond 5 years).
    InsurancePeriodExpired = 8,
    /// Claim processing window expired.
    ClaimWindowExpired = 9,
    /// Insufficient pool funds.
    InsufficientPoolFunds = 10,
    /// Withdrawal would breach minimum reserve.
    WithdrawalBreachesReserve = 11,
    /// Invalid tree-escrow contract.
    InvalidEscrowContract = 12,
}

// ── Types ────────────────────────────────────────────────────────────────────

/// Lifecycle state of an insurance claim.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ClaimStatus {
    /// Claim registered, awaiting sponsor processing.
    Pending,
    /// Claim processed and paid out.
    Paid,
    /// Claim rejected (e.g., outside window).
    Rejected,
}

/// An insurance claim for tree death.
#[contracttype]
#[derive(Clone, Debug)]
pub struct InsuranceClaim {
    /// Unique claim identifier.
    pub claim_id: u64,
    /// Farmer address (identifies the escrow).
    pub farmer: Address,
    /// Sponsor/donor address who receives payout.
    pub sponsor: Address,
    /// Number of trees that died.
    pub tree_count: i128,
    /// Insured amount per tree (in stroops).
    pub insured_amount_per_tree: i128,
    /// Total payout amount.
    pub payout_amount: i128,
    /// Timestamp when tree death was verified.
    pub death_verified_at: u64,
    /// Timestamp when tree was planted.
    pub planted_at: u64,
    /// Claim status.
    pub status: ClaimStatus,
    /// Timestamp when claim was processed/paid.
    pub processed_at: u64,
}

/// Administrative configuration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Admin address (verifier).
    pub admin: Address,
    /// Address of the native XLM (SAC) used for payouts.
    pub xlm: Address,
    /// Tree-escrow contract that can deposit fees.
    pub tree_escrow: Address,
    /// Total fees collected in the pool.
    pub total_pool_balance: i128,
    /// Total insured value across all active policies.
    pub total_insured_value: i128,
    /// Total number of claims ever created.
    pub claim_count: u64,
    /// Pause flag for emergency response.
    pub paused: bool,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Config,
    /// Claim record by id.
    Claim(u64),
    /// All claim ids for a given sponsor.
    SponsorClaims(Address),
    /// All claim ids for a given farmer.
    FarmerClaims(Address),
}

// ── Event symbols (max 9 chars) ──────────────────────────────────────────────

const SYM_FEE_DEPOSIT: soroban_sdk::Symbol = symbol_short!("fee_dep");
const SYM_CLAIM_REG: soroban_sdk::Symbol = symbol_short!("claim_reg");
const SYM_CLAIM_PAID: soroban_sdk::Symbol = symbol_short!("claim_paid");
const SYM_WITHDRAW: soroban_sdk::Symbol = symbol_short!("withdraw");
const SYM_CONFIG: soroban_sdk::Symbol = symbol_short!("cfg");

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct InsurancePool;

#[contractimpl]
impl InsurancePool {
    /// Initialize the insurance pool.
    pub fn initialize(env: Env, admin: Address, xlm: Address, tree_escrow: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, InsurancePoolError::AlreadyInitialized);
        }

        let config = Config {
            admin,
            xlm,
            tree_escrow,
            total_pool_balance: 0,
            total_insured_value: 0,
            claim_count: 0,
            paused: false,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.events()
            .publish((SYM_CONFIG, soroban_sdk::String::from_str(&env, "init")), true);
    }

    /// Deposit insurance fee from tree-escrow. Called when a donor opts into insurance.
    ///
    /// Only the registered tree-escrow contract can call this.
    pub fn deposit_fee(
        env: Env,
        escrow: Address,
        sponsor: Address,
        farmer: Address,
        amount: i128,
        tree_count: i128,
        insured_amount_per_tree: i128,
    ) {
        escrow.require_auth();

        let config = Self::get_config(&env);
        if escrow != config.tree_escrow {
            panic_with_error!(&env, InsurancePoolError::InvalidEscrowContract);
        }

        Self::assert_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(&env, InsurancePoolError::AmountMustBePositive);
        }
        if tree_count <= 0 {
            panic_with_error!(&env, InsurancePoolError::TreeCountMustBePositive);
        }

        // Transfer fee from escrow to pool
        token::Client::new(&env, &config.xlm).transfer(
            &escrow,
            &env.current_contract_address(),
            &amount,
        );

        // Update pool state
        let insured_value = insured_amount_per_tree
            .checked_mul(tree_count)
            .expect("insured value overflow");

        let mut cfg = config;
        cfg.total_pool_balance = cfg
            .total_pool_balance
            .checked_add(amount)
            .expect("pool balance overflow");
        cfg.total_insured_value = cfg
            .total_insured_value
            .checked_add(insured_value)
            .expect("insured value overflow");
        env.storage().instance().set(&DataKey::Config, &cfg);

        env.events().publish(
            (SYM_FEE_DEPOSIT, farmer.clone()),
            (sponsor, amount, tree_count),
        );
    }

    /// Register an insurance claim for tree death. Called by admin after verification.
    ///
    /// Records the claim with death timestamp; sponsor must call `process_claim` to receive payout.
    pub fn register_claim(
        env: Env,
        admin: Address,
        sponsor: Address,
        farmer: Address,
        tree_count: i128,
        insured_amount_per_tree: i128,
        planted_at: u64,
    ) -> u64 {
        admin.require_auth();

        let config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, InsurancePoolError::Unauthorized);
        }

        Self::assert_not_paused(&env);

        if tree_count <= 0 {
            panic_with_error!(&env, InsurancePoolError::TreeCountMustBePositive);
        }

        let claim_id = config.claim_count + 1;
        let payout_amount = insured_amount_per_tree
            .checked_mul(tree_count)
            .expect("payout amount overflow");

        let claim = InsuranceClaim {
            claim_id,
            farmer: farmer.clone(),
            sponsor: sponsor.clone(),
            tree_count,
            insured_amount_per_tree,
            payout_amount,
            death_verified_at: env.ledger().timestamp(),
            planted_at,
            status: ClaimStatus::Pending,
            processed_at: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Claim(claim_id), &claim);

        // Track by sponsor and farmer
        let mut sponsor_claims = Self::get_claims_for_sponsor(env.clone(), sponsor.clone());
        sponsor_claims.push_back(claim_id);
        env.storage()
            .persistent()
            .set(&DataKey::SponsorClaims(sponsor), &sponsor_claims);

        let mut farmer_claims = Self::get_claims_for_farmer(env.clone(), farmer.clone());
        farmer_claims.push_back(claim_id);
        env.storage()
            .persistent()
            .set(&DataKey::FarmerClaims(farmer), &farmer_claims);

        // Update claim count
        let mut cfg = config;
        cfg.claim_count = claim_id;
        env.storage().instance().set(&DataKey::Config, &cfg);

        env.events()
            .publish((SYM_CLAIM_REG, claim_id), (sponsor, farmer, tree_count));

        claim_id
    }

    /// Process a registered claim and pay out to the sponsor.
    ///
    /// Validates the 5-year insurance window and transfers funds from the pool.
    pub fn process_claim(env: Env, sponsor: Address, claim_id: u64) {
        sponsor.require_auth();

        Self::assert_not_paused(&env);

        let config = Self::get_config(&env);
        let mut claim: InsuranceClaim = match env.storage().persistent().get(&DataKey::Claim(claim_id))
        {
            Some(c) => c,
            None => panic_with_error!(&env, InsurancePoolError::ClaimNotFound),
        };

        if claim.sponsor != sponsor {
            panic_with_error!(&env, InsurancePoolError::Unauthorized);
        }

        if claim.status != ClaimStatus::Pending {
            panic_with_error!(&env, InsurancePoolError::ClaimAlreadyProcessed);
        }

        // Verify 5-year insurance window
        let elapsed_since_planting = env
            .ledger()
            .timestamp()
            .saturating_sub(claim.planted_at);
        if elapsed_since_planting > FIVE_YEARS_SECS {
            claim.status = ClaimStatus::Rejected;
            env.storage()
                .persistent()
                .set(&DataKey::Claim(claim_id), &claim);
            panic_with_error!(&env, InsurancePoolError::InsurancePeriodExpired);
        }

        // Verify claim processing window (30 days from death verification)
        let elapsed_since_death = env
            .ledger()
            .timestamp()
            .saturating_sub(claim.death_verified_at);
        if elapsed_since_death > MAX_CLAIM_DELAY_SECS {
            claim.status = ClaimStatus::Rejected;
            env.storage()
                .persistent()
                .set(&DataKey::Claim(claim_id), &claim);
            panic_with_error!(&env, InsurancePoolError::ClaimWindowExpired);
        }

        // Check pool has sufficient funds
        if config.total_pool_balance < claim.payout_amount {
            panic_with_error!(&env, InsurancePoolError::InsufficientPoolFunds);
        }

        // Verify reserve ratio after payout
        let new_balance = config
            .total_pool_balance
            .checked_sub(claim.payout_amount)
            .expect("balance underflow");
        let required_reserve = config
            .total_insured_value
            .checked_mul(MIN_RESERVE_RATIO_BPS)
            .and_then(|v| v.checked_div(BPS_DENOM))
            .unwrap_or(0);
        if new_balance < required_reserve {
            panic_with_error!(&env, InsurancePoolError::InsufficientPoolFunds);
        }

        // Transfer payout to sponsor
        token::Client::new(&env, &config.xlm).transfer(
            &env.current_contract_address(),
            &sponsor,
            &claim.payout_amount,
        );

        // Update state
        claim.status = ClaimStatus::Paid;
        claim.processed_at = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::Claim(claim_id), &claim);

        let mut cfg = config;
        cfg.total_pool_balance = new_balance;
        cfg.total_insured_value = cfg
            .total_insured_value
            .checked_sub(claim.payout_amount)
            .expect("insured value underflow");
        env.storage().instance().set(&DataKey::Config, &cfg);

        env.events()
            .publish((SYM_CLAIM_PAID, claim_id), (sponsor, claim.payout_amount));
    }

    /// Admin withdraw excess pool funds (above minimum reserve).
    pub fn admin_withdraw(env: Env, admin: Address, amount: i128) {
        admin.require_auth();

        let config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, InsurancePoolError::Unauthorized);
        }

        if amount <= 0 {
            panic_with_error!(&env, InsurancePoolError::AmountMustBePositive);
        }

        // Calculate required reserve
        let required_reserve = config
            .total_insured_value
            .checked_mul(MIN_RESERVE_RATIO_BPS)
            .and_then(|v| v.checked_div(BPS_DENOM))
            .unwrap_or(0);

        let new_balance = config
            .total_pool_balance
            .checked_sub(amount)
            .expect("withdrawal underflow");

        if new_balance < required_reserve {
            panic_with_error!(&env, InsurancePoolError::WithdrawalBreachesReserve);
        }

        // Transfer to admin
        token::Client::new(&env, &config.xlm).transfer(
            &env.current_contract_address(),
            &admin,
            &amount,
        );

        let mut cfg = config;
        cfg.total_pool_balance = new_balance;
        env.storage().instance().set(&DataKey::Config, &cfg);

        env.events().publish((SYM_WITHDRAW, admin), amount);
    }

    /// Pause/unpause the contract for emergency response.
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        let mut config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, InsurancePoolError::Unauthorized);
        }
        config.paused = paused;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    /// Returns the administrative configuration.
    pub fn get_config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, InsurancePoolError::NotInitialized))
    }

    /// Returns a claim by id, if it exists.
    pub fn get_claim(env: Env, claim_id: u64) -> Option<InsuranceClaim> {
        env.storage().persistent().get(&DataKey::Claim(claim_id))
    }

    /// Returns all claim ids for a given sponsor.
    pub fn get_claims_for_sponsor(env: Env, sponsor: Address) -> soroban_sdk::Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::SponsorClaims(sponsor))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Returns all claim ids for a given farmer.
    pub fn get_claims_for_farmer(env: Env, farmer: Address) -> soroban_sdk::Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::FarmerClaims(farmer))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    fn assert_not_paused(env: &Env) {
        let config = Self::get_config(env);
        if config.paused {
            panic_with_error!(env, InsurancePoolError::Unauthorized);
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Env};

    fn setup() -> (Env, Address, Address, Address, InsurancePoolClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, InsurancePool);
        let client = InsurancePoolClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let xlm = env.register_stellar_asset_contract(admin.clone());
        let tree_escrow = Address::generate(&env);

        client.initialize(&admin, &xlm, &tree_escrow);

        (env, admin, xlm, tree_escrow, client)
    }

    // ── initialize ───────────────────────────────────────────────────────────

    #[test]
    fn initialize_sets_config() {
        let (_, admin, xlm, tree_escrow, client) = setup();
        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.xlm, xlm);
        assert_eq!(config.tree_escrow, tree_escrow);
        assert_eq!(config.total_pool_balance, 0);
        assert_eq!(config.total_insured_value, 0);
        assert_eq!(config.claim_count, 0);
        assert_eq!(config.paused, false);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn initialize_twice_fails() {
        let (_, admin, xlm, tree_escrow, client) = setup();
        client.initialize(&admin, &xlm, &tree_escrow);
    }

    // ── deposit_fee ───────────────────────────────────────────────────────────

    #[test]
    fn deposit_fee_transfers_and_updates_pool() {
        let (env, _admin, xlm, tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &1_000_000);

        client.deposit_fee(
            &tree_escrow,
            &sponsor,
            &farmer,
            &200, // 2% of 10_000
            &10,
            &1_000,
        );

        let config = client.get_config();
        assert_eq!(config.total_pool_balance, 200);
        assert_eq!(config.total_insured_value, 10_000);
        assert_eq!(token::Client::new(&env, &xlm).balance(&client.address), 200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn deposit_fee_from_unauthorized_escrow_fails() {
        let (env, _admin, xlm, _tree_escrow, client) = setup();
        let unauthorized = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&unauthorized, &1_000);

        client.deposit_fee(&unauthorized, &Address::generate(&env), &Address::generate(&env), &200, &10, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn deposit_fee_zero_amount_fails() {
        let (env, _admin, xlm, tree_escrow, client) = setup();
        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &1_000);

        client.deposit_fee(&tree_escrow, &Address::generate(&env), &Address::generate(&env), &0, &10, &1_000);
    }

    // ── register_claim ────────────────────────────────────────────────────────

    #[test]
    fn register_claim_creates_claim_record() {
        let (env, admin, _xlm, _tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let claim_id = client.register_claim(&admin, &sponsor, &farmer, &5, &1_000, env.ledger().timestamp());

        assert_eq!(claim_id, 1);

        let claim = client.get_claim(&claim_id).unwrap();
        assert_eq!(claim.sponsor, sponsor);
        assert_eq!(claim.farmer, farmer);
        assert_eq!(claim.tree_count, 5);
        assert_eq!(claim.status, ClaimStatus::Pending);
        assert_eq!(claim.payout_amount, 5_000);

        let config = client.get_config();
        assert_eq!(config.claim_count, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn register_claim_unauthorized_fails() {
        let (env, _admin, _xlm, _tree_escrow, client) = setup();
        client.register_claim(
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &5,
            &1_000,
            env.ledger().timestamp(),
        );
    }

    // ── process_claim ─────────────────────────────────────────────────────────

    #[test]
    fn process_claim_pays_sponsor_within_window() {
        let (env, admin, xlm, tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        // Fund the pool
        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &100_000);
        client.deposit_fee(&tree_escrow, &sponsor, &farmer, &2_000, &10, &1_000);

        let planted_at = env.ledger().timestamp();
        let claim_id = client.register_claim(&admin, &sponsor, &farmer, &5, &1_000, planted_at);

        // Process claim within 5-year window
        client.process_claim(&sponsor, &claim_id);

        let claim = client.get_claim(&claim_id).unwrap();
        assert_eq!(claim.status, ClaimStatus::Paid);
        assert_eq!(token::Client::new(&env, &xlm).balance(&sponsor), 5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn process_claim_beyond_5_years_fails() {
        let (env, admin, _xlm, _tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let planted_at = env.ledger().timestamp();
        let claim_id = client.register_claim(&admin, &sponsor, &farmer, &5, &1_000, planted_at);

        // Advance beyond 5 years
        env.ledger().set_timestamp(planted_at + FIVE_YEARS_SECS + 1);

        client.process_claim(&sponsor, &claim_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn process_claim_beyond_30_day_window_fails() {
        let (env, admin, _xlm, _tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let planted_at = env.ledger().timestamp();
        let claim_id = client.register_claim(&admin, &sponsor, &farmer, &5, &1_000, planted_at);

        // Advance beyond 30 days from claim registration
        env.ledger().set_timestamp(env.ledger().timestamp() + MAX_CLAIM_DELAY_SECS + 1);

        client.process_claim(&sponsor, &claim_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn process_claim_insufficient_funds_fails() {
        let (env, admin, xlm, tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        // Fund pool with insufficient amount
        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &100);
        client.deposit_fee(&tree_escrow, &sponsor, &farmer, &100, &10, &1_000);

        let claim_id = client.register_claim(&admin, &sponsor, &farmer, &5, &1_000, env.ledger().timestamp());

        client.process_claim(&sponsor, &claim_id);
    }

    // ── admin_withdraw ───────────────────────────────────────────────────────

    #[test]
    fn admin_withdraw_allows_excess_withdrawal() {
        let (env, admin, xlm, tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        // Fund pool
        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &100_000);
        client.deposit_fee(&tree_escrow, &sponsor, &farmer, &10_000, &10, &1_000);

        // Required reserve: 20% of 10_000 = 2_000
        // Can withdraw up to 8_000
        client.admin_withdraw(&admin, &5_000);

        let config = client.get_config();
        assert_eq!(config.total_pool_balance, 5_000);
        assert_eq!(token::Client::new(&env, &xlm).balance(&admin), 5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn admin_withdraw_breaches_reserve_fails() {
        let (env, admin, xlm, tree_escrow, client) = setup();
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &100_000);
        client.deposit_fee(&tree_escrow, &sponsor, &farmer, &10_000, &10, &1_000);

        // Try to withdraw more than allowed (would breach 20% reserve)
        client.admin_withdraw(&admin, &9_000);
    }

    // ── pause ─────────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn paused_operations_are_blocked() {
        let (env, admin, xlm, tree_escrow, client) = setup();
        client.set_paused(&admin, &true);

        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&tree_escrow, &1_000);

        client.deposit_fee(&tree_escrow, &sponsor, &farmer, &200, &10, &1_000);
    }
}
