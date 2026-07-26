#![no_std]

//! Shared numeric & time constants used by multiple FarmCredit contracts.
//!
//! These are pure compile-time `const`s so they cost zero runtime / Wasm
//! bytes and incur no storage reads. Anything that multiple contracts
//! re-declare verbatim belongs here.

// ── Percentage / basis points ────────────────────────────────────────────────

/// Industry-standard basis-point denominator: 10 000 bps = 100.00 %.
/// Use `(amount * bps) / BPS_DENOM` to express percentages uniformly.
pub const BPS_DENOM: i128 = 10_000;

/// Maximum fee expressible in basis points (100 %).
pub const MAX_FEE_BPS: u32 = 10_000;

// ── Time (seconds) ───────────────────────────────────────────────────────────

pub const SECONDS_PER_MINUTE: u64 = 60;
pub const SECONDS_PER_HOUR: u64 = 60 * 60;
pub const SECONDS_PER_DAY: u64 = 24 * 60 * 60;
pub const SECONDS_PER_WEEK: u64 = 7 * 24 * 60 * 60;
/// 30-day calendar month — matches `subscription-sponsorship`'s default interval.
pub const SECONDS_PER_MONTH: u64 = 30 * 24 * 60 * 60;
/// 365-day calendar year (no leap-year correction).
pub const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;
/// 6 months in seconds (26 weeks) — used by milestone and survival flows.
pub const SIX_MONTHS_SECS: u64 = 26 * 7 * 24 * 60 * 60;
/// 90 days in seconds — sponsor refund window used by the escrow contract.
pub const NINETY_DAYS_SECS: u64 = 90 * 24 * 60 * 60;
