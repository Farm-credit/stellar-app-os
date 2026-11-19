// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title CarbonCreditNFT
 * @notice ERC-721 contract that tokenizes verified carbon credits from
 *         Verra and Gold Standard registries as non-fungible tokens.
 *
 *         Each NFT represents exactly one verified, retired (or allocated)
 *         carbon credit serial number. Critical metadata is stored both in
 *         the on-chain `CreditData` struct and via an off-chain (IPFS) URI.
 *
 * @dev Double-minting is prevented by:
 *      1. A unique keccak256(protocol, serialNumber) -> tokenId mapping
 *         checked in `mintVerifiedCredit`.
 *      2. The backend verifier wallet must sign off via the MINTER_ROLE.
 */
contract CarbonCreditNFT is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    AccessControl
{
    using Counters for Counters.Counter;
    using Strings for uint256;

    // ── Roles ────────────────────────────────────────────────────────────────

    /// @notice Role granted to authorised backend / verifier wallets that may
    ///         call {mintVerifiedCredit}.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Role granted to the oracle wallet that attests off-chain
    ///         validation records. Currently also holds {MINTER_ROLE}.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Role granted to administrators that may update the contract
    ///         base URI and per-token metadata URIs.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── Protocol identifiers ─────────────────────────────────────────────────

    /// @notice Bytes32 identifier for the Verra registry
    ///         (`keccak256("verra")`).
    bytes32 public constant PROTOCOL_VERRA = keccak256("verra");

    /// @notice Bytes32 identifier for the Gold Standard registry
    ///         (`keccak256("gold-standard")`).
    bytes32 public constant PROTOCOL_GOLD_STANDARD = keccak256("gold-standard");

    // ── Counter ──────────────────────────────────────────────────────────────

    Counters.Counter private _tokenIdCounter;

    // ── On-chain credit metadata ─────────────────────────────────────────────

    enum RegistryProtocol {
        Verra,
        GoldStandard
    }

    struct CreditData {
        bytes32 protocol;
        string projectId;
        uint256 vintage;
        uint256 tonnage;
        string serialNumber;
        bytes32 validationId;
        uint64 mintedAt;
    }

    // ── State ────────────────────────────────────────────────────────────────

    /// @notice On-chain credit metadata for each token id.
    /// @dev Populated in {mintVerifiedCredit}; entries are retained after a
    ///      token is burned via {retireCredit} for auditability.
    mapping(uint256 tokenId => CreditData) public creditData;

    mapping(bytes32 protocolSerialHash => bool minted)
        private _mintedSerials;

    mapping(uint256 tokenId => string metadataUri) private _tokenURIs;

    /// @notice Base URI prepended to token URIs by the ERC-721 `_baseURI`
    ///         implementation. Updated by {setContractBaseURI}.
    string public contractBaseURI;

    // ── Events ───────────────────────────────────────────────────────────────

    event CreditMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        bytes32 indexed protocolSerialHash,
        bytes32 protocol,
        string projectId,
        string serialNumber,
        uint256 vintage,
        uint256 tonnage,
        string metadataUri,
        bytes32 validationId
    );

    event CreditRetired(
        address indexed owner,
        uint256 indexed tokenId,
        string reason,
        uint256 retiredAt
    );

    event MetadataUriUpdated(
        uint256 indexed tokenId,
        string oldUri,
        string newUri
    );

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * @notice Deploy the CarbonCreditNFT contract and configure roles.
     *
     * @dev Grants `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` to `defaultAdmin`,
     *      `MINTER_ROLE` to both `minterWallet` and `oracleWallet`, and
     *      `ORACLE_ROLE` to `oracleWallet`. The token id counter is started
     *      at 1 so that token id 0 is never minted.
     *
     * @param defaultAdmin  Address receiving the default admin and admin roles.
     * @param minterWallet  Address receiving the minter role.
     * @param oracleWallet  Address receiving the minter and oracle roles.
     * @param baseURI       Initial value for {contractBaseURI}.
     */
    constructor(
        address defaultAdmin,
        address minterWallet,
        address oracleWallet,
        string memory baseURI
    ) ERC721("StellarVerifiedCarbonCredit", "SVCC") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minterWallet);
        _grantRole(MINTER_ROLE, oracleWallet);
        _grantRole(ORACLE_ROLE, oracleWallet);
        contractBaseURI = baseURI;
        _tokenIdCounter.increment();
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _protocolToBytes32(
        RegistryProtocol protocol
    ) internal pure returns (bytes32) {
        if (protocol == RegistryProtocol.Verra) return PROTOCOL_VERRA;
        return PROTOCOL_GOLD_STANDARD;
    }

    function _hashSerial(
        bytes32 protocol,
        string calldata serialNumber
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(protocol, serialNumber));
    }

    function _validateStrings(
        string calldata projectId,
        string calldata serialNumber
    ) internal pure {
        require(bytes(projectId).length > 0, "CarbonCreditNFT: empty projectId");
        require(bytes(serialNumber).length > 0, "CarbonCreditNFT: empty serialNumber");
        require(bytes(projectId).length <= 200, "CarbonCreditNFT: projectId too long");
        require(bytes(serialNumber).length <= 500, "CarbonCreditNFT: serialNumber too long");
    }

    // ── Minting (authorised) ─────────────────────────────────────────────────

    /**
     * @notice Mint a verified carbon credit NFT.
     *
     * @dev Caller must hold MINTER_ROLE (authorised backend wallet or Oracle).
     *      Reverts if the (protocol, serialNumber) pair has already been
     *      minted to prevent double-tokenization. Emits {CreditMinted} on
     *      success.
     *
     *      Reverts with:
     *      - "CarbonCreditNFT: zero recipient" if `recipient` is the zero address.
     *      - "CarbonCreditNFT: vintage too early" if `vintage` < 1900.
     *      - "CarbonCreditNFT: vintage too late" if `vintage` > 2200.
     *      - "CarbonCreditNFT: tonnage must be positive" if `tonnage` == 0.
     *      - "CarbonCreditNFT: empty projectId" / "empty serialNumber" /
     *        "projectId too long" / "serialNumber too long" from
     *        {_validateStrings}.
     *      - "CarbonCreditNFT: serial already minted" if the serial hash is
     *        already recorded.
     *      - AccessControl "account is missing role" if the caller lacks
     *        MINTER_ROLE.
     *
     * @param recipient      Wallet receiving the NFT.
     * @param protocol       RegistryProtocol.Verra (0) or GoldStandard (1).
     * @param projectId      Registry project identifier.
     * @param vintage        Credit vintage year (e.g. 2023).
     * @param tonnage        Tonnes of CO2 represented by this credit.
     * @param serialNumber   Retirement / issuance serial number.
     * @param metadataUri    IPFS / HTTPS URI for extended JSON metadata.
     * @param validationId   Off-chain validation record identifier.
     *
     * @return tokenId       The newly-minted token id.
     *
     * Emits a {CreditMinted} event.
     */
    function mintVerifiedCredit(
        address recipient,
        RegistryProtocol protocol,
        string calldata projectId,
        uint256 vintage,
        uint256 tonnage,
        string calldata serialNumber,
        string calldata metadataUri,
        bytes32 validationId
    )
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        require(recipient != address(0), "CarbonCreditNFT: zero recipient");
        require(vintage >= 1900, "CarbonCreditNFT: vintage too early");
        require(vintage <= 2200, "CarbonCreditNFT: vintage too late");
        require(tonnage > 0, "CarbonCreditNFT: tonnage must be positive");
        _validateStrings(projectId, serialNumber);

        bytes32 protocolBytes = _protocolToBytes32(protocol);
        bytes32 serialHash = _hashSerial(protocolBytes, serialNumber);

        require(
            !_mintedSerials[serialHash],
            "CarbonCreditNFT: serial already minted"
        );

        tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, metadataUri);

        creditData[tokenId] = CreditData({
            protocol: protocolBytes,
            projectId: projectId,
            vintage: vintage,
            tonnage: tonnage,
            serialNumber: serialNumber,
            validationId: validationId,
            mintedAt: uint64(block.timestamp)
        });

        _mintedSerials[serialHash] = true;

        emit CreditMinted(
            recipient,
            tokenId,
            serialHash,
            protocolBytes,
            projectId,
            serialNumber,
            vintage,
            tonnage,
            metadataUri,
            validationId
        );
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    /**
     * @notice Returns whether a (protocol, serialNumber) pair has been minted.
     *
     * @dev Computes the same keccak256(protocol, serialNumber) hash used by
     *      {mintVerifiedCredit} and checks the internal minted-serial map.
     *
     * @param protocol      RegistryProtocol.Verra (0) or GoldStandard (1).
     * @param serialNumber  Retirement / issuance serial number.
     *
     * @return True if the pair has already been minted, false otherwise.
     */
    function isSerialMinted(
        RegistryProtocol protocol,
        string calldata serialNumber
    ) external view returns (bool) {
        bytes32 protocolBytes = _protocolToBytes32(protocol);
        bytes32 serialHash = _hashSerial(protocolBytes, serialNumber);
        return _mintedSerials[serialHash];
    }

    /**
     * @notice Look up a token id by its (protocol, serialNumber) pair via
     *         a linear scan over the existing supply.  O(n) — use for
     *         debugging / tooling, not on-chain hot paths.
     *
     * @dev Reverts with "CarbonCreditNFT: serial not minted" if the serial
     *      hash has never been recorded, and with
     *      "CarbonCreditNFT: token not found for serial" if the serial is
     *      marked minted but no matching live token is found (e.g. the token
     *      was burned via {retireCredit}).
     *
     * @param protocol      RegistryProtocol.Verra (0) or GoldStandard (1).
     * @param serialNumber  Retirement / issuance serial number.
     *
     * @return The token id associated with the serial number.
     */
    function findTokenIdBySerial(
        RegistryProtocol protocol,
        string calldata serialNumber
    ) external view returns (uint256) {
        bytes32 protocolBytes = _protocolToBytes32(protocol);
        bytes32 serialHash = _hashSerial(protocolBytes, serialNumber);
        require(_mintedSerials[serialHash], "CarbonCreditNFT: serial not minted");

        uint256 supply = totalSupply();
        for (uint256 i = 0; i < supply; ++i) {
            uint256 tid = tokenByIndex(i);
            CreditData storage c = creditData[tid];
            if (
                c.protocol == protocolBytes &&
                keccak256(bytes(c.serialNumber)) ==
                keccak256(bytes(serialNumber))
            ) {
                return tid;
            }
        }
        revert("CarbonCreditNFT: token not found for serial");
    }

    /**
     * @notice Return the protocol for a given token id as a human-readable
     *         string: "verra" or "gold-standard".
     *
     * @dev Reverts with ERC721 "ERC721NonexistentToken" (via `_requireOwned`)
     *      if `tokenId` does not exist. Returns "unknown" if the stored
     *      protocol bytes32 matches neither known constant.
     *
     * @param tokenId  The token id to query.
     *
     * @return The protocol name as a string.
     */
    function protocolString(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        bytes32 p = creditData[tokenId].protocol;
        if (p == PROTOCOL_VERRA) return "verra";
        if (p == PROTOCOL_GOLD_STANDARD) return "gold-standard";
        return "unknown";
    }

    // ── Burning / Retirement ─────────────────────────────────────────────────

    /**
     * @notice Burn a credit NFT, permanently removing it from supply.
     *         Emits `CreditRetired` so that the retirement is auditable.
     *         Caller must be owner or approved.
     *
     * @dev Reverts with ERC721 "ERC721NonexistentToken" (via `_requireOwned`)
     *      if `tokenId` does not exist, and with
     *      "CarbonCreditNFT: not owner nor approved" if the caller is neither
     *      the owner, an approved operator, nor approved for the token.
     *
     * @param tokenId  The token id to retire (burn).
     * @param reason   Free-form human-readable retirement reason.
     *
     * Emits a {CreditRetired} event.
     */
    function retireCredit(
        uint256 tokenId,
        string calldata reason
    ) external {
        address owner = _requireOwned(tokenId);
        require(
            _isAuthorized(owner, _msgSender(), tokenId),
            "CarbonCreditNFT: not owner nor approved"
        );

        _burn(tokenId);

        emit CreditRetired(_msgSender(), tokenId, reason, block.timestamp);
    }

    // ── Admin functions ──────────────────────────────────────────────────────

    /**
     * @notice Update the contract-wide base URI used by {tokenURI}.
     *
     * @dev Caller must hold ADMIN_ROLE; otherwise reverts with AccessControl
     *      "account is missing role".
     *
     * @param newBaseURI  The new base URI value.
     */
    function setContractBaseURI(
        string calldata newBaseURI
    ) external onlyRole(ADMIN_ROLE) {
        contractBaseURI = newBaseURI;
    }

    /**
     * @notice Update the metadata URI for an existing token.
     *
     * @dev Caller must hold ADMIN_ROLE. Reverts with ERC721
     *      "ERC721NonexistentToken" (via `_requireOwned`) if `tokenId` does
     *      not exist, and with AccessControl "account is missing role" if the
     *      caller lacks ADMIN_ROLE.
     *
     * @param tokenId  The token id whose URI is updated.
     * @param newUri   The new metadata URI.
     *
     * Emits a {MetadataUriUpdated} event with the previous and new URIs.
     */
    function updateTokenURI(
        uint256 tokenId,
        string calldata newUri
    ) external onlyRole(ADMIN_ROLE) {
        _requireOwned(tokenId);
        string memory oldUri = tokenURI(tokenId);
        _setTokenURI(tokenId, newUri);
        emit MetadataUriUpdated(tokenId, oldUri, newUri);
    }

    // ── ERC-165 / overrides ──────────────────────────────────────────────────

    /**
     * @notice Query if this contract implements the given interface.
     *
     * @dev Resolves the diamond inheritance of ERC721, ERC721Enumerable,
     *      ERC721URIStorage and AccessControl via `super`.
     *
     * @param interfaceId  The ERC-165 interface identifier.
     *
     * @return True if the interface is supported, false otherwise.
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Return the metadata URI for a token.
     *
     * @dev Resolves the ERC721 / ERC721URIStorage override chain via
     *      `super`. Reverts with ERC721 "ERC721NonexistentToken" if `tokenId`
     *      does not exist.
     *
     * @param tokenId  The token id to query.
     *
     * @return The token's metadata URI.
     */
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return contractBaseURI;
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }
}
