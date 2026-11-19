// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AfforestationProject.sol";

/// @title Carbon Credit (v2)
/// @notice Carbon credit issuance that enforces permanent sequestration for afforestation
/// projects. Credits may only be issued against a project that has posted a
/// sequestration bond or insurance policy guaranteeing the trees will not be
/// harvested for 30 years. This prevents carbon leakage.
contract CarbonSredit {
    /// Constant: 30 years in seconds.
    uint256 public constant SEQUESTRATION_PERIOD = 30 * 365 days;

    /// @notice The afforestation project registry that governs eligibility.
    AfforestationProject public immutable afforestationProject;

    /// @notice Admin authorized to issue credits.
    address public admin;

    /// @notice Total credits (tons) issued per project ID.
    mapping(uint256 => uint256) public creditsIssued;

    /// @notice Emitted when credits are issued against a project.
    event CreditsIssued(uint256 indexed projectId, uint256 tons, address issuedBy);

    /// @notice Emitted when a project is rejected for lack of sequestration cover.
    event CreditsRejected(uint256 indexed projectId, string reason);

    constructor(AfforestationProject _project, address _admin) {
        require(address(_project) != address(0), "project required");
        require(_admin != address(0), "admin required");
        afforestationProject = _project;
        admin = _admin;
    }

    /// @notice Issue carbon credits for a project.
    /// @dev Reverts if the project does not have an active 30-year sequestration
    /// bond or insurance policy. This is the leakage-prevention gate.
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
    function getCreditsIssued(uint256 projectId) external view returns (uint256) {
        return creditsIssued[projectId];
    }

    /// @notice Returns true if the project is covered by an active 30-year
    /// sequestration guarantee.
    function isProjectEligible(uint256 projectId) external view returns (bool) {
        (bool secured, ) = afforestationProject.isSequestrationSecured(projectId);
        return secured;
    }
}
