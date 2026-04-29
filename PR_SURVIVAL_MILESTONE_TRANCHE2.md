# feat: Second Milestone — Survival Rate Gate for Tranche 2 Release

## Summary

Implements the second and final escrow milestone: after a farmer submits their 6-month survival proof and the oracle confirms a survival rate of **≥ 70%**, the remaining **25% (Tranche 2)** is released to the farmer's wallet. If the survival rate falls below 70%, the escrow moves to a `Disputed` state and the funds are held pending admin resolution.

Both `tree-escrow` and `escrow-milestone` contracts are upgraded. A new API layer handles the oracle submission and dispute resolution flows.

---

## Problem

The existing contracts had no survival rate enforcement on Tranche 2:

- `tree-escrow::verify_survival` released 25% unconditionally — no threshold check
- `escrow-milestone::release_remainder` had no proof hash, no survival rate, no dispute path

There was also no API surface for the oracle to submit survival data or for admins to resolve disputes.

---

## Solution

### State machine (both contracts)

```
Funded
  │
  ▼ verify_planting / verify_milestone
Planted / Milestone1Released  (75% released)
  │
  ▼ verify_survival(farmer, proof_hash, survival_rate)
  ├─ survival_rate >= 70% ──► Completed  (25% released to farmer)
  └─ survival_rate <  70% ──► Disputed   (25% held)
                                  │
                                  ▼ resolve_dispute(farmer, release_to_farmer)
                              Completed  (25% → farmer OR donor)
```

---

## What Changed

### Soroban Contracts

**`contracts/tree-escrow/src/lib.rs`**

- Added `MIN_SURVIVAL_RATE: u32 = 70` constant
- Added `Disputed` variant to `EscrowStatus`
- Added `survival_rate: Option<u32>` field to `EscrowRecord`
- `verify_survival(farmer, proof_hash, survival_rate)` — new signature:
  - Validates `survival_rate` is 0–100
  - Enforces 6-month lock (unchanged)
  - Records `survival_proof` and `survival_rate` regardless of outcome
  - `>= 70%` → transfers Tranche 2 to farmer, status = `Completed`, emits `survived` event
  - `< 70%` → status = `Disputed`, funds held, emits `disputed` event
- `resolve_dispute(farmer, release_to_farmer)` — new function:
  - Admin-only, requires `Disputed` state
  - `release_to_farmer = true` → pays held 25% to farmer
  - `release_to_farmer = false` → refunds held 25% to donor
  - Status → `Completed` in both cases, emits `resolved` event

**`contracts/escrow-milestone/src/lib.rs`**

- Same `MIN_SURVIVAL_RATE`, `Disputed` status, `survival_proof`, `survival_rate` fields added
- `release_remainder` **replaced** by `verify_survival(farmer, proof_hash, survival_rate)` — identical gate logic
- `resolve_dispute(farmer, release_to_farmer)` added — same as tree-escrow
- `EscrowState` extended with `survival_proof: Option<BytesN<32>>` and `survival_rate: Option<u32>`

### New Unit Tests (9 added across both contracts)

| Test | Contract | Asserts |
|---|---|---|
| `test_verify_survival_passing_rate` | both | 85% → Completed, 100% released |
| `test_verify_survival_at_boundary_70_percent` | both | 70% → Completed (boundary) |
| `test_survival_below_70_percent_disputes` | both | 69% → Disputed, only 75% released |
| `test_dispute_resolved_to_farmer` | both | Admin releases held 25% to farmer |
| `test_dispute_resolved_to_donor` | both | Admin refunds held 25% to donor |
| `test_invalid_survival_rate_rejected` | both | rate > 100 panics |
| `test_survival_too_early_rejected` | tree-escrow | 6-month lock enforced |

---

### TypeScript

**`lib/types/survival.ts`** — new types:
- `SurvivalVerificationRequest` — `farmerPublicKey`, `survivalRate`, `proofHash`, `contractType`, `network`
- `SurvivalVerificationResponse` — `outcome: 'completed' | 'disputed'`, `survivalRate`, `transactionHash`
- `DisputeResolutionRequest` / `DisputeResolutionResponse`

**`lib/stellar/survival-verifier-client.ts`** — Soroban RPC client:
- `invokeSurvivalVerification(farmerPublicKey, proofHash, survivalRate, contractType, network)` — encodes args as XDR ScVals, submits via fee-payer account, polls for confirmation
- `invokeResolveDispute(farmerPublicKey, releaseToFarmer, contractType, network)` — same pattern for dispute resolution
- Supports both `tree-escrow` and `escrow-milestone` contract types via env var routing

**`app/api/transaction/verify-survival/route.ts`** — `POST /api/transaction/verify-survival`:
- Validates all fields including hex format of `proofHash`
- Invokes `verify_survival` on-chain
- Returns HTTP 200 with `outcome: 'completed'` or HTTP 202 with `outcome: 'disputed'`
- Maps contract panics to typed HTTP errors:
  - `PLANTING_NOT_VERIFIED` → 409
  - `SURVIVAL_PERIOD_NOT_ELAPSED` → 409
  - `ESCROW_NOT_FOUND` → 404

**`app/api/transaction/resolve-dispute/route.ts`** — `POST /api/transaction/resolve-dispute`:
- Admin-only endpoint for manual dispute resolution
- `ESCROW_NOT_DISPUTED` → 409 if escrow isn't in Disputed state

---

## API Reference

### `POST /api/transaction/verify-survival`

```json
{
  "farmerPublicKey": "G...",
  "survivalRate": 75,
  "proofHash": "a3f1...32 bytes hex...",
  "contractType": "tree-escrow",
  "network": "testnet"
}
```

**Responses:**
- `200` — `{ outcome: "completed", survivalRate: 75, transactionHash: "..." }`
- `202` — `{ outcome: "disputed", survivalRate: 65, transactionHash: "..." }`
- `409` — `PLANTING_NOT_VERIFIED` or `SURVIVAL_PERIOD_NOT_ELAPSED`
- `404` — `ESCROW_NOT_FOUND`

### `POST /api/transaction/resolve-dispute`

```json
{
  "farmerPublicKey": "G...",
  "releaseToFarmer": true,
  "contractType": "tree-escrow",
  "network": "testnet"
}
```

**Responses:**
- `200` — `{ transactionHash: "...", releasedTo: "farmer" }`
- `409` — `ESCROW_NOT_DISPUTED`

---

## Environment Variables Required

```bash
TREE_ESCROW_CONTRACT_TESTNET=C...
TREE_ESCROW_CONTRACT_MAINNET=C...
ESCROW_MILESTONE_CONTRACT_TESTNET=C...
ESCROW_MILESTONE_CONTRACT_MAINNET=C...
STELLAR_FEE_PAYER_SECRET=S...
```

## Build & Test

```bash
cd contracts
cargo test -p tree-escrow
cargo test -p escrow-milestone
cargo build --release --target wasm32-unknown-unknown -p tree-escrow
cargo build --release --target wasm32-unknown-unknown -p escrow-milestone
```

---

## Related

- Builds on: `contracts/tree-escrow` (Closes #310) and `contracts/escrow-milestone` (Closes #314)
- Companion PR: `feat/zk-groth16-anonymous-donation-verifier` — Circuit 1 anonymous donation verifier
