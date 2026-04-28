# FarmCredit Smart Contract API Reference

All contracts are deployed on the Stellar network (Soroban). Invoke them via the Stellar CLI or the `@stellar/stellar-sdk` JS client.

---

## Contracts

| Contract | Purpose |
|---|---|
| `tree-escrow` | Two-tranche donor escrow (75% on planting, 25% after 6 months) |
| `escrow-milestone` | Single-milestone escrow with remainder release |
| `location-proof` | ZK location proofs for Northern Nigeria boundary |
| `nullifier-registry` | SHA-256 commitment registry — prevents double-counting |

---

## Common Patterns

### Authorization

Functions marked **admin-only** require the admin address (set at `initialize`) to sign the transaction. Functions marked **caller-auth** require the calling address to sign.

### Error Handling

Contracts panic with a descriptive string on invalid input. The Stellar SDK surfaces these as `InvokeHostFunctionError` with the panic message in `result_xdr`. Common patterns:

| Panic message | Meaning |
|---|---|
| `"already initialized"` | `initialize` called more than once |
| `"amount must be positive"` | `amount ≤ 0` passed to `deposit` |
| `"active escrow already exists for this farmer"` | Duplicate `deposit` for same farmer |
| `"no escrow for farmer"` / `"no escrow found for farmer"` | Farmer address has no escrow record |
| `"commitment already registered"` | Duplicate nullifier / replay attempt |
| `"location outside Northern Nigeria boundary"` | `in_region = false` passed to `submit_proof` |

---

## tree-escrow

State machine: `Funded → Planted → Completed` (or `Funded → Refunded`)

### `initialize`

One-time setup. Must be called before any other function.

**Auth:** deployer (anyone, once)

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Address that will act as verifier/admin |

**Returns:** `void`

**Errors:** panics with `"already initialized"` if called again.

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source deployer \
  -- initialize --admin GADMIN...
```

```ts
await client.initialize({ admin: adminAddress });
```

---

### `deposit`

Donor deposits funds into escrow for a specific farmer. Transfers `amount` of `token` from `donor` into the contract.

**Auth:** `donor` (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `donor` | `Address` | Address funding the escrow |
| `farmer` | `Address` | Beneficiary farmer address |
| `token` | `Address` | SAC token contract address (e.g. USDC) |
| `amount` | `i128` | Amount in token's smallest unit (must be > 0) |

**Returns:** `void`

**Events emitted:** `DonationReceived(donor, farmer) → (amount, token)`

**Errors:**
- `"amount must be positive"` — `amount ≤ 0`
- `"active escrow already exists for this farmer"` — farmer already has an open escrow

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source donor \
  -- deposit \
    --donor GDONOR... \
    --farmer GFARMER... \
    --token GUSDC... \
    --amount 10000000
```

```ts
await client.deposit({
  donor: donorAddress,
  farmer: farmerAddress,
  token: usdcAddress,
  amount: BigInt(10_000_000), // 1 USDC (7 decimals)
});
```

---

### `verify_planting`

Admin confirms GPS + photo proof of planting. Releases **75%** of escrowed funds to the farmer immediately.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to update |
| `proof_hash` | `BytesN<32>` | SHA-256 of the GPS + photo proof payload |

**Returns:** `void`

**Events emitted:** `PlantingVerified(farmer) → (tranche1_amount, proof_hash)`

**Errors:**
- `"planting already verified or escrow not active"` — status is not `Funded`
- `"no escrow for farmer"` — no escrow record found

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source admin \
  -- verify_planting \
    --farmer GFARMER... \
    --proof_hash aabbcc...  # 32-byte hex
```

```ts
const proofHash = Buffer.from(sha256(proofPayload));
await client.verify_planting({
  farmer: farmerAddress,
  proof_hash: proofHash,
});
```

---

### `verify_survival`

Admin confirms 6-month survival check. Releases the remaining **25%** to the farmer. Enforces that at least 6 months (≈ 26 weeks) have elapsed since `verify_planting`.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to complete |
| `proof_hash` | `BytesN<32>` | SHA-256 of the survival proof payload |

**Returns:** `void`

**Events emitted:** `SurvivalVerified(farmer) → (tranche2_amount, proof_hash)`

**Errors:**
- `"planting not yet verified"` — status is not `Planted`
- `"6-month survival period not yet elapsed"` — called too early
- `"nothing left to release"` — released amount already equals total

```ts
await client.verify_survival({
  farmer: farmerAddress,
  proof_hash: survivalProofHash,
});
```

---

### `refund`

Returns the full escrowed amount to the donor. Only callable before planting is verified.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to refund |

**Returns:** `void`

**Events emitted:** `DonationRefunded(donor, farmer) → total_amount`

**Errors:**
- `"cannot refund after planting has been verified"` — status is not `Funded`

```ts
await client.refund({ farmer: farmerAddress });
```

---

### `get_record`

Read-only. Returns the full escrow record for a farmer.

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer address to look up |

**Returns:** `Option<EscrowRecord>`

```ts
const record = await client.get_record({ farmer: farmerAddress });
// record.status: "Funded" | "Planted" | "Completed" | "Refunded"
// record.total_amount: bigint
// record.released: bigint
```

---

## escrow-milestone

Simplified single-milestone escrow. Same 75%/25% split but without the 6-month time lock.

### `initialize` / `deposit` / `refund` / `get_escrow`

Identical signatures to `tree-escrow`. See above.

---

### `verify_milestone`

Admin confirms GPS + photo proof. Releases **75%** to the farmer.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer to release funds to |
| `verification_hash` | `BytesN<32>` | SHA-256 of the proof payload |

**Returns:** `void`

**Events emitted:** `PlantingVerified(farmer) → (release_amount, verification_hash)`

**Errors:**
- `"milestone already processed or escrow not in funded state"`

```ts
await client.verify_milestone({
  farmer: farmerAddress,
  verification_hash: proofHash,
});
```

---

### `release_remainder`

Admin releases the remaining **25%** after the final milestone.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer to receive remainder |

**Returns:** `void`

**Events emitted:** `MilestonePaymentReleased(farmer) → remainder`

**Errors:**
- `"first milestone not yet verified"` — `verify_milestone` not yet called
- `"nothing left to release"`

```ts
await client.release_remainder({ farmer: farmerAddress });
```

---

## location-proof

Stores ZK location proofs attesting a farmer's GPS coordinates fall within the Northern Nigeria bounding box (lat 4°–14°N, lon 3°–15°E) without revealing raw coordinates.

**Commitment scheme:** `SHA-256(lat_i32_be ‖ lon_i32_be ‖ farmer_id_xdr ‖ nonce_be)`

### `initialize`

Same as other contracts. Sets the verifier address.

---

### `submit_proof`

Verifier submits a ZK location proof for a farmer.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer_id` | `Address` | Farmer's Stellar address |
| `commitment` | `BytesN<32>` | SHA-256 commitment of location data |
| `in_region` | `bool` | Must be `true` — prover attests point is in Northern Nigeria |
| `nonce` | `u64` | Monotonically increasing per-farmer counter (replay protection) |

**Returns:** `void`

**Events emitted:** `loc_proof(farmer_id) → commitment`

**Errors:**
- `"location outside Northern Nigeria boundary"` — `in_region` is `false`
- `"proof commitment already registered"` — duplicate commitment (replay)

```ts
const commitment = sha256(
  Buffer.concat([latI32BE, lonI32BE, farmerIdXdr, nonceBE])
);
await client.submit_proof({
  farmer_id: farmerAddress,
  commitment,
  in_region: true,
  nonce: BigInt(1),
});
```

---

### `get_proof`

Returns the proof entry for a commitment.

| Parameter | Type | Description |
|---|---|---|
| `commitment` | `BytesN<32>` | The commitment hash to look up |

**Returns:** `Option<LocationProofEntry>`

```ts
const entry = await client.get_proof({ commitment });
// entry.farmer_id, entry.in_region, entry.submitted_at, entry.nonce
```

---

### `is_proven`

Returns `true` if the commitment is registered.

| Parameter | Type | Description |
|---|---|---|
| `commitment` | `BytesN<32>` | Commitment to check |

**Returns:** `bool`

---

## nullifier-registry

Prevents double-counting of tree planting events by storing SHA-256 commitments on-chain.

**Commitment scheme:** `SHA-256(gps_xdr ‖ timestamp_be_8 ‖ farmer_id_xdr)`

### `initialize`

Same as other contracts.

---

### `register`

Farmer registers a tree commitment. Panics if the same commitment already exists.

**Auth:** `farmer_id` (caller-auth — the farmer signs)

| Parameter | Type | Description |
|---|---|---|
| `input.gps` | `String` | GPS coordinates, e.g. `"-1.2345,36.8219"` |
| `input.timestamp` | `u64` | Unix timestamp (seconds) of the planting event |
| `input.farmer_id` | `Address` | Farmer's Stellar address |

**Returns:** `BytesN<32>` — the computed commitment hash

**Events emitted:** `FarmerRegistered(farmer_id) → commitment`

**Errors:**
- `"commitment already registered: double-counting rejected"` — identical input submitted twice

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source farmer \
  -- register \
    --input '{"gps":"-1.2345,36.8219","timestamp":1700000000,"farmer_id":"GFARMER..."}'
```

```ts
const commitment = await client.register({
  input: {
    gps: '-1.2345,36.8219',
    timestamp: BigInt(1_700_000_000),
    farmer_id: farmerAddress,
  },
});
```

---

### `compute_commitment`

Read-only. Computes the commitment hash without writing to storage. Useful for pre-computing before calling `register`.

| Parameter | Type | Description |
|---|---|---|
| `input` | `TreeCommitmentInput` | Same as `register` |

**Returns:** `BytesN<32>`

```ts
const hash = await client.compute_commitment({ input });
```

---

### `is_registered`

Returns `true` if the commitment is already in the registry.

| Parameter | Type | Description |
|---|---|---|
| `commitment` | `BytesN<32>` | Commitment to check |

**Returns:** `bool`

---

### `get_entry`

Returns the full registry entry for a commitment.

| Parameter | Type | Description |
|---|---|---|
| `commitment` | `BytesN<32>` | Commitment to look up |

**Returns:** `Option<NullifierEntry>`

```ts
const entry = await client.get_entry({ commitment });
// entry.farmer_id, entry.registered_at
```

---

## Required Secrets (GitHub Actions / Deployment)

| Secret | Used by |
|---|---|
| `TESTNET_DEPLOYER_SECRET` | `contracts.yml` — Stellar keypair for deploying contracts |
| `VERCEL_TOKEN` | `deploy.yml` |
| `VERCEL_ORG_ID` | `deploy.yml` |
| `VERCEL_PROJECT_ID` | `deploy.yml` |

Contract IDs after testnet deployment are printed to the GitHub Actions job summary and must be set as `NEXT_PUBLIC_CONTRACT_*` environment variables.
