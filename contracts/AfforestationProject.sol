// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Afforestation Project Registry (v2)
/// @notice Registry of afforestation projects that enforces a 30-year non-harvest
/// guarantee to prevent carbon leakage. Each project must post either a
/// sequestration bond or an insurance policy covering the full 30-year period.
contract AfforestationProject {
    /// @notice 30 years in seconds (10950 days).
    uint256 public constant SEQUESTRATION_PERIOD = 30 * 365 days;

    /// @notice Minimum bond / insurance coverage required per hectare.
    uint256 public constant MIN_COVERAGE_PER_HECTARE = 1 ether;

    /// @notice Kind of sequestration cover posted by a project.
    enum CoverType {
        None,
        Bond,
        Insurance
    }

    /// @notice Persisted project record.
    struct Project {
        address owner;
        string name;
        uint256 areaHectares;
        uint256 treeCount;
        uint256 plantedAt;
        CoverType coverType;
        uint256 coverageAmount;
        uint256 coverageExpiresAt;
        address coverageProvider;
        bool exists;
    }

    /// @notice Admin authorized to verify coverage and manage the registry.
    /// @dev Set once at construction; used by the `onlyAdmin` modifier.
    address public admin;

    /// @notice Auto-incrementing project ID counter.
    /// @dev Starts at 1 so that a project ID of 0 is never valid.
    uint256 public nextProjectId = 1;

    /// @notice Project ID -> Project record.
    /// @dev Only IDs below `nextProjectId` have `exists == true`.
    mapping(uint256 => Project) public projects;

    /// @notice Emitted when a project is registered.
    /// @param projectId The newly assigned project ID.
    /// @param owner The address that registered the project.
    /// @param areaHectares The project area in hectares.
    event ProjectRegistered(uint256 indexed projectId, address indexed owner, uint256 areaHectares);

    /// @notice Emitted when 30-year sequestration cover is posted.
    /// @param projectId The project that received cover.
    /// @param coverType The kind of cover posted (Bond or Insurance).
    /// @param coverageAmount The coverage amount in wei.
    /// @param expiresAt The timestamp at which the cover expires.
    /// @param provider The bond poster or the insurer.
    event SequestrationCovered(
        uint256 indexed projectId,
        CoverType coverType,
        uint256 coverageAmount,
        uint256 expiresAt,
        address indexed provider
    );

    /// @notice Emitted when a project is flagged for a 30-year harvest violation.
    /// @param projectId The project that was flagged.
    /// @param reportedBy The admin that reported the violation.
    event HarvestViolation(uint256 indexed projectId, address reportedBy);

    /// @notice Deploys the registry and sets the admin.
    /// @dev Reverts with "admin required" if `_admin` is the zero address.
    /// @param _admin The address authorized to verify coverage and manage the registry.
    constructor(address _admin) {
        require(_admin != address(0), "admin required");
        admin = _admin;
    }

    /// @notice Restricts a function to the registry admin.
    /// @dev Reverts with "only admin" if `msg.sender` is not `admin`.
    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    /// @notice Register a new afforestation project.
    /// @dev The project is initially uncovered and cannot generate carbon credits
    /// until a 30-year sequestration bond or insurance policy is posted. Reverts
    /// with "name required" if `name` is empty, "area hectares must be positive"
    /// if `areaHectares` is zero, and "tree count must be positive" if
    /// `treeCount` is zero. Emits {ProjectRegistered}.
    /// @param name Human-readable project name; must be non-empty.
    /// @param areaHectares Project area in hectares; must be positive.
    /// @param treeCount Number of trees planted; must be positive.
    /// @return projectId The newly assigned project ID.
    function registerProject(
        string caldata name,
        uint256 areaHectares,
        uint256 treeCount
    ) external returns (uint256) {
        require(bytes(name).length > 0, "name required");
        require(areaHectares > 0, "area hectares must be positive");
        require(treeCount > 0, "tree count must be positive");

        uint256 projectId = nextProjectId++;
        Project storage p = projects[projectId];
        p.owner = msg.sender;
        p.name = name;
        p.areaHectares = areaHectares;
        p.treeCount = treeCount;
        p.plantedAt = block.timestamp;
        p.coverType = CoverType.None;
        p.exists = true;

        emit ProjectRegistered(projectId, msg.sender, areaHectares);
        return projectId;
    }

    /// @notice Post a 30-year sequestration bond for a project.
    /// @dev The bond must cover at least MIN_COVERAGE_PER_HECTARE per hectare and
    /// must extend at least 30 years from the planting date. The bond is held by
    /// this contract and is forfeited if a harvest violation is reported. Reverts
    /// with "project not found" if the project does not exist, "only owner or
    /// admin" if the caller is neither, "bond below minimum coverage" if
    /// `msg.value` is below the required amount, and "ncoverage must span 30
    /// years" if the cover would not span the full period. Emits
    /// {SequestrationCovered} with `CoverType.Bond`.
    /// @param projectId The project to cover; must exist.
    function postSequestrationBond(uint256 projectId) external payable {
        Project storage p = projects[projectId];
        require(p.exists, "project not found");
        require(msg.sender == p.owner || msg.sender == admin, "only owner or admin");

        uint256 required = p.areaHectares * MIN_COVERAGE_PER_HECTARE;
        require(msg.value >= required, "bond below minimum coverage");

        uint256 expiresAt = p.plantedAt + SEQUESTRATION_PERIOD;
        require(expiresAt >= block.timestamp + SEQUESTRATION_PERIOD,"ncoverage must span 30 years");

        p.coverType = CoverType.Bond;
        p.coverageAmount = msg.value;
        p.coverageExpiresAt = expiresAt;
        p.coverageProvider = msg.sender;

        emit SequestrationCovered(
            projectId,
            CoverType.Bond,
            msg.value,
            expiresAt,
            msg.sender
        );
    }

    /// @notice Record an insurance policy covering the 30-year no-harvest
    /// guarantee. The premium is paid off-chain to the insurer and the policy
    /// is registered on-chain by the admin after verification.
    /// @dev Restricted to the admin via `onlyAdmin` (reverts with "only admin").
    /// Reverts with "project not found" if the project does not exist, "insurer
    /// required" if `insurer` is the zero address, "insurance below minimum
    /// coverage" if `coverageAmount` is below the required amount, and
    /// "insurance must span 30 years" if `expiresAt` is too early. Emits
    /// {SequestrationCovered} with `CoverType.Insurance`.
    /// @param projectId The project to cover; must exist.
    /// @param insurer The insurer backing the policy; must be non-zero.
    /// @param coverageAmount The coverage amount in wei.
    /// @param expiresAt The policy expiry timestamp.
    function postInsurancePolicy(
        uint256 projectId,
        address insurer,
        uint256 coverageAmount,
        uint256 expiresAt
    ) external onlyAdmin {
        Project storage p = projects[projectId];
        require(p.exists, "project not found");
        require(insurer != address(0), "insurer required");

        uint256 required = p.areaHectares * MIN_COVERAGE_PER_HECTARE;
        require(coverageAmount >= required, "insurance below minimum coverage");
        require(
            expiresAt >= p.plantedAt + SEQUESTRATION_PERIOD,
            "insurance must span 30 years"
        );

        p.coverType = CoverType.Insurance;
        p.coverageAmount = coverageAmount;
        p.coverageExpiresAt = expiresAt;
        p.coverageProvider = insurer;

        emit SequestrationCovered(
            projectId,
            CoverType.Insurance,
            coverageAmount,
            expiresAt,
            insurer
        );
    }

    /// @notice Report a harvest violation for a project. The sequestration bond
    /// is forfeited to the admin and the project loses its coverage, blocking
    /// further carbon credit issuance.
    /// @dev Restricted to the admin via `onlyAdmin` (reverts with "only admin").
    /// Reverts with "project not found" if the project does not exist and "no
    /// coverage to forfeit" if no cover is posted. Emits {HarvestViolation}.
    /// @param projectId The project to flag; must exist and have active cover.
    function reportHarvestViolation(uint256 projectId) external onlyAdmin {
        Project storage p = projects[projectId];
        require(p.exists, "project not found");
        require(p.coverType != CoverType.None, "no coverage to forfeit");

        if (p.coverType == CoverType.Bond && p.coverageAmount > 0) {
            uint256 amount = p.coverageAmount;
            p.coverageAmount = 0;
            payable(admin).call{value: amount}();
        }

        p.coverType = CoverType.None;
        p.coverageExpiresAt = 0;
        p.coverageProvider = address(0);

        emit HarvestViolation(projectId, msg.sender);
    }

    /// @notice Returns true when the project is covered by an active 30-year
    /// sequestration bond or insurance policy. This is the gate used by the
    /// CarbonCredit contract before issuing credits.
    /// @dev Never reverts; failures are reported via the `reason` string. Reasons
    /// include "project not found", "no sequestration cover posted",
    /// "sequestration cover expires before 30 years", and "sequestration
    /// coverage below minimum".
    /// @param projectId The project to check.
    /// @return secured True if the project has valid 30-year cover.
    /// @return reason Empty when secured; otherwise a human-readable reason.
    function isSequestrationSecured(uint256 projectId)
        public
        view
        returns (bool secured, string memory reason)
    {
        Project storage p = projects[projectId];
        if (!p.exists) {
            return (false, "project not found");
        }
        if (p.coverType == CoverType.None) {
            return (false, "no sequestration cover posted");
        }
        if (p.coverageExpiresAt < block.timestamp + SEQUESTRATION_PERIOD) {
            return (false, "sequestration cover expires before 30 years");
        }
        uint256 required = p.areaHectares * MIN_COVERAGE_PER_HECTARE;
        if (p.coverageAmount < required) {
            return (false, "sequestration coverage below minimum");
        }
        return (true, "");
    }

    /// @notice Returns the stored project record.
    /// @dev Reverts with "project not found" if the project does not exist.
    /// @param projectId The project to fetch; must exist.
    /// @return The stored {Project} record.
    function getProject(uint256 projectId) external view returns (Project memory) {
        require(projects[projectId].exists, "project not found");
        return projects[projectId];
    }
}
