#![no_std]

//! Call Registry Contract — Cross-call metadata storage
//!
//! Stores per-call metadata including vault_balance so other contracts
//! (e.g. treasury) can query and cache it.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

// — Types ——————————————————————————————————————————————————————————————

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CallRecord {
    pub vault_balance: i128,
    pub caller: Address,
}

#[contracttype]
enum DataKey {
    /// CallRecord by call_id
    Call(u64),
    /// Auto-incrementing counter
    NextId,
}

// — Contract ——————————————————————————————————————————————————————————

#[contract]
pub struct CallRegistry;

#[contractimpl]
impl CallRegistry {
    /// Initialize the registry. Can only be called once.
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&DataKey::NextId) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    /// Register a new call with the given vault_balance.
    /// Returns the assigned call_id.
    pub fn register_call(env: Env, caller: Address, vault_balance: i128) -> u64 {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .expect("not initialized");

        let record = CallRecord {
            vault_balance,
            caller,
        };
        env.storage().instance().set(&DataKey::Call(id), &record);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        env.events()
            .publish((symbol_short!("reg_call"),), (id, vault_balance));

        id
    }

    /// Return the CallRecord for the given call_id.
    /// Reverts if call_id does not exist.
    pub fn get_call(env: Env, call_id: u64) -> CallRecord {
        env.storage()
            .instance()
            .get(&DataKey::Call(call_id))
            .expect("call not found")
    }

    /// Return the vault_balance for the given call_id.
    /// Reverts if call_id does not exist.
    pub fn get_vault_balance(env: Env, call_id: u64) -> i128 {
        let record: CallRecord = env
            .storage()
            .instance()
            .get(&DataKey::Call(call_id))
            .expect("call not found");
        record.vault_balance
    }
}

// — Tests ———————————————————————————————————————————————————————————

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{CallRegistry, CallRegistryClient};

    fn setup() -> (Env, Address, CallRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register(CallRegistry, ());
        let client = CallRegistryClient::new(&env, &contract);
        client.initialize();
        (env, contract, client)
    }

    #[test]
    fn test_register_and_get_call() {
        let (env, _contract, client) = setup();
        let caller = Address::generate(&env);
        let id = client.register_call(&caller, &5_000);
        assert_eq!(id, 0);

        let record = client.get_call(&id);
        assert_eq!(record.vault_balance, 5_000);
        assert_eq!(record.caller, caller);
    }

    #[test]
    fn test_multiple_calls_increment_id() {
        let (env, _contract, client) = setup();
        let caller = Address::generate(&env);
        let id0 = client.register_call(&caller, &100);
        let id1 = client.register_call(&caller, &200);
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(client.get_vault_balance(&id0), 100);
        assert_eq!(client.get_vault_balance(&id1), 200);
    }

    #[test]
    #[should_panic(expected = "call not found")]
    fn test_get_call_missing_reverts() {
        let (_env, _contract, client) = setup();
        client.get_call(&99);
    }

    #[test]
    #[should_panic(expected = "call not found")]
    fn test_get_vault_balance_missing_reverts() {
        let (_env, _contract, client) = setup();
        client.get_vault_balance(&99);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_reverts() {
        let (_env, _contract, client) = setup();
        client.initialize();
    }
}
