#![no_std]

//! Upgrade timelock controller for Soroban contracts.
//!
//! Contract upgrades are intentionally split into two operations:
//!
//! 1. `approve_upgrade` records the target contract and Wasm hash and starts
//!    the mandatory delay.
//! 2. `activate_upgrade` becomes permissionless after the delay and invokes the
//!    target contract's conventional `upgrade(BytesN<32>)` entry point.
//!
//! The target contract must authorize this controller as its upgrade operator
//! and must perform the actual `env.deployer().update_current_contract_wasm`
//! call in its `upgrade` entry point. Keeping that responsibility in the
//! target preserves Soroban's self-upgrade authorization model while this
//! controller guarantees that activation cannot happen before the delay.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, IntoVal,
};

/// Forty-eight hours, expressed in ledger timestamp seconds.
pub const MIN_UPGRADE_DELAY_SECONDS: u64 = 48 * 60 * 60;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingUpgrade {
    /// Contract whose `upgrade(BytesN<32>)` entry point will be invoked.
    pub target: Address,
    /// Installed Wasm executable hash to pass to the target contract.
    pub wasm_hash: BytesN<32>,
    /// Admin that approved the upgrade.
    pub approved_by: Address,
    /// Ledger timestamp at which approval was recorded.
    pub approved_at: u64,
    /// Earliest ledger timestamp at which activation is allowed.
    pub executable_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpgradeState {
    None,
    Pending(PendingUpgrade),
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    MinimumDelay,
    PendingUpgrade,
}

#[contract]
pub struct UpgradeTimelock;

#[contractimpl]
impl UpgradeTimelock {
    /// Initialize the controller once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("upgrade timelock already initialized");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::MinimumDelay, &MIN_UPGRADE_DELAY_SECONDS);
    }

    /// Approve an upgrade and start the mandatory 48-hour delay.
    ///
    /// The Wasm identified by `wasm_hash` must be uploaded before activation.
    /// Only the configured admin may approve an upgrade. A pending upgrade
    /// must be explicitly cancelled before another one can be approved.
    pub fn approve_upgrade(env: Env, target: Address, wasm_hash: BytesN<32>) {
        Self::require_admin(&env);

        if env.storage().instance().has(&DataKey::PendingUpgrade) {
            panic!("upgrade already pending");
        }

        let approved_at = env.ledger().timestamp();
        let delay = Self::load_minimum_delay(&env);
        let executable_at = approved_at
            .checked_add(delay)
            .unwrap_or_else(|| panic!("upgrade activation timestamp overflow"));

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("upgrade timelock not initialized"));

        let pending = PendingUpgrade {
            target: target.clone(),
            wasm_hash: wasm_hash.clone(),
            approved_by: admin,
            approved_at,
            executable_at,
        };

        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &pending);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("approved")),
            (target, wasm_hash, executable_at),
        );
    }

    /// Activate the approved upgrade once the 48-hour delay has elapsed.
    ///
    /// Activation is permissionless so any keeper can execute a ready upgrade.
    /// The call is atomic: if the target rejects the upgrade, the pending
    /// record remains available for inspection or cancellation.
    pub fn activate_upgrade(env: Env) {
        let pending = Self::pending(&env);
        let now = env.ledger().timestamp();

        if now < pending.executable_at {
            panic!("upgrade timelock has not elapsed");
        }

        let target = pending.target.clone();
        let wasm_hash = pending.wasm_hash.clone();
        env.invoke_contract::<()>(
            &target,
            &symbol_short!("upgrade"),
            (wasm_hash.clone(),).into_val(&env),
        );

        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("activated")),
            (target, wasm_hash),
        );
    }

    /// Cancel a pending upgrade before activation.
    pub fn cancel_upgrade(env: Env) {
        Self::require_admin(&env);
        let pending = Self::pending(&env);
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("cancelled")),
            (pending.target, pending.wasm_hash),
        );
    }

    /// Increase the delay used for future approvals.
    ///
    /// The delay can never be reduced below the required 48-hour minimum.
    pub fn set_minimum_delay(env: Env, delay_seconds: u64) {
        Self::require_admin(&env);
        if delay_seconds < MIN_UPGRADE_DELAY_SECONDS {
            panic_with_error!(&env, UpgradeTimelockError::DelayTooShort);
        }
        env.storage()
            .instance()
            .set(&DataKey::MinimumDelay, &delay_seconds);
    }

    /// Return the configured minimum delay in seconds.
    pub fn minimum_delay(env: Env) -> u64 {
        Self::load_minimum_delay(&env)
    }

    /// Return the pending upgrade, or `None` when no upgrade is queued.
    pub fn get_pending_upgrade(env: Env) -> UpgradeState {
        match env
            .storage()
            .instance()
            .get::<DataKey, PendingUpgrade>(&DataKey::PendingUpgrade)
        {
            Some(pending) => UpgradeState::Pending(pending),
            None => UpgradeState::None,
        }
    }

    fn pending(env: &Env) -> PendingUpgrade {
        env.storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .unwrap_or_else(|| panic!("no upgrade pending"))
    }

    fn load_minimum_delay(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MinimumDelay)
            .unwrap_or_else(|| panic!("upgrade timelock not initialized"))
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("upgrade timelock not initialized"));
        admin.require_auth();
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum UpgradeTimelockError {
    DelayTooShort = 1,
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, BytesN, Env,
    };

    #[contract]
    struct MockUpgradeable;

    #[contractimpl]
    impl MockUpgradeable {
        pub fn upgrade(env: Env, wasm_hash: BytesN<32>) {
            env.storage()
                .instance()
                .set(&symbol_short!("WASM"), &wasm_hash);
        }

        pub fn wasm_hash(env: Env) -> BytesN<32> {
            env.storage()
                .instance()
                .get(&symbol_short!("WASM"))
                .unwrap()
        }
    }

    fn setup() -> (Env, Address, Address, UpgradeTimelockClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let controller_id = env.register_contract(None, UpgradeTimelock);
        let target_id = env.register_contract(None, MockUpgradeable);
        let admin = Address::generate(&env);
        let controller = UpgradeTimelockClient::new(&env, &controller_id);
        controller.initialize(&admin);
        (env, admin, target_id, controller)
    }

    fn hash(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    #[test]
    fn approval_starts_a_48_hour_delay() {
        let (env, _admin, target, controller) = setup();
        env.ledger().set_timestamp(100);
        let wasm_hash = hash(&env, 1);

        controller.approve_upgrade(&target, &wasm_hash);

        assert_eq!(controller.minimum_delay(), MIN_UPGRADE_DELAY_SECONDS);
        assert_eq!(
            controller.get_pending_upgrade(),
            UpgradeState::Pending(PendingUpgrade {
                target,
                wasm_hash,
                approved_by: _admin,
                approved_at: 100,
                executable_at: 100 + MIN_UPGRADE_DELAY_SECONDS,
            })
        );
    }

    #[test]
    fn activation_is_permissionless_after_the_delay() {
        let (env, _admin, target, controller) = setup();
        let wasm_hash = hash(&env, 2);
        controller.approve_upgrade(&target, &wasm_hash);

        env.ledger().set_timestamp(MIN_UPGRADE_DELAY_SECONDS - 1);
        assert!(controller.try_activate_upgrade().is_err());

        env.ledger().set_timestamp(MIN_UPGRADE_DELAY_SECONDS);
        controller.activate_upgrade();

        let target_client = MockUpgradeableClient::new(&env, &target);
        assert_eq!(target_client.wasm_hash(), wasm_hash);
        assert_eq!(controller.get_pending_upgrade(), UpgradeState::None);
    }

    #[test]
    fn admin_can_cancel_a_pending_upgrade() {
        let (env, _admin, target, controller) = setup();
        controller.approve_upgrade(&target, &hash(&env, 3));
        controller.cancel_upgrade();
        assert_eq!(controller.get_pending_upgrade(), UpgradeState::None);
    }

    #[test]
    #[should_panic(expected = "upgrade already pending")]
    fn a_second_approval_requires_cancellation() {
        let (env, _admin, target, controller) = setup();
        controller.approve_upgrade(&target, &hash(&env, 4));
        controller.approve_upgrade(&target, &hash(&env, 5));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn delay_cannot_be_reduced_below_48_hours() {
        let (_env, _admin, _target, controller) = setup();
        controller.set_minimum_delay(&(MIN_UPGRADE_DELAY_SECONDS - 1));
    }

    #[test]
    fn admin_can_increase_the_delay() {
        let (_env, _admin, _target, controller) = setup();
        let longer_delay = MIN_UPGRADE_DELAY_SECONDS + 1;
        controller.set_minimum_delay(&longer_delay);
        assert_eq!(controller.minimum_delay(), longer_delay);
    }
}
