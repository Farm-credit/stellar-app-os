# [Smart Contract] Deploy and verify contract on Stellar testnet

Closes #330

## Summary

This PR addresses issue #330 by building, deploying, and verifying the `tree-escrow`, `escrow-milestone`, and `nullifier-registry` smart contracts on the Stellar testnet. It also includes the deployment of the `TREE` token (Soroban SAC) and an end-to-end integration test.

## What Was Implemented

- **Smart Contract Fixes:** Resolved compilation errors in `tree-escrow`, `escrow-milestone`, and `nullifier-registry` related to SDK version 21+ changes (missing imports, type mismatches, and ownership issues).
- **Build Optimization:** Configured root `Cargo.toml` with release profiles and utilized `stellar contract optimize` to ensure compatibility with Stellar testnet (fixing `reference-types` errors).
- **Testnet Deployment:**
    - Deployed `TREE` token (SAC) with issuer `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`.
    - Deployed `tree-escrow` contract: `CDWDZYGHRQDKTN7NXRVAD37M5QKKLBRJ3FQQ74EHV4Q2KAKDY3PT6NQB`.
    - Deployed `escrow-milestone` contract: `CAXHC2EJVSMVJGXSHLFYZIRKNA365RNEUCHSNMDIMC4ADYEUPQY7DVSA`.
    - Deployed `nullifier-registry` contract: `CC6KDS3BVRXZGS6DJCVQTB2SQSDWL3XXOCE7U7WD6ZQFSCNWIYZUTTJQ`.
- **Initialization:** All contracts have been initialized with the admin address on testnet.
- **Integration Testing:** Verified the `tree-escrow` deposit and planting verification flow on testnet using `TREE` tokens.
- **Documentation:** Created `CONTRACTS.md` with all contract IDs, hashes, and issuing accounts.

## Implementation Details

- Modified `Cargo.toml` to disable default features for `soroban-sdk` to support `wasm32v1-none` target requirements.
- Added `RUSTFLAGS="-C target-feature=-reference-types"` to the build process to avoid modern WASM features not yet supported by the Soroban environment.
- Used `stellar-sdk` script to automate trustline creation and initial token minting (payment) from issuer to distributor.

## How to Test

1. Inspect the `CONTRACTS.md` file for deployed IDs.
2. Verify the contracts on [Stellar Laboratory](https://lab.stellar.org/r/testnet/contract/CDWDZYGHRQDKTN7NXRVAD37M5QKKLBRJ3FQQ74EHV4Q2KAKDY3PT6NQB).
3. (Optional) Run the integration test steps manually using `stellar-cli`:
   ```bash
   # Check escrow record for farmer 'dev'
   stellar contract invoke --id tree-escrow --source dev --network testnet -- get_record --farmer dev
   ```

## Screen Recording

[N/A - CLI/Contract interaction verified via testnet logs]
