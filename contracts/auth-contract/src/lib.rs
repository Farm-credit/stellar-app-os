#![no_std]

//! Auth Contract — invocation-context validation for privileged entry points.
//!
//! Stores an admin and a TTL-managed signer set. Every state-changing public
//! function takes an explicit `caller` / `admin` address parameter and uses
//! [`contract_utils::auth`] helpers so the declared address must match the
//! account that authorized the Soroban invocation.

use contract_utils::auth::{require_admin_invocation_auth, require_invocation_auth};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, IntoVal,
};

/// Default persistent TTL extension (ledgers) for signer records.
const SIGNER_TTL_THRESHOLD: u32 = 100_000;
const SIGNER_TTL_EXTEND_TO: u32 = 200_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    SignerNotRegistered = 5,
    SignerAlreadyRegistered = 6,
    NonceAlreadyUsed = 7,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SignerMeta {
    pub registered_at: u64,
    pub registered_by: Address,
}

#[contract]
pub struct AuthContract;

#[contractimpl]
impl AuthContract {
    /// One-time setup. Stores the governance admin in instance storage.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    /// Register `signer` as an authorized actor. Only the stored admin may call this.
    ///
    /// `admin` must match the on-chain admin **and** sign the invocation.
    /// Signer records live in persistent storage with TTL extension.
    pub fn register_signer(env: Env, admin: Address, signer: Address) {
        let stored_admin = Self::load_admin(&env);
        require_admin_invocation_auth(&env, &admin, &stored_admin);

        let key = Self::signer_key(&env, &signer);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::SignerAlreadyRegistered);
        }

        let meta = SignerMeta {
            registered_at: env.ledger().timestamp(),
            registered_by: admin.clone(),
        };
        env.storage().persistent().set(&key, &meta);
        env.storage().persistent().extend_ttl(
            &key,
            SIGNER_TTL_THRESHOLD,
            SIGNER_TTL_EXTEND_TO,
        );

        env.events()
            .publish((symbol_short!("SignReg"), signer.clone()), admin);
    }

    /// Remove `signer` from the authorized set. Admin-only with strict auth context.
    pub fn revoke_signer(env: Env, admin: Address, signer: Address) {
        let stored_admin = Self::load_admin(&env);
        require_admin_invocation_auth(&env, &admin, &stored_admin);

        let key = Self::signer_key(&env, &signer);
        if !env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::SignerNotRegistered);
        }
        env.storage().persistent().remove(&key);

        env.events()
            .publish((symbol_short!("SignRev"), signer.clone()), admin);
    }

    /// Returns `true` when `signer` is currently registered.
    pub fn is_signer(env: Env, signer: Address) -> bool {
        env.storage()
            .persistent()
            .has(&Self::signer_key(&env, &signer))
    }

    /// Returns registration metadata for `signer`, if present.
    pub fn get_signer(env: Env, signer: Address) -> Option<SignerMeta> {
        env.storage()
            .persistent()
            .get(&Self::signer_key(&env, &signer))
    }

    /// Signer-only heartbeat: proves the declared caller signed and is registered.
    ///
    /// Stores the last consumed `nonce` in instance storage keyed per signer to
    /// reject replays within the contract's scope.
    pub fn signer_ping(env: Env, caller: Address, nonce: u64) {
        require_invocation_auth(&caller);

        if !Self::is_signer(env.clone(), caller.clone()) {
            panic_with_error!(&env, Error::SignerNotRegistered);
        }

        let nonce_key = Self::nonce_key(&env, &caller);
        let last: u64 = env
            .storage()
            .instance()
            .get(&nonce_key)
            .unwrap_or(0);
        if nonce <= last {
            panic_with_error!(&env, Error::NonceAlreadyUsed);
        }
        env.storage().instance().set(&nonce_key, &nonce);

        env.events()
            .publish((symbol_short!("SignPing"), caller), nonce);
    }

    /// Read-only admin accessor. Panics if the contract was not initialised.
    pub fn get_admin(env: Env) -> Address {
        Self::load_admin(&env)
    }

    fn load_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn signer_key(env: &Env, signer: &Address) -> soroban_sdk::Val {
        (symbol_short!("SIGNER"), signer.clone()).into_val(env)
    }

    fn nonce_key(env: &Env, caller: &Address) -> soroban_sdk::Val {
        (symbol_short!("NONCE"), caller.clone()).into_val(env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, AuthContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AuthContract);
        let client = AuthContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn initialize_sets_admin() {
        let (_env, admin, client) = setup();
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn double_initialize_rejected() {
        let (env, admin, client) = setup();
        client.initialize(&admin);
        let _ = env;
    }

    #[test]
    fn register_and_query_signer() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        assert!(!client.is_signer(&signer));

        client.register_signer(&admin, &signer);
        assert!(client.is_signer(&signer));

        let meta = client.get_signer(&signer).unwrap();
        assert_eq!(meta.registered_by, admin);
        assert_eq!(meta.registered_at, env.ledger().timestamp());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn register_signer_twice_rejected() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        client.register_signer(&admin, &signer);
        client.register_signer(&admin, &signer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn register_signer_unauthorized_admin_rejected() {
        let (env, _admin, client) = setup();
        let imposter = Address::generate(&env);
        let signer = Address::generate(&env);
        client.register_signer(&imposter, &signer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn revoke_unknown_signer_rejected() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        client.revoke_signer(&admin, &signer);
    }

    #[test]
    fn revoke_signer_happy_path() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        client.register_signer(&admin, &signer);
        assert!(client.is_signer(&signer));
        client.revoke_signer(&admin, &signer);
        assert!(!client.is_signer(&signer));
    }

    #[test]
    fn signer_ping_accepts_monotonic_nonce() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        client.register_signer(&admin, &signer);
        client.signer_ping(&signer, &1);
        client.signer_ping(&signer, &2);
        let _ = env;
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn signer_ping_rejects_reused_nonce() {
        let (env, admin, client) = setup();
        let signer = Address::generate(&env);
        client.register_signer(&admin, &signer);
        client.signer_ping(&signer, &5);
        client.signer_ping(&signer, &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn signer_ping_rejects_unregistered_caller() {
        let (env, _admin, client) = setup();
        let stranger = Address::generate(&env);
        client.signer_ping(&stranger, &1);
    }

    #[test]
    #[should_panic]
    fn signer_ping_rejects_without_auth_mock() {
        let env = Env::default();
        let contract_id = env.register_contract(None, AuthContract);
        let client = AuthContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        let signer = Address::generate(&env);
        client.register_signer(&admin, &signer);
        env.mock_auths(&[]);
        client.signer_ping(&signer, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn get_admin_before_init_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AuthContract);
        let client = AuthContractClient::new(&env, &contract_id);
        client.get_admin();
    }
}
