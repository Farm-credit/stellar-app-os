#![no_std]

//! Shared error codes for all Harvesta / FarmCredit contracts.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
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
    InvalidStatus = 48,
    NotVerifier = 61,
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
}
