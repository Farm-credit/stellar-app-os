# Security Policy

## 🔒 Reporting a Vulnerability

The FarmCredit / Harvesta team places paramount importance on the security of our smart contracts, off-chain infrastructure, and users' funds.

If you discover a security vulnerability, **please do NOT create a public issue, pull request, or discuss it publicly.**

---

## 🏆 Bug Bounty Program on Immunefi

We run an active Bug Bounty Program hosted on **Immunefi** with rewards up to **$50,000 USD**:

- **Immunefi Program Link**: [https://immunefi.com/bounty/harvesta](https://immunefi.com/bounty/harvesta)
- **Program Details & Scope**: See [`BUG_BOUNTY.md`](./BUG_BOUNTY.md) for full scope, severity classifications, and reward tiers.

---

## 📧 Direct Security Contact

If you cannot or prefer not to submit via Immunefi:
- **Email**: `security@harvesta.finance`
- **PGP Encryption**: Please encrypt your advisory using our PGP Key:
  ```
  -----BEGIN PGP PUBLIC KEY BLOCK-----
  mQENBF/EXAMPLE...HARVESTA...SECURITY...KEY...
  -----END PGP PUBLIC KEY BLOCK-----
  ```

---

## ⏱️ Response Timelines

- **Initial Acknowledgment**: < 24 hours
- **Vulnerability Triage**: < 48 hours
- **Status Updates**: Every 48 hours until fix is deployed

---

## 🛡️ Supported Versions

| Component | In-Scope Version | Support Status |
| :--- | :--- | :--- |
| Soroban Smart Contracts | `contracts/` (main branch) | :white_check_mark: Supported |
| Frontend PWA | `app/`, `components/` (main branch) | :white_check_mark: Supported |
| Backend & Event Indexer | `backend/`, `scripts/` (main branch) | :white_check_mark: Supported |
| Archived / Deprecated Branches | Any non-main branch | :x: Unsupported |
