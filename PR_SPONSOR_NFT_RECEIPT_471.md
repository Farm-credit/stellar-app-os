# feat(contract): Sponsor NFT Receipt — non-transferable proof of sponsorship

**Closes #471**

## Summary

This PR introduces a new Soroban contract, **`sponsor-receipt`**, that mints a **non-transferable (soulbound) NFT-style receipt** to a sponsor's Stellar wallet every time they sponsor a tree. Each receipt permanently attests the sponsor's contribution on-chain together with the receipt's metadata — species, region, planting date, and projected CO₂ offset — and can never be sold, transferred, or reassigned.

The contract lives alongside the existing `tree-escrow`, `planter-registry`, and `species-registry` crates and shares their idiomatic patterns (HarvestaError-style typed panics, persistent vs. instance storage split, two-step admin rotation, and an admin-controlled global pause).

## Motivation & Issue Tracking

Issue **#471** requested:
1. Extend TreeRegistry to track NFT ownership.
2. `mint_receipt(sponsor, tree_id)` to mint proof of sponsorship.
3. **Block transfer calls** — the receipt must be soulbound.
4. Persist **metadata**: species, region, date, CO₂ estimate.

There is no pre-existing contract called "TreeRegistry" — the closest functional neighbours are `tree-escrow`'s `register_tree(tree_id, …)` (which already namespaces `tree_id`s for the co-funded flow) and the `species-registry` storage. To deliver the issue cleanly and without entangling the 800-line `tree-escrow` monolith, this PR adds a brand-new `sponsor-receipt` crate as the **on-chain TreeRegistry-NFT store of record**, decoupled from the escrow and from `species-registry`. Cross-contract references remain simple because both crates share `tree_id: u64` and species slugs as plain primitives.

## What ships in this PR

### 1. New crate: `contracts/sponsor-receipt`

| File | Purpose |
|---|---|
| `contracts/sponsor-receipt/Cargo.toml` | New `cdylib`+`rlib` crate, `soroban-sdk 21.7.7`. |
| `contracts/sponsor-receipt/src/lib.rs` | Full contract: types, storage keys, `#[contract]` impl, 30 unit tests. |
| `contracts/Cargo.toml` | New member `sponsor-receipt` appended to the workspace. |

### 2. Public API surface

```text
initialize(admin)                                  One-time.
mint_receipt(sponsor, tree_id, species, region, co2_estimate_scaled, planter) -> u64
                                                    Sponsor signs; returns new receipt_id.
get_receipt(receipt_id) -> Option<SponsorReceipt>  Per-receipt lookup.
get_receipts_by_sponsor(sponsor) -> Vec<u64>        All receipt ids owned by sponsor (insertion order).
receipt_for_tree(sponsor, tree_id) -> u64           Dedup lookup; returns 0 when none.
total_receipts() -> u64                             Monotonic counter.
attempt_transfer(from, to, receipt_id)              ALWAYS PANICS :: SoulboundTransferBlocked.
revoke_receipt(receipt_id)                         Admin-only emergency revocation.
pause / unpause / is_paused                        Emergency stop.
propose_admin(new_admin) / accept_admin / get_admin Two-step rotation.
```

### 3. On-chain record

```rust
struct SponsorReceipt {
    receipt_id: u64,
    sponsor: Address,
    tree_id: u64,
    species: Symbol,                  // matches species-registry slug
    region: String,
    minted_at: u64,
    co2_estimate_scaled: i128,        // kg × 100 to match species-registry
    planter: OptAddress,
}
```

All four metadata requirements of #471 are first-class fields of the receipt:
- **species** → `Symbol` (matches the `species-registry::register_species(slug)` namespace)
- **region** → `String`
- **date** → `minted_at: u64` (ledger timestamp at mint)
- **CO₂ estimate** → `co2_estimate_scaled: i128` (kg × 100, same convention as `species-registry::co2_scaled`)

`receipt_id` and `sponsor` are the additional NFT-typical fields; `planter` is forward-compatible with `planter-registry` and lets the app defer the planter address when not yet known.

## Soulbound enforcement — defence in depth

The contract is **soulbound by construction**:

1. **No transfer API exists.** There is no `transfer()`, no `approve()`, no `set_owner()` function on this contract. The SDK does not let any caller move a `SponsorReceipt`'s `sponsor` field — the only function that writes `sponsor` is `mint_receipt`, and it writes a sponsor's own address after that sponsor's `require_auth()` succeeds.
2. **`attempt_transfer` always panics.** As defence in depth, an explicit `attempt_transfer(from, to, receipt_id)` function is published and always panics with a stable error code `SoulboundTransferBlocked = #10`. Off-chain tooling, bridges, and integration tests can rely on this signal instead of the host's generic "function not found" reply.
3. **`revoke_receipt` is admin-only and audit-preserving.** Even when an admin revokes a receipt (e.g. a clerically-issued disputed one), the primary `Receipt(id)` storage is **not** deleted, so the historical record stays queryable via `get_receipt` for forensic review. The sponsor's index and the `(sponsor, tree_id)` dedup boundary are cleared using swap-with-last so the remaining receipts stay contiguous.

## Storage layout

```text
Instance (small, hot):                                  Persistent (immutable user data):
  Admin                Address                           (RECEIPT, receipt_id)         SponsorReceipt
  PendingAdmin         OptAddress                        (STREE, sponsor, tree_id)     u64   (dedup boundary)
  NextId               u64                              SponsorCount(sponsor)        u32   (instance)
  Paused               bool                              SponsorAt(sponsor, idx)      u64   (instance)
```

The admin counters live in **instance** storage; the per-receipt records and dedup map live in **persistent** storage because they represent user-facing state that must outlive any TTL bump policy.

## Auth model

| Action | Required auth |
|---|---|
| `initialize` | None |
| `mint_receipt` | `sponsor.require_auth()` (sponsor signs) |
| `revoke_receipt`, `pause`, `unpause`, `propose_admin` | `admin.require_auth()` |
| `accept_admin` | proposed new admin's `require_auth()` (defence against lockout) |
| `attempt_transfer` | N/A — always panics |

Anyone who holds admin authority may rotate the role via the standard two-step `propose_admin` → `accept_admin` flow (matches `admin-controls`).

## Validation & error surface

Single contract-local `Error` enum (pattern follows `planter-registry` rather than `HarvestaError` — both patterns exist in the codebase already):

```text
AlreadyInitialized       #1
NotInitialized           #2
NotPendingAdmin          #3
AlreadyPaused            #4
NotPaused                #5
ContractPaused           #6
AlreadyMintedReceipt     #7   — dedup boundary trip
ReceiptNotFound          #8
NotAuthorized            #9
SoulboundTransferBlocked #10  — transfer "guard"
InvalidCo2Estimate       #11
InvalidTreeId            #12
```

A `(sponsor, tree_id)` dedup boundary rejects accidental double-mints with `AlreadyMintedReceipt`. `co2_estimate_scaled <= 0` and `tree_id == 0` are rejected at mint time so ESG dashboards never display "zero offset" artefacts.

## Event surface

| Event | Topics | Payload | Meaning |
|---|---|---|---|
| `RecvMint` | `(RecvMint, sponsor)` | receipt_id | A new receipt was minted. |
| `RecvRev`  | `(RecvRev, sponsor)`  | receipt_id | Admin revoked a receipt. |
| `Paused`   | `(Paused,)` | timestamp | Global pause engaged. |
| `Unpaused` | `(Unpaused,)` | timestamp | Global pause released. |
| `AdminProp` | `(AdminProp,)` | new_admin | Step 1 of admin rotation. |
| `AdminXfer` | `(AdminXfer,)` | new_admin | Step 2 of admin rotation completed. |

## Test coverage

The 30 unit tests in `mod tests` exercise:

- **Initialization**: success, double-init rejection, get-admin before init panics.
- **Mint**: basic happy path, no-planter variant, monotonic ids across multiple sponsors, sponsor index ordering, no cross-sponsor leakage, empty result for non-owner, round-trip `(sponsor, tree_id) → id`, double-mint rejection, same-sponsor-different-trees allowed, multiple-sponsors-same-tree allowed.
- **Input validation**: zero `tree_id`, zero `co2_estimate`, negative `co2_estimate`.
- **Soulbound**: `attempt_transfer` always panics, even for unknown receipt ids.
- **Revoke**: admin clears index & dedup boundary, history preserved, non-admin caller rejected via `mock_auths(&[])`, unknown receipt panics, **middle-of-3-receipts swap-with-last regression test**, last-position revoke decrement (no-swap path).
- **Pause**: blocks mint, blocks revoke; double-pause & unpause-when-not-paused both rejected.
- **Admin rotation**: two-step transfer; `accept_admin` without proposal rejected.
- **Read**: unknown receipt returns `None`; full-field metadata round-trip including a long-Unicode region.

> Note: I could not run `cargo test` locally (Rust toolchain not present in the sandbox). The `env.mock_auths(&[..])` API was used deliberately to *prove* the `require_auth` gates reject unauthorised callers — `env.mock_all_auths()` would have masked every gate, which is exactly the bug we are guarding against in production.

## How to verify locally

```bash
cd contracts
cargo build -p sponsor-receipt
cargo test  -p sponsor-receipt
```

Expected: the contract builds, all 30 tests pass.

## Deployment notes

When wiring into the existing suite:

1. Deploy `sponsor-receipt`.
2. Set its admin to the multi-sig used by `tree-escrow`/`admin-controls`.
3. Update the `tree-escrow` `verify_progress` (first-tranche) call site to invoke `sponsor-receipt::mint_receipt` for the sponsor / gift recipient, passing `tree_id`, the resolved `species` Symbol, the human-readable `region`, and `co2_estimate_scaled = species-registry::calculate_offset(species, count, maturity)` (or a known projection). Followup PR candidates are flagged in `suggest_followups`.
4. (Optional) The existing `tree-escrow::spec_rate` forward cross-contract call is not changed in this PR; cross-contract wiring is intentionally deferred to a smaller, focused follow-up to minimise blast radius on the audited escrow contract.

## Risk assessment

- **Storage growth**: one persistent `(Receipt, id)` × one sponsor per tree ever sponsored. Well within Soroban's instance/persistent bounds for the foreseeable corpus; TTL bumps are unchanged from the existing suite.
- **Soulbound risk**: zero. The contract exposes no transfer path and `attempt_transfer` is a documented panic.
- **Re-organisation**: no changes to existing contracts in this PR. Workspace-only addition is backwards-compatible.
- **Migration**: not required — `initialize` is a one-time set-up call.

## Checklist

- [x] Issue link in PR title / body.
- [x] New crate follows existing conventions (`#[contract]`, `#[contracttype]`, `#[contracterror]`, `panic_with_error`, `symbol_short!` event names, `env.events().publish`).
- [x] All soulbound invariants explained and defended.
- [x] Unit tests for happy paths + every auth gate + every validation branch.
- [x] No changes to existing contracts.
- [x] Workspace `Cargo.toml` updated.
- [x] Module-level + every-public-function rustdoc documents invariants.

---

🤖 Generated with [Codebuff](https://codebuff.com) — see codebuff.com for the CLI.
