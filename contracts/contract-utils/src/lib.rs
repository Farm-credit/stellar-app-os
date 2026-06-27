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
