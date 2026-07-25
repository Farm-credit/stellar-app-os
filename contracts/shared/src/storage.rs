#![no_std]

//! Common storage helpers used by FarmCredit contracts.
//!
//! Most contracts follow the same pattern:
//!   - `ADMIN`        : governance address (per-contract or per-suite)
//!   - Other singletons (`VERIFIER`, `ORACLE`, …)
//!
//! These helpers centralise the "load admin" / "require admin" logic so
//! every contract emits the same panic message and does the same auth
//! dance.

use soroban_sdk::{symbol_short, Address, Env};

/// Returns `true` if the contract has been initialised (the `ADMIN` slot is set).
pub fn is_initialised(env: &Env) -> bool {
    env.storage().instance().has(&symbol_short!("ADMIN"))
}

/// Load the registered admin address. Panics if the contract is not initialised.
pub fn load_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| panic!("admin not initialised"))
}

/// Require the caller's auth matches the registered admin. Panics if the
/// contract is not initialised.
pub fn require_admin(env: &Env) {
    let admin = load_admin(env);
    admin.require_auth();
}
