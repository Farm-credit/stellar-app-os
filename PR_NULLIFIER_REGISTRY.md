# PR: On-Chain Nullifier Registry (Soroban)

Closes #308

## Summary

Implements a Soroban smart contract that acts as an on-chain nullifier registry to prevent double-counting of tree carbon credits. Each tree registration produces a unique cryptographic commitment derived from GPS coordinates, timestamp, and farmer ID. Once a commitment is stored on-chain, any attempt to register the same tree again is rejected at the contract level.

## What Changed

- `contracts/nullifier-registry/src/lib.rs` — Soroban contract with:
  - `initialize(admin)` — one-time setup
  - `compute_commitment(input)` — deterministic SHA-256 hash of `gps + timestamp + farmer_id`
  - `register(input)` — stores commitment, requires farmer auth, panics on duplicate
  - `is_registered(commitment)` — read-only nullifier check
  - `get_entry(commitment)` — returns full `NullifierEntry` (farmer, timestamp, commitment)
- `contracts/nullifier-registry/Cargo.toml` — crate config targeting `cdylib` for Wasm
- `contracts/Cargo.toml` — workspace root for all Soroban contracts

## How It Works

```
commitment = SHA-256( gps_xdr | timestamp_be_bytes | farmer_id_xdr )
```

On `register`:

1. Farmer signs the transaction (auth required)
2. Contract computes the commitment
3. Checks persistent storage — if key exists → panic (double-count rejected)
4. Stores `NullifierEntry` and emits a `register` event for indexers

## Tests

Four unit tests using `soroban-sdk` testutils:

- Happy path: register + lookup
- Double registration rejected (expected panic)
- Different inputs → different commitments
- Deterministic commitment computation

## How to Build & Test

```bash
cd contracts
cargo test
cargo build --release --target wasm32-unknown-unknown
```

## Related

- Closes #308 — Prevent double-counting of tree carbon credits
