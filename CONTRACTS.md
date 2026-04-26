# Deployed Contracts and Tokens (Stellar Testnet)

The following smart contracts and tokens have been deployed and verified on the Stellar testnet as part of issue #330.

## TREE Token (Soroban)
- **Asset Code:** `TREE`
- **Issuer Account:** `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`
- **Contract ID:** `CBVO334VEZCUTMIU3CG4BISOFKYQXEGJE3PCM3M7BAOGTPTQYPYGU563`
- **Decimals:** 7
- **Explorer Link:** [Stellar Expert](https://stellar.expert/explorer/testnet/asset/TREE-GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4)

## Tree Escrow Contract
- **Contract ID:** `CDWDZYGHRQDKTN7NXRVAD37M5QKKLBRJ3FQQ74EHV4Q2KAKDY3PT6NQB`
- **WASM Hash:** `bb144da3fe25567a063b14410da8a4529d255a7208ecc5865821a98093ed9a60`
- **Admin Address:** `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`
- **Features:** Two-tranche release (75% at planting, 25% after 6 months survival).

## Escrow Milestone Contract
- **Contract ID:** `CAXHC2EJVSMVJGXSHLFYZIRKNA365RNEUCHSNMDIMC4ADYEUPQY7DVSA`
- **WASM Hash:** `29ad70ed0825c8352390f371ea8710e7f36961b5e3ab556a556b31b8cfd63399`
- **Admin Address:** `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`

## Nullifier Registry Contract
- **Contract ID:** `CC6KDS3BVRXZGS6DJCVQTB2SQSDWL3XXOCE7U7WD6ZQFSCNWIYZUTTJQ`
- **WASM Hash:** `e113d901d3c8defc8f952ecbfda36d80590472695b62ce5e470a0e38ae0640b4`
- **Admin Address:** `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`

---

## Deployment Details
- **Network:** Testnet
- **Deployment Date:** 2026-04-25
- **Source Account:** `GA7W6L76SSZK7JQIUYRPLBHCHEAXRUHDRZGLOM4D5RNPHW5O6ZRGPGO4`
- **Build Tool:** `stellar-cli 25.1.0` with `RUSTFLAGS="-C target-feature=-reference-types"` and `stellar contract optimize`.
