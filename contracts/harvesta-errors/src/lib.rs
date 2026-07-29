#![no_std]

use soroban_sdk::contracterror;

#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum HarvestaError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    AlreadyPaused = 5,
    NotPaused = 6,
    NoPendingAdmin = 7,
    AmountMustBePositive = 9,
    TreeCountMustBePositive = 10,
    InvalidPayoutAmount = 13,
    SlotAmountMustBePositive = 15,
    EscrowAlreadyExists = 16,
    EscrowNotFound = 17,
    RefundAfterPlanting = 20,
    SurvivalRateOutOfRange = 22,
    SurvivalRateBelowMinimum = 23,
    SurvivalPeriodNotElapsed = 24,
    NothingToRelease = 25,
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

    // ── Nullifier registry (60) ───────────────────────────────────────────────
    CommitmentAlreadyRegistered = 60,

    // ── Species registry (62─64) ──────────────────────────────────────────────
    // ── KYC attestation (61) ─────────────────────────────────────────────────
    /// Caller is not a registered verifier — attest_kyc / verify_kyc denied.
    NotVerifier = 61,

    // ── Species registry (62–64, 74-75) ───────────────────────────────────────
    // ── Dispute / arbiter (38–46) ─────────────────────────────────────────────
    DisputeAlreadyOpen = 38,
    NoOpenDispute = 39,
    EscrowAlreadyFinalised = 40,
    NotArbiter = 41,
    InvalidRoyalty = 47,

    // ── Species Voting (50–55) ────────────────────────────────────────────────
    /// The specified proposal ID does not exist.
    ProposalNotFound = 50,
    /// The voting period for this proposal has already ended.
    VotingPeriodExpired = 51,
    /// The caller has already cast a vote on this proposal.
    AlreadyVoted = 52,
    /// The proposal is not currently active and cannot be voted on.
    ProposalNotActive = 53,
    /// The proposal has not met the passing threshold and cannot be executed.
    ProposalNotPassed = 54,
    /// The proposal has already been executed and its outcome finalized.
    ProposalAlreadyExecuted = 55,

    // ── Location proof / KYC / ZK (64, 65–77) ────────────────────────────────
    /// Region geohash is outside the approved Northern Nigeria boundary.
    OutsideNigeriaRegion = 65,
    /// A location-proof commitment with this hash is already registered.
    ProofCommitmentAlreadyRegistered = 66,
    /// A ZK commitment with this hash has already been submitted.
    CommitmentAlreadySubmitted = 67,
    /// No commitment record found for the supplied hash.
    CommitmentNotFound = 68,
    /// The commitment is not in Pending state (already approved or rejected).
    CommitmentNotPending = 69,
    /// The supplied ZK proof digest failed on-chain integrity validation.
    ZkProofInvalid = 70,
    /// The age encoded in the ZK proof is below the minimum threshold.
    AgeBelowMinimum = 71,
    /// The ZK proof's validity window has expired.
    ProofExpired = 72,
    /// Polygon has fewer than 3 vertices - not a valid polygon.
    PolygonTooFewVertices = 75,
    /// The proof point falls outside the registered polygon boundary.
    PointOutsidePolygon = 76,
    /// The requested zone ID is not registered.
    ZoneNotFound = 77,

    // ── Species registry (62–64, 68–70) ───────────────────────────────────────
    Co2MustBePositive = 62,
    GrowthRateMustBePositive = 78,
    MaturityYearsMustBePositive = 63,
    SpeciesNotFound = 64,
    InvasiveSpecies = 74,
    HighWaterUse = 82,

    // ── Farmer registry hash integrity (73) ────────────────────────────────
    /// SHA-256 of the supplied document pre-image does not match the stored hash.
    HashMismatch = 73,
    // ── Farmer registry validator gates (67) ──────────────────────────────
    /// Caller is not a registered validator — gated read/write denied.
    NotValidator = 79,

    // ── Arithmetic overflows (80–81) ──────────────────────────────────────────
    TreeTokenMintOverflow = 80,
    TokenUnitOverflow = 81,

    // ── Tree lifecycle state machine (90–112) ─────────────────────────────────
    InvalidTreeStatusTransition = 90,
    PlantingTimeoutNotReached = 91,
    PolicyNotFound = 101,
    InvalidThreshold = 102,
    InvalidSignerSet = 103,
    AlreadyApproved = 104,
    NotAPolicySigner = 105,
    RequestNotOpen = 106,
    RequestExpired = 107,
    NotPolicyAdmin = 108,
    PolicySuperseded = 109,
    CannotCancelFinalised = 111,
    InvalidReplacementVersion = 112,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum GovernanceError {
    NotAdmin = 1,
    MinimumOneSignerRequired = 2,
    ThresholdMustBePositive = 3,
    ThresholdTooHigh = 4,
    MultisigNotInitialized = 5,
    NotASigner = 6,
    ProposalNotFound = 7,
    ProposalAlreadyExecuted = 8,
    AlreadyApproved = 9,
    SignerAlreadyExists = 10,
    SignerNotFound = 11,
    NonceAlreadyUsed = 93,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum NftError {
    TokenAlreadyMinted = 1,
    TokenNotFound = 2,
    MetadataMismatch = 3,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum FarmerError {
    FarmerAlreadyRegistered = 1,
    FarmerNotRegistered = 2,
    InvalidRegion = 3,
    PlotAlreadyExists = 4,
    InvalidCoordinatesCount = 5,
    NotValidator = 6,
    HashMismatch = 7,
    FarmerFrozen = 8,
    LandTenureAlreadyExists = 9,
    LandTenureNotFound = 10,
}
