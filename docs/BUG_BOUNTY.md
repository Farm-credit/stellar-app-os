# Bug Bounty Program

## Overview

Harvesta operates a bug bounty program on [Immunefi](https://immunefi.com/) to incentivize security researchers to identify vulnerabilities in our smart contracts and infrastructure. This program helps us maintain the highest security standards for our decentralized tree-planting platform.

> We also run a complementary [HackerOne bug bounty program](HACKERONE_BUG_BOUNTY.md). Researchers may report qualifying vulnerabilities through either platform.

## Program Details

- **Platform**: Immunefi
- **Status**: Active
- **Launch Date**: TBD
- **Reward Pool**: $50,000 USD (initial)
- **Payout Currency**: USDC (Stellar) or USD via Immunefi

## Scope

### In Scope

#### Smart Contracts (Soroban/Rust)

All Soroban smart contracts deployed on Stellar mainnet and testnet:

- **Tree Escrow Contract** (`contracts/tree-escrow/`)
  - Fund locking and release mechanisms
  - Tree NFT minting and ownership
  - Milestone verification logic

- **Farmer Registry Contract** (`contracts/farmer-registry/`)
  - Farmer registration and verification
  - Reputation scoring system
  - KYC attestation handling

- **Species Registry Contract** (`contracts/species-registry/`)
  - Species data management
  - CO₂ sequestration calculations
  - Species voting integration

- **Donation Escrow Contract** (`contracts/donation-escrow/`)
  - Anonymous donation handling
  - Fund escrow and release
  - Nullifier registry integration

- **Escrow Milestone Contract** (`contracts/escrow-milestone/`)
  - Milestone creation and verification
  - Time-locked releases
  - Multi-signature requirements

- **Admin Controls Contract** (`contracts/admin-controls/`)
  - Administrative functions
  - Emergency pause mechanisms
  - Parameter updates

- **KYC Attestation Contract** (`contracts/kyc-attestation/`)
  - KYC verification logic
  - Attestation issuance
  - Revocation mechanisms

- **Location Proof Contract** (`contracts/location-proof/`)
  - GPS coordinate verification
  - Location-based restrictions
  - Proof validation

- **Nullifier Registry Contract** (`contracts/nullifier-registry/`)
  - Nullifier management for anonymous donations
  - Duplicate prevention
  - Privacy preservation

- **ZK Verifier Contract** (`contracts/zk-verifier/`)
  - Zero-knowledge proof verification
  - Groth16 circuit integration
  - Privacy-preserving transactions

- **ZK Location Verifier Contract** (`contracts/zk-location-verifier/`)
  - Location-based ZK proofs
  - Privacy-preserving location verification

- **Aggregate Impact Verifier Contract** (`contracts/aggregate-impact-verifier/`)
  - Impact calculation verification
  - Aggregation logic
  - Data integrity checks

- **Naira Payout Contract** (`contracts/naira-payout/`)
  - Local currency payouts
  - Exchange rate handling
  - Fiat integration

- **Tree Token Contract** (`contracts/tree-token/`)
  - TREE token implementation
  - Token distribution
  - Voting power calculation

- **Species Voting Contract** (`contracts/species-voting/`)
  - Proposal creation
  - Voting mechanisms
  - Execution logic

#### Infrastructure

- **API Endpoints** (`app/api/`)
  - Donation processing
  - Tree status updates
  - Webhook handlers

- **Webhook System** (`lib/webhook/`)
  - Event delivery
  - Signature verification
  - Retry mechanisms

- **Indexer** (`lib/indexer/`)
  - Blockchain event processing
  - Database synchronization
  - Real-time updates

### Out of Scope

- Third-party dependencies (unless specifically identified as vulnerable)
- Frontend UI/UX issues without security impact
- Social engineering attacks
- Physical security
- DNS/infrastructure outside our control
- Rate limiting/DDoS prevention
- Spam filtering
- Known issues already disclosed
- Vulnerabilities in Stellar network itself
- Vulnerabilities in IPFS/Pinata services

## Severity Levels & Rewards

### Critical (Up to $25,000)

- Direct loss of funds (escrowed or user funds)
- Arbitrary code execution in smart contracts
- Privilege escalation to admin controls
- Bypass of KYC/identity verification
- Complete privacy breach (exposure of anonymous user data)

### High (Up to $15,000)

- Temporary freezing of funds
- Unauthorized modification of critical contract state
- Bypass of voting mechanisms
- Significant privacy leak (partial data exposure)
- Denial of service affecting core functionality

### Medium (Up to $5,000)

- Minor fund loss (gas costs, small amounts)
- Unauthorized state changes with limited impact
- Bypass of non-critical access controls
- Information disclosure with limited impact
- Minor denial of service

### Low (Up to $1,000)

- Minor information disclosure
- Low-impact state manipulation
- UI/UX security issues
- Best practice violations without immediate impact

## Submission Guidelines

### What to Include

1. **Vulnerability Description**
   - Clear title and summary
   - Detailed technical explanation
   - Steps to reproduce
   - Proof of concept (code/screenshots)

2. **Impact Assessment**
   - Potential severity level
   - Estimated financial impact
   - Affected contracts/versions
   - Exploit scenarios

3. **Suggested Fix**
   - Proposed solution
   - Code changes if applicable
   - Testing recommendations

### How to Submit

1. Visit [Immunefi](https://immunefi.com/)
2. Search for "Harvesta" or "Stellar App OS"
3. Submit vulnerability through the platform
4. Include all required information

### Response Time

- **Initial Response**: Within 48 hours
- **Triage**: Within 7 days
- **Resolution**: Within 30 days (depending on severity)

## Rules of Engagement

### Do's

- Test only on testnet when possible
- Report vulnerabilities responsibly
- Provide sufficient details for reproduction
- Cooperate with the team during remediation
- Allow reasonable time for fixes before disclosure

### Don'ts

- Exploit vulnerabilities on mainnet
- Access or modify user data without consent
- Disrupt platform operations
- Publicly disclose vulnerabilities before fix
- Demand payment before disclosure
- Use automated scanning tools aggressively

## Safe Harbor

Harvesta commits to:

- **No Legal Action**: We will not pursue legal action against researchers who act in good faith
- **Safe Harbor**: Researchers who follow the rules will not face legal consequences
- **Credit**: We will publicly acknowledge valid bug reports (with researcher consent)
- **Payment**: We will pay rewards for valid vulnerabilities according to the severity scale

## Reward Payout Process

1. **Submission**: Researcher submits vulnerability through Immunefi
2. **Triage**: Security team reviews and categorizes the report
3. **Validation**: Team reproduces and validates the vulnerability
4. **Fix**: Development team implements the fix
5. **Verification**: Security team verifies the fix
6. **Payout**: Reward is processed through Immunefi
7. **Disclosure**: Vulnerability is disclosed (with researcher consent)

## Recognition

Valid vulnerability submissions will be acknowledged in:

- Our security hall of fame
- Release notes for affected versions
- Annual security reports
- Immunefi leaderboard (if applicable)

## Contact

For questions about the bug bounty program:

- **Email**: security@harvesta.io
- **Immunefi**: [Harvesta Program](https://immunefi.com/)
- **GitHub**: [Security Issues](https://github.com/Kenlachy/stellar-app-os/security)

## Program Updates

This program may be updated at any time. Changes will be announced:

- On this page
- Through Immunefi platform
- On our social media channels
- Via email to registered researchers

## Additional Resources

- [Immunefi Guidelines](https://docs.immunefi.com/)
- [Stellar Security Best Practices](https://developers.stellar.org/docs/security/)
- [Soroban Security Guide](https://soroban.stellar.org/docs/learn/security/)
- [OWASP Smart Contract Top 10](https://owasp.org/www-project-smart-contract-top-10/)

## Acknowledgments

We thank all security researchers who help make Harvesta more secure. Your contributions are invaluable to protecting our users and their funds.
