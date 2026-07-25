#![no_std]

//! Planting Bond Contract — Closes #468
//!
//! Planters lock a tier-based XLM bond when accepting a job.
//! The bond is returned on successful verification, or slashed to the
//! treasury address on abandonment (deadline elapsed, not verified).
//!
//! ## Roles
//! - **admin**: sets tier amounts, calls `return_bond` / `slash_bond`.
//! - **planter**: calls `accept_job` to lock their bond.
//!
//! ## Job tiers (bond amounts in stroops)
//! | Tier | Amount |
//! |------|--------|
//! | 0    | 10 XLM (10_000_000 stroops) |
//! | 1    | 25 XLM (25_000_000 stroops) |
//! | 2    | 50 XLM (50_000_000 stroops) |

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal,
};

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidTier = 3,
    BondAlreadyExists = 4,
    BondNotFound = 5,
    BondAlreadySettled = 6,
    DeadlineNotPassed = 7,
    NotAuthorized = 8,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// 7 days in seconds — abandonment deadline.
const ABANDON_DEADLINE: u64 = 7 * 24 * 60 * 60;

/// Number of supported job tiers.
const TIER_COUNT: u32 = 3;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BondStatus {
    Active,
    Returned,
    Slashed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bond {
    pub planter: Address,
    pub tree_id: u64,
    pub tier: u32,
    pub amount: i128,
    pub token: Address,
    pub accepted_at: u64,
    pub status: BondStatus,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlantingBond;

#[contractimpl]
impl PlantingBond {
    /// One-time setup.
    ///
    /// - `admin`: the only address allowed to call `return_bond` / `slash_bond`.
    /// - `treasury`: receives slashed bonds.
    /// - `token`: XLM token contract address.
    /// - `tier_amounts`: bond amounts in stroops for tiers 0, 1, 2.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        token: Address,
        tier_amounts: (i128, i128, i128),
    ) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("TREAS"), &treasury);
        env.storage().instance().set(&symbol_short!("TOKEN"), &token);
        env.storage().instance().set(&symbol_short!("TIERS"), &tier_amounts);
    }

    /// Planter locks their bond to accept a job.
    ///
    /// Transfers `tier_amount[tier]` from `planter` into this contract.
    pub fn accept_job(env: Env, planter: Address, tree_id: u64, tier: u32) -> Bond {
        planter.require_auth();

        if tier >= TIER_COUNT {
            panic_with_error!(&env, Error::InvalidTier);
        }

        let key = Self::bond_key(&env, tree_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::BondAlreadyExists);
        }

        let token = Self::token(&env);
        let amount = Self::tier_amount(&env, tier);

        token::Client::new(&env, &token).transfer(
            &planter,
            &env.current_contract_address(),
            &amount,
        );

        let bond = Bond {
            planter: planter.clone(),
            tree_id,
            tier,
            amount,
            token,
            accepted_at: env.ledger().timestamp(),
            status: BondStatus::Active,
        };

        env.storage().persistent().set(&key, &bond);

        env.events()
            .publish((symbol_short!("BondLock"), planter), (tree_id, amount));

        bond
    }

    /// Return the bond to the planter on successful verification.
    ///
    /// Only callable by admin (escrow/verifier calls this).
    pub fn return_bond(env: Env, tree_id: u64) {
        Self::require_admin(&env);

        let key = Self::bond_key(&env, tree_id);
        let mut bond: Bond = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::BondNotFound));

        if bond.status != BondStatus::Active {
            panic_with_error!(&env, Error::BondAlreadySettled);
        }

        token::Client::new(&env, &bond.token).transfer(
            &env.current_contract_address(),
            &bond.planter,
            &bond.amount,
        );

        bond.status = BondStatus::Returned;
        env.storage().persistent().set(&key, &bond);

        env.events().publish(
            (symbol_short!("BondRet"), tree_id),
            bond.amount,
        );
    }

    /// Slash the bond to treasury after deadline has passed without verification.
    ///
    /// Only callable by admin.
    pub fn slash_bond(env: Env, tree_id: u64) {
        Self::require_admin(&env);

        let key = Self::bond_key(&env, tree_id);
        let mut bond: Bond = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::BondNotFound));

        if bond.status != BondStatus::Active {
            panic_with_error!(&env, Error::BondAlreadySettled);
        }

        let elapsed = env
            .ledger()
            .timestamp()
            .saturating_sub(bond.accepted_at);
        if elapsed < ABANDON_DEADLINE {
            panic_with_error!(&env, Error::DeadlineNotPassed);
        }

        let treasury = Self::treasury(&env);
        token::Client::new(&env, &bond.token).transfer(
            &env.current_contract_address(),
            &treasury,
            &bond.amount,
        );

        bond.status = BondStatus::Slashed;
        env.storage().persistent().set(&key, &bond);

        env.events().publish(
            (symbol_short!("BondSlsh"), tree_id),
            bond.amount,
        );
    }

    /// Read a bond record.
    pub fn get_bond(env: Env, tree_id: u64) -> Option<Bond> {
        env.storage()
            .persistent()
            .get(&Self::bond_key(&env, tree_id))
    }

    /// Read the bond amount for a tier (0–2).
    pub fn tier_amount(env: &Env, tier: u32) -> i128 {
        let (t0, t1, t2): (i128, i128, i128) = env
            .storage()
            .instance()
            .get(&symbol_short!("TIERS"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        match tier {
            0 => t0,
            1 => t1,
            2 => t2,
            _ => panic_with_error!(env, Error::InvalidTier),
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn bond_key(env: &Env, tree_id: u64) -> soroban_sdk::Val {
        (symbol_short!("BOND"), tree_id).into_val(env)
    }

    fn token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("TOKEN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn treasury(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("TREAS"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    fn setup() -> (Env, Address, Address, Address, Address, PlantingBondClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

        let contract_id = env.register_contract(None, PlantingBond);
        let client = PlantingBondClient::new(&env, &contract_id);

        // tier 0 = 10 XLM, tier 1 = 25 XLM, tier 2 = 50 XLM (in stroops)
        client.initialize(&admin, &treasury, &token, &(10_000_000, 25_000_000, 50_000_000));

        (env, admin, treasury, token, contract_id, client)
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    // ── accept_job ────────────────────────────────────────────────────────────

    #[test]
    fn test_accept_job_locks_bond() {
        let (env, _, _, token, contract_id, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);

        let bond = client.accept_job(&planter, &1u64, &0u32);

        assert_eq!(bond.amount, 10_000_000);
        assert_eq!(bond.status, BondStatus::Active);
        assert_eq!(bond.tier, 0);

        // Contract holds the bond
        assert_eq!(token::Client::new(&env, &token).balance(&contract_id), 10_000_000);
        // Planter's balance reduced
        assert_eq!(token::Client::new(&env, &token).balance(&planter), 90_000_000);
    }

    #[test]
    fn test_accept_job_tier1_correct_amount() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);

        let bond = client.accept_job(&planter, &2u64, &1u32);
        assert_eq!(bond.amount, 25_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_invalid_tier_rejected() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &5u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_duplicate_bond_rejected() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);
        client.accept_job(&planter, &1u64, &0u32);
    }

    // ── return_bond ───────────────────────────────────────────────────────────

    #[test]
    fn test_return_bond_sends_to_planter() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);

        let before = token::Client::new(&env, &token).balance(&planter);
        client.return_bond(&1u64);
        let after = token::Client::new(&env, &token).balance(&planter);

        assert_eq!(after - before, 10_000_000);
        assert_eq!(client.get_bond(&1u64).unwrap().status, BondStatus::Returned);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_return_already_returned_panics() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);
        client.return_bond(&1u64);
        client.return_bond(&1u64);
    }

    // ── slash_bond ────────────────────────────────────────────────────────────

    #[test]
    fn test_slash_after_deadline_sends_to_treasury() {
        let (env, _, treasury, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);

        env.ledger().with_mut(|l| l.timestamp += ABANDON_DEADLINE + 1);

        client.slash_bond(&1u64);

        assert_eq!(token::Client::new(&env, &token).balance(&treasury), 10_000_000);
        assert_eq!(client.get_bond(&1u64).unwrap().status, BondStatus::Slashed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_slash_before_deadline_panics() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);

        env.ledger().with_mut(|l| l.timestamp += ABANDON_DEADLINE - 1);
        client.slash_bond(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_slash_already_returned_panics() {
        let (env, _, _, token, _, client) = setup();
        let planter = Address::generate(&env);
        mint(&env, &token, &planter, 100_000_000);
        client.accept_job(&planter, &1u64, &0u32);
        client.return_bond(&1u64);

        env.ledger().with_mut(|l| l.timestamp += ABANDON_DEADLINE + 1);
        client.slash_bond(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_slash_nonexistent_panics() {
        let (env, _, _, _, _, client) = setup();
        env.ledger().with_mut(|l| l.timestamp += ABANDON_DEADLINE + 1);
        client.slash_bond(&999u64);
    }

    // ── get_bond ──────────────────────────────────────────────────────────────

    #[test]
    fn test_get_bond_nonexistent_returns_none() {
        let (env, _, _, _, _, client) = setup();
        assert!(client.get_bond(&42u64).is_none());
    }

    // ── initialization ────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_init_rejected() {
        let (env, admin, treasury, token, _, client) = setup();
        client.initialize(&admin, &treasury, &token, &(1, 2, 3));
    }
}
