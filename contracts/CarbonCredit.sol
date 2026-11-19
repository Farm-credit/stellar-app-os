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

    /// @notice Details of an on-chain auction for carbon credits.
    /// @dev `highestBidder` is the zero address until the first valid bid.
    struct Auction {
        uint256 projectId;
        uint256 tons;
        uint256 reservePrice;
        address seller;
        address highestBidder;
        uint256 highestBid;
        uint256 highestBidTime;
        uint256 endTime;
        bool settled;
    }

    /// @notice Auto-incrementing ID for the next auction to be created.
    uint256 public nextAuctionId;

    /// @notice Auctions keyed by auction ID.
    mapping(uint256 => Auction) public auctions;

    /// @notice Emitted when a new auction is created.
    /// @param auctionId The ID of the newly created auction.
    /// @param projectId The afforestation project whose credits are auctioned.
    /// @param tons The number of credits (in tons) being auctioned.
    /// @param reservePrice The minimum acceptable bid (per auction, in wei).
    /// @param seller The address offering the credits for sale.
    /// @param endTime The timestamp at which bidding closes.
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed projectId,
        uint256 tons,
        uint256 reservePrice,
        address indexed seller,
        uint256 endTime
    );

    /// @notice Emitted when a bid is placed on an auction.
    /// @param auctionId The ID of the auction receiving the bid.
    /// @param bidder The address placing the bid.
    /// @param amount The bid amount (in wei).
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);

    /// @notice Emitted when an auction is settled.
    /// @param auctionId The ID of the auction that was settled.
    /// @param winner The winning bidder (zero address if no valid bid).
    /// @param winningBid The winning bid amount (in wei).
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid);

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

    /// @notice Create an auction to sell carbon credits to multiple buyers.
    /// @dev Reverts if `tons` is zero, if `reservePrice` is zero, if `duration`
    /// is zero, or if the seller does not hold enough issued credits for the
    /// project. Emits {AuctionCreated}.
    /// @param projectId The afforestation project whose credits are auctioned.
    /// @param tons The number of credits (in tons) to auction.
    /// @param reservePrice The minimum acceptable bid (in wei).
    /// @param duration The length of the bidding window in seconds.
    /// @return auctionId The ID of the newly created auction.
    function createAuction(
        uint256 projectId,
        uint256 tons,
        uint256 reservePrice,
        uint256 duration
    ) external returns (uint256 auctionId) {
        require(tons > 0, "tons must be positive");
        require(reservePrice > 0, "reserve price required");
        require(duration > 0, "duration required");
        require(creditsIssued[projectId] >= tons, "insufficient credits");

        auctionId = nextAuctionId++;
        uint256 endTime = block.timestamp + duration;

        auctions[auctionId] = Auction({
            projectId: projectId,
            tons: tons,
            reservePrice: reservePrice,
            seller: msg.sender,
            highestBidder: address(0),
            highestBid: 0,
            highestBidTime: 0,
            endTime: endTime,
            settled: false
        });

        emit AuctionCreated(auctionId, projectId, tons, reservePrice, msg.sender, endTime);
    }

    /// @notice Place a bid on an active auction.
    /// @dev Reverts if the auction is settled or expired, if the seller bids,
    /// if the bid is below the reserve price, or if the bid does not strictly
    /// exceed the current highest bid. Ties are broken in favour of the
    /// earliest bid, so a matching bid is rejected. Emits {BidPlaced}.
    /// @param auctionId The ID of the auction to bid on.
    function placeBid(uint256 auctionId) external payable {
        Auction storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction not found");
        require(!auction.settled, "auction settled");
        require(block.timestamp < auction.endTime, "auction ended");
        require(msg.sender != auction.seller, "seller cannot bid");
        require(msg.value >= auction.reservePrice, "below reserve price");
        require(msg.value > auction.highestBid, "bid too low");

        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;
        auction.highestBidTime = block.timestamp;

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    /// @notice Settle an auction after its bidding window has closed.
    /// @dev Highest bidder wins; ties are resolved by earliest bid (enforced in
    /// {placeBid}). Reverts if the auction does not exist, is already settled,
    /// or bidding is still open. Emits {AuctionSettled}.
    /// @param auctionId The ID of the auction to settle.
    function settleAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction not found");
        require(!auction.settled, "auction settled");
        require(block.timestamp >= auction.endTime, "auction still active");

        auction.settled = true;

        emit AuctionSettled(auctionId, auction.highestBidder, auction.highestBid);
    }
}
