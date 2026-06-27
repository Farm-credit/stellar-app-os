#![no_std]

//! Admin Controls — Closes #323
//!
//! Emergency pause/unpause and admin management for the FarmCredit contract suite.
//!
//! # Design
//!
//! - `pause()` / `unpause()` are restricted to the admin multi-sig address.
//! - All state-changing functions in dependent contracts call `assert_not_paused()`
//!   before executing (enforced via the shared pause flag stored in this contract).
//! - `update_oracle()` allows the admin to rotate the verification oracle address
//!   without redeploying contracts.
//! - `transfer_admin()` supports multi-sig admin rotation with a two-step
//!   propose → accept pattern to prevent accidental lockout.

use harvesta_errors::HarvestaError;
use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env};

// ── Types ─────────────────────────────────────────────────────────────────────

/// Option<Address> wrapper — Soroban #[contracttype] does not support Option<Address> directly.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptAddress {
    None,
    Some(Address),
}

impl OptAddress {
    pub fn is_none(&self) -> bool {
        matches!(self, OptAddress::None)
    }
}

/// Snapshot of the current admin configuration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AdminConfig {
    /// Current admin address (multi-sig)
    pub admin: Address,
    /// Pending admin address (set during transfer, cleared on accept)
    pub pending_admin: OptAddress,
    /// Verification oracle address (ZK proof verifier)
    pub oracle: Address,
    /// Whether the contract suite is currently paused
    pub paused: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct AdminControls;

#[contractimpl]
impl AdminControls {
    /// One-time initialisation.
    ///
    /// `admin`  — initial admin address (should be a multi-sig)
    /// `oracle` — initial verification oracle address
    pub fn initialize(env: Env, admin: Address, oracle: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("ORACLE"), &oracle);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
    }

    // ── Pause controls ────────────────────────────────────────────────────────

    /// Pause all state-changing operations across the contract suite.
    /// Restricted to admin multi-sig.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        if Self::_is_paused(&env) {
            panic_with_error!(&env, HarvestaError::AlreadyPaused);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("Paused"),), env.ledger().timestamp());
    }

    /// Unpause the contract suite. Restricted to admin multi-sig.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        if !Self::_is_paused(&env) {
            panic_with_error!(&env, HarvestaError::NotPaused);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("Unpaused"),), env.ledger().timestamp());
    }

    /// Returns true if the contract suite is currently paused.
    pub fn is_paused(env: Env) -> bool {
        Self::_is_paused(&env)
    }

    /// Asserts the contract is not paused. Call this at the top of every
    /// state-changing function in dependent contracts.
    pub fn assert_not_paused(env: Env) {
        if Self::_is_paused(&env) {
            panic_with_error!(&env, HarvestaError::ContractPaused);
        }
    }

    // ── Oracle management ─────────────────────────────────────────────────────

    /// Update the verification oracle address. Restricted to admin multi-sig.
    ///
    /// Emits `OracleUpdated(old_oracle, new_oracle)` for audit trail.
    pub fn update_oracle(env: Env, new_oracle: Address) {
        Self::require_admin(&env);

        let old_oracle: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ORACLE"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        env.storage()
            .instance()
            .set(&symbol_short!("ORACLE"), &new_oracle);

        env.events()
            .publish((symbol_short!("OracleUpd"), old_oracle), new_oracle);
    }

    /// Returns the current oracle address.
    pub fn get_oracle(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ORACLE"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized))
    }

    // ── Whitelist management ──────────────────────────────────────────────────

    /// Add `addr` to the contract whitelist. Restricted to admin multi-sig.
    /// Whitelisted addresses are allowed as targets for cross-contract calls.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::add_to_whitelist(&env, &addr);
        env.events()
            .publish((symbol_short!("WLAdd"),), addr);
    }

    /// Remove `addr` from the contract whitelist. Restricted to admin multi-sig.
    pub fn remove_from_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::remove_from_whitelist(&env, &addr);
        env.events()
            .publish((symbol_short!("WLRemove"),), addr);
    }

    /// Returns `true` if `addr` is whitelisted.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        contract_utils::is_whitelisted(&env, &addr)
    }

    /// Panics if `addr` is not whitelisted.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        contract_utils::assert_whitelisted(&env, &addr);
    }

    // ── Admin rotation (two-step) ─────────────────────────────────────────────

    /// Step 1 — Current admin proposes a new admin address.
    /// The new admin must call `accept_admin()` to complete the transfer.
    pub fn propose_admin(env: Env, new_admin: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(
            &symbol_short!("PENDADMIN"),
            &OptAddress::Some(new_admin.clone()),
        );
        env.events()
            .publish((symbol_short!("AdminProp"),), new_admin);
    }

    /// Step 2 — Proposed admin accepts the role.
    /// Clears the pending admin slot and activates the new admin.
    pub fn accept_admin(env: Env) {
        let pending_opt: OptAddress = env
            .storage()
            .instance()
            .get(&symbol_short!("PENDADMIN"))
            .unwrap_or(OptAddress::None);

        let pending = match pending_opt {
            OptAddress::Some(addr) => addr,
            OptAddress::None => panic_with_error!(&env, HarvestaError::NoPendingAdmin),
        };
        pending.require_auth();

        let old_admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &pending);
        env.storage()
            .instance()
            .set(&symbol_short!("PENDADMIN"), &OptAddress::None);

        env.events()
            .publish((symbol_short!("AdminXfer"), old_admin), pending);
    }

    /// Returns the current admin configuration snapshot.
    pub fn get_config(env: Env) -> AdminConfig {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        let oracle: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ORACLE"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        let pending_admin: OptAddress = env
            .storage()
            .instance()
            .get(&symbol_short!("PENDADMIN"))
            .unwrap_or(OptAddress::None);

        AdminConfig {
            admin,
            pending_admin,
            oracle,
            paused,
        }
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn _is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, Address, AdminControlsClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AdminControls);
        let client = AdminControlsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        client.initialize(&admin, &oracle);
        (env, admin, oracle, client)
    }

    #[test]
    fn test_initial_state() {
        let (_, admin, oracle, client) = setup();
        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.oracle, oracle);
        assert!(!config.paused);
        assert!(config.pending_admin.is_none());
    }

    #[test]
    fn test_pause_unpause() {
        let (_, _, _, client) = setup();

        assert!(!client.is_paused());
        client.pause();
        assert!(client.is_paused());
        client.unpause();
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_assert_not_paused_panics_when_paused() {
        let (_, _, _, client) = setup();
        client.pause();
        client.assert_not_paused();
    }

    #[test]
    fn test_assert_not_paused_passes_when_unpaused() {
        let (_, _, _, client) = setup();
        client.assert_not_paused(); // should not panic
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_double_pause_rejected() {
        let (_, _, _, client) = setup();
        client.pause();
        client.pause();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_unpause_when_not_paused_rejected() {
        let (_, _, _, client) = setup();
        client.unpause();
    }

    #[test]
    fn test_update_oracle() {
        let (env, _, _, client) = setup();
        let new_oracle = Address::generate(&env);

        client.update_oracle(&new_oracle);
        assert_eq!(client.get_oracle(), new_oracle);
        assert_eq!(client.get_config().oracle, new_oracle);
    }

    #[test]
    fn test_two_step_admin_transfer() {
        let (env, _old_admin, _, client) = setup();
        let new_admin = Address::generate(&env);

        client.propose_admin(&new_admin);
        let config = client.get_config();
        assert_eq!(config.pending_admin, OptAddress::Some(new_admin.clone()));

        client.accept_admin();
        let config = client.get_config();
        assert_eq!(config.admin, new_admin);
        assert!(config.pending_admin.is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_accept_admin_without_proposal_rejected() {
        let (_, _, _, client) = setup();
        client.accept_admin();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (env, admin, oracle, client) = setup();
        client.initialize(&admin, &oracle);
    }

    // ── Whitelist tests ───────────────────────────────────────────────────────

    #[test]
    fn test_add_to_whitelist() {
        let (env, _, _, client) = setup();
        let allowed = Address::generate(&env);
        assert!(!client.is_whitelisted(&allowed));
        client.add_to_whitelist(&allowed);
        assert!(client.is_whitelisted(&allowed));
    }

    #[test]
    fn test_remove_from_whitelist() {
        let (env, _, _, client) = setup();
        let allowed = Address::generate(&env);
        client.add_to_whitelist(&allowed);
        assert!(client.is_whitelisted(&allowed));
        client.remove_from_whitelist(&allowed);
        assert!(!client.is_whitelisted(&allowed));
    }

    #[test]
    fn test_is_whitelisted_returns_false_for_unlisted() {
        let (env, _, _, client) = setup();
        let unknown = Address::generate(&env);
        assert!(!client.is_whitelisted(&unknown));
    }

    #[test]
    fn test_assert_whitelisted_passes_for_listed() {
        let (env, _, _, client) = setup();
        let allowed = Address::generate(&env);
        client.add_to_whitelist(&allowed);
        client.assert_whitelisted(&allowed);
    }

    #[test]
    #[should_panic(expected = "address not whitelisted")]
    fn test_assert_whitelisted_panics_for_unlisted() {
        let (env, _, _, client) = setup();
        let unknown = Address::generate(&env);
        client.assert_whitelisted(&unknown);
    }

    #[test]
    fn test_whitelist_is_independent_per_contract() {
        let (env, _, _, _) = setup();
        let addr = Address::generate(&env);

        let contract_a = env.register_contract(None, AdminControls);
        let client_a = AdminControlsClient::new(&env, &contract_a);
        let admin_a = Address::generate(&env);
        let oracle_a = Address::generate(&env);
        client_a.initialize(&admin_a, &oracle_a);

        let contract_b = env.register_contract(None, AdminControls);
        let client_b = AdminControlsClient::new(&env, &contract_b);
        let admin_b = Address::generate(&env);
        let oracle_b = Address::generate(&env);
        client_b.initialize(&admin_b, &oracle_b);

        client_a.add_to_whitelist(&addr);
        assert!(client_a.is_whitelisted(&addr));
        assert!(!client_b.is_whitelisted(&addr));
    }
}
