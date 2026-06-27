#![no_std]

//! Shared error codes for all Harvesta / FarmCredit contracts.
//!
//! Import the crate, then call `panic_with_error!(env, HarvestaError::Variant)`
//! instead of raw string panics.  Error codes are stable u32 values embedded in
//! the Stellar XDR so off-chain tooling can parse them without string matching.

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
    EscrowAlreadyExists = 16,
    EscrowNotFound = 17,
    PlantingAlreadyVerified = 18,
    PlantingNotVerified = 19,
    RefundAfterPlanting = 20,
    SurvivalThresholdOutOfRange = 21,
    SurvivalRateOutOfRange = 22,
    SurvivalRateBelowMinimum = 23,
    SurvivalPeriodNotElapsed = 24,
    NothingToRelease = 25,

    // ── Oracle / tree co-fund (26–34) ─────────────────────────────────────────
    UnauthorizedOracle = 26,
    NoOracleReport = 27,
    BatchEmpty = 28,
    BatchTooLarge = 29,
    TreeAlreadyRegistered = 30,
    TreeNotRegistered = 31,
    TreeNotOpenForContributions = 32,
    TreeNotOpenForRelease = 33,
    NoFundsToRelease = 34,

    // ── Farmer registry (35–37) ───────────────────────────────────────────────
    FarmerAlreadyRegistered = 35,
    FarmerNotRegistered = 36,
    InvalidRegion = 37,

    // ── Dispute / arbiter (38–46) ─────────────────────────────────────────────
    DisputeAlreadyOpen = 38,
    NoOpenDispute = 39,
    EscrowAlreadyFinalised = 40,
    NotArbiter = 41,
    NotBuyerOrSeller = 42,
    MilestoneReleaseBlocked = 43,
    MilestoneAlreadyProcessed = 44,
    CompletionPercentageOutOfRange = 45,
    TotalReleasedExceedsMilestone = 46,

    // ── Naira payout (47–54) ──────────────────────────────────────────────────
    PendingPayoutAlreadyExists = 47,
    PayoutIntervalTooShort = 48,
    MaxDailyPayoutExceeded = 49,
    PayoutNotPending = 50,
    CanOnlyCancelPending = 51,
    PayoutNotFound = 52,
    ExpectedNgnMustBePositive = 53,
    UnsupportedToken = 54,

    // ── Aggregate impact verifier (55–59) ─────────────────────────────────────
    FarmCountMustBePositive = 55,
    PeriodEndBeforeStart = 56,
    ProofDigestAlreadyRegistered = 57,
    ProofNotFound = 58,
    ProofAlreadyRevoked = 59,

    // ── Nullifier registry (60) ───────────────────────────────────────────────
    CommitmentAlreadyRegistered = 60,

    // ── KYC attestation (61) ──────────────────────────────────────────────────
    NotVerifier = 61,

    // ── Species registry (62–64) ──────────────────────────────────────────────
    Co2MustBePositive = 62,
    MaturityYearsMustBePositive = 63,
    SpeciesNotFound = 64,

    // ── Location / ZK proofs (65–70) ──────────────────────────────────────────
    OutsideNigeriaRegion = 65,
    ProofCommitmentAlreadyRegistered = 66,
    CommitmentAlreadySubmitted = 67,
    CommitmentNotFound = 68,
    CommitmentNotPending = 69,
    InvalidProof = 70,

    // ── Donation escrow (71–79) ───────────────────────────────────────────────
    AlreadyProcessed = 71,
    NotDonor = 72,
    DonationAlreadyCancelled = 73,
    DonationCancelled = 74,
    IntervalNotElapsed = 75,
    ProjectNotRegistered = 76,
    AmountPerIntervalMustBePositive = 77,
    IntervalSecondsMustBePositive = 78,
    RecurringDonationNotFound = 79,

    // ── Arithmetic overflows (80–81) ──────────────────────────────────────────
    TreeTokenMintOverflow = 80,
    TokenUnitOverflow = 81,

    // ── Verifier staking (91–95) ──────────────────────────────────────────────
    MinStakeMustBePositive = 91,
    VerifierAlreadyStaked = 92,
    VerifierNotStaked = 93,
    SlashExceedsStake = 94,
    InsufficientStake = 95,

    // ── Carbon credit marketplace (101–107) ───────────────────────────────────
    ListingAmountMustBePositive = 101,
    PriceMustBePositive = 102,
    ListingNotFound = 103,
    ListingNotActive = 104,
    BuyAmountMustBePositive = 105,
    InsufficientLiquidity = 106,
    SelfTrade = 107,
}
