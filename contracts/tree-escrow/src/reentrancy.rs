//! Cross-contract reentrancy guard for Soroban contracts.
//!
//! # How it works
//!
//! Soroban executes all contract calls synchronously within a single ledger
//! transaction, but a contract CAN re-enter itself if it issues a cross-contract
//! call to a third-party contract that then calls back into the original contract
//! before the first invocation has completed.
//!
//! This module implements the classic mutex pattern using a single boolean
//! flag stored in `Instance` storage (the cheapest and fastest storage tier).
//! Storing in `Instance` means the flag is shared across all invocations of the
//! contract within the same transaction — exactly the scope we need.
//!
//! # Usage
//!
//! ```rust
//! use crate::reentrancy::ReentrancyGuard;
//!
//! pub fn my_state_mutating_function(env: Env, ...) {
//!     let _guard = ReentrancyGuard::acquire(&env); // panics if already locked
//!     // ... do work including cross-contract calls ...
//!     // _guard is released (lock cleared) when it drops at end of scope
//! }
//! ```
//!
//! # Error
//!
//! If a reentrant call is detected, the contract panics with error code
//! `TreeEscrowError::Reentrancy` (value 200).

use soroban_sdk::{contracterror, panic_with_error, symbol_short, Env};

/// Storage key for the reentrancy lock flag.
const REENTRANT_KEY: soroban_sdk::Symbol = symbol_short!("REENTRANT");

/// Error raised when a reentrant call is detected.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReentrancyError {
    /// A reentrant call into a guarded function was detected.
    Reentrancy = 200,
}

/// RAII guard that sets a reentrancy lock on construction and clears it on drop.
///
/// Acquire with [`ReentrancyGuard::acquire`].
/// The lock is automatically released when the guard goes out of scope.
pub struct ReentrancyGuard<'a> {
    env: &'a Env,
}

impl<'a> ReentrancyGuard<'a> {
    /// Acquire the reentrancy lock.
    ///
    /// # Panics
    /// Panics with `ReentrancyError::Reentrancy` (code 200) if the lock is
    /// already held, i.e. this function was called while a guarded function
    /// is still executing (reentrant call detected).
    pub fn acquire(env: &'a Env) -> Self {
        // Check if lock is already held
        let locked: bool = env
            .storage()
            .instance()
            .get(&REENTRANT_KEY)
            .unwrap_or(false);

        if locked {
            panic_with_error!(env, ReentrancyError::Reentrancy);
        }

        // Acquire: set lock
        env.storage().instance().set(&REENTRANT_KEY, &true);

        ReentrancyGuard { env }
    }

    /// Check whether the reentrancy lock is currently held.
    /// Useful for read-only inspection in tests.
    pub fn is_locked(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&REENTRANT_KEY)
            .unwrap_or(false)
    }
}

impl<'a> Drop for ReentrancyGuard<'a> {
    fn drop(&mut self) {
        // Release: clear the lock
        self.env.storage().instance().set(&REENTRANT_KEY, &false);
    }
}
