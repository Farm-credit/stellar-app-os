# Storage Footprint Optimization Across Contracts

Status: **active** — version 1 (issue [#1817](https://github.com/Farm-credit/stellar-app-os/issues/1817))

## Problem

Soroban exposes three storage classes, but a large shared codebase tends to
reach for `env.storage().persistent()` by default. That has two costs:

1. **Live-ledger footprint.** A persistent entry remains part of the live
   ledger (and of every footprint that touches its key) until its TTL lapses
   and its archival window closes. One-shot markers — "sale `n` was already
   routed", "proof digest `d` was already cached" — therefore sit in the
   ledger forever even though no caller needs them after a bounded window.
2. **TTL bookkeeping.** Each persistent entry needs its own
   `extend_ttl(key, …)` call. Per-entry TTL maintenance is pure overhead for
   state that is read on nearly every invocation.

Instance storage has a single TTL that is bumped whenever any instance entry
is accessed; temporary storage entries leave the live ledger as soon as their
TTL expires and are **not** restorable afterwards. Choosing the right class
is therefore a footprint optimization that does not change contract logic.

## Storage classes

| Class | TTL | Ledger footprint | Correct for |
| ----- | --- | ---------------- | ----------- |
| `Instance` | one TTL per contract, bumped on instance access | paid only while the contract is invoked | admin, token addresses, pause flags, counters, hot accumulators |
| `Temporary` | one TTL per entry, deleted on expiry | grows only for the TTL window | recomputable caches, short-lived replay guards |
| `Persistent` | one TTL per entry, archived (restorable) on expiry | paid for the whole life of the entry | balances, ownership, one-per-entity records, audit trail |

## Decision matrix

The canonical decision is encoded in
[`contracts/contract-utils/src/storage.rs`](../../contracts/contract-utils/src/storage.rs)
as `DataLifetime::storage_class()` and is re-exported as
`contract_utils::storage`. New code should use these helpers instead of
calling `env.storage().persistent()` directly.

| Data lifetime | Storage class | Examples in this repo |
| ------------- | ------------- | --------------------- |
| `Config` | Instance | `ADMIN`, `PAUSED`, `PaymentToken`, `TwapConfig` |
| `Counter` | Instance | `NextTreeId`, `NextListingId`, `OrderSeq`, `COUNT` |
| `HotAccumulator` | Instance | latest price, current oracle observation, current month |
| `Cache` | Temporary | `zk-location-verifier` proof-result cache |
| `ReplayGuard` | Temporary | `bonus-pool` `ProcessedSale` marker |
| `AuditRecord` | Persistent | receipts, retirement certificates, submissions, disputes |
| `Balance` | Persistent | `TotalOffset`, `PoolBalance` snapshots, stake balances |
| `Ownership` | Persistent | `Farmer(Address)`, `PlanterTrees(Address)`, signer sets |

## Audit result

The audit covered all `contracts/*/src/lib.rs` files (about 1,300
`.persistent()` call sites across 49 crates). The vast majority was already
correct:

- admin/config/pause/counter state was already in **instance** storage in
  `admin-controls`, `atomic-swap`, `carbon-price-oracle`, `carbon-marketplace`,
  `farmer-escrow`, `leaderboard`, `sponsor-receipt`, `tree_registry`,
  `tree-registry`, `verifier-staking` and others;
- per-entity records (trees, receipts, policies, claims, locks, bonds,
  certificates) legitimately use **persistent** storage;
- `zk-location-verifier` already kept its proof-result cache in **temporary**
  storage with a configurable TTL.

Two gaps were found and fixed:

1. **`bonus-pool`** kept `DataKey::ProcessedSale(sale_id)` in persistent
   storage. `sale_id` is a globally unique, monotonically increasing id issued
   by the marketplace, so the guard only has to cover the reporting/settlement
   window. It is now written with `storage::mark_replay_guard()` into temporary
   storage with `REPLAY_GUARD_TTL_LEDGERS` (518,400 ledgers ≈ 30 days) and read
   with `storage::replay_guard_active()`. Once the window closes, the marker is
   reclaimed and stops contributing to the live ledger.
2. **`zk-location-verifier`** duplicated the "temporary storage + TTL"
   pattern inline in four places. It now routes all cache reads and writes
   through `contract_utils::storage`, so the class/TTL policy has a single
   source of truth. Behaviour and the configurable `PRFTTL` are unchanged.

## Normative rules

1. **Never downgrade a guard that must live as long as the protocol.** A
   replay marker whose underlying id can be reused after the TTL must stay
   persistent (for example the milestone proof-hash guard in
   `escrow-milestone`). Only bounded-window markers may use `Temporary`.
2. **Never put per-user records in instance storage.** One shared TTL means
   every caller pays for every entry; use `Persistent` keyed by address/id.
3. **Caches must be recomputable.** Temporary entries are deleted, not
   archived — losing one must never lose data.
4. **TTL values are ledgers, not seconds.** The suite uses 5s/ledger:
   `518_400 ≈ 30 days`, `17_280 ≈ 1 day`.
5. **Use the shared helpers** in `contract_utils::storage` for new short-lived
   state so the decision matrix above stays enforceable.

## Verification

The migration is covered by unit tests:

- `contract-utils`: policy classification for every `DataLifetime`, round-trip
  of `get`/`set`/`has`/`remove` in all three classes, and an explicit test
  that a replay guard disappears once its TTL elapses.
- `bonus-pool`: duplicate `sale_id` is still rejected inside the TTL, and a
  contribution with the same `sale_id` succeeds after the TTL (proving the
  footprint is reclaimed).
- `zk-location-verifier`: the full existing cache/idempotency suite (43 unit
  + 3 integration tests) still passes after routing through the shared
  helpers.

Run locally with `cargo test -p contract-utils -p bonus-pool -p zk-location-verifier`
and `cargo fmt --all -- --check`.
