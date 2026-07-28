#![no_std]

use soroban_sdk::contracterror;

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
    NotArbiter = 41,
    InvalidRoyalty = 47,
    CommitmentAlreadyRegistered = 60,
    NotVerifier = 61,
    Co2MustBePositive = 62,
    MaturityYearsMustBePositive = 63,
    SpeciesNotFound = 64,
    ProofCommitmentAlreadyRegistered = 66,
    PointOutsidePolygon = 76,
    ZoneNotFound = 77,
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
