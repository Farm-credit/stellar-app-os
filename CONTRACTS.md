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
| `tree-ownership` | Immutable tree sponsorship and ownership-transfer records on Stellar (transaction hash, ownership ledger, on-chain transfers) |

---

## Common Patterns

### Authorization

Functions marked **Admin-only** require the admin address (set at `initialize`) to sign the transaction. Functions marked **caller-auth** require the calling address to sign.

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
| `"can only rate after escrow is completed"` — Bating before job completion |
| `"only the original donor can rate the planter"` — Non-donor attempting to rate |
| `"sponsor has already rated this planter"` — Duplicate rating attempt |
| `"soil health score must be between 0 and 1000"` — Score outside valid range |
| `"baseline soil health score must be between 0 and 1000` — Baseline outside valid range |
| `"improvement score must be between 0 and 1000` — Improvement outside valid range |
| `"no soil health record for farmer"` | No record found for farmer |
| `"soil health record already exists for farmer"` | Duplicate registration attempt |
| `"carbon credits must be positive"` — `carbon_credits_awarded ≤ 0` |
| `"minimum purchase is 1 ton"` — `tons` ≤ 0 or fractional purchase below 1 ton |
| `"fractional purchase not allowed for this project"` — Project disabled fractionalization |
| `"project not found"` — Project ID has no registered carbon project |
| `"insufficient credits available"` — Requested tons exceed project remaining supply |
| `"sequestration bond required for afforestation projects"` — Afforestation deposit missing required sequestration bond |
| `"sequestration bond already posted for this escrow"` — Duplicate bond posting attempt |
| `"no sequestration bond for escrow"` — No bond record found for escrow |
| `"sequestration period not yet elapsed"` — 30-year leakage-prevention period has not completed |
| `"cannot release sequestration bond before 30 years"` — Attempting to release bond early |
| `"harvest detected during sequestration period"` — Tree harvest detected before 30 years — bond forfeited |
| `"sequestration bond amount must be positive` — `bond_amount ≤ 0` |
| `"tree id must be positive"` — `tree_id = 0` passed to `tree-ownership` |
| `"transaction hash must not be empty"` — Empty transaction hash passed to `tree-ownership` |
| `"owner address must not be the zero address"` — Invalid owner address |
| `"no ownership record for this tree"` — No ownership record found for tree |
| `"ownership record already exists for this tree"` — Duplicate registration attempt |
| `"only the current owner can transfer ownership"` — Non-owner attempting to transfer |
| `"new owner must differ from current owner"` — Self-transfer attempt |
| `"transfer transaction hash must not be empty"` — Empty transaction hash passed to `transfer_ownership` |

---

## escrow (Single-Tree Escrow & Sponsor Insurance #1021)

Manages single-tree sponsorships with optional **1-Year Survival Insurance Guarantee (#1021)** and **Platform Fee on Release (#467)**.

### Sponsor Insurance Overview
- **Optional Guarantee:** Sponsors can pay a *+2.00% fee** (200 bps) at deposit time (`deposit_with_insurance`) or add it to a pending deposit (`purchase_insurance`).
- **1-Year Survival Guarantee:** Protects the sponsor for 365 days (31_536_000 seconds).
- **Full Refund on Death:** If the tree dies within 1 year, the sponsor receives a **100% full refund** of their deposit via `claim_insurance_refund` or verifier `report_tree_dead`.

### Sequestration Bond Overview (#Leakage Prevention)
- **Required for Afforestation Projects:** Afforestation projects must post a sequestration bond or insurance guaranteeing trees are not harvested for 30 years.
- **30-Year Permanent Sequestration:** Bonds are locked for 30 years (946 080 000 seconds). Premature harvest forfeits the bond and prevents carbon leakage.
- **Leakage Prevention:** Bonds are released only after the 30-year sequestration period elapses, or forfeited if harvest is detected.

### `deposit_with_insurance`
Sponsor deposits funds for a tree with the 1-year survival guarantee. Transfers `amount + (amount * 2%)` from sponsor.

**Auth:** `sponsor` (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `sponsor` | `Address` | Sponsor paying for tree + 2% insurance guarantee |
| `planter` | `Address` | Planter planting the tree |
| `tree_id` | `u64` | Target tree ID |
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

### `post_sequestration_bond`
Posts a sequestration bond for an afforestation escrow, locked for 30 years to prevent carbon leakage from tree harvesting. Required for afforestation projects.

**Auth:** `sponsor` / `donor` (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `donor` | `Address` | Donor posting the sequestration bond |
| `farmer` | `Address` | Farmer beneficiary of the afforestation escrow |
| `token` | `Address` | SAC token contract address for the bond |
| `bond_amount` | `i128` | Bond amount locked for 30 years (must be > 0) |

**Returns:** `void`

**Events emitted:** `SequestrationBondPosted(donor, farmer) → (bond_amount, token, locked_until)`

**Errors:**
-  `"sequestration bond amount must be positive"` — `bond_amount ≤ 0`
-  `"sequestration bond already posted for this escrow"` — Duplicate bond posting attempt
-  `"no escrow for farmer"` — No escrow record found

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source donor \
  -- post_sequestration_bond \
    --donor GDONOR... \
    --farmer GFARMER... \
    --token USDC... \
    --bond_amount 50000000
```

```ts
await client.post_sequestration_bond({
  donor: donorAddress,
  farmer: farmerAddress,
  token: usdcAddress,
  bond_amount: BigInt(50_000_000),
});
```

---

### `release_sequestration_bond`
Releases a sequestration bond back to the donor after the 30-year sequestration period has elapsed. Prevents carbon leakage by ensuring trees are not harvested.

**Auth:** donor / admin

| Parameter | Type | Description |
|---|---|---|
| `donor` | `Address` | Donor who posted the bond |
| `farmer` | `Address` | Farmer beneficiary of the afforestation escrow |

**Returns:** `void`

**Events emitted:** `SequestrationBondReleased(donor, farmer) → (bond_amount, token)`

**Errors:**
-  `"no sequestration bond for escrow"` — No bond record found
-  `"sequestration period not yet elapsed"` — 30-year period has not completed
-  `"cannot release sequestration bond before 30 years"` — Attempting to release early
-  `"harvest detected during sequestration period"` — Tree harvest detected — bond forfeited

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source donor \
  -- release_sequestration_bond \
    --donor GDONOR... \
    --farmer GFARMER...
```

```ts
await client.release_sequestration_bond({
  donor: donorAddress,
  farmer: farmerAddress,
});
```

---

### `forfeit_sequestration_bond`
Forfeits a sequestration bond when tree harvest is detected during the 30-year sequestration period. The bond is sent to the admin/treasury to compensate for carbon leakage.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `donor` | `Address` | Donor who posted the bond |
| `farmer` | `Address` | Farmer beneficiary of the afforestation escrow |

**Returns:** `void`

**Events emitted:** `SequestrationBondForfeited(donor, farmer) → (bond_amount, token, reason)`*
**Errors:**
-  `"no sequestration bond for escrow"` — No bond record found
-  `"cannot forfeit sequestration bond after 30 years"` — Period already complete

### `get_sequestration_bond_info`
Returns `(has_bond: bool, bond_amount: i128, locked_until: u64, is_active: bool, is_forfeited: bool)`.

---

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
-  `"amount must be positive"` — `amount ≤ 0`
-  `"active escrow already exists for this farmer"` — farmer already has an open escrow |
-  `"planting density below minimum for job size"` — Job area meets threshold but density is too low |
-  `"area hectares must be positive"` — `area_hectares ≤ 0` |

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source donor \
  -- deposit \
    --donor GDONOR... \
    --farmer GFARMER... \
    --token USDC... \
    --amount 100000000 \
    --tree_count 100 \
    --area_hectares 1
```

```ts
await client.deposit({
  donor: donorAddress,
  farmer: farmerAddress,
  token: usdcAddress,
  amount: BigInt(100_000_000),
  tree_count: BigInt(100),
  area_hectares: BigInt(1),
});
```

---

## tree-ownership (Blockchain Tree Ownership Records)

Records tree sponsorship and ownership transfers on the Stellar blockchain for immutable, auditable provenance.

Each tree has an associated ownership record that stores the current owner, the transaction hash of the most recent on-chain action, and an append-only ledger of all ownership events. The ledger is viewable via `get_ownership_history`, which returns the full ownership chain including the blockchain transaction hash for each event.

### Overview
- **Immutable records:** Once an ownership event is recorded, it cannot be modified or deleted.
- **Transaction hash on profile:** The latest transaction hash is stored on the tree profile and returned by `get_ownership_record`.
- **On-chain transfers:** Ownership transfers between users are recorded on-chain with the transfer transaction hash.
- **Auditable ledger:** `get_ownership_history` returns the complete ownership chain for a tree.

### `initialize`
One-time setup. Must be called before any other function.

**Auth:** deployer (anyone, once)

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Administrator address authorized to record ownership events |

**Returns:** `void`

**Errors:** panics with `"already initialized"` if called again.

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source deployer \
  -- initialize \
    --admin GADMIN...
```

```ts
await client.initialize({
  admin: adminAddress,
});
```

---

### `record_sponsorship`
Records the initial sponsorship of a tree on-chain. Stores the owner address and the transaction hash of the sponsorship transaction on the tree profile.

**Auth:** admin-only

| Parameter | Type | Description |
|---|---|---|
| `tree_id` | `u64` | Target tree ID (must be > 0) |
| `owner` | `Address` | Sponsor who owns the tree |
| `tx_hash` | `String` | Stellar transaction hash of the sponsorship transaction |

**Returns:** `void`

**Events emitted:** `SponsorshipRecorded(tree_id) → (owner, tx_hash,```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source admin \
  -- record_sponsorship \
    --tree_id 1234 \
    --owner GSPONSOR... \
    --tx_hash 4a1b2c3d4e5f607a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f607a8b
```

```ts
await client.record_sponsorship({
  tree_id: BigInt(1234),
  owner: sponsorAddress,
  tx_hash: stellarTxHash,
});
```

---

### `transfer_ownership`
Records an ownership transfer between users on-chain. The current owner must authorize the transfer. Appends a new entry to the ownership ledger and updates the tree profile with the new owner and transaction hash.

**Auth:** current owner (caller-auth)

| Parameter | Type | Description |
|---|---|---|
| `tree_id` | `u64` | Target tree ID|
| `current_owner` | `Address` | Current owner of the tree (caller-auth) |
| `new_owner` | `Address` | Address receiving ownership |
| `tx_hash` | `String` | Stellar transaction hash of the transfer transaction |

**Returns:** `void`

**Events emitted:** `OwnershipTransferred(tree_id) → (from, to, tx_hash)`

**Errors:**
-  `"no ownership record for this tree"` — No ownership record found
-  `"only the current owner can transfer ownership"` — Non-owner attempting to transfer
-  `"new owner must differ from current owner"` — Self-transfer attempt
-  `"transfer transaction hash must not be empty"` — Empty transaction hash passed

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet --source current-owner \
  -- transfer_ownership \
    --tree_id 1234 \
    --current_owner GCURRENT... \
    --new_owner GNEW... \
    --tx_hash 4f5e6d7c8b9a0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e
```

```ts
await client.transfer_ownership({
  tree_id: BigInt(1234),
  current_owner: currentOwnerAddress,
  new_owner: newOwnerAddress,
  tx_hash: transferTxHash,
});
```

---

### `get_ownership_record`
Returns the current ownership record for a tree, including the transaction hash of the latest on-chain action.

**Auth:** none (read-only)

| Parameter | Type | Description |
|---|---|---|
| `tree_id` | `u64` | Target tree ID |

**Returns:** `(owner: Address, tx_hash: String, recorded_at: u64, updated_at: u64)`

**Errors:**
-  `"no ownership record for this tree"` — No ownership record found

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet \
  -- get_ownership_record \
    --tree_id 1234
```

```ts
const record = await client.get_ownership_record({ tree_id: BigInt(1234) });
```

---

### `get_ownership_history`
Returns the full ownership ledger for a tree as an ordered list of blockchain events. Each entry contains the event type (`Sponsorship` or `Transfer`), the from and to addresses, the transaction hash, and the ledger timestamp.

**Auth:** none (read-only)

| Parameter | Type | Description |
|---|---|---|
| `tree_id` | `u64` | Target tree ID |

**Returns:** `Vec<OwnershipEvent>` where `OwnershipEvent` is `(event_type: Symbol, from: Option<Address>, to: Address, tx_hash: String, timestamp: u64)`. The first entry is the initial sponsorship (`to` is the sponsor, `from` is `None`); subsequent entries are transfers.

**Errors:**
-  `"no ownership record for this tree"` — No ownership record found

```bash
stellar contract invoke \
  --id $CONTRACT_ID --network testnet \
  -- get_ownership_history \
    --tree_id 1234
```

```ts
const history = await client.get_ownership_history({ tree_id: BigInt(1234) });
for (const event of history) {
  console.log(event.event_type, event.from, event.to, event.tx_hash, event.timestamp);
}
```
