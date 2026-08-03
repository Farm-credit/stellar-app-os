#![no_std]

//! Shared utilities for the FarmCredit contract suite.
//!
//! # Whitelist
//!
//! Per-contract whitelist for validating external contract addresses before
//! making cross-contract calls. Prevents supply-chain attacks by ensuring
//! only admin-approved token/contract addresses are invoked.
//!
//! Each contract stores its own whitelist entries keyed by
//! `(symbol_short!("W"), address)` in instance storage. The admin manages
//! entries via the contract's own admin-only functions.
//!
//! # Auth context
//!
//! [`auth`] helpers ensure declared caller addresses match `require_auth`
//! signers on every guarded entry point.

pub mod auth;

pub use auth::{
    require_admin_invocation_auth, require_invocation_auth, require_matching_invocation_auth,
    AuthError,
};

use soroban_sdk::{symbol_short, Address, Env};

/// Add `addr` to the caller contract's whitelist.
pub fn add_to_whitelist(env: &Env, addr: &Address) {
    env.storage()
        .instance()
        .set(&(symbol_short!("W"), addr.clone()), &true);
}

/// Remove `addr` from the caller contract's whitelist.
pub fn remove_from_whitelist(env: &Env, addr: &Address) {
    env.storage()
        .instance()
        .remove(&(symbol_short!("W"), addr.clone()));
}

/// Returns `true` if `addr` is whitelisted in the caller contract.
pub fn is_whitelisted(env: &Env, addr: &Address) -> bool {
    env.storage()
        .instance()
        .get(&(symbol_short!("W"), addr.clone()))
        .unwrap_or(false)
}

/// Panics if `addr` is not whitelisted in the caller contract.
pub fn assert_whitelisted(env: &Env, addr: &Address) {
    if !is_whitelisted(env, addr) {
        panic!("address not whitelisted");
    }
}

/// TTL extension constants and helper functions for Soroban instance storage.
pub mod ttl {
    use soroban_sdk::Env;

    /// Default threshold ledgers (~1 day of ledgers assuming 5s/ledger)
    pub const DEFAULT_TTL_THRESHOLD: u32 = 17_280;
    /// Default extension target ledgers (~30 days of ledgers)
    pub const DEFAULT_TTL_EXTEND_TO: u32 = 518_400;

    /// Extends the instance storage TTL of the executing contract.
    pub fn extend_instance_ttl(env: &Env, threshold: u32, extend_to: u32) {
        env.storage().instance().extend_ttl(threshold, extend_to);
    }

    /// Extends instance storage TTL using default parameters (1 day threshold, 30 days extension).
    pub fn bump_instance_ttl(env: &Env) {
        extend_instance_ttl(env, DEFAULT_TTL_THRESHOLD, DEFAULT_TTL_EXTEND_TO);
    }
}

