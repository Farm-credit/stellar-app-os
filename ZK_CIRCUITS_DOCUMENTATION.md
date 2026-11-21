# ZK Circuits Documentation

## Overview

The `contracts/zk-verifier` crate implements two on-chain zero-knowledge proof verifier circuits
for the Stellar App OS platform, built on Soroban (Stellar's smart-contract runtime).

Both circuits use **Groth16** proofs over the **BN254** (alt_bn128) elliptic curve. The underlying
cryptographic primitives live in `src/groth16.rs` and are shared by both circuits.

```
contracts/zk-verifier/src/
├── groth16.rs       — Shared BN254 / Groth16 primitives (VK, point ops, pairing check)
├── lib.rs           — Circuit 1: Anonymous Donation Verifier  (ZkVerifier contract)
└── range_proof.rs   — Circuit 3: Tree Growth Height Range Proof (ZkRangeVerifier contract)
```

---

## Shared Cryptographic Layer (`groth16.rs`)

### Proof System

Both circuits verify **Groth16** proofs. The verification equation is:

```
e(A, B) == e(alpha, beta) · e(vk_x, gamma) · e(C, delta)
```

where `vk_x = IC[0] + Σ( public_inputs[i] · IC[i+1] )`.

All elliptic curve operations are over **BN254** (prime field modulus `p ≈ 2.19 × 10⁷⁷`).

### Point Encoding

| Type | Size | Layout |
|------|------|--------|
| G1 point | 64 bytes | `x (32B) ∥ y (32B)`, big-endian |
| G2 point | 128 bytes | `x_re (32B) ∥ x_im (32B) ∥ y_re (32B) ∥ y_im (32B)`, big-endian |
| Scalar / field element | 32 bytes | big-endian, must be `< BN254_P` |

### Verification Key (VK)

The VK is **embedded as compile-time constants** and cannot be swapped post-deployment:

| Constant | Type | Description |
|----------|------|-------------|
| `VK_ALPHA_G1` | G1 (64B) | Alpha point |
| `VK_BETA_G2` | G2 (128B) | Beta point |
| `VK_GAMMA_G2` | G2 (128B) | Gamma point |
| `VK_DELTA_G2` | G2 (128B) | Delta point |
| `VK_IC[3]` | [G1; 3] | Input commitment points (IC[0] constant, IC[1] for commitment, IC[2] for nullifier_hash) |

> **Production note:** Replace the placeholder VK constants with the real values produced by
> `snarkjs groth16 setup` / `zkey export verificationkey` before deployment.

### Key Functions

| Function | Description |
|----------|-------------|
| `groth16_verify(a, b, c, inputs)` | Full Groth16 verification pipeline |
| `compute_vk_x(inputs)` | Accumulates public inputs into `vk_x` using 4-bit fixed-window scalar mul |
| `g1_scalar_mul(px, py, scalar)` | Scalar multiplication with 4-bit windowed method (~17% fewer ops vs double-and-add) |
| `g1_add(ax, ay, bx, by)` | G1 point addition (chord-and-tangent formula) |
| `is_valid_g1(point)` | Validates a 64-byte G1 point is non-infinity and within field bounds |
| `is_valid_g2(point)` | Validates a 128-byte G2 point is non-infinity and within field bounds |
| `is_valid_field_element(v)` | Checks `v < BN254_P` (lexicographic) |
| `vk_hash(env)` | SHA-256 of the full embedded VK for off-chain auditing |

> **Pairing check status:** The `pairing_check_passes` function is currently a structural
> placeholder. All G1/G2 point format validation runs correctly. The full Miller-loop +
> final-exponentiation pairing will be replaced with `env.crypto().bn254_pairing(...)` once
> Soroban exposes the host precompile.

---

## Circuit 1 — Anonymous Donation Verifier (`lib.rs`)

### Contract: `ZkVerifier`

Verifies Groth16 proofs for **anonymous on-chain donations**. The donor's wallet address is
never included in the proof inputs; only a donation commitment and a nullifier hash are public.

### Privacy Model

```
Off-chain (private):  donor_wallet, donation_amount, donor_secret
                              │
                              ▼
                     ZK circuit generates proof
                              │
                              ▼
On-chain (public):   commitment = Pedersen(amount, donor_secret)
                     nullifier_hash = H(donor_secret ∥ salt)
```

The nullifier hash prevents the same donation being counted twice without linking the proof
to any identity.

### Public Inputs

| Field | Type | Description |
|-------|------|-------------|
| `commitment` | `BytesN<32>` | Pedersen commitment to `(amount, donor_secret)` |
| `nullifier_hash` | `BytesN<32>` | `H(donor_secret ∥ salt)` — replay prevention |

### Storage Layout

| Key | Type | Scope | Description |
|-----|------|-------|-------------|
| `"ADMIN"` (symbol) | `Address` | Instance | Contract admin |
| `nullifier_hash` (BytesN<32>) | `NullifierEntry` | Persistent | Records spent nullifiers |

### Contract Interface

#### `initialize(admin: Address)`
One-time setup. Sets the admin address. Panics with `"already initialized"` if called again.

#### `verify_proof(proof: ZkProof, inputs: ProofInputs)`
Verifies a single Groth16 proof atomically:
1. Decode G1/G2 proof components
2. Run Groth16 verification against the embedded VK
3. Check nullifier is not already spent
4. Record the nullifier in persistent storage
5. Emit `(zkverify, donate)` event with the nullifier hash

Panics with `"INVALID_PROOF"` or `"NULLIFIER_ALREADY_SPENT"` on failure.

#### `batch_verify(proofs: Vec<ZkProof>, public_inputs: Vec<ProofInputs>) → Result<Vec<bool>, ZkError>`
Batch-verifies multiple proofs with **all-or-nothing atomicity** — if any proof fails,
the entire batch is rejected and no nullifiers are recorded.

Returns `Ok(Vec<bool>)` where every element is `true` on success, ordered by input index.

| Error | Code | Condition |
|-------|------|-----------|
| `EmptyBatch` | 1 | Both vectors are empty |
| `LengthMismatch` | 2 | `proofs.len() != public_inputs.len()` |
| `VerificationFailed` | 3 | Any proof fails or nullifier already spent |

#### `verify_proof_compressed(proof: ZkProof, compressed: CompressedProofInputs)`
Same as `verify_proof` but accepts packed inputs. Reduces per-proof ledger entry overhead
by ~50% by packing `commitment ∥ nullifier_hash` into a single 64-byte entry.

#### `batch_verify_compressed(proofs, compressed_inputs) → Result<Vec<bool>, ZkError>`
Batch equivalent of `verify_proof_compressed`.

#### `compress_inputs(commitment, nullifier_hash) → CompressedProofInputs`
Convenience helper to pack split inputs into `CompressedProofInputs`.

#### `is_nullifier_spent(nullifier_hash: BytesN<32>) → bool`
Read-only check — returns `true` if the nullifier has already been recorded on-chain.

#### `get_verification_key_hash(env: Env) → BytesN<32>`
Returns SHA-256 of the embedded VK. Used for off-chain auditing — compare against the
known VK hash to confirm the deployed contract uses the correct circuit.

### Data Types

```rust
// Groth16 proof components (BN254)
pub struct ZkProof {
    pub a: BytesN<64>,   // G1 point: x ∥ y
    pub b: BytesN<128>,  // G2 point: x_re ∥ x_im ∥ y_re ∥ y_im
    pub c: BytesN<64>,   // G1 point: x ∥ y
}

// Standard public inputs
pub struct ProofInputs {
    pub commitment:     BytesN<32>,  // Pedersen commitment
    pub nullifier_hash: BytesN<32>,  // Replay-prevention hash
}

// Compressed public inputs (saves ~50% ledger entry overhead)
pub struct CompressedProofInputs {
    pub packed: BytesN<64>,  // commitment (bytes 0..32) ∥ nullifier_hash (bytes 32..64)
}

// Stored per spent nullifier
pub struct NullifierEntry {
    pub nullifier_hash: BytesN<32>,
    pub spent_at:       u64,         // Ledger timestamp
}
```

### Error Codes

| Variant | Code | Meaning |
|---------|------|---------|
| `EmptyBatch` | 1 | Batch call with no proofs |
| `LengthMismatch` | 2 | Proof and input arrays differ in length |
| `VerificationFailed` | 3 | Proof invalid or nullifier replayed |

Panic messages for single-proof calls: `"INVALID_PROOF"`, `"NULLIFIER_ALREADY_SPENT"`.

---

## Circuit 3 — Tree Growth Height Range Proof (`range_proof.rs`)

### Contract: `ZkRangeVerifier`

Verifies zero-knowledge range proofs that validate **tree height growth metrics** fall within
biologically plausible bounds, without revealing raw sensor measurements on-chain.

### Privacy Model

```
Off-chain (private):  raw_height_mm (sensor reading)
                              │
                              ▼
             Oracle generates Groth16 range proof attesting:
                   MIN_HEIGHT_MM ≤ h ≤ MAX_HEIGHT_MM
                              │
                              ▼
On-chain (public):   height_commitment = Pedersen(h)
                     range_hash = SHA-256(MIN_HEIGHT_MM_padded ∥ MAX_HEIGHT_MM_padded)
                     tree_id    = 32-byte on-chain identifier
```

The raw height value is never recorded on-chain. Downstream contracts (e.g. `tree-registry`)
can trust the metric is within the approved bounds by checking the stored `GrowthRecord`.

### Global Bounds

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_HEIGHT_MM` | `10` | Minimum valid height (newly germinated seedling) |
| `MAX_HEIGHT_MM` | `50_000` | Maximum valid height (50 m tropical canopy) |
| `MAX_BATCH_RANGE` | `10` | Maximum proofs per batch submission |

### Public Inputs

| Field | Type | Description |
|-------|------|-------------|
| `height_commitment` | `BytesN<32>` | Pedersen commitment to the raw height `h` |
| `range_hash` | `BytesN<32>` | SHA-256(min_padded_32B ∥ max_padded_32B) |
| `tree_id` | `BytesN<32>` | On-chain tree identifier |

### Range Hash Encoding

```
range_hash = SHA-256(
    0x00...00 ∥ min_height_mm_be_4B  (32 bytes total)
    0x00...00 ∥ max_height_mm_be_4B  (32 bytes total)
)
```

Each bound is encoded as a 4-byte big-endian value placed in the last 4 bytes of a
32-byte zero-padded buffer, matching the circuit's field-element encoding.

### Storage Layout

| Key | Type | Scope | TTL |
|-----|------|-------|-----|
| `"ADMIN"` (symbol) | `Address` | Instance | ~7 days |
| `"PAUSED"` (symbol) | `bool` | Instance | ~7 days |
| `(THTCFG, tree_id)` | `TreeHeightConfig` | Persistent | ~30 days |
| `(GRANGE, tree_id)` | `GrowthRecord` | Persistent | ~30 days |
| `(RNULL, proof_id)` | `u64` (timestamp) | Persistent | ~30 days |

### Contract Interface

#### Lifecycle

**`initialize(admin: Address)`**  
One-time setup. Requires admin `require_auth()`. Panics with error `#2` (`AlreadyInitialized`)
if called again.

#### Admin Operations

**`register_tree(tree_id, min_height_mm, max_height_mm)`**  
Registers a new tree with its approved height bounds. Computes and stores `range_hash` so
future proof submissions only need a single 32-byte equality check.

**`update_tree_bounds(tree_id, min_height_mm, max_height_mm)`**  
Updates the height bounds for an existing tree. Recomputes `range_hash`. Previously verified
proofs are unaffected; new proofs must use the updated bounds.

**`pause()` / `unpause()`**  
Emergency circuit breaker. When paused, all proof submissions are rejected with
`ContractPaused` (#4). State is preserved across pause/unpause cycles.

All admin functions require `require_auth()` from the stored admin address.

#### Oracle Proof Submission

**`submit_growth_proof(oracle, proof, inputs, proof_id)`**  
Submits a single growth proof. Execution is fully atomic:

1. Assert contract is not paused
2. Oracle `require_auth()`
3. Validate all public input field elements are within BN254 bounds
4. Assert the tree is registered
5. Verify `range_hash` in inputs matches the stored tree config
6. Assert `proof_id` (nullifier) has not been spent
7. Run Groth16 structural verification
8. Record nullifier timestamp in persistent storage
9. Store `GrowthRecord` (overwrites previous — each tree retains only its latest)
10. Emit `(rngVerif, tree_id)` event

**`batch_submit_growth_proofs(oracle, proofs, inputs, proof_ids)`**  
Batch-submit up to `MAX_BATCH_RANGE` (10) proofs. Uses a **validate-all-then-write-all**
pattern for strict atomicity — the full validation pass runs before any state is written,
so a failure on any proof prevents partial writes.

A single `require_auth()` from the oracle covers the entire batch.

#### Read-Only Queries

| Function | Returns | Description |
|----------|---------|-------------|
| `get_growth_record(tree_id)` | `Option<GrowthRecord>` | Latest verified growth record for a tree |
| `get_tree_config(tree_id)` | `Option<TreeHeightConfig>` | Registered height bounds for a tree |
| `is_proof_spent(proof_id)` | `bool` | Whether a proof_id (nullifier) has been recorded |
| `is_paused()` | `bool` | Whether the contract is currently paused |
| `compute_range_hash(min, max)` | `BytesN<32>` | Off-chain helper to compute the expected range_hash |

### Data Types

```rust
// Groth16 proof components (identical layout to Circuit 1's ZkProof)
pub struct RangeProof {
    pub a: BytesN<64>,   // G1 point
    pub b: BytesN<128>,  // G2 point
    pub c: BytesN<64>,   // G1 point
}

// Public inputs for Circuit 3
pub struct RangeProofInputs {
    pub height_commitment: BytesN<32>,  // Pedersen commitment to raw height
    pub range_hash:        BytesN<32>,  // SHA-256 of the encoded bounds
    pub tree_id:           BytesN<32>,  // On-chain tree identifier
}

// Per-tree height bounds + precomputed range_hash
pub struct TreeHeightConfig {
    pub min_height_mm: u32,
    pub max_height_mm: u32,
    pub range_hash:    BytesN<32>,  // SHA-256(min_padded ∥ max_padded)
    pub registered_at: u64,         // Ledger timestamp
}

// Latest verified growth record stored per tree
pub struct GrowthRecord {
    pub height_commitment: BytesN<32>,  // Verified Pedersen commitment
    pub proof_id:          BytesN<32>,  // Nullifier (replay prevention)
    pub verified_ledger:   u32,         // Ledger sequence at verification time
    pub verified_at:       u64,         // Ledger timestamp at verification time
    pub oracle:            Address,     // Oracle that submitted the proof
}
```

### Error Codes

| Variant | Code | Meaning |
|---------|------|---------|
| `NotInitialized` | 1 | Contract not yet initialised |
| `AlreadyInitialized` | 2 | `initialize` called more than once |
| `Unauthorized` | 3 | Caller is not the admin |
| `ContractPaused` | 4 | Proof submission is paused |
| `ProofAlreadySpent` | 5 | Replay attempt — proof_id already recorded |
| `InvalidProof` | 6 | Groth16 structural verification failed |
| `RangeHashMismatch` | 7 | Proof's range_hash ≠ stored tree config hash |
| `TreeNotRegistered` | 8 | tree_id not found in storage |
| `TreeAlreadyRegistered` | 9 | tree_id already exists on register |
| `InvalidHeightBounds` | 10 | min ≥ max, or bounds outside global limits |
| `EmptyBatch` | 11 | Batch called with empty vectors |
| `BatchLengthMismatch` | 12 | proofs / inputs / proof_ids have different lengths |
| `BatchTooLarge` | 13 | Batch size exceeds `MAX_BATCH_RANGE` (10) |
| `InvalidFieldElement` | 14 | A public input is outside the BN254 field |

---

## Proof Submission Flow

### Single Proof (Circuit 1 — Anonymous Donation)

```
Donor (off-chain)
  │  generates Groth16 proof with commitment + nullifier_hash
  ▼
ZkVerifier::verify_proof(proof, inputs)
  │
  ├── groth16_verify(a, b, c, [commitment, nullifier_hash])
  │       ├── is_valid_g1(a), is_valid_g2(b), is_valid_g1(c)
  │       ├── is_valid_field_element for each input
  │       ├── compute_vk_x(inputs) → vk_x
  │       └── pairing_check_passes(...)  ← TODO: real precompile
  │
  ├── persistent.has(nullifier_hash)?  → panic NULLIFIER_ALREADY_SPENT
  │
  └── persistent.set(nullifier_hash, NullifierEntry { spent_at })
      events.publish((zkverify, donate), nullifier_hash)
```

### Single Proof (Circuit 3 — Tree Growth Range Proof)

```
Oracle (off-chain)
  │  generates Groth16 range proof for tree height
  ▼
ZkRangeVerifier::submit_growth_proof(oracle, proof, inputs, proof_id)
  │
  ├── assert_not_paused()
  ├── oracle.require_auth()
  ├── validate_proof_inputs()     — field element + G1/G2 checks (no storage)
  ├── get tree config             — panic TreeNotRegistered if missing
  ├── inputs.range_hash == config.range_hash?  → panic RangeHashMismatch
  ├── persistent.has(proof_id)?   → panic ProofAlreadySpent
  ├── groth16_verify(a, b, c, [height_commitment, range_hash, tree_id])
  │
  ├── persistent.set(nullifier_key, timestamp)
  ├── persistent.set(growth_key, GrowthRecord { ... })
  └── events.publish((rngVerif, tree_id), (height_commitment, proof_id))
```

### Batch Proof (Circuit 3 — Validate-All-Then-Write-All)

```
ZkRangeVerifier::batch_submit_growth_proofs(oracle, proofs, inputs, proof_ids)
  │
  ├── assert_not_paused()
  ├── oracle.require_auth()
  ├── check: non-empty, lengths match, size ≤ MAX_BATCH_RANGE
  │
  ├── VALIDATION PHASE (no state writes)
  │   └── for each i: validate_proof_inputs(proofs[i], inputs[i], proof_ids[i])
  │           → panic on first invalid — entire batch rejected, zero writes
  │
  └── WRITE PHASE (only reached if all validations pass)
      └── for each i: verify_and_record(oracle, proofs[i], inputs[i], proof_ids[i])
```

---

## Security Properties

| Property | Circuit 1 | Circuit 3 |
|----------|-----------|-----------|
| Replay prevention | Nullifier hash stored per proof | `proof_id` stored as nullifier |
| Identity privacy | Donor wallet never in public inputs | Raw height never on-chain |
| Atomic batch | All-or-nothing via `Result` propagation | Validate-all-then-write-all |
| VK immutability | Embedded as compile-time constants | Shared via `groth16.rs` |
| Admin gating | One-time `initialize` | `register_tree`, `pause/unpause` |
| Oracle auth | N/A | `oracle.require_auth()` per call |
| Emergency pause | N/A | `pause()` / `unpause()` by admin |
| Field element validation | In `groth16_verify` | Explicit `validate_proof_inputs` pass |
| Storage TTL management | N/A | Instance: ~7 days, Persistent: ~30 days |

---

## Off-Chain Integration Guide

### Computing `range_hash` (Circuit 3)

To generate a proof whose `range_hash` will match the on-chain config, encode the bounds
identically to `range_hash_internal`:

```python
import hashlib, struct

def compute_range_hash(min_mm: int, max_mm: int) -> bytes:
    # Each bound: 4-byte big-endian in the last 4 bytes of a 32-byte zero-padded buffer
    buf = bytearray(64)
    struct.pack_into('>I', buf, 28, min_mm)  # bytes 28..32
    struct.pack_into('>I', buf, 60, max_mm)  # bytes 60..64
    return hashlib.sha256(bytes(buf)).digest()
```

### Verifying the Deployed VK

```bash
# 1. Export the VK hash from the deployed contract
stellar contract invoke --id <CONTRACT_ID> \
  -- get_verification_key_hash

# 2. Compute the expected hash locally from your trusted setup artifacts
# and compare against the returned value
```

### Checking Nullifier / Proof Status

```bash
# Circuit 1 — check if a donation nullifier is spent
stellar contract invoke --id <ZK_VERIFIER_ID> \
  -- is_nullifier_spent --nullifier_hash <HEX>

# Circuit 3 — check if a proof_id is spent
stellar contract invoke --id <ZK_RANGE_VERIFIER_ID> \
  -- is_proof_spent --proof_id <HEX>

# Circuit 3 — retrieve latest growth record for a tree
stellar contract invoke --id <ZK_RANGE_VERIFIER_ID> \
  -- get_growth_record --tree_id <HEX>
```

---

## Test Coverage

Both circuits have comprehensive unit tests co-located in the source files.

### Circuit 1 Tests (`lib.rs`)

| Test | Covers |
|------|--------|
| `test_verify_proof_happy_path` | Valid proof accepted, nullifier recorded |
| `test_replay_rejected` | Same nullifier rejected on second call |
| `test_invalid_proof_rejected` | Zero-point proof fails validation |
| `test_different_nullifiers_both_accepted` | Independent proofs coexist |
| `test_get_verification_key_hash_is_deterministic` | VK hash stable across calls |
| `test_double_initialize_rejected` | Second `initialize` blocked |
| `test_batch_verify_single_valid_proof` | Batch of one works |
| `test_batch_verify_two_valid_proofs` | Batch of two, both nullifiers recorded |
| `test_batch_verify_five_valid_proofs` | Batch of five all succeed |
| `test_batch_verify_empty_arrays_returns_error` | `EmptyBatch` error returned |
| `test_batch_verify_mismatched_lengths_*` | `LengthMismatch` error returned |
| `test_batch_verify_first/middle/last_proof_invalid` | Single bad proof rejects whole batch |
| `test_batch_verify_nullifier_replay_in_batch` | Same nullifier twice in one batch fails |
| `test_batch_verify_does_not_partially_succeed` | No partial nullifier writes on failure |
| `test_batch_verify_results_ordered_by_input` | Result[i] corresponds to input[i] |
| `test_batch_verify_same_result_as_individual_calls` | Batch == sequential individual calls |
| `test_batch_verify_large_batch` | Batch of 10 proofs |
| Compressed inputs suite | `verify_proof_compressed`, `batch_verify_compressed`, `compress_inputs` |

### Circuit 3 Tests (`range_proof.rs`)

| Test | Covers |
|------|--------|
| `test_initialize_sets_admin` | Contract starts unpaused |
| `test_double_initialize_panics` | `AlreadyInitialized` (#2) |
| `test_register_tree_success` | Tree bounds stored correctly |
| `test_register_tree_stores_correct_range_hash` | Stored hash matches `compute_range_hash` |
| `test_register_duplicate_tree_panics` | `TreeAlreadyRegistered` (#9) |
| `test_register_tree_min_equals_max_panics` | `InvalidHeightBounds` (#10) |
| `test_register_tree_min_greater_than_max_panics` | `InvalidHeightBounds` (#10) |
| `test_register_tree_below_global_min_panics` | `InvalidHeightBounds` (#10) |
| `test_register_tree_above_global_max_panics` | `InvalidHeightBounds` (#10) |
| `test_update_tree_bounds_success` | Bounds and hash updated correctly |
| `test_update_unregistered_tree_panics` | `TreeNotRegistered` (#8) |
| `test_update_tree_invalid_bounds_panics` | `InvalidHeightBounds` (#10) |
| `test_pause_and_unpause` | `is_paused()` toggles correctly |
| `test_submit_proof_when_paused_panics` | `ContractPaused` (#4) |
| `test_submit_growth_proof_success` | Record stored, nullifier marked spent |
| `test_replay_same_proof_id_panics` | `ProofAlreadySpent` (#5) |
| `test_invalid_proof_rejected` | `InvalidProof` (#6) |
| `test_wrong_range_hash_panics` | `RangeHashMismatch` (#7) |
| `test_unregistered_tree_proof_panics` | `TreeNotRegistered` (#8) |
| `test_different_trees_can_each_have_proof` | Independent trees coexist |
| `test_latest_proof_overwrites_previous_growth_record` | Latest commitment stored |
| `test_compute_range_hash_is_deterministic` | Hash is stable |
| `test_compute_range_hash_different_bounds_differ` | Different bounds → different hashes |
| `test_batch_submit_three_proofs_success` | Batch of 3, all records written |
| `test_batch_empty_panics` | `EmptyBatch` (#11) |
| `test_batch_length_mismatch_panics` | `BatchLengthMismatch` (#12) |
| `test_batch_one_invalid_proof_aborts_all` | `InvalidProof` (#6), no partial writes |
| `test_batch_atomicity_no_partial_writes` | Validate-all-then-write-all confirmed |
| `test_batch_too_large_panics` | `BatchTooLarge` (#13) |
| `test_is_proof_spent_false_before_submission` | Nullifier clean before use |
| `test_get_growth_record_none_before_proof` | Record absent before submission |

---

## TODO / Production Checklist

- [ ] Replace placeholder VK constants in `groth16.rs` with real trusted-setup output
  (`snarkjs groth16 setup` → `zkey export verificationkey`)
- [ ] Replace `pairing_check_passes` stub with `env.crypto().bn254_pairing(...)` once
  Soroban exposes the BN254 pairing host precompile
- [ ] Add Circuit 3 VK constants (currently shares Circuit 1's VK — each circuit needs
  its own trusted setup)
- [ ] Run `cargo test` in `contracts/zk-verifier/` to confirm all tests pass after
  VK replacement
- [ ] Audit storage TTL values (`PERSISTENT_TTL_LEDGERS = 518_400`, `INSTANCE_TTL_LEDGERS = 120_960`)
  against expected ledger cadence before mainnet deployment
