# Soroban contract storage TTL renewal bot

Soroban contract instance (and code) ledger entries expire after a "time to
live" measured in ledgers. If a contract's storage TTL is allowed to reach
zero, the entry is archived and becomes unusable until restored. This bot
polls the configured contracts' TTL and automatically submits an
`ExtendFootprintTTL` transaction before that happens.

## How it works

For each contract ID in `TTL_RENEWAL_CONTRACT_IDS`:

1. Reads the contract instance's ledger entry via Soroban RPC
   (`getLedgerEntries`), which returns `liveUntilLedgerSeq` and the network's
   current `latestLedger`.
2. Computes `remainingLedgers = liveUntilLedgerSeq - latestLedger`.
3. If `remainingLedgers >= TTL_RENEWAL_THRESHOLD_LEDGERS`, the contract is
   left alone (`status: 'healthy'`).
4. Otherwise, it builds, simulates, signs (with `TTL_RENEWAL_SIGNER_SECRET`),
   and submits an `Operation.extendFootprintTtl` transaction that extends the
   TTL to `TTL_RENEWAL_EXTEND_TO_LEDGERS` ledgers out, then polls for
   confirmation (`status: 'renewed'`).

Contracts are checked **sequentially**, not in parallel — renewal
transactions share one signer account, and Stellar transactions from the same
account must be submitted in sequence-number order.

## Running it

```bash
pnpm monitor:ttl-renewal   # tsx lib/monitor/ttlRenewalWorker.ts
```

This runs as a long-lived process (same shape as `pnpm monitor:treasury`):
an infinite loop that calls the check once, then sleeps for
`TTL_RENEWAL_POLL_INTERVAL_MS` before checking again.

## Configuration

```dotenv
# Secret key of the account that pays for and signs renewal transactions.
# Required — the bot skips its check (and logs an error) if this is unset.
TTL_RENEWAL_SIGNER_SECRET=
# Comma-separated list of Soroban contract IDs to monitor (no spaces needed).
TTL_RENEWAL_CONTRACT_IDS=
# Renew when the contract's remaining TTL falls below this many ledgers.
# Default: 17280 (~1 day at 5s/ledger).
TTL_RENEWAL_THRESHOLD_LEDGERS=17280
# Ledger count to extend the TTL to when a renewal is triggered.
# Default: 518400 (~30 days at 5s/ledger).
TTL_RENEWAL_EXTEND_TO_LEDGERS=518400
# How often the worker re-checks all configured contracts (ms).
# Default: 3600000 (1 hour).
TTL_RENEWAL_POLL_INTERVAL_MS=3600000
```

RPC URL and network passphrase are **not** duplicated here — the bot reuses
`NEXT_PUBLIC_SOROBAN_RPC_URL` / `NEXT_PUBLIC_NETWORK_PASSPHRASE` via
`lib/config/network.ts`, the same config every other Soroban call site in
this repo uses.

## Failure handling

- **Missing/invalid config** (no signer secret, no contract IDs, or a
  malformed secret key) — the check is skipped entirely for that run, an
  error/warning is logged, and the worker sleeps and tries again next
  interval. It never crashes the process.
- **Per-contract isolation** — each contract is wrapped in its own
  try/catch. An RPC error, a failed simulation, a rejected submission, or a
  confirmation timeout on one contract is recorded as `status: 'error'` for
  that contract only; the rest of the configured contracts are still
  checked in the same run.
- **Logging** — all logs go through the shared `lib/logger` (winston).
  Only contract IDs, ledger numbers, transaction hashes, and safe error
  *messages* are logged — the signer secret and raw SDK error objects are
  never logged.

## Code layout

| File | Purpose |
|---|---|
| `lib/monitor/ttlRenewalTypes.ts` | `TtlRenewalConfig`, `ContractTtlResult`, `TtlRenewalSummary` types |
| `lib/monitor/ttlRenewal.ts` | Core, independently-testable check/renew logic (`checkAndRenewContractTtl`, `runTtlRenewalCheck`) |
| `lib/monitor/ttlRenewalWorker.ts` | Poll-loop process entrypoint, run via `pnpm monitor:ttl-renewal` |
| `lib/monitor/__tests__/ttlRenewal.test.ts` | Vitest suite: healthy TTL, low-TTL renewal, RPC/simulation/submission failures, missing/invalid config, multiple contract IDs |
