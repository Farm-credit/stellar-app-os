//! Canonical Soroban custom error registry for every workspace contract.
//!
//! This crate is the single source of truth for error codes shared across the
//! Harvesta contracts (issue #1813). [`standard`] defines the workspace-wide
//! allocation scheme that keeps codes globally unique and predictable for
//! frontends, while the enums below hold the deployed, stable code values.
//!
//! Never renumber an existing variant: clients may already map its integer to
//! a localized message. New errors are appended inside the owning crate's
//! allocated range (see [`standard::CRATE_ERROR_RANGES`]).

#![no_std]

#[cfg(test)]
extern crate std;

pub mod standard;

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
    VerifiedCountMustBePositive = 11,
    VerifiedCountExceedsDonation = 12,
    InvalidPayoutAmount = 13,
    SlotAmountMustBePositive = 15,
    EscrowAlreadyExists = 16,
    EscrowNotFound = 17,
    PlantingAlreadyVerified = 18,
    PlantingNotVerified = 19,
    RefundAfterPlanting = 20,
    ContractMustBeTreeTokenAdmin = 21,
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

    // ── Nullifier registry (60) ───────────────────────────────────────────────
    CommitmentAlreadyRegistered = 60,

    // ── KYC attestation (61) ─────────────────────────────────────────────────
    /// Caller is not a registered verifier — attest_kyc / verify_kyc denied.
    NotVerifier = 61,

    // ── Dispute / arbiter (38–41, 47) ──────────────────────────────────────────
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

    // ── Location proof / KYC / ZK (65–77) ─────────────────────────────────────
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

    // ── Species registry (62–64, 74, 78, 82) ──────────────────────────────────
    Co2MustBePositive = 62,
    GrowthRateMustBePositive = 78,
    MaturityYearsMustBePositive = 63,
    SpeciesNotFound = 64,
    InvasiveSpecies = 74,
    HighWaterUse = 82,

    // ── Farmer registry hash integrity (73) ────────────────────────────────
    /// SHA-256 of the supplied document pre-image does not match the stored hash.
    HashMismatch = 73,

    // ── Farmer registry validator gates (79) ──────────────────────────────
    /// Caller is not a registered validator — gated read/write denied.
    NotValidator = 79,

    // ── Arithmetic overflows (80–81) ──────────────────────────────────────────
    TreeTokenMintOverflow = 80,
    TokenUnitOverflow = 81,

    // ── Tree lifecycle state machine (#462) ───────────────────────────────────
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

    // ── Sponsor insurance (#1021) ─────────────────────────────────────────────
    InsuranceNotActive = 113,
    InsurancePeriodExpired = 114,
    TreeNotDead = 115,
    InsuranceAlreadyClaimed = 116,
    InsuranceAlreadyPurchased = 117,

    // ── Wholesale multi-signature approval (issue #1089) ──────────────────────
    WholesaleOrderNotFound = 118,
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
    /// Payment amount is zero or negative for a trade.
    TradeAmountMustBePositive = 4,
    /// Buyer attempted to trade with themselves.
    SelfTrade = 5,
    /// The seller does not own the token being traded.
    NotTokenOwner = 6,
    TokenIsSoulbound = 7,
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
    InvalidMerkleProof = 11,
}

/// Every code currently registered in the shared canonical registry.
///
/// Exposed as a constant so SDK clients and tooling can generate exhaustive
/// error maps without scraping Rust sources.
pub const ALL_HARVESTA_ERRORS: &[HarvestaError] = &[
    HarvestaError::AlreadyInitialized,
    HarvestaError::NotInitialized,
    HarvestaError::Unauthorized,
    HarvestaError::ContractPaused,
    HarvestaError::AlreadyPaused,
    HarvestaError::NotPaused,
    HarvestaError::NoPendingAdmin,
    HarvestaError::AmountMustBePositive,
    HarvestaError::TreeCountMustBePositive,
    HarvestaError::VerifiedCountMustBePositive,
    HarvestaError::VerifiedCountExceedsDonation,
    HarvestaError::InvalidPayoutAmount,
    HarvestaError::SlotAmountMustBePositive,
    HarvestaError::EscrowAlreadyExists,
    HarvestaError::EscrowNotFound,
    HarvestaError::PlantingAlreadyVerified,
    HarvestaError::PlantingNotVerified,
    HarvestaError::RefundAfterPlanting,
    HarvestaError::ContractMustBeTreeTokenAdmin,
    HarvestaError::SurvivalRateOutOfRange,
    HarvestaError::SurvivalRateBelowMinimum,
    HarvestaError::SurvivalPeriodNotElapsed,
    HarvestaError::NothingToRelease,
    HarvestaError::UnauthorizedOracle,
    HarvestaError::NoOracleReport,
    HarvestaError::BatchEmpty,
    HarvestaError::BatchTooLarge,
    HarvestaError::TreeAlreadyRegistered,
    HarvestaError::TreeNotRegistered,
    HarvestaError::TreeNotOpenForContributions,
    HarvestaError::TreeNotOpenForRelease,
    HarvestaError::NoFundsToRelease,
    HarvestaError::FarmerAlreadyRegistered,
    HarvestaError::FarmerNotRegistered,
    HarvestaError::InvalidRegion,
    HarvestaError::CommitmentAlreadyRegistered,
    HarvestaError::NotVerifier,
    HarvestaError::DisputeAlreadyOpen,
    HarvestaError::NoOpenDispute,
    HarvestaError::EscrowAlreadyFinalised,
    HarvestaError::NotArbiter,
    HarvestaError::InvalidRoyalty,
    HarvestaError::ProposalNotFound,
    HarvestaError::VotingPeriodExpired,
    HarvestaError::AlreadyVoted,
    HarvestaError::ProposalNotActive,
    HarvestaError::ProposalNotPassed,
    HarvestaError::ProposalAlreadyExecuted,
    HarvestaError::OutsideNigeriaRegion,
    HarvestaError::ProofCommitmentAlreadyRegistered,
    HarvestaError::CommitmentAlreadySubmitted,
    HarvestaError::CommitmentNotFound,
    HarvestaError::CommitmentNotPending,
    HarvestaError::ZkProofInvalid,
    HarvestaError::AgeBelowMinimum,
    HarvestaError::ProofExpired,
    HarvestaError::PolygonTooFewVertices,
    HarvestaError::PointOutsidePolygon,
    HarvestaError::ZoneNotFound,
    HarvestaError::Co2MustBePositive,
    HarvestaError::GrowthRateMustBePositive,
    HarvestaError::MaturityYearsMustBePositive,
    HarvestaError::SpeciesNotFound,
    HarvestaError::InvasiveSpecies,
    HarvestaError::HighWaterUse,
    HarvestaError::HashMismatch,
    HarvestaError::NotValidator,
    HarvestaError::TreeTokenMintOverflow,
    HarvestaError::TokenUnitOverflow,
    HarvestaError::InvalidTreeStatusTransition,
    HarvestaError::PlantingTimeoutNotReached,
    HarvestaError::PolicyNotFound,
    HarvestaError::InvalidThreshold,
    HarvestaError::InvalidSignerSet,
    HarvestaError::AlreadyApproved,
    HarvestaError::NotAPolicySigner,
    HarvestaError::RequestNotOpen,
    HarvestaError::RequestExpired,
    HarvestaError::NotPolicyAdmin,
    HarvestaError::PolicySuperseded,
    HarvestaError::CannotCancelFinalised,
    HarvestaError::InvalidReplacementVersion,
    HarvestaError::InsuranceNotActive,
    HarvestaError::InsurancePeriodExpired,
    HarvestaError::TreeNotDead,
    HarvestaError::InsuranceAlreadyClaimed,
    HarvestaError::InsuranceAlreadyPurchased,
    HarvestaError::WholesaleOrderNotFound,
];

/// Every code in the shared governance error enum.
pub const ALL_GOVERNANCE_ERRORS: &[GovernanceError] = &[
    GovernanceError::NotAdmin,
    GovernanceError::MinimumOneSignerRequired,
    GovernanceError::ThresholdMustBePositive,
    GovernanceError::ThresholdTooHigh,
    GovernanceError::MultisigNotInitialized,
    GovernanceError::NotASigner,
    GovernanceError::ProposalNotFound,
    GovernanceError::ProposalAlreadyExecuted,
    GovernanceError::AlreadyApproved,
    GovernanceError::SignerAlreadyExists,
    GovernanceError::SignerNotFound,
    GovernanceError::NonceAlreadyUsed,
];

/// Every code in the shared NFT error enum.
pub const ALL_NFT_ERRORS: &[NftError] = &[
    NftError::TokenAlreadyMinted,
    NftError::TokenNotFound,
    NftError::MetadataMismatch,
    NftError::TradeAmountMustBePositive,
    NftError::SelfTrade,
    NftError::NotTokenOwner,
    NftError::TokenIsSoulbound,
];

/// Every code in the shared farmer error enum.
pub const ALL_FARMER_ERRORS: &[FarmerError] = &[
    FarmerError::FarmerAlreadyRegistered,
    FarmerError::FarmerNotRegistered,
    FarmerError::InvalidRegion,
    FarmerError::PlotAlreadyExists,
    FarmerError::InvalidCoordinatesCount,
    FarmerError::NotValidator,
    FarmerError::HashMismatch,
    FarmerError::FarmerFrozen,
    FarmerError::LandTenureAlreadyExists,
    FarmerError::LandTenureNotFound,
    FarmerError::InvalidMerkleProof,
];

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_unique(codes: &[u32], label: &str) {
        for (i, &first) in codes.iter().enumerate() {
            for &other in &codes[i + 1..] {
                assert_ne!(first, other, "duplicate code {} in {}", first, label);
            }
        }
    }

    #[test]
    fn shared_registry_codes_are_unique() {
        let codes: std::vec::Vec<u32> = ALL_HARVESTA_ERRORS
            .iter()
            .map(|error| *error as u32)
            .collect();
        assert_eq!(codes.len(), ALL_HARVESTA_ERRORS.len());
        assert_unique(&codes, "HarvestaError");
        assert_eq!(codes.len(), 88);
    }

    #[test]
    fn auxiliary_error_enums_are_internally_unique() {
        let governance: std::vec::Vec<u32> = ALL_GOVERNANCE_ERRORS
            .iter()
            .map(|error| *error as u32)
            .collect();
        let nft: std::vec::Vec<u32> = ALL_NFT_ERRORS.iter().map(|error| *error as u32).collect();
        let farmer: std::vec::Vec<u32> = ALL_FARMER_ERRORS
            .iter()
            .map(|error| *error as u32)
            .collect();
        assert_unique(&governance, "GovernanceError");
        assert_unique(&nft, "NftError");
        assert_unique(&farmer, "FarmerError");
    }

    #[test]
    fn every_shared_code_lies_in_the_shared_range() {
        for error in ALL_HARVESTA_ERRORS {
            let code = *error as u32;
            assert!(
                standard::GLOBAL_SHARED_RANGE.contains(code),
                "code {} is outside the shared registry range",
                code
            );
        }
    }

    #[test]
    fn registry_capacity_matches_the_highest_allocated_code() {
        let highest = ALL_HARVESTA_ERRORS
            .iter()
            .map(|error| *error as u32)
            .max()
            .unwrap();
        assert_eq!(highest, standard::SHARED_REGISTRY_LAST);
    }

    #[test]
    fn stable_error_codes_are_pinned() {
        assert_eq!(HarvestaError::Unauthorized as u32, 3);
        assert_eq!(HarvestaError::CommitmentAlreadyRegistered as u32, 60);
        assert_eq!(HarvestaError::OutsideNigeriaRegion as u32, 65);
        assert_eq!(HarvestaError::ProposalNotFound as u32, 50);
        assert_eq!(HarvestaError::WholesaleOrderNotFound as u32, 118);
    }
}
