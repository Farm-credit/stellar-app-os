# Requirements Document

## Introduction

This feature adds SEP-41 NFT minting for donor impact certificates on the Stellar blockchain. After a successful donation, a donor can mint a non-fungible certificate that permanently records their environmental impact: tree count, CO2 offset estimate, planting date, and region (Northern Nigeria). Certificates can be minted to a regular public Stellar address or to an anonymous address derived from the ZK proof flow (Circuit 1), preserving donor privacy. The minting flow integrates with the existing donation pipeline and the `Donation` type's `certificateUrl` field.

---

## Glossary

- **Certificate_NFT**: A SEP-41 non-fungible token on Stellar representing a donor's impact certificate.
- **Minting_Contract**: The Soroban smart contract implementing the SEP-41 token interface that creates Certificate_NFTs.
- **Certificate_Metadata**: The structured data attached to a Certificate_NFT — tree count, CO2 offset (kg), planting date (ISO 8601), and region string.
- **Recipient_Address**: The Stellar public key to which a Certificate_NFT is minted. May be a regular wallet address or an anonymous address from the ZK flow.
- **Anonymous_Address**: A Stellar public key derived from the ZK proof commitment, used when the donor has no on-chain wallet identity.
- **Mint_API**: The Next.js API route that builds the Soroban minting transaction.
- **Certificate_Service**: The client-side service that orchestrates the mint flow — calling Mint_API, signing, and submitting.
- **Donation_Record**: The existing `Donation` object in `lib/types/donation.ts`, extended with a `certificateTokenId` field.
- **CO2_Offset**: The estimated kilograms of CO2 sequestered, calculated as `trees × (CO2_PER_DOLLAR / TREES_PER_DOLLAR)` = 0.048 kg per tree.
- **Region**: The geographic label for the planting area — fixed to "Northern Nigeria" for this platform.
- **SEP-41**: The Stellar token standard for non-fungible tokens, equivalent to ERC-721 on Ethereum.
- **Token_ID**: A unique identifier for each Certificate_NFT, derived deterministically from the donation's `txHash` and `projectId`.
- **Metadata_URI**: A URI pointing to the off-chain JSON metadata for a Certificate_NFT, stored on IPFS or a platform-controlled endpoint.

---

## Requirements

### Requirement 1: Certificate NFT Minting

**User Story:** As a donor, I want to mint an NFT certificate after my donation is confirmed, so that I have a permanent, on-chain record of my environmental impact.

#### Acceptance Criteria

1. WHEN a donation reaches `status: 'completed'` and no Certificate_NFT exists for that donation, THE Certificate_Service SHALL present the donor with an option to mint a Certificate_NFT.
2. WHEN the donor initiates minting, THE Mint_API SHALL build a Soroban transaction that invokes the Minting_Contract's `mint` function with the Recipient_Address, Token_ID, and Metadata_URI.
3. WHEN the Minting_Contract executes the `mint` function, THE Minting_Contract SHALL create a Certificate_NFT assigned to the Recipient_Address with the provided Token_ID.
4. WHEN minting succeeds, THE Certificate_Service SHALL update the Donation_Record's `certificateUrl` field with the Metadata_URI of the newly minted Certificate_NFT.
5. IF a Certificate_NFT with the same Token_ID already exists, THEN THE Minting_Contract SHALL return an error with code `TOKEN_ALREADY_MINTED`.
6. THE Minting_Contract SHALL enforce that each Token_ID is unique across all minted Certificate_NFTs.

---

### Requirement 2: Certificate Metadata

**User Story:** As a donor, I want my certificate to display tree count, CO2 offset, planting date, and region, so that the certificate accurately reflects my donation's impact.

#### Acceptance Criteria

1. THE Certificate_Metadata SHALL include the following fields: `treeCount` (positive integer), `co2OffsetKg` (positive number), `plantingDate` (ISO 8601 date string), and `region` (non-empty string).
2. WHEN a Certificate_NFT is minted for a donation of `N` trees, THE Mint_API SHALL set `treeCount` to `N`, where `N = amount × TREES_PER_DOLLAR`.
3. WHEN a Certificate_NFT is minted for a donation of `N` trees, THE Mint_API SHALL set `co2OffsetKg` to `N × 0.048`.
4. THE Mint_API SHALL set `plantingDate` to the ISO 8601 string of the donation's `date` field from the Donation_Record.
5. THE Mint_API SHALL set `region` to `"Northern Nigeria"`.
6. THE Mint_API SHALL serialise the Certificate_Metadata to a JSON object and store it at the Metadata_URI before building the minting transaction.
7. IF the Certificate_Metadata JSON is deserialised and re-serialised, THE Mint_API SHALL produce an object equal to the original Certificate_Metadata (round-trip property).

---

### Requirement 3: Token ID Derivation

**User Story:** As the platform, I want each certificate's Token_ID to be deterministically derived from the donation, so that duplicate mints for the same donation are detectable and preventable.

#### Acceptance Criteria

1. THE Mint_API SHALL derive the Token_ID by computing a SHA-256 hash of the concatenation of the donation's `txHash` and `projectId`, encoded as a hex string.
2. WHEN the same `txHash` and `projectId` are provided, THE Mint_API SHALL always produce the same Token_ID (deterministic derivation).
3. WHEN different `txHash` or `projectId` values are provided, THE Mint_API SHALL produce different Token_IDs (collision resistance).
4. THE Minting_Contract SHALL reject a `mint` call with a Token_ID that has already been used, returning error code `TOKEN_ALREADY_MINTED`.

---

### Requirement 4: Anonymous Address Minting

**User Story:** As an anonymous donor, I want to mint a certificate to an address derived from my ZK proof, so that I can claim my impact certificate without revealing my wallet identity on-chain.

#### Acceptance Criteria

1. WHEN a donor completed an anonymous donation via the ZK proof flow, THE Certificate_Service SHALL accept an Anonymous_Address as the Recipient_Address for minting.
2. THE Mint_API SHALL accept a `recipientAddress` field in the request body that may be either a regular Stellar public key or an Anonymous_Address.
3. THE Minting_Contract SHALL mint the Certificate_NFT to the provided Recipient_Address without requiring the Recipient_Address to be the transaction source account.
4. IF the `recipientAddress` field is not a valid Stellar public key format (56-character base32 string starting with `G`), THEN THE Mint_API SHALL return HTTP 400 with error code `INVALID_RECIPIENT_ADDRESS`.
5. THE Mint_API SHALL NOT require the Recipient_Address to have a pre-existing Stellar account (trustline-free minting via Soroban).

---

### Requirement 5: Mint API Endpoint

**User Story:** As the frontend, I want a single API endpoint to build the minting transaction, so that the certificate minting flow is orchestrated server-side.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/nft/mint`, THE Mint_API SHALL accept a request body containing `donationId`, `txHash`, `projectId`, `amount`, `date`, `recipientAddress`, and `network`.
2. WHEN the request body is valid, THE Mint_API SHALL derive the Token_ID, build the Certificate_Metadata, store the metadata at the Metadata_URI, and return a Soroban transaction XDR for signing.
3. WHEN the request body is valid, THE Mint_API SHALL return HTTP 200 with `{ transactionXdr, networkPassphrase, tokenId, metadataUri }`.
4. IF any required field is missing from the request body, THEN THE Mint_API SHALL return HTTP 400 with a descriptive error message listing the missing fields.
5. IF the `network` field is not `testnet` or `mainnet`, THEN THE Mint_API SHALL return HTTP 400 with error code `UNSUPPORTED_NETWORK`.
6. IF the Minting_Contract address for the requested network is not configured, THEN THE Mint_API SHALL return HTTP 503 with error code `CONTRACT_NOT_CONFIGURED`.
7. THE Mint_API SHALL read the Minting_Contract address for each network from environment variables `NFT_MINTING_CONTRACT_TESTNET` and `NFT_MINTING_CONTRACT_MAINNET`.

---

### Requirement 6: Certificate Minting Transaction Signing and Submission

**User Story:** As a donor, I want to sign and submit the minting transaction with my wallet, so that the Certificate_NFT is created under my authorisation.

#### Acceptance Criteria

1. WHEN the Mint_API returns a transaction XDR, THE Certificate_Service SHALL present the transaction to the donor's connected wallet (Freighter or Albedo) for signing.
2. WHEN the donor signs the transaction, THE Certificate_Service SHALL submit the signed transaction to the Stellar network via the existing `/api/transaction/submit` endpoint.
3. WHEN the transaction is confirmed on the Stellar network, THE Certificate_Service SHALL return the transaction hash and Token_ID to the caller.
4. IF the donor rejects the signing request, THEN THE Certificate_Service SHALL return an error with code `USER_REJECTED_SIGNING`.
5. IF the transaction submission fails, THEN THE Certificate_Service SHALL return the Stellar network error code to the caller without retrying automatically.

---

### Requirement 7: Certificate Viewing

**User Story:** As a donor, I want to view my minted certificate, so that I can share proof of my environmental impact.

#### Acceptance Criteria

1. WHEN a Certificate_NFT has been minted for a Donation_Record, THE Certificate_Service SHALL provide a shareable URL constructed from the Metadata_URI stored in `certificateUrl`.
2. WHEN the shareable URL is accessed, THE platform SHALL render the Certificate_Metadata fields — `treeCount`, `co2OffsetKg`, `plantingDate`, and `region` — in a human-readable format.
3. THE platform SHALL display the Certificate_NFT's Token_ID and the Recipient_Address on the certificate view page.
4. WHEN a donor navigates to the donations dashboard, THE platform SHALL display a "View Certificate" link for each Donation_Record whose `certificateUrl` field is populated.

---

### Requirement 8: Network Support (Testnet and Mainnet)

**User Story:** As a developer, I want the NFT minting to work on both Stellar testnet and mainnet, so that I can test the integration before deploying to production.

#### Acceptance Criteria

1. WHERE the network is `testnet`, THE Mint_API SHALL invoke the Minting_Contract deployed on Stellar testnet using the testnet Soroban RPC endpoint.
2. WHERE the network is `mainnet`, THE Mint_API SHALL invoke the Minting_Contract deployed on Stellar mainnet using the mainnet Soroban RPC endpoint.
3. IF a network value other than `testnet` or `mainnet` is provided, THEN THE Mint_API SHALL return HTTP 400 with error code `UNSUPPORTED_NETWORK`.
4. THE Mint_API SHALL use the same Horizon server URLs as the existing transaction builder: `https://horizon-testnet.stellar.org` for testnet and `https://horizon.stellar.org` for mainnet.

---

### Requirement 9: Metadata Serialisation Round-Trip

**User Story:** As a developer, I want certificate metadata to serialise and deserialise correctly, so that metadata is not corrupted when stored and retrieved.

#### Acceptance Criteria

1. THE Mint_API SHALL serialise Certificate_Metadata objects to JSON strings for storage at the Metadata_URI.
2. WHEN a JSON string is deserialised back into a Certificate_Metadata object, THE Mint_API SHALL produce an object equal to the original Certificate_Metadata.
3. FOR ALL valid Certificate_Metadata objects, serialising then deserialising SHALL produce an equivalent object (round-trip property).
4. IF a JSON string does not conform to the Certificate_Metadata schema (missing required fields or wrong types), THEN THE Mint_API SHALL return HTTP 422 with a descriptive validation error.
