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
| `species-voting` | On-chain governance for adding new tree species to the catalogue |

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
| `"must hold TREE tokens to vote"` | Voter has zero TREE token balance |
| `"already voted on this proposal"` | Duplicate vote attempt |
| `"proposal has not passed"` | Attempting to execute a non-passed proposal |
| `"planting density below minimum for job size"` — Job area meets threshold but density is too low |
| `"area hectares must be positive"` — `area_hectares ≤ 0` |
| `"survival not yet verified"` — Attempting to call 1-year milestone before survival check |
| `"1-year milestone period not yet elapsed"` — Called before 1 year elapsed since planting |
| `"rating must be between 1 and 5"` — Rating outside valid range |
| `"can only rate after escrow is completed"` — Rating before job completion |
| `"only the original donor can rate the planter"` — Non-donor attempting to rate |
| `"sponsor has already rated this planter"` — Duplicate rating attempt |

---

## tree-escrow

State machine: `Funded → Planted → Survived → Completed` (or `Funded → Refunded`)

**Time-Locked Milestones (#494):** Funds are released in 3 tranches:
- Tranche 1 (30%) at planting verification
- Tranche 2 (40%) at 6-month survival check
- Tranche 3 (30%) at 1-year milestone

**Minimum Planting Density Rule (#514):** For jobs with `area_hectares` ≥ `job_size_threshold`, the contract enforces a minimum planting density of `min_density` trees per hectare. Small jobs below the threshold are exempt from density rules.

**Planter Rating System (#483):** After job completion, sponsors can rate planters (1-5 stars). Ratings are stored on-chain and aggregated into a reputation score (0-100) to track planter performance over time.

**Minimum Planting Density Rule (#514):** For jobs with `area_hectares` ≥ `job_size_threshold`, the contract enforces a minimum planting density of `min_density` trees per hectare. Small jobs below the threshold are exempt from density rules.

### `initialize`

One-time setup. Must be called before any other function.

**Auth:** deployer (anyone, once)

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Address that will act as verifier/admin |
| `tree_token` | `Address` | TREE token contract address |
| `oracle` | `Address` | Oracle address for survival reports |
| `survival_threshold_percent` | `u32` | Minimum survival rate (0..=100) for Tranche 2 |
| `min_density` | `i128` | Minimum trees per hectare for large jobs |
| `job_size_threshold` | `i128` | Minimum job size (hectares) for density rules |

**Returns:** `void`

**Errors:** panics with `"already initialized"` if called again.

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source deployer \
  -- initialize \
    --admin GADMIN... \
    --tree_token GTREE... \
    --oracle GORACLE... \
    --survival_threshold_percent 70 \
    --min_density 1000 \
    --job_size_threshold 10
```

```ts
await client.initialize({
  admin: adminAddress,
  tree_token: treeTokenAddress,
  oracle: oracleAddress,
  survival_threshold_percent: 70,
  min_density: 1000,
  job_size_threshold: 10,
});
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
| `tree_count` | `i128` | Number of trees to be planted (must be > 0) |
| `area_hectares` | `i128` | Planting area in hectares (must be > 0) |

**Returns:** `void`

**Events emitted:** `DonationReceived(donor, farmer) → (amount, token)`

**Errors:**
- `"amount must be positive"` — `amount ≤ 0`
- `"active escrow already exists for this farmer"` — farmer already has an open escrow
- `"planting density below minimum for job size"` — Job area meets threshold but density is too low
- `"area hectares must be positive"` — `area_hectares ≤ 0`

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source donor \
  -- deposit \
    --donor GDONOR... \
    --farmer GFARMER... \
    --token GUSDC... \
    --amount 10000000 \
    --tree_count 5000 \
    --area_hectares 5
```

```ts
await client.deposit({
  donor: donorAddress,
  farmer: farmerAddress,
  token: usdcAddress,
  amount: BigInt(10_000_000), // 1 USDC (7 decimals)
  tree_count: BigInt(5_000),
  area_hectares: BigInt(5),
});
```

---

### `verify_planting`

Admin confirms GPS + photo proof of planting. Releases **Tranche 1 (30%)** of escrowed funds to the farmer immediately and mints TREE tokens.

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

Admin confirms 6-month survival check. Releases **Tranche 2 (40%)** to the farmer. Enforces that at least 6 months (≈ 26 weeks) have elapsed since `verify_planting` and survival rate meets threshold.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to update |
| `proof_hash` | `BytesN<32>` | SHA-256 of the survival proof payload |
| `survival_rate_percent` | `u32` | Survival rate (0..=100) |

**Returns:** `void`

**Events emitted:** `SurvivalVerified(farmer) → (tranche2_amount, proof_hash)`

**Errors:**
- `"planting not yet verified"` — status is not `Planted`
- `"6-month survival period not yet elapsed"` — called too early
- `"survival rate below minimum"` — survival rate below configured threshold
- `"nothing left to release"` — released amount already equals total

```ts
await client.verify_survival({
  farmer: farmerAddress,
  proof_hash: survivalProofHash,
  survival_rate_percent: 70,
});
```

---

### `verify_year_milestone`

Admin confirms 1-year milestone. Releases **Tranche 3 (30%)** to the farmer. Enforces that at least 1 year (≈ 52 weeks) has elapsed since `verify_planting`.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to complete |
| `proof_hash` | `BytesN<32>` | SHA-256 of the year milestone proof payload |

**Returns:** `void`

**Events emitted:** `YearMilestone(farmer) → (tranche3_amount, proof_hash)`

**Errors:**
- `"survival not yet verified"` — status is not `Survived`
- `"1-year milestone period not yet elapsed"` — called too early
- `"nothing left to release"` — released amount already equals total

```ts
await client.verify_year_milestone({
  farmer: farmerAddress,
  proof_hash: yearMilestoneProofHash,
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
// record.status: "Funded" | "Planted" | "Survived" | "Completed" | "Refunded"
// record.total_amount: bigint
// record.released: bigint
```

---

### `rate_planter`

Sponsor rates a planter after job completion. Rating must be 1-5 stars. Only callable by the original donor after escrow is completed. Each sponsor can only rate a specific planter once per escrow.

**Auth:** sponsor (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `sponsor` | `Address` | Sponsor/donor providing the rating |
| `farmer` | `Address` | Planter being rated |
| `rating` | `u32` | Rating from 1-5 stars |

**Returns:** `void`

**Events emitted:** `Rated(farmer) → (sponsor, rating)`

**Errors:**
- `"rating must be between 1 and 5"` — Rating outside valid range
- `"no escrow for farmer"` — No escrow record found
- `"only the original donor can rate the planter"` — Caller is not the donor
- `"can only rate after escrow is completed"` — Escrow not in Completed state
- `"sponsor has already rated this planter"` — Duplicate rating attempt

```ts
await client.rate_planter({
  sponsor: donorAddress,
  farmer: farmerAddress,
  rating: 5, // 1-5 stars
});
```

---

### `get_planter_reputation`

Query the aggregated reputation score for a planter.

**Auth:** public (no auth required)

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Planter address to look up |

**Returns:** `Option<PlanterReputation>` with fields:
- `total_ratings: u32` — Number of ratings received
- `sum_ratings: u128` — Sum of all ratings (1-5 each)
- `average_rating: u32` — Scaled average (0-100, where 100 = 5 stars)

```ts
const reputation = await client.get_planter_reputation({ farmer: farmerAddress });
if (reputation) {
  console.log(`Average rating: ${reputation.average_rating / 20} stars`);
  console.log(`Total ratings: ${reputation.total_ratings}`);
}
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

## species-voting

On-chain governance for adding new tree species to the species catalogue. TREE token holders can propose and vote on new species additions.

### `initialize`

One-time setup. Configures the voting contract with token and registry addresses.

**Auth:** deployer (anyone, once)

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Admin address for contract management |
| `tree_token` | `Address` | TREE token contract address |
| `species_registry` | `Address` | Species registry contract address |
| `voting_threshold` | `i128` | Minimum votes required (in token base units) |
| `voting_period` | `u64` | Voting window in seconds (default 604800 = 7 days) |

**Returns:** `void`

**Errors:** panics with `"already initialized"` if called again.

```ts
await client.initialize({
  admin: adminAddress,
  tree_token: treeTokenAddress,
  species_registry: speciesRegistryAddress,
  voting_threshold: BigInt(1_000_000),
  voting_period: BigInt(604800),
});
```

---

### `propose_species`

Create a new species proposal.

**Auth:** caller-auth (proposer)

| Parameter | Type | Description |
|---|---|---|
| `slug` | `Symbol` | Short identifier (e.g., "mahogany") |
| `name` | `String` | Human-readable name |
| `co2_scaled` | `i128` | kg CO₂/year × 100 |
| `maturity_years` | `u32` | Years to biomass maturity |

**Returns:** `void`

**Events emitted:** `proposal(created) → (id, slug, name)`

**Errors:**
- `"co2_scaled must be positive"` — `co2_scaled ≤ 0`
- `"maturity_years must be > 0"` — `maturity_years = 0`

```ts
await client.propose_species({
  slug: Symbol.short('mahogany'),
  name: String.fromString('Mahogany'),
  co2_scaled: BigInt(2500),
  maturity_years: 25,
});
```

---

### `vote`

Vote on a proposal. Voting power is proportional to TREE token holdings.

**Auth:** caller-auth (voter)

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | Proposal to vote on |
| `vote_for` | `bool` | true to vote for, false to vote against |

**Returns:** `void`

**Events emitted:** `vote(proposal_id) → (voter, vote_for, power)`

**Errors:**
- `"proposal not found"` — Invalid proposal ID
- `"proposal is not active"` — Proposal already closed
- `"voting period has ended"` — Past voting deadline
- `"already voted on this proposal"` — Duplicate vote
- `"must hold TREE tokens to vote"` — Zero token balance

```ts
await client.vote({
  proposal_id: 1,
  vote_for: true,
});
```

---

### `execute_proposal`

Execute a passed proposal to register the species in the species registry.

**Auth:** caller-auth (anyone)

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | Proposal to execute |

**Returns:** `void`

**Events emitted:** `proposal(executed) → (proposal_id, slug)`

**Errors:**
- `"proposal not found"` — Invalid proposal ID
- `"proposal has not passed"` — Proposal didn't meet threshold

```ts
await client.execute_proposal({
  proposal_id: 1,
});
```

---

### `get_proposal`

Read-only. Returns the full proposal record.

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | Proposal ID to look up |

**Returns:** `ProposalRecord`

```ts
const proposal = await client.get_proposal({ proposal_id: 1 });
// proposal.id, proposal.slug, proposal.name, proposal.co2_scaled
// proposal.maturity_years, proposal.proposer, proposal.votes_for
// proposal.votes_against, proposal.status, proposal.created_at
// proposal.voting_ends_at
```

---

### `get_vote`

Read-only. Returns a voter's record for a proposal.

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | Proposal ID |
| `voter` | `Address` | Voter address |

**Returns:** `Option<VoteRecord>`

---

### `proposal_count`

Read-only. Returns total number of proposals created.

**Returns:** `u64`

---

### `voting_threshold` / `voting_period`

Read-only. Returns current governance parameters.

**Returns:** `i128` / `u64`

---

### Admin Functions

#### `update_voting_threshold`

Update the minimum votes required for proposals to pass.

**Auth:** admin-only

```ts
await client.update_voting_threshold({
  new_threshold: BigInt(2_000_000),
});
```

#### `update_voting_period`

Update the voting window duration.

**Auth:** admin-only

```ts
await client.update_voting_period({
  new_period: BigInt(1_209_600), // 14 days
});
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
