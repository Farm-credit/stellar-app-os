# FarmCredit Smart Contract API Reference

All contracts are deployed on the Stellar network (Soroban). Invoke them via the Stellar CLI or the `@stellar/stellar-sdk` JS client.

---

## Contracts

| Contract | Purpose |
|---|---|
| `escrow` | Single-tree sponsor escrow with optional 1-year survival insurance guarantee (#1021) and platform fees (#467) |
| `tree-escrow` | Two-tranche donor escrow (75% on planting, 25% after 6 months) with optional survival guarantee |
| `escrow-milestone` | Single-milestone escrow with remainder release |
| `donation-escrow` | Campaign donation escrow w/ XLM / USDC / EURC rails + recurring subscriptions |
| `location-proof` | ZK location proofs for Northern Nigeria boundary |
| `nullifier-registry` | SHA-256 commitment registry — prevents double-counting |
| `species-voting` | On-chain governance for adding new tree species to the catalogue |
| `soil-health` | Soil health scoring for regenerative farming practices + soil carbon sequestration bonus credits |

---

## Common Patterns

### Authorization

Functions marked **Admin-only** require the admin address (set at `initialize`) to sign the transaction. Functions marked **caller-auth** require the calling address to sign.

### Error Handling

Contracts panic with a descriptive string on invalid input. The Stellar SDK surfaces these as `InvokeHostFunctionError` with the panic message in `result_xdr`. Common patterns:

| Panic message | Meaning |
|---|---|
| `"already initialized" | `initialize` called more than once |
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
| `"can only rate after escrow is completed"` — Bating before job completion |
| `"only the original donor can rate the planter"` — Non-donor attempting to rate |
| `"sponsor has already rated this planter"` — Duplicate rating attempt |
| `"soil health score must be between 0 and 1000"` — Score outside valid range |
| `"baseline soil health score must be between 0 and 1000`` | Baseline outside valid range |
| `"improvement score must be between 0 and 1000`` | Improvement outside valid range |
| `"no soil health record for farmer"` | No record found for farmer |
| `"soil health record already exists for farmer"` | Duplicate registration attempt |
| `"carbon credits must be positive"` — `carbon_credits_awarded ≤ 0` |
| `"minimum purchase is 1 ton"` — `tons` ≤ 0 or fractional purchase below 1 ton |
| `"fractional purchase not allowed for this project"` — Project disabled fractionalization |
| `"project not found"` — Project ID has no registered carbon project |
| `"insufficient credits available"` — Requested tons exceed project remaining supply |

---

## escrow (Single-Tree Escrow & Sponsor Insurance #1021)

Manages single-tree sponsorships with optional **1-Year Survival Insurance Guarantee (#1021)** and **Platform Fee on Release (#467)**.

### Sponsor Insurance Overview
- **Optional Guarantee:** Sponsors can pay a **+2.00% fee** (200 bps) at deposit time (`deposit_with_insurance`) or add it to a pending deposit (`purchase_insurance`).
- **1-Year Survival Guarantee:** Protects the sponsor for 365 days (`31_536_000` seconds).
- **Full Refund on Death:** If the tree dies within 1 year, the sponsor receives a **100% full refund** of their deposit via `claim_insurance_refund` or verifier `report_tree_dead`.

### `deposit_with_insurance`
Sponsor deposits funds for a tree with the 1-year survival guarantee. Transfers `amount + (amount * 2%)` from sponsor.

**Auth:** `sponsor` (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `sponsor` | `Address` | Sponsor paying for tree + 2% insurance guarantee |
| `planter` | `Address` | Planter planting the tree |
| `tree_id` | `u64` x Target tree ID |
| `token` | `Address` | SAC token contract address |
| `amount` | `i128` | Tree deposit amount |

### `claim_insurance_refund`
Sponsor claims a 100% refund of deposit `amount` if their insured tree died within the 1year guarantee period.

**Auth:** `sponsor` (caller-auth)

### `report_tree_dead`
Verifier / admin marks an insured tree as dead, automatically refunding 100% of the deposit `amount` to the sponsor.

**Auth:** `verifier` / `admin`

### `get_insurance_info`
Returns `(has_insurance: bool, insurance_fee: i128, expires_at: u64, is_active: bool)`.

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

**Events emitted:** `DonationReceived(donor, farmer) → (amount, token)`**
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
| `proof_hash` | `BytesN32>` | SHA-256 of the GPS + photo proof payload |

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
    --proof_hash aabbbc...  # 32-byte hex
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
| `proof_hash` | `BytesN32>` | SHA-256 of the survival proof payload |
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

Admin confirms 1-milestone. Releases **Tranche 3 (30%)** to the farmer. Enforces that at least 1 year (≈ 52 weeks) has elapsed since `verify_planting`.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `farmer` | `Address` | Farmer whose escrow to complete |
| `proof_hash` | `BytesN32>` | SHA-256 of the year milestone proof payload |

**Returns:** `void`

**Events emitted:** `YearMilestone(farmer) → (tranche3_amount, proof_hash)`**
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

**Events emitted:** `DonationRefunded(donor, farmer) → total_amount)`

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
| `farmer` | `Address` | Farmer whose escrow record to retrieve |

---

## carbon-credits

Manages the lifecycle of voluntary carbon units (VCUs) minted from verified tree plantings. Supports **fractionalization** so retail buyers can purchase as little as **1 ton** of a larger project.

### Fractionalization Overview

- **Minimum Purchase:** 1 ton (`1 ton = 1_000_000_000` grams, i.e. credits are stored in grams of CO2-e). This replaces the old 100+ ton block model.
- **Fractional Purchase:** Any project can be marked `fractional_enabled` at registration. When enabled, buyers may purchase any integer number of tons ≥ 1.
- **Remaining Supply:** Each project tracks `total_tons` and `tons_sold`, and purchases fail with `"insufficient credits available"` if the request exceeds the remaining supply.

### `initialize`

One-time setup.

**Auth:** deployer (anyone, once)

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Admin address for project registration and minting |
| `carbon_token` | `Address` | CARBON token contract address |

### `register_project`

Registers a new carbon project with a total tonnage and fractionalization flag.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `project_id` | `u64` | Unique project identifier |
| `total_tons` | `i128` | Total CO2-e tonnage available (must be > 0) |
| `fractional_enabled` | `bool` | Whether retail 1-ton purchases are allowed |

### `purchase_credits`

Buyer purchases an integer number of tons from a project. Enforces the 1-ton minimum and the project's fractionalization flag.

**Auth:** `buyer` (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `buyer` | `Address` | Address paying for the credits |
| `project_id` | `u64` | Project to purchase from |
| `tons` | `i128` | Number of tons to buy (must be ≥ 1) |
| `token` | `Address` | SAC token contract for payment |

**Returns:** `void`

**Events emitted:** `CreditsPurchased(buyer, project_id) → (tons, amount,`)*
**Errors:**
- `"minimum purchase is 1 ton"` — `tons ≤ 0`
- `"fractional purchase not allowed for this project"` — Project disabled fractionalization and `tons <100` (legacy block mode)
- `"project not found"` — Project ID has no registered carbon project
- `"insufficient credits available"` — tons exceed project remaining supply

```ts
await client.purchase_credits({
  buyer: buyerAddress,
  project_id: BigInt(1),
  tons: BigInt(1),
  token: usdcAddress,
});
```

### `get_project`

Read-only. Returns `(total_tons, tons_sold, fractional_enabled).
