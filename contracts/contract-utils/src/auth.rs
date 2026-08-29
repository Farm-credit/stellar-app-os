//! Soroban invocation-context helpers.
//!
//! Public contract entry points often take an explicit `Address` for the
//! transaction signer. That address must match the account that actually
//! authorized the call (`require_auth`). These helpers enforce both checks in
//! one place so callers cannot pass a privileged address while signing as
//! someone else.

use soroban_sdk::{contracterror, panic_with_error, Address, Env};

/// Stable error codes for auth-context validation in shared utilities.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuthError {
    /// The declared caller address does not match the expected role holder.
    CallerMismatch = 1,
    /// The declared caller is not authorized for this operation.
    Unauthorized = 2,
}

/// Require that `declared_caller` equals `expected` and signed this invocation.
pub fn require_matching_invocation_auth(
    env: &Env,
    declared_caller: &Address,
    expected: &Address,
) {
    if declared_caller != expected {
        panic_with_error!(env, AuthError::CallerMismatch);
    }
    declared_caller.require_auth();
}

/// Require that `declared_admin` equals the registered `admin` and signed this invocation.
pub fn require_admin_invocation_auth(env: &Env, declared_admin: &Address, admin: &Address) {
    if declared_admin != admin {
        panic_with_error!(env, AuthError::Unauthorized);
    }
    declared_admin.require_auth();
}

/// Require an authorization entry for `declared_caller` on this invocation.
pub fn require_invocation_auth(declared_caller: &Address) {
    declared_caller.require_auth();
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn require_matching_invocation_auth_accepts_matching_mock() {
        let env = Env::default();
        let caller = Address::generate(&env);
        env.mock_all_auths();
        require_matching_invocation_auth(&env, &caller, &caller);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn require_matching_invocation_auth_rejects_address_mismatch() {
        let env = Env::default();
        let expected = Address::generate(&env);
        let imposter = Address::generate(&env);
        env.mock_all_auths();
        require_matching_invocation_auth(&env, &imposter, &expected);
    }

    #[test]
    #[should_panic]
    fn require_invocation_auth_rejects_without_mock() {
        let env = Env::default();
        let caller = Address::generate(&env);
        let _ = env;
        require_invocation_auth(&caller);
    }

    #[test]
    fn require_admin_invocation_auth_accepts_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.mock_all_auths();
        require_admin_invocation_auth(&env, &admin, &admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn require_admin_invocation_auth_rejects_non_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let imposter = Address::generate(&env);
        env.mock_all_auths();
        require_admin_invocation_auth(&env, &imposter, &admin);
    }
}
