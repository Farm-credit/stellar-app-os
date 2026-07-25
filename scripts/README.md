# Soroban/Stellar Deploy Scripts — Closes #504

Bash + PowerShell + Node.js scripts that deploy every contract in
`contracts/Cargo.toml` to a Stellar Soroban network (testnet, futurenet, or
mainnet) in dependency order, invoke the right `initialize(...)` arguments,
and persist a JSON manifest at `deployments/<network>.json`.

## Quickstart

### 1. Install the tooling (one-time)

```bash
# Rust + cargo (rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Soroban CLI (soroban binary; install once globally)
cargo install --locked stellar-cli --features soroban

# WASM build target
rustup target add wasm32-unknown-unknown

# Node ≥18 is already required by the rest of the repo (package.json).
```

> PowerShell users: run the same commands inside an `x86_64` PowerShell 7
> terminal. The CLI scripts work on Windows natively through `deploy.ps1`.

### 2. Configure your deploy identity

For testnet bootstrap, `friendbot` funds any identity whose name starts with
`admin*` (or whatever your `DEPLOY_IDENTITY=…` says). The simplest setup:

```bash
# Bash / PowerShell equivalent — generate a deployer keypair.
soroban keys generate --name admin --network testnet
soroban keys fund admin --network testnet
```

For mainnet, fund your deployer account with XLM out-of-band (the
orchestrator has no friendbot path for public network).

### 3. Bootstrap a testnet deployment

```bash
# Bootstrap a fresh manifest.
scripts/deploy.sh testnet admin

# Equivalent on Windows / PowerShell
pwsh scripts/deploy.ps1 -Network testnet -Identity admin
```

This will:

1. Build every workspace member to WASM (`cargo build --target
   wasm32-unknown-unknown --release`).
2. Resolve existing SACs (XLM is native, USDC read from
   `USDC_TOKEN_ADDRESS`) or deploy a fresh TREE SAC.
3. Deploy + initialize all 21 contracts in 8 phases (see the orchestrator
   header for the order).
4. Write/update `deployments/testnet.json`.

### 4. Re-running / partial deploys

| Flag | Effect |
| --- | --- |
| `--only <crate>`, repeated | Only deploy / initialise these individual crates; others are honoured from the manifest id-list. Existing manifest entries for crates NOT on the `--only` list are not touched. |
| `--skip <crate>`, repeated | Skip a specific crate (e.g. a flaky downstream dependency while iterating). |
| `--force` | Re-deploy contracts even if already in the manifest. |
| `--build-only` | Just rebuild WASM and exit. |
| `--no-build` | Use pre-existing WASM from `target/`. |

Examples:

```bash
# Just (re-)deploy the tree-escrow contract (and skip others).
scripts/deploy.sh testnet admin --only tree-escrow

# Skip a flaky downstream contract while debugging the rest.
scripts/deploy.sh testnet admin --skip naira-payout

# Production retry of a single phase.
scripts/deploy.sh mainnet ops --only platform-governance --force
```

## TREE SAC pitfall

**`tree-escrow` requires the contract itself to be the SAC admin.** Its
`initialize` does:

```rust
if token::StellarAssetClient::new(&env, &tree_token).admin() != env.current_contract_address() {
    panic_with_error!(...);
}
```

If the TREE SAC was deployed via the legacy `scripts/deploy-tree-asset.mjs`,
that script (a) wraps a classic Stellar asset and (b) locks the issuer
(`master weight = 0`). Locking the issuer account makes the SAC `mint`
unreachable; and a classic asset wrapped via Stellar's native asset contract
**cannot** transfer its admin to a Soroban contract — `admin()` will always
return the issuer account.

The new orchestrator avoids this entirely. Phase 0 deploys the TREE SAC
through `soroban contract asset deploy`, then **transfers its admin rights
to the fresh `tree-escrow` contract address** (step 6b) **before**
initializing tree-escrow (step 6c). The legacy script is kept untouched for
backwards compatibility, but should not be used as a bootstrap step in any
deployment that includes `tree-escrow`.

Three escape hatches:

1. **Reuse an existing TREE SAC** by setting `TREE_TOKEN_ADDRESS=<C…>`. The
   orchestrator will *not* re-transfer admin rights — you are responsible
   for ensuring the SAC's admin matches what tree-escrow expects. This is
   the recommended path for production mainnet.
2. **Auto-deploy** (default for testnet): `deploy_if_missing: true` in the
   config makes Phase 0 provision a fresh TREE SAC + admin transfer.
3. **Lock the issuer** with `assets.tree.lock_issuer: true` if you need a
   hard supply cap. **Incompatible with `tree-escrow`'s mint flow** —
   confirm tree-escrow accepts a separate admin signer before enabling.

## Environment variables

Read in this priority: explicit CLI flags > `.env.deploy` > config JSON.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOY_NETWORK` | `testnet`, `mainnet`, or `futurenet` | `testnet` |
| `DEPLOY_IDENTITY` | Key alias to sign deploy/initialize txs | `admin` |
| `DEPLOY_CONFIG` | Path to deploy config JSON | `scripts/deploy.config.json` |
| `XLM_TOKEN_ADDRESS` | Optional XLM SAC override; otherwise the native asset is implicit | – |
| `USDC_TOKEN_ADDRESS` | Default: Circle sandbox (testnet) / Circle (mainnet) | The builtin defaults are conservative; provide your own. |
| `TREE_TOKEN_ADDRESS` | If unset, deploy a fresh TREE SAC (testnet) | falls back to deploy |
| `STAKE_TOKEN_ADDRESS` | If unset, defaults to USDC | – |
| `TREASURY_SIGNER_A/B/C` | Multisig signers; defaults to `DEPLOY_IDENTITY` if any one missing | warnings raised |
| `NAIRA_ANCHOR_ADDRESS` | Stellar account for SEP-24/31 off-ramp | defaults to `DEPLOY_IDENTITY` |

A `.env.deploy.example` is included at the repo root; copy to `.env.deploy`
(anywhere lookup-able) and edit per-environment.

## Manifest schema

Written to `deployments/<network>.json`:

```json
{
  "schema_version": 1,
  "network": "testnet",
  "deployed_at": "2025-01-15T08:00:00.000Z",
  "rpc_url": "https://soroban-testnet.stellar.org",
  "horizon_url": "https://horizon-testnet.stellar.org",
  "identity": "admin",
  "identity_address": "GABC…",
  "assets": {
    "xlm": null,
    "usdc": "CABC…",
    "tree": "CDEF…",
    "stake_token": "CABC…"
  },
  "contracts": {
    "admin-controls": "C123…",
    "tree-escrow": "CXYZ…",
    "tree-escrow-initialized": true,
    "sponsor-receipt": "C555…",
    …
  }
}
```

`null` for `assets.xlm` is intentional — XLM is the native asset and any
Soroban contract that accepts it gets a special `Address::Native` form at
runtime.

The manifest is updated **after every successful contract deploy + init**,
so a Ctrl+C at Phase 6 can be resumed simply by re-running `scripts/deploy.sh`
without `--force`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `tree-escrow initialize` panics | The TREE SAC's admin is the issuer, not the contract | Use this orchestrator (transfers admin at Phase 6); do not lock the issuer. |
| `Error: ... sac-signer …` | The deploy identity isn't the issuer on file | Pre-fund and bind the identity before re-running. |
| `Could not parse a contract ID from output` | Custom soroban CLI build mute the ID | Upgrade `stellar-cli` ≥22. |
| Idempotency breaks | Manifest from a different identity exists | Pass `--force` or remove `deployments/<network>.json` to start fresh. |
| Pipeline stops at Phase 5 | A phase out of order; orchestration aborted intentionally | Fix the failing init args then re-run — no `--force` required, manifest retains partial progress. |

## Files in this directory

| File | Purpose |
| --- | --- |
| `orchestrate.mjs` | Node.js orchestrator (the heavy lift) |
| `sac-deploy.mjs` | SAC resolution + deployment helpers |
| `lib/deploy-helpers.mjs` | Shared utilities (CLI invocation, manifest IO, logging) |
| `deploy.sh` | Bash entry point (`./scripts/deploy.sh …`) |
| `deploy.ps1` | PowerShell entry point (`pwsh scripts/deploy.ps1 …`) |
| `deploy.config.example.json` | Configuration template (copy → `deploy.config.json`) |
| `deploy-tree-asset.mjs` | **Legacy**, kept for reference; do not use as a TREE SAC bootstrap when tree-escrow is in scope (see "TREE SAC pitfall") |
| `seed-species.mjs` | Species-registry seed script (unchanged) |
| `generate-icons.mjs` | PWA icon generator (unchanged) |
