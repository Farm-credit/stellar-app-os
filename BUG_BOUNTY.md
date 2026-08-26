# 🛡️ FarmCredit / Harvesta — Bug Bounty Program (Immunefi)

> **Decentralized Tree-Planting & Agricultural Credit on Stellar (Soroban)**  
> **Official Bug Bounty Program specification ready for [Immunefi](https://immunefi.com)**

FarmCredit / Harvesta invites security researchers and white-hat hackers to inspect our smart contracts, off-chain backend infrastructure, and web applications. We offer rewards of up to **$50,000 USD** (payable in USDC or XLM) for critical vulnerabilities.

---

## 💰 Rewards by Severity

Rewards are distributed according to the **[Immunefi Vulnerability Severity Classification System v2.3](https://immunefi.com/immunefi-vulnerability-severity-classification-system-v2-3/)**.

### 🌟 Smart Contracts (Soroban / Rust)

| Severity | Min Reward | Max Reward | Primary Impact Definition |
| :--- | :--- | :--- | :--- |
| **Critical** | **\$10,000** | **\$50,000** | Direct permanent loss or theft of escrow/user funds, permanent freezing of funds, unauthorized minting of Carbon Credits or Tree NFTs. |
| **High** | **\$3,000** | **\$10,000** | Temporary freezing of funds, manipulation of planter reputation/staking without fund drain, bypassing milestone payment verification. |
| **Medium** | **\$1,000** | **\$3,000** | Unbounded gas/resource consumption leading to griefing, contract state inconsistency not leading to direct fund loss. |
| **Low** | **\$250** | **\$500** | Contract logic quirks, minor rounding discrepancies in carbon sequestration models, non-critical event emission errors. |

*Critical smart contract rewards may be scaled up to **10% of affected Total Value Locked (TVL)** up to the maximum reward cap.*

---

### 🌐 Websites & Applications (Frontend & Backend API)

| Severity | Reward | Primary Impact Definition |
| :--- | :--- | :--- |
| **Critical** | **\$2,500 – \$5,000** | Remote Code Execution (RCE) on backend servers, direct wallet manipulation or arbitrary transaction signing on behalf of users. |
| **High** | **\$1,000 – \$2,500** | Stored XSS leading to session/wallet hijack, Subdomain takeover on active production domains, unauthorized database modification. |
| **Medium** | **\$500 – \$1,000** | CSRF impacting sensitive actions, Reflected XSS, bypass of rate-limiting leading to resource exhaustion. |
| **Low** | **\$100 – \$250** | Open redirect with proven impact, information disclosure of non-sensitive environmental telemetry. |

---

## 🎯 Assets in Scope

### 1. Smart Contracts (Soroban WASM on Stellar)

| Contract Module | Target Path | Key Functions & Risks |
| :--- | :--- | :--- |
| **Escrow** | `contracts/escrow/src/lib.rs` | Milestone tranche locking, fund release to planters, refund mechanics, fee deductions. |
| **Tree Registry** | `contracts/tree_registry/src/lib.rs` | Unique Tree ID minting, geohash immutability, ownership records. |
| **Planter Registry** | `contracts/planter_registry/src/lib.rs` | Planter onboarding, application staking, reputation score algorithms, slashing. |
| **Carbon Credits** | `contracts/carbon_credits/src/lib.rs` | Biomass calculation models, CO₂ offset token minting, retirement tracking. |
| **Nullifier Registry** | `contracts/nullifier_registry/src/lib.rs` | ZK nullifier validation, double-claiming prevention. |
| **Governance** | `contracts/governance/src/lib.rs` | Proposal submission, voting quorum calculation, DAO parameter execution. |

*Repository:* [https://github.com/Farm-credit/stellar-app-os](https://github.com/Farm-credit/stellar-app-os)

---

### 2. Web & Cloud Infrastructure

| Target Asset | Type | Description |
| :--- | :--- | :--- |
| `https://harvesta.finance` | Production Web App | Next.js 15 PWA frontend and wallet bridge. |
| `https://api.harvesta.finance` | Production API | Backend API & verification endpoints. |
| `indexer.harvesta.finance` | Ingestion Service | Horizon & Soroban RPC event listener. |

---

## 🚫 Out of Scope & Ineligible Vulnerabilities

The following types of reports are strictly **out of scope**:

- Theoretical vulnerabilities without an actionable Proof of Concept (PoC).
- Issues already reported in past security audits or active public GitHub issues.
- Attacks requiring social engineering, phishing, physical access, or DDoS/DoS attacks.
- Attacks dependent on compromised private keys, admin credentials, or validator collusions.
- Best practice suggestions, code formatting, spelling errors, or outdated library dependencies without a proven exploit chain.
- Front-running / MEV on public testnet transactions unless leading to unauthorized escrow draining.
- Zero-day vulnerabilities in third-party services (e.g. Pinata, Infura, Cloudflare) unless directly leading to protocol exploit.

---

## 📜 Rules of Engagement

1. **Responsible Disclosure**: Do NOT disclose vulnerabilities publicly or to third parties before the FarmCredit security team has resolved the issue and given explicit permission.
2. **No Data Destruction / Fund Draining**: Test exclusively on testnet environments or local Soroban sandbox networks. Never attempt attacks against real user funds or live mainnet contracts.
3. **Proof of Concept (PoC)**: Submissions must include clear step-by-step reproduction instructions and/or executable test scripts (e.g., Rust Soroban unit test or JavaScript script).
4. **Primary Communication**: All reports must be submitted through the official **Immunefi platform** or sent via encrypted email to `security@harvesta.finance`.

---

## ⏱️ Response Targets & SLAs

- **First Response / Acknowledgment**: Within **24 hours**
- **Triage & Severity Confirmation**: Within **48 hours**
- **Patch Deployment**: Within **5 business days** (Critical: < 48 hours)
- **Reward Payout**: Within **72 hours** after fix verification

---

## 📬 Submitting a Report

- **Immunefi Portal**: [https://immunefi.com/bounty/harvesta](https://immunefi.com/bounty/harvesta) *(upon launch)*
- **Direct Security Email**: `security@harvesta.finance`
- **PGP Key Fingerprint**: `9F82 4B11 C829 3A7E 55D0 1024 88BA 6E31 DC90 44EF`
