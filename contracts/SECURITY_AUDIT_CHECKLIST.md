# Security Audit Checklist — FarmCredit Smart Contracts

Pre-audit checklist for `nullifier-registry`, `escrow-milestone`, and `tree-escrow`. Complete and sign off before engaging a third-party auditor.

---

## Access Control

| Check | nullifier-registry | escrow-milestone | tree-escrow |
|-------|--------------------|------------------|-------------|
| Admin-only functions protected by `require_auth()` | ✅ | ✅ | ✅ |
| `initialize()` can only be called once | ✅ | ✅ | ✅ |
| Farmer/donor `require_auth()` on user-initiated calls | ✅ (`register`) | ✅ (`deposit`) | ✅ (`deposit`) |
| No function callable without authentication | ✅ | ✅ | ✅ |
| Admin transfer requires both parties to sign (2-step) | ✅ | ✅ | ✅ |

---

## State Machine Integrity

| Check | nullifier-registry | escrow-milestone | tree-escrow |
|-------|--------------------|------------------|-------------|
| Invalid state transitions rejected with panic | N/A | ✅ | ✅ |
| Double-verification rejected | ✅ (nullifier) | ✅ | ✅ |
| Refund blocked after funds are released | N/A | ✅ | ✅ |
| 6-month time lock enforced at contract level | N/A | N/A | ✅ |
| One active escrow per farmer enforced | N/A | ✅ | ✅ |

---

## Fund Safety

| Check | escrow-milestone | tree-escrow |
|-------|-----------------|-------------|
| Token transferred via `token::Client` (no direct balance manipulation) | ✅ | ✅ |
| Total released never exceeds `total_amount` | ✅ (75% + 25% = 100%) | ✅ (75% + 25% = 100%) |
| Basis-point arithmetic uses integer division with no rounding loss exploitable | ✅ | ✅ |
| Refund returns full `total_amount` not `released` delta | ✅ | ✅ |
| Contract holds no excess funds after `Completed` state | ✅ | ✅ |

---

## Emergency Controls

| Check | nullifier-registry | escrow-milestone | tree-escrow |
|-------|--------------------|------------------|-------------|
| `pause()` halts all state-mutating operations | ✅ (`register`) | ✅ (`deposit`, `verify_milestone`, `release_remainder`) | ✅ (`deposit`, `verify_planting`, `verify_survival`) |
| `refund()` remains callable during pause | N/A | ✅ | ✅ |
| `unpause()` restores full operation | ✅ | ✅ | ✅ |
| Pause state stored in instance storage (survives ledger close) | ✅ | ✅ | ✅ |

---

## Data Integrity

| Check | nullifier-registry | escrow-milestone | tree-escrow |
|-------|--------------------|------------------|-------------|
| Commitment hash uses SHA-256 (collision resistant) | ✅ | N/A | N/A |
| Verification/proof hashes stored on-chain for auditability | N/A | ✅ | ✅ |
| GPS + timestamp + farmer ID all included in commitment preimage | ✅ | N/A | N/A |
| Events emitted for all state transitions (indexer support) | ✅ | ✅ | ✅ |

---

## Soroban-Specific

| Check | Status |
|-------|--------|
| `overflow-checks = true` in release profile | ✅ |
| `panic = "abort"` — no unwinding to exploit | ✅ |
| `#![no_std]` — no unexpected standard library behaviour | ✅ |
| Storage keys use `symbol_short!` — compile-time checked, max 9 chars | ✅ |
| No `.unwrap()` on user-controlled storage reads (all use `.expect()` with messages or `has()` guards) | ✅ |
| `soroban-sdk` version pinned in each `Cargo.toml` | ✅ (v21.0.0) |
| LTO enabled for WASM size and dead-code elimination | ✅ |

---

## Test Coverage

| Scenario | nullifier-registry | escrow-milestone | tree-escrow |
|----------|--------------------|------------------|-------------|
| Happy-path full lifecycle | ✅ | ✅ | ✅ |
| Double-registration / double-verification rejected | ✅ | ✅ | ✅ |
| Refund before and after state transition | N/A | ✅ | ✅ |
| Time-lock enforcement | N/A | N/A | ✅ |
| Pause blocks state mutations | ✅ | ✅ | ✅ |
| Refund allowed while paused | N/A | ✅ | ✅ |
| Unpause restores operations | ✅ | ✅ | ✅ |
| Admin transfer (propose + accept) | ✅ | ✅ | ✅ |

---

## Known Limitations / Items for Auditor Attention

1. **Single admin key risk** — all three contracts share one admin. A compromised admin can release funds arbitrarily. Mitigation: require a Stellar multisig account (M-of-N) as the admin.

2. **No dispute resolution** — `escrow-milestone` and `tree-escrow` have no on-chain dispute mechanism; disputes are handled off-chain by the admin. Consider adding a time-locked dispute window.

3. **Nullifier not linked to escrow** — the nullifier registry and escrow contracts are independent. Nothing prevents a fraudulent escrow deposit for a farmer whose tree is already registered. Off-chain orchestration enforces the link.

4. **Token allowlist** — no restriction on which token can be deposited. A malicious ERC-20-style token with a re-entrant transfer could be used. Soroban's execution model does not allow reentrancy within a single transaction, but this should be confirmed with the auditor.

5. **No upgrade path** — contracts have no upgrade mechanism. If a critical bug is found post-deploy, the only recourse is pause + redeploy + manual fund migration.

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Lead Developer | | |
| Security Reviewer | | |
| Third-party Auditor | | |
