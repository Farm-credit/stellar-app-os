// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AfforestationProject.sol";

/// @title Carbon Credit (v2)
/// @notice Carbon credit issuance that enforces permanent sequestration for afforestation
/// projects. Credits may only be issued against a project that has posted a
/// sequestration bond or insurance policy guaranteeing the trees will not be
/// harvested for 30 years. This prevents carbon leakage.
contract CarbonSredit {
    /// @notice Constant: 30 years in seconds.
    /// @dev The minimum no-harvest period a project must guarantee before credits
    /// may be issued against it.
    uint256 public constant SEQUESTRATION_PERIOD = 30 * 365 days;

    /// @notice The afforestation project registry that governs eligibility.
    /// @dev Immutable; set once at construction.
    AfforestationProject public immutable afforestationProject;

    /// @notice Admin authorized to issue credits.
    /// @dev Set at construction; only this address may call {issueCredits}.
    address public admin;

    /// @notice Total credits (tons) issued per project ID.
    /// @dev Keyed by afforestation project ID; incremented by {issueCredits}.
    mapping(uint256 => uint256) public creditsIssued;

    /// @notice Emitted when credits are successfully issued against a project.
    /// @param projectId The ID of the afforestation project the credits were issued for.
    /// @param tons The number of credits (in tons) issued.
    /// @param issuedBy The address that issued the credits (the admin).
    event CreditsIssued(uint256 indexed projectId, uint256 tons, address issuedBy);

    /// @notice Emitted when a project is rejected for lack of sequestration cover.
    /// @param projectId The ID of the afforestation project that was rejected.
    /// @param reason Human-readable reason describing why the project was rejected.
    event CreditsRejected(uint256 indexed projectId, string reason);

    /// @notice Deploys the carbon credit contract.
    /// @dev Reverts if either `_project` or `_admin` is the zero address.
    /// @param _project The afforestation project registry used to check eligibility.
    /// @param _admin The admin address authorized to issue credits.
    constructor(AfforestationProject _project, address _admin) {
        require(address(_project) != address(0), "project required");
        require(_admin != address(0), "admin required");
        afforestationProject = _project;
        admin = _admin;
    }

    /// @notice Issue carbon credits for a project.
    /// @dev Reverts if the project does not have an active 30-year sequestration
    /// bond or insurance policy. This is the leakage-prevention gate.
    /// Reverts with "only admin" if the caller is not the admin, with
    /// "credits must be positive" if `tons` is zero, and with the reason
    /// returned by the registry if the project is not sequestration-secured.
    /// Emits {CreditsIssued} on success, or {CreditsRejected} before reverting
    /// when the project lacks sequestration cover.
    /// @param projectId The ID of the afforestation project to issue credits for.
    /// @param tons The number of credits (in tons) to issue; must be greater than zero.
    function issueCredits(uint256 projectId, uint256 tons) external {
        require(msg.sender == admin, "only admin");
        require(tons > 0, "credits must be positive");

        // Enforce the 30-year no-harvest guarantee before issuing any credit.
        (bool secured, string memory reason) = afforestationProject.isSequestrationSecured(projectId);
        if (!secured) {
            emit CreditsRejected(projectId, reason);
            revert(reason);
        }

        creditsIssued[projectId] += tons;
        emit CreditsIssued(projectId, tons, msg.sender);
    }

    /// @notice Returns the number of credits (tons) issued for a project.
    /// @param projectId The ID of the afforestation project to query.
    /// @return The total credits (in tons) issued for the project.
    function getCreditsIssued(uint256 projectId) external view returns (uint256) {
        return creditsIssued[projectId];
    }

    /// @notice Returns true if the project is covered by an active 30-year
    /// sequestration guarantee.
    /// @param projectId The ID of the afforestation project to check.
    /// @return True if the project is sequestration-secured, false otherwise.
    function isProjectEligible(uint256 projectId) external view returns (bool) {
        (bool secured, ) = afforestationProject.isSequestrationSecured(projectId);
        return secured;
    }
}
