# HackerOne Bug Bounty Program

## Overview

Harvesta also operates a bug bounty program on [HackerOne](https://www.hackerone.com/) to broaden responsible-disclosure coverage for our decentralized tree-planting platform. HackerOne provides an independent, trusted channel for security researchers to report vulnerabilities in our smart contracts and infrastructure, with tiered rewards and a structured triage process.

> This program is complementary to our [Immunefi program](BUG_BOUNTY.md). Researchers may report qualifying vulnerabilities through either platform.

## Program Details

- **Platform**: HackerOne
- **Status**: Active
- **Launch Date**: TBD
- **Reward Pool**: $50,000 USD (initial)
- **Payout Currency**: USDC (Stellar) or USD via HackerOne
- **Program Handle**: `stellar-app-os` (subject to final handle on HackerOne)

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

## Severity Levels & Tiered Rewards

| Severity | Reward |
|---|---|
| Critical | Up to $25,000 |
| High | Up to $15,000 |
| Medium | Up to $5,000 |
| Low | Up to $1,000 |

Rewards are tiered by severity and paid out for validated, in-scope findings only. Duplicate or out-of-scope reports are not rewarded.

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

### How to Submit

1. Visit [HackerOne](https://www.hackerone.com/)
2. Search for our program handle (`stellar-app-os` — "Harvesta" / "Stellar App OS")
3. Click **Submit Report** and follow the in-platform template
4. Include all required information (below)
5. Mark reports as `Security` and keep them private

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

### Response Time

- **Initial Response**: Within 48 hours
- **Triage**: Within 7 days
- **Resolution**: Within 30 days (depending on severity)

## Triage Process

1. **Submission**: Researcher submits a report through HackerOne
2. **Initial Review**: Security team responds within 48 hours
3. **Triage**: Team categorizes the report by severity and validates it within 7 days
4. **Reproduction**: Team reproduces and validates the vulnerability
5. **Fix**: Development team implements the fix
6. **Verification**: Security team verifies the fix
7. **Payout**: Reward is processed through HackerOne
8. **Disclosure**: Vulnerability is disclosed (with researcher consent)

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

## Recognition

Valid vulnerability submissions will be acknowledged in:

- Our security hall of fame
- HackerOne leaderboard / acknowledgments
- Release notes for affected versions
- Annual security reports

## Contact

For questions about the HackerOne bug bounty program:

- **Email**: security@harvesta.io
- **HackerOne**: [Program page](https://www.hackerone.com/)
- **GitHub**: [Security Issues](https://github.com/Farm-credit/stellar-app-os/security)
- **Immunefi**: [Immunefi program](BUG_BOUNTY.md)

## Program Updates

This program may be updated at any time. Changes will be announced:

- On this page
- Through HackerOne platform
- On our social media channels
- Via email to registered researchers

## Additional Resources

- [HackerOne Disclosure Guidelines](https://www.hackerone.com/disclosure-guidelines)
- [Stellar Security Best Practices](https://developers.stellar.org/docs/security/)
- [Soroban Security Guide](https://soroban.stellar.org/docs/learn/security/)
- [OWASP Smart Contract Top 10](https://owasp.org/www-project-smart-contract-top-10/)

## Acknowledgments

We thank all security researchers who help make Harvesta more secure. Your contributions are invaluable to protecting our users and their funds.
