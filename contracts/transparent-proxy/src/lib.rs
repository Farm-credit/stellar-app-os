#![no_std]

//! Soroban's transparent upgrade boundary.
//!
//! Soroban does not provide EVM-style `delegatecall`: a contract invocation
//! always reads and writes the callee's storage. Consequently, a separate
//! forwarding contract cannot preserve the implementation's state. This
//! contract uses Soroban's native WASM replacement instead. The contract ID
//! and all instance/persistent storage remain unchanged while the executable
//! is replaced, which gives callers transparent upgrades without state loss.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env,
};

const ADMIN: soroban_sdk::Symbol = symbol_short!("ADMIN");
const IMPLEMENTATION: soroban_sdk::Symbol = symbol_short!("WASM");
const VERSION: soroban_sdk::Symbol = symbol_short!("VERSION");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ProxyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    SameImplementation = 4,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProxyConfig {
    pub admin: Address,
    pub implementation: BytesN<32>,
    pub version: u32,
}

#[contract]
pub struct TransparentProxy;

#[contractimpl]
impl TransparentProxy {
    /// Initializes the stable upgrade boundary once.
    ///
    /// `implementation` is the hash of the WASM currently installed at this
    /// contract address. The admin must authorize initialization.
    pub fn initialize(env: Env, admin: Address, implementation: BytesN<32>) {
        if env.storage().instance().has(&ADMIN) {
            panic_with_error!(&env, ProxyError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .set(&IMPLEMENTATION, &implementation);
        env.storage().instance().set(&VERSION, &1_u32);
        env.events().publish((symbol_short!("Init"),), admin);
    }

    /// Replaces the executable after the new WASM has been uploaded.
    ///
    /// Soroban applies this replacement only after the invocation succeeds;
    /// therefore the metadata update and executable change are atomic.
    pub fn upgrade(env: Env, new_implementation: BytesN<32>) {
        let admin = Self::admin(&env);
        admin.require_auth();

        let current: BytesN<32> = env
            .storage()
            .instance()
            .get(&IMPLEMENTATION)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized));
        if current == new_implementation {
            panic_with_error!(&env, ProxyError::SameImplementation);
        }

        let version: u32 = env.storage().instance().get(&VERSION).unwrap_or(1);
        let next_version = version.saturating_add(1);
        env.storage()
            .instance()
            .set(&IMPLEMENTATION, &new_implementation);
        env.storage().instance().set(&VERSION, &next_version);
        env.events().publish(
            (symbol_short!("Upgraded"), current),
            (new_implementation.clone(), next_version),
        );
        env.deployer()
            .update_current_contract_wasm(new_implementation);
    }

    pub fn get_config(env: Env) -> ProxyConfig {
        ProxyConfig {
            admin: Self::admin(&env),
            implementation: env
                .storage()
                .instance()
                .get(&IMPLEMENTATION)
                .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized)),
            version: env.storage().instance().get(&VERSION).unwrap_or(1),
        }
    }

    pub fn get_admin(env: Env) -> Address {
        Self::admin(&env)
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(env, ProxyError::NotInitialized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn hash(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    #[test]
    fn initialization_persists_proxy_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, TransparentProxy);
        let client = TransparentProxyClient::new(&env, &id);
        let admin = Address::generate(&env);
        let wasm = hash(&env, 1);

        client.initialize(&admin, &wasm);

        assert_eq!(client.get_admin(), admin);
        assert_eq!(
            client.get_config(),
            ProxyConfig {
                admin,
                implementation: wasm,
                version: 1
            }
        );
    }

    #[test]
    fn initialization_is_one_time() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, TransparentProxy);
        let client = TransparentProxyClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &hash(&env, 1));

        let result = client.try_initialize(&admin, &hash(&env, 2));
        assert!(result.is_err());
    }
}
