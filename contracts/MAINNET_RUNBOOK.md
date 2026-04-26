# Mainnet Deployment Runbook — FarmCredit Smart Contracts

Covers the three Soroban contracts: `nullifier-registry`, `escrow-milestone`, `tree-escrow`.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable ≥ 1.78 | `rustup update stable` |
| Soroban CLI | ≥ 21.0.0 | `cargo install --locked soroban-cli` |
| stellar-cli | ≥ 21.0.0 | included with soroban-cli |

Verify with:
```bash
cargo build --target wasm32-unknown-unknown --release
soroban --version
```

---

## Multi-Sig Admin Account Setup

All three contracts use a single admin/verifier address. On mainnet this **must** be a Stellar multisig account, not a single-key account.

### Recommended threshold: 2-of-3

1. Generate three independent signing keypairs and store each in a separate hardware wallet (Ledger) or air-gapped machine.
2. Fund the admin account on mainnet with enough XLM to cover transaction fees (~10 XLM buffer).
3. Set thresholds and signers:

```bash
# Replace <ADMIN>, <SIGNER_A/B/C> with actual public keys
stellar tx new set-options \
  --source-account <ADMIN> \
  --master-weight 0 \
  --low-threshold 2 \
  --med-threshold 2 \
  --high-threshold 2 \
  --signer <SIGNER_A>:1 \
  --signer <SIGNER_B>:1 \
  --signer <SIGNER_C>:1 \
  --network mainnet
```

4. Verify with `stellar account info --account <ADMIN> --network mainnet` — confirm signers and thresholds are correct before proceeding.

---

## Build

```bash
cd contracts

# Build all three contracts
cargo build --target wasm32-unknown-unknown --release

# Optimised WASM outputs will be at:
# target/wasm32-unknown-unknown/release/nullifier_registry.wasm
# target/wasm32-unknown-unknown/release/escrow_milestone.wasm
# target/wasm32-unknown-unknown/release/tree_escrow.wasm
```

Run all tests before deploying:
```bash
cargo test
```

All tests must pass with zero failures.

---

## Deploy — Testnet (dry run)

Always deploy to testnet first and exercise every function before mainnet.

```bash
# Fund a testnet account
soroban keys generate --network testnet deployer
soroban keys fund deployer --network testnet

# Deploy nullifier-registry
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/nullifier_registry.wasm \
  --source deployer \
  --network testnet

# Deploy escrow-milestone
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow_milestone.wasm \
  --source deployer \
  --network testnet

# Deploy tree-escrow
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tree_escrow.wasm \
  --source deployer \
  --network testnet
```

Note the contract IDs returned for each deploy. Initialize each:

```bash
soroban contract invoke \
  --id <NULLIFIER_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize --admin <ADMIN_ADDRESS>

soroban contract invoke \
  --id <ESCROW_MILESTONE_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize --admin <ADMIN_ADDRESS>

soroban contract invoke \
  --id <TREE_ESCROW_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize --admin <ADMIN_ADDRESS>
```

### Testnet smoke tests

For each contract, exercise the full happy path and verify:
- [ ] `initialize` succeeds; second call panics with "already initialized"
- [ ] Core flow completes (register / deposit→verify→release / deposit→plant→survive)
- [ ] `pause` blocks state changes; `refund` still works while paused
- [ ] `unpause` restores normal operations
- [ ] `propose_admin` + `accept_admin` transfers ownership correctly

---

## Deploy — Mainnet

Only proceed after all testnet smoke tests pass and the security audit checklist is signed off.

```bash
# Mainnet deploy — use the multisig admin account as the signer
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/nullifier_registry.wasm \
  --source <MULTISIG_ADMIN> \
  --network mainnet

soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow_milestone.wasm \
  --source <MULTISIG_ADMIN> \
  --network mainnet

soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tree_escrow.wasm \
  --source <MULTISIG_ADMIN> \
  --network mainnet
```

Initialize immediately after each deploy — do not leave contracts uninitialized:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <MULTISIG_ADMIN> \
  --network mainnet \
  -- initialize --admin <MULTISIG_ADMIN_ADDRESS>
```

Record all contract IDs in a secure, team-accessible location.

---

## Gas Cost Estimates

See `GAS_COST_ANALYSIS.md` for per-operation XLM fee estimates.

---

## Emergency Pause Procedure

If a security issue is discovered post-deployment, pause all three contracts immediately.

### Pause (requires 2-of-3 signers)

```bash
for CONTRACT_ID in <NULLIFIER_ID> <ESCROW_MILESTONE_ID> <TREE_ESCROW_ID>; do
  soroban contract invoke \
    --id $CONTRACT_ID \
    --source <MULTISIG_ADMIN> \
    --network mainnet \
    -- pause
done
```

Verify each contract is paused:

```bash
soroban contract invoke --id <CONTRACT_ID> --network mainnet -- is_paused
# Must return: true
```

### During a Pause

- New deposits and milestone/planting/survival releases are blocked.
- `refund()` remains callable — funders and donors can always retrieve their escrowed funds.
- Investigate and patch the issue. Deploy a fixed contract if necessary.

### Unpause (after incident resolution)

```bash
for CONTRACT_ID in <NULLIFIER_ID> <ESCROW_MILESTONE_ID> <TREE_ESCROW_ID>; do
  soroban contract invoke \
    --id $CONTRACT_ID \
    --source <MULTISIG_ADMIN> \
    --network mainnet \
    -- unpause
done
```

---

## Admin Transfer Procedure

Use the 2-step transfer to hand off admin to a new multisig account:

```bash
# Step 1: current admin proposes successor
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <CURRENT_ADMIN> \
  --network mainnet \
  -- propose_admin --new_admin <NEW_ADMIN_ADDRESS>

# Step 2: new admin accepts (must be signed by new admin account)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <NEW_ADMIN> \
  --network mainnet \
  -- accept_admin
```

Repeat for all three contracts. Verify by calling `is_paused` from the new admin to confirm it can operate the contract.

---

## Post-Deployment Verification Checklist

- [ ] All three contracts deployed and initialized on mainnet
- [ ] `is_paused` returns `false` for all contracts
- [ ] Admin address matches the multisig account (verify on Stellar Expert)
- [ ] Contract IDs recorded and shared with team
- [ ] Horizon event streaming confirmed for all contract events
- [ ] Front-end environment variables updated with mainnet contract IDs
- [ ] On-call runbook shared with all admin keyholders
