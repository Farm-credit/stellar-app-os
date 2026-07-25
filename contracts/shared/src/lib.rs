#![no_std]


//!
//! Closes #502.
//!
//! # Purpose
//!
//! Multiple contracts (`escrow`, `escrow-milestone`, `tree-escrow`,
//! `subscription-sponsorship`, `naira-payout`, …) re-declare the same
//! constants (`BPS_DENOM`, `SIX_MONTHS_SECS`, …) and the same hand-rolled
//! `Option<T>` wrappers (`OptAddress`, `OptProof`, …). They drift over time
//! and drifts cause subtle in-suite inconsistencies. This crate gives those
//! contracts a single, typed source of truth.
//!
//! # Modules
//!
//! - [`constants`] — pure compile-time values (basis points, time spans).
//! - [`types`]     — `Option<T>` shapes Soroban can derive as `#[contracttype]`
//!   (`OptAddress`, `OptBytesN32`).
//! - [`storage`]   — tiny `load_admin` / `require_admin` helpers.
//!
//! # Migration
//!
//! Adding the dependency is one line in a contract's `Cargo.toml`:
//!
//! ```toml
//! shared = { path = "../shared" }
//! ```
//!
//! and a small import in the contract source:
//!
//! ```ignore
//! use shared::{constants::BPS_DENOM, types::OptAddress, storage::require_admin};
//! ```
//!
//! Existing per-contract `OptAddress` definitions should be deleted in the
//! same PR or a follow-up — keeping both around risks drift re-emerging.

pub mod constants;
pub mod storage;
pub mod types;

// Re-export the most common items at the crate root for ergonomics.
pub use constants::{
    BPS_DENOM, MAX_FEE_BPS, NINETY_DAYS_SECS, SECONDS_PER_DAY, SECONDS_PER_HOUR,
    SECONDS_PER_MINUTE, SECONDS_PER_MONTH, SECONDS_PER_WEEK, SECONDS_PER_YEAR, SIX_MONTHS_SECS,
};
pub use storage::{is_initialised, load_admin, require_admin};
pub use types::{OptAddress, OptBytesN32};

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    // ── constants ────────────────────────────────────────────────────────────

    #[test]
    fn test_bps_denom_is_ten_thousand() {
        // Industry convention — assert it doesn't drift silently.
        assert_eq!(constants::BPS_DENOM, 10_000);
        assert_eq!(constants::MAX_FEE_BPS, 10_000);
    }

    #[test]
    fn test_time_constants_environment() {
        // Day / week / month chain.
        assert_eq!(SECONDS_PER_MINUTE, 60);
        assert_eq!(SECONDS_PER_HOUR, 60 * SECONDS_PER_MINUTE);
        assert_eq!(SECONDS_PER_DAY, 24 * SECONDS_PER_HOUR);
        assert_eq!(SECONDS_PER_WEEK, 7 * SECONDS_PER_DAY);
        assert_eq!(SECONDS_PER_MONTH, 30 * SECONDS_PER_DAY);
        assert_eq!(SECONDS_PER_YEAR, 365 * SECONDS_PER_DAY);
    }

    #[test]
    fn test_six_months_matches_26_weeks() {
        assert_eq!(SIX_MONTHS_SECS, 26 * SECONDS_PER_WEEK);
    }

    #[test]
    fn test_ninety_days_window() {
        assert_eq!(NINETY_DAYS_SECS, 90 * SECONDS_PER_DAY);
    }

    // ── types ────────────────────────────────────────────────────────────────

    #[test]
    fn test_opt_address_default_is_none() {
        let opt: OptAddress = OptAddress::default();
        assert!(opt.is_none());
        assert!(!opt.is_some());
    }

    #[test]
    fn test_opt_address_some_round_trip() {
        let env = Env::default();
        let addr = Address::generate(&env);
        let opt = OptAddress::Some(addr.clone());
        assert!(opt.is_some());
        assert!(!opt.is_none());
        match opt {
            OptAddress::Some(inner) => assert_eq!(inner, addr),
            OptAddress::None => panic!("expected Some"),
        }
    }

    #[test]
    fn test_opt_bytes_n32_default_is_none() {
        let opt: OptBytesN32 = OptBytesN32::default();
        assert!(opt.is_none());
    }

    #[test]
    fn test_opt_bytes_n32_some_round_trip() {
        let env = Env::default();
        let hash = BytesN::from_array(&env, &[0xAB; 32]);
        let opt = OptBytesN32::Some(hash.clone());
        assert!(opt.is_some());
        match opt {
            OptBytesN32::Some(inner) => assert_eq!(inner, hash),
            OptBytesN32::None => panic!("expected Some"),
        }
    }

    // ── storage helpers ──────────────────────────────────────────────────────

    #[test]
    fn test_is_initialised_false_before_init() {
        let env = Env::default();
        assert!(!is_initialised(&env));
    }

    #[test]
    fn test_is_initialised_true_after_setting_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("ADMIN"), &admin);
        assert!(is_initialised(&env));
    }

    #[test]
    #[should_panic(expected = "admin not initialised")]
    fn test_load_admin_panics_when_unset() {
        let env = Env::default();
        let _ = load_admin(&env);
    }

    #[test]
    fn test_load_admin_returns_registered_address() {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("ADMIN"), &admin);
        assert_eq!(load_admin(&env), admin);
    }
}
