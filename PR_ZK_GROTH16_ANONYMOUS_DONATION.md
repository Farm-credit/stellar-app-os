# feat: Groth16 ZK Proof Verifier — Anonymous Donations (Circuit 1)

## Summary

Integrates a Groth16 zero-knowledge proof verifier into the Soroban smart contract layer, enabling fully anonymous donations on Stellar. Donors prove they are authorised to donate a given amount without ever exposing their wallet address on-chain. The existing 70/30 USDC split to the planting address and replanting buffer fund is preserved.

---

## Problem

The current donation flow links every on-chain payment directly to the donor's Stellar wallet address. This is a privacy concern for donors who want to contribute anonymously. There was no mechanism to accept a donation, verify its legitimacy, and record it on-chain without revealing who sent it.

---

## Solution

A new Soroban contract (`zk-verifier`) verifies a Groth16 proof generated client-side by the donor. The proof encodes a commitment to the donation amount and a nullifier hash — the donor's wallet address is never an input. Once the proof passes on-chain verification, the platform's fee-payer account builds and submits the 70/30 USDC payment transaction.

```
Donor device                    API server                    Stellar
─────────────────               ──────────────────            ──────────────────
generate proof(secret, amount)
        │
        ▼
POST /api/transaction/
  build-anonymous-donation ──► invokeVerifyProof()
  { proof, inputs,              (ZkVerifier contract)
    amount, network }                  │
                                       ▼
                               Groth16 verify ✓
                               nullifier check ✓
                               nullifier stored
                                       │
                               build 70/30 USDC tx
                                       │
        ◄──────────────────── transactionXdr
        │
sign with Freighter/Albedo
        │
        ▼
POST /api/transaction/submit ──────────────────────────────► confirmed
```

---

## What Changed

### Soroban Contract — `contracts/zk-verifier/`

**`src/groth16.rs`**
- BN254 Groth16 verifier with embedded compile-time VK constants (alpha G1, beta/gamma/delta G2, 3 IC points for Circuit 1's 2 public inputs)
- `groth16_verify(proof_a, proof_b, proof_c, public_inputs)` — validates G1/G2 point formats, checks all field elements are within the BN254 modulus, accumulates `vk_x = IC[0] + Σ(inputs[i] * IC[i+1])`, and runs the pairing check
- `g1_scalar_mul` via double-and-add over the 256-bit scalar
- `vk_hash(env)` — SHA-256 over the full VK for off-chain auditing
- Pairing check is structurally implemented with a clear `TODO` to swap in `env.crypto().bn254_pairing()` once Soroban exposes the precompile

**`src/lib.rs`**
- `ZkVerifier` contract with 4 public functions:
  - `initialize(admin)` — one-time setup, panics on re-init
  - `verify_proof(proof, inputs)` — atomic: Groth16 verify → nullifier check → nullifier write → event emit
  - `is_nullifier_spent(nullifier_hash)` — read-only lookup
  - `get_verification_key_hash()` — returns SHA-256 of embedded VK
- `ZkProof` struct: `a: BytesN<64>`, `b: BytesN<128>`, `c: BytesN<64>`
- `ProofInputs` struct: `commitment: BytesN<32>`, `nullifier_hash: BytesN<32>`
- `NullifierEntry` stored in persistent storage keyed by nullifier hash
- 6 unit tests: happy path, replay rejection, invalid proof rejection, multiple distinct nullifiers, VK hash determinism, double-init rejection

**`Cargo.toml`** — `cdylib` crate, soroban-sdk 21, release profile with `lto = true` / `panic = "abort"`

**`contracts/Cargo.toml`** — added `zk-verifier` to workspace members

---

### TypeScript — `lib/zk/`

**`types.ts`**
- `ZkProof` — hex-encoded G1/G2 proof components for JSON transport
- `ProofInputs` — `commitment` + `nullifierHash` (32-byte hex each)
- `GeneratedProof` — full output from the proof generator
- `SnarkjsProof` — typed snarkjs output shape
- `AnonymousDonationRequest` / `AnonymousDonationResponse` — API contract types

**`proof-generator.ts`**
- `generateDonationProof(donorSecret, amount, salt)` — derives commitment via `SHA-256(amount_bytes ∥ donor_secret)` and nullifier via `SHA-256(donor_secret ∥ salt)` using `crypto.subtle`, then calls `snarkjs.groth16.fullProve` against the circuit WASM/zkey
- `serialiseProof(snarkProof)` — converts snarkjs G1/G2 output (including G2 coordinate reversal) to hex byte arrays
- `deserialiseProof(raw)` / `deserialiseInputs(raw)` — schema validation with descriptive errors on malformed input (round-trip safe)

---

### TypeScript — `lib/stellar/`

**`zk-verifier-client.ts`**
- `invokeVerifyProof(proof, inputs, network)` — encodes `ZkProof` and `ProofInputs` as Soroban XDR ScVals, submits via the platform's fee-payer account (donor wallet never touches the verifier), simulates first to catch contract errors early, polls for confirmation, maps `INVALID_PROOF` / `NULLIFIER_ALREADY_SPENT` panics to typed errors

**`anonymous-donation.ts`**
- `processAnonymousDonation(amount, donorSecret, wallet, idempotencyKey)` — end-to-end service: generate proof → POST to API → sign with Freighter/Albedo → submit to Stellar network

---

### API — `app/api/transaction/build-anonymous-donation/route.ts`

- `POST /api/transaction/build-anonymous-donation`
- Validates body (proof, inputs, amount, network, idempotencyKey)
- Deserialises and validates proof byte lengths before hitting the chain
- Calls `invokeVerifyProof` — donor wallet address is never passed
- On success, builds the 70/30 USDC split transaction using the fee-payer account
- Error mapping:
  - `INVALID_PROOF` → HTTP 422
  - `NULLIFIER_ALREADY_SPENT` → HTTP 409
  - `UNSUPPORTED_NETWORK` → HTTP 400
  - Missing fields → HTTP 400

---

## Privacy Guarantee

The donor's wallet address appears **nowhere** in the Soroban contract invocation. The only on-chain data is:

| Field | On-chain? | Value |
|---|---|---|
| Donor wallet address | No | Never transmitted to contract |
| Donation commitment | Yes (public input) | `SHA-256(amount ∥ donor_secret)` |
| Nullifier hash | Yes (public input + stored) | `SHA-256(SHA-256(donor_secret ∥ salt))` |
| Donation amount | Yes (tx operation) | USD amount in USDC |

---

## Environment Variables Required

```bash
ZK_VERIFIER_CONTRACT_TESTNET=C...   # deployed zk-verifier contract ID on testnet
ZK_VERIFIER_CONTRACT_MAINNET=C...   # deployed zk-verifier contract ID on mainnet
STELLAR_FEE_PAYER_SECRET=S...       # platform fee-payer signing key
STELLAR_FEE_PAYER_PUBLIC_KEY=G...   # platform fee-payer public key
```

## Circuit Artifacts Required

Drop the compiled Circuit 1 artifacts into `public/circuits/`:
```
public/circuits/circuit1_donation.wasm
public/circuits/circuit1_donation_final.zkey
```

## Production Checklist

- [ ] Replace placeholder VK byte arrays in `groth16.rs` with real values from `snarkjs zkey export verificationkey`
- [ ] Replace `pairing_check_passes` with `env.crypto().bn254_pairing()` precompile call once Soroban exposes it
- [ ] Deploy `zk-verifier` contract and set env vars
- [ ] Drop circuit WASM + zkey into `public/circuits/`
- [ ] Run `cargo test -p zk-verifier` against the real VK

---

## How to Build & Test

```bash
# Soroban contract
cd contracts
cargo test -p zk-verifier
cargo build --release --target wasm32-unknown-unknown -p zk-verifier

# TypeScript
npm run type-check
```

---

## Related

- Spec: `.kiro/specs/zk-proof-verifier/requirements.md`
- Builds on: `contracts/nullifier-registry` (existing nullifier pattern)
- Circuit 2 (location verification) follows the same Soroban verification pattern — see `.kiro/specs/zk-location-verification/requirements.md`
