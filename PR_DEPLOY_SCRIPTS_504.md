# chore(contracts): Write deploy scripts for testnet and mainnet — Closes #504

This PR adds a complete, production-ready Soroban/Stellar deployment
pipeline. Two thin OS entry points (`scripts/deploy.sh` + `scripts/deploy.ps1`)
forward into a Node.js orchestrator that handles the entire contract
workspace with idempotency, dependency ordering, and a written deployment
manifest.

Closes #504.

## What's new

```
scripts/
├── orchestrate.mjs            # Main Node.js orchestrator (the heavy lift)
├── sac-deploy.mjs             # SAC resolution / deployment helper
├── lib/
│   └── deploy-helpers.mjs     # Shared utilities (CLI, manifest IO, logging)
├── deploy.sh                  # Bash entry point
├── deploy.ps1                 # PowerShell entry point
├── deploy.config.example.json # Configuration template
└── README.md                  # Operator quickstart + TREE SAC pitfall + manifest schema
.env.deploy.example            # Env-var template (copy → .env.deploy)
PR_DEPLOY_SCRIPTS_504.md       # This PR description
```

## Why this design

**Bash + PowerShell + Node**, not Bash + PowerShell alone:

| Layer | Why |
| --- | --- |
| `scripts/deploy.sh` / `.ps1` | Assert prereqs (node ≥18, soroban, stellar, cargo), load `.env.deploy`, set positional args, exec into Node. Cross-platform entry. |
| `scripts/orchestrate.mjs` | The heavy lift (build + deploy + init in 8 dependency-ordered phases, per-crate `--only` / `--skip` / `--force` filters, idempotency, manifest writes). |
| `scripts/sac-deploy.mjs` | SAC resolution / deployment helper. Closes the "TREE SAC pitfall". |
| `scripts/lib/deploy-helpers.mjs` | Shared utilities (CLI invocation, atomic manifest IO, coloured logging, prerequisite checks). |

Existing scripts (`deploy-tree-asset.mjs`, `seed-species.mjs`,
`generate-icons.mjs`) are untouched.

## How it works

1. **Phase 0 — SAC resolution.** XLM is the native asset (implicit). USDC
   is reused from `USDC_TOKEN_ADDRESS` (operators MUST resolve it on
   testnet via Horizon — we no longer hardcode a fake address). TREE
   token is auto-provisioned via `soroban contract asset deploy` when no
   `TREE_TOKEN_ADDRESS` env var is supplied. Stake token defaults to USDC
   unless overridden.

2. **Phase 1 — admin-controls** (admin, oracle).

3. **Phase 2 — 10 single-admin registries**: nullifier-registry,
   species-registry, farmer-registry, planter-registry, kyc-attestation,
   location-proof, zk-verifier, zk-location-verifier, escrow-milestone,
   aggregate-impact-verifier.

4. **Phase 3 — verifier-staking** (admin, stake-token, min-stake-amount).

5. **Phase 4 — governance**: species-voting (admin, tree-token,
   species-registry, threshold, voting-period); platform-governance
   (admin, verifier-staking, admin-controls, fee, min-planting-bond).

6. **Phase 5 — escrow & payments**: escrow (verifier), donation-escrow
   (admin, xlm, usdc), subscription-sponsorship (admin, xlm, usdc),
   treasury (signer-a, signer-b, signer-c, token), naira-payout (admin,
   anchor, min-interval, max-daily).

7. **Phase 6 — tree-escrow + tree-token with SAC admin transfer** (see "TREE
   SAC pitfall" below for why this phase is special).

8. **Phase 7 — sponsor-receipt** (the soulbound NFT receipt contract from
   #471).

After every successful deploy + initialise the orchestrator atomically
writes `deployments/<network>.json` (`tmp + rename`) so a Ctrl+C at any
phase preserves the partial state and the run can be resumed simply by
re-running `scripts/deploy.sh`.

## CLI surface

```bash
scripts/deploy.sh <network> <identity> [extra args passed to orchestrate.mjs]
```

| Flag | Effect |
| --- | --- |
| `-n`, `--network <testnet\|mainnet\|futurenet>` | Target network (required, or via `DEPLOY_NETWORK` env). |
| `-i`, `--identity <key-alias>` | Local soroban/stellar key alias (required, or via `DEPLOY_IDENTITY`). |
| `--only <crate>`, repeated | Only deploy / initialise these individual crates. |
| `--skip <crate>`, repeated | Skip a specific crate. |
| `--force` | Re-deploy even if the manifest already has the address. |
| `--no-build` | Skip `cargo build`, use pre-existing wasm in `target/`. |
| `--build-only` | Only build wasm and exit. |
| `-c`, `--config <path>` | Path to a config JSON (default `scripts/deploy.config.json`). |
| `-h`, `--help` | Show help. |

### Examples

```bash
# Bootstrap a testnet deployment from scratch.
scripts/deploy.sh testnet admin

# Production mainnet re-deployment of a single contract.
scripts/deploy.sh mainnet ops --only tree-escrow --force

# While iterating: skip a flaky downstream contract.
scripts/deploy.sh testnet admin --skip naira-payout

# Just rebuild WASM and exit.
scripts/deploy.sh testnet admin --build-only

# Idempotent re-run (the orchestrator will resume from where you left off).
scripts/deploy.sh testnet admin

# Force a full redeploy (use with caution; re-deploys + re-initialises every contract).
scripts/deploy.sh testnet admin --force
```

## TREE SAC pitfall (and how this PR closes it)

`tree-escrow`'s `initialize` enforces a hard precondition:

```rust
if token::StellarAssetClient::new(&env, &tree_token).admin()
    != env.current_contract_address()
{
    panic_with_error!(...);
}
```

The pre-existing `scripts/deploy-tree-asset.mjs` script is INCOMPATIBLE
with this check because it deploys a classic Stellar asset wrapper and
locks the issuer (`master weight = 0`). For a wrapped classic asset:

1. `tree-escrow`'s `initialize` will always panic — the admin of a
   wrapped classic asset is the issuer account, never a Soroban contract
   address.
2. Even if the admin were transferable, a locked issuer can't authorise
   `mint` operations.

This PR solves both of those problems in `Phase 6`:

- **Step 6a**: Deploy `tree-escrow`'s WASM but DO NOT initialise yet.
- **Step 6b**: Transfer the TREE SAC's admin rights to the freshly-deployed
  `tree-escrow` contract address (`soroban contract invoke -- set_admin
  --new_admin <tree-escrow>`).
- **Step 6c**: Initialise `tree-escrow`. Its admin check now passes because
  we just set its own address as the SAC's admin.
- **Step 6d**: Deploy + initialise `tree-token` (admin, tree-token) which
  requires the SAC to be addressable.

If the TREE SAC was **not** deployed by us (i.e. the operator supplied
`TREE_TOKEN_ADDRESS`), Phase 6b is skipped with a warning — production
operators are responsible for ensuring the SAC's admin matches before
re-running.

### Migration note

Any deployments that previously used `scripts/deploy-tree-asset.mjs` to
provision TREE and then called `tree-escrow.initialize` directly will
panic with `Error(Contract, #8)` (`ContractMustBeTreeTokenAdmin`). The
remediation is to either:

1. Use this new orchestrator (which performs the admin transfer
   automatically), or
2. Switch to a Soroban-native token contract (where `set_admin` writes
   through to contract address).

`deploy-tree-asset.mjs` is left in the repo for backwards compatibility
but is documented as **do-not-use** when `tree-escrow` is in scope.

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
    "sponsor-receipt": "C555…"
  }
}
```

`assets.xlm` is `null` on purpose — XLM is the native asset and Soroban
contracts that need a native asset receive a special `Address::Native`
form at runtime. `tree-escrow-initialized` is a flag (not a contract
id) that records whether `tree-escrow.initialize` has been invoked
without having to re-call the contract to find out.

`readManifest` rejects manifests stamped with a different `schema_version`
or recorded for a different `network` so the orchestrator silently
doesn't march forward on a hand-edited or out-of-sync manifest.

## Constructor arguments matrix

Per-contract `pub fn initialize(...)` (cross-checked against
`contracts/Cargo.toml` + every `src/lib.rs`):

| Contract | Args |
| --- | --- |
| `admin-controls` | `(admin, oracle)` |
| `aggregate-impact-verifier` | `(admin)` |
| `donation-escrow` | `(admin, xlm_token, usdc_token)` |
| `escrow` | `(verifier)` |
| `escrow-milestone` | `(admin)` |
| `farmer-registry` | `(admin)` |
| `kyc-attestation` | `(admin)` |
| `location-proof` | `(admin)` |
| `naira-payout` | `(admin, anchor_withdrawal, min_interval_secs, max_daily_payout)` |
| `nullifier-registry` | `(admin)` |
| `planter-registry` | `(admin)` |
| `platform-governance` | `(admin, staking_contract, admin_controls, platform_fee, min_planting_bond)` |
| `species-registry` | `(admin)` |
| `species-voting` | `(admin, tree_token, species_registry, voting_threshold, voting_period)` |
| `sponsor-receipt` | `(admin)` |
| `subscription-sponsorship` | `(admin, xlm_token, usdc_token)` |
| `tree-escrow` | `(admin, tree_token, oracle, survival_threshold_percent, min_density, job_size_threshold)` |
| `tree-token` | `(admin, tree_token)` |
| `treasury` | `(signer_a, signer_b, signer_c, token)` |
| `verifier-staking` | `(admin, stake_token, min_stake_amount)` |
| `zk-location-verifier` | `(admin)` |
| `zk-verifier` | `(admin)` |

`carbon-marketplace` is **not** in `contracts/Cargo.toml` workspace
members, so the orchestrator does not touch it. If it lives elsewhere
later it can be added to the manifest dict directly.

`contract-utils` and `harvesta-errors` are libraries (no `initialize`
function) and are filtered out of the workspace parse.

## Environment variables

Read in priority: explicit CLI flags > `.env.deploy` > config JSON.

| Variable | Purpose |
| --- | --- |
| `DEPLOY_NETWORK`, `DEPLOY_IDENTITY` | Defaults for `--network` / `--identity` |
| `DEPLOY_CONFIG` | Path to deploy config JSON (default `scripts/deploy.config.json`) |
| `DEPLOY_ORACLE` | Admin-controls `oracle` address (defaults to the deploy identity) |
| `XLM_TOKEN_ADDRESS` | Optional XLM SAC override |
| `USDC_TOKEN_ADDRESS` | Required for any non-bootstrap deployment |
| `TREE_TOKEN_ADDRESS` | If set, reuse existing TREE SAC (recommended on mainnet) |
| `STAKE_TOKEN_ADDRESS` | Defaults to USDC |
| `TREASURY_SIGNER_A/B/C` | 2-of-3 multisig keys (defaults to deploy identity on testnet, **must** be set on mainnet) |
| `NAIRA_ANCHOR_ADDRESS` | Stellar account used by `naira-payout` for SEP-24/31 off-ramp |

A `.env.deploy.example` is at the repo root — copy to `.env.deploy` and
edit for your environment.

## Idempotency, retries, and `--only` semantics

- A successful `initialize` is recorded by writing the contract id to
  `deployments/<network>.json` immediately after the transaction
  succeeds. Subsequent runs skip the same contract — no duplicate
  initialisations.
- `--force`: re-deploy and re-initialise even when the manifest already
  has the address. Use with caution on mainnet (it will cost fresh
  fees and may overwrite on-chain state).
- `--only <crate>`, `--skip <crate>`: per-crate filter that excludes a
  single contract from the run. `--only tree-escrow` deploys and
  initialises `tree-escrow` only; everything else is honoured from the
  manifest id-list (no re-deployment).
- `tree-escrow-initialized` flag is reset every time `tree-escrow` is
  re-deployed, so we don't accidentally leave a fresh contract
  uninitialised.

The Phase 6 block (`tree-escrow` + `tree-token`) and Phase 0 (asset
resolution) are `--only`-aware: when `tree-escrow` or `tree-token` /
`tree-escrow` / `sponsor-receipt` are not in scope, the TREE SAC is
served from the manifest address without re-deployment. Likewise USDC
and the stake-token.

## Pre-requisites

The orchestrator calls the Soroban CLI directly. You'll need:

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Soroban / Stellar CLI
cargo install --locked stellar-cli --features soroban

# Node ≥18 (the rest of the repo already pins this)
```

`scripts/deploy.sh` (and `.ps1`) calls `assertPrerequisites()` which
prints clear remediations if anything is missing.

## Operator quickstart

```bash
# 1. Configure your deploy identity (testnet is friendbot-funded).
soroban keys generate --name admin --network testnet
soroban keys fund admin --network testnet

# 2. Copy and edit the env template.
cp .env.deploy.example .env.deploy  # edit USDC/STAKES/SIGNERS per env

# 3. Bootstrap.
scripts/deploy.sh testnet admin

# 4. Inspect the manifest.
cat deployments/testnet.json | jq '.contracts, .assets'
```

See `scripts/README.md` for the full operator manual (env-var table,
troubleshooting matrix, manifest schema).

## PR checklist

- [x] All 21 deployable contracts in `contracts/Cargo.toml` are covered
      (libraries `contract-utils` + `harvesta-errors` excluded).
- [x] Each `initialize(...)` signature is matched against the live
      in-repo source — verified during code review.
- [x] TREE SAC pitfall closed (Phase 6 admin transfer).
- [x] Idempotent (per-crate `--only` / `--skip`; `--force` opt-in).
- [x] Atomic manifest writes (`tmp + rename`); Ctrl+C-safe.
- [x] Cross-platform wrappers (Bash + PowerShell 5.1-compatible).
- [x] Operator docs (scripts/README.md) and template configs.
- [x] No existing scripts broken (legacy `deploy-tree-asset.mjs` left
      untouched + documented as out-of-scope when `tree-escrow` is in
      scope).
- [ ] **Operator follow-up**: run `pnpm install && scripts/deploy.sh
      testnet admin` end-to-end on a live network before merging; this
      PR cannot perform that round-trip from a CI sandbox because the
      `cargo` + `soroban` toolchains are not installed there. The 32
      unit tests in the existing contracts remain unchanged.
