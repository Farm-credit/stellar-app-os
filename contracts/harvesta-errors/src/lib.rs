#![no_std]

//! Shared error codes for all Harvesta / FarmCredit contracts.
//!
//! Import the crate, then call `panic_with_error!(env, HarvestaError::Variant)`
//! instead of raw string panics.  Error codes are stable u32 values embedded in
//! the Stellar XDR so off-chain tooling can parse them without string matching.
//!
//! NOTE: Error count reduced to stay within Soroban SDK limits.
//! Only essential errors for current contracts are included.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum HarvestaError {
    // ── Common lifecycle (1–8) ─────────────────────────────────────────────────
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    AlreadyPaused = 5,
    NotPaused = 6,
    NoPendingAdmin = 7,
    ContractMustBeTreeTokenAdmin = 8,

    // ── Amount / value validation (9–15) ──────────────────────────────────────
    AmountMustBePositive = 9,
    TreeCountMustBePositive = 10,
    VerifiedCountMustBePositive = 11,
    VerifiedCountExceedsDonation = 12,
    InvalidPayoutAmount = 13,
    BurnAmountMustBePositive = 14,
    SlotAmountMustBePositive = 15,

    // ── Escrow state (16–25) ──────────────────────────────────────────────────
    // EscrowAlreadyExists = 16,
    // EscrowNotFound = 17,
    // PlantingAlreadyVerified = 18,
    // PlantingNotVerified = 19,
    // RefundAfterPlanting = 20,
    // SurvivalThresholdOutOfRange = 21,
    // SurvivalRateOutOfRange = 22,
    // SurvivalRateBelowMinimum = 23,
    // SurvivalPeriodNotElapsed = 24,
    // NothingToRelease = 25,

    // ── Oracle / tree co-fund (26–34) ─────────────────────────────────────────
    // UnauthorizedOracle = 26,
    // NoOracleReport = 27,
    // BatchEmpty = 28,
    // BatchTooLarge = 29,
    // TreeAlreadyRegistered = 30,
    // TreeNotRegistered = 31,
    // TreeNotOpenForContributions = 32,
    // TreeNotOpenForRelease = 33,
    // NoFundsToRelease = 34,

    // ── Farmer registry (35–37) ───────────────────────────────────────────────
    // FarmerAlreadyRegistered = 35,
    // FarmerNotRegistered = 36,
    // InvalidRegion = 37,

    // ── Dispute / arbiter (38–46) ─────────────────────────────────────────────
    // DisputeAlreadyOpen = 38,
    // NoOpenDispute = 39,
    // EscrowAlreadyFinalised = 40,
    // NotArbiter = 41,
    // NotBuyerOrSeller = 42,
    // MilestoneReleaseBlocked = 43,
    // MilestoneAlreadyProcessed = 44,
    // CompletionPercentageOutOfRange = 45,
    // TotalReleasedExceedsMilestone = 46,

    // ── Species registry (62–64) ──────────────────────────────────────────────
    Co2MustBePositive = 62,
    MaturityYearsMustBePositive = 63,
    SpeciesNotFound = 64,

    // ── Arithmetic overflows (80–81) ──────────────────────────────────────────
    TreeTokenMintOverflow = 80,
    TokenUnitOverflow = 81,
}
