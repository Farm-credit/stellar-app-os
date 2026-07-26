#![no_std]

//! Shared error codes for all Harvesta / FarmCredit contracts.
//!
//! Import the crate, then call `panic_with_error!(env, HarvestaError::Variant)`
//! instead of raw string panics. Error codes are stable `u32` values embedded in
//! the Stellar XDR so off-chain tooling can parse them without string matching.

use soroban_sdk::{contracterror, Env, Error};

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum HarvestaError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    AlreadyPaused = 5,
    NotPaused = 6,
    NoPendingAdmin = 7,
    ContractMustBeTreeTokenAdmin = 8,

    AmountMustBePositive = 9,
    TreeCountMustBePositive = 10,
    VerifiedCountMustBePositive = 11,
    VerifiedCountExceedsDonation = 12,
    InvalidPayoutAmount = 13,
    BurnAmountMustBePositive = 14,
    SlotAmountMustBePositive = 15,

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

    UnauthorizedOracle = 26,
    NoOracleReport = 27,
    BatchEmpty = 28,
    BatchTooLarge = 29,
    TreeAlreadyRegistered = 30,
    TreeNotRegistered = 31,
    TreeNotOpenForContributions = 32,
    TreeNotOpenForRelease = 33,
    NoFundsToRelease = 34,

    FarmerAlreadyRegistered = 35,
    FarmerNotRegistered = 36,
    InvalidRegion = 37,

    DisputeAlreadyOpen = 38,
    NoOpenDispute = 39,
    EscrowAlreadyFinalised = 40,
    NotArbiter = 41,
    NotBuyerOrSeller = 42,
    MilestoneReleaseBlocked = 43,
    MilestoneAlreadyProcessed = 44,
    CompletionPercentageOutOfRange = 45,
    TotalReleasedExceedsMilestone = 46,

    InvalidRoyalty = 47,

    ProposalNotFound = 48,
    VotingPeriodExpired = 49,
    AlreadyVoted = 50,
    ProposalNotActive = 51,
    ProposalNotPassed = 52,
    ProposalAlreadyExecuted = 53,

    CommitmentAlreadyRegistered = 54,
    NotVerifier = 55,

    Co2MustBePositive = 56,
    GrowthRateMustBePositive = 57,
    MaturityYearsMustBePositive = 58,
    SpeciesNotFound = 59,
    InvasiveSpecies = 60,

    OutsideNigeriaRegion = 61,
    ProofCmntAlreadyRegistered = 62,
    CommitmentAlreadySubmitted = 63,
    CommitmentNotFound = 64,
    CommitmentNotPending = 65,
    ZkProofInvalid = 66,
    AgeBelowMinimum = 67,
    ProofExpired = 68,
    PolygonTooFewVertices = 69,
    PointOutsidePolygon = 70,
    ZoneNotFound = 71,

    NotValidator = 72,
    HashMismatch = 73,
    HighWaterUse = 74,

    TreeTokenMintOverflow = 75,
    TokenUnitOverflow = 76,

    InvalidTreeStatusTransition = 77,
    PlantingTimeoutNotReached = 78,
    NonceAlreadyUsed = 79,

    PolicyVersionAlreadyExists = 80,
    PolicyNotFound = 81,
    InvalidThreshold = 82,
    InvalidSignerSet = 83,
    AlreadyApproved = 84,
    NotAPolicySigner = 85,
    RequestNotOpen = 86,
    RequestExpired = 87,
    NotPolicyAdmin = 88,
    PolicySuperseded = 89,
    RequestAlreadyFinalised = 90,
    CannotCancelFinalised = 91,
    InvalidReplacementVersion = 92,

    InvalidStatus = 93,
}

impl From<HarvestaError> for Error {
    fn from(err: HarvestaError) -> Error {
        Error::from_contract_error(err as u32)
    }
}

impl HarvestaError {
    pub fn panic_with(env: &Env, err: HarvestaError) -> ! {
        soroban_sdk::panic_with_error!(env, err)
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
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
#[repr(u32)]
pub enum NftError {
    TokenAlreadyMinted = 1,
    TokenNotFound = 2,
    MetadataMismatch = 3,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FarmerError {
    FarmerAlreadyRegistered = 1,
    FarmerNotRegistered = 2,
    InvalidRegion = 3,
    PlotAlreadyExists = 4,
    InvalidCoordinatesCount = 5,
    NotValidator = 6,
    HashMismatch = 7,
    FarmerFrozen = 8,
}
