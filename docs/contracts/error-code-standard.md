# Soroban Custom Error Code Standard

Status: **active** — version 1 (issue [#1813](https://github.com/Farm-credit/stellar-app-os/issues/1813))

## Problem

A Soroban `#[contracterror]` variant is serialized on-chain as a plain `u32`.
Before this standard, almost every contract numbered its errors from `1`:

| code | contract A | contract B | contract C |
| ---- | ---------- | ---------- | ---------- |
| 1 | `AlreadyInitialized` | `TokenAlreadyMinted` | `FarmerAlreadyRegistered` |
| 2 | `NotInitialized` | `TokenNotFound` | `FarmerNotRegistered` |
| 3 | `AmountMustBePositive` | `MetadataMismatch` | `InvalidRegion` |

An SDK client that only receives `{ contractId, error: 1 }` therefore cannot
tell which error actually happened. Codes above `100` collided as well
(`100..=118` was used simultaneously by the marketplace, donation escrow,
verifier staking, species catalog and the shared registry).

## Encoding

The standard partitions the 32-bit code into two independent fields:

```text
  31                    16 15                     0
+-------------------------+------------------------+
| namespace (16 bits)     | local code (16 bits)   |
+-------------------------+------------------------+
```

- `namespace == 0` is reserved for the **shared canonical registry**
  (`harvesta_errors::HarvestaError`). Its already deployed codes `1..=118` are
  kept unchanged, so no client mapping has to be rewritten.
- `namespace == N + 1` belongs to the crate at index `N` in the allocation
  table. Each crate owns the whole `2^16` block, so collisions between crates
  are impossible by construction.

The canonical, dependency-free implementation lives in
[`contracts/harvesta-errors/src/standard.rs`](../../contracts/harvesta-errors/src/standard.rs)
and is re-exported as `harvesta_errors::standard`. It is `no_std` and uses only
`core`, so contracts, indexers, CLI tools and SDK generators can share it.

## Normative rules

1. **Never renumber an existing variant.** On-chain history and frontend
   message maps depend on the integer value.
2. **New shared errors** are appended to `HarvestaError` using the next free
   code and `standard::SHARED_REGISTRY_LAST` is bumped. The new value must stay
   below `standard::NAMESPACE_SPAN`.
3. **New contract-specific errors** use the owning crate's block:
   `harvesta_errors::standard::global_code(CRATE_INDEX, local)`. Local codes
   start at `1` inside the block and must be unique within the crate.
4. **One error enum per crate.** A second `#[contracterror]` with overlapping
   values in the same crate is a bug. Legacy duplicates must be consolidated
   into the crate's single enum during migration.
5. **Frontends decode before interpreting:**
   `namespace = code >>> 16`, `local = code & 0xFFFF`. A non-zero namespace is
   the authoritative source of the error meaning, regardless of which contract
   emitted it.
6. The allocation table is checked at compile time (`const` assertions for
   disjointness and validity). Any change that makes ranges overlap fails the
   build.

## Shared canonical registry

`HarvestaError` contains 88 registered codes in the inclusive range `1..=118`.
The full, exhaustive list is available to tooling as
`harvesta_errors::ALL_HARVESTA_ERRORS`. Selected pinned values:

| code | variant |
| ---- | ------- |
| 3 | `Unauthorized` |
| 50 | `ProposalNotFound` |
| 60 | `CommitmentAlreadyRegistered` |
| 65 | `OutsideNigeriaRegion` |
| 118 | `WholesaleOrderNotFound` |

The auxiliary enums `GovernanceError`, `NftError` and `FarmerError` in the same
crate are **legacy** namespaces: they still start at `1` and therefore collide
with the shared range. They are exported as
`ALL_GOVERNANCE_ERRORS`, `ALL_NFT_ERRORS` and `ALL_FARMER_ERRORS` for migration
tracking. Do not add new variants to them; add the error to `HarvestaError` (or
to the consuming crate's own block) instead.

## Crate allocation table

`index` is the value passed to `global_code(index, local)`. Ranges are
inclusive and disjoint.

| index | crate | namespace | owned range (first-last) |
| ----- | ----- | --------- | ------------------------ |
| 0 | additionality-verifier | 0x01 | 0x010000-0x01FFFF (65536-131071) |
| 1 | admin-controls | 0x02 | 0x020000-0x02FFFF (131072-196607) |
| 2 | aggregate-impact-verifier | 0x03 | 0x030000-0x03FFFF (196608-262143) |
| 3 | atomic-swap | 0x04 | 0x040000-0x04FFFF (262144-327679) |
| 4 | auth-contract | 0x05 | 0x050000-0x05FFFF (327680-393215) |
| 5 | bonus-pool | 0x06 | 0x060000-0x06FFFF (393216-458751) |
| 6 | carbon-credits | 0x07 | 0x070000-0x07FFFF (458752-524287) |
| 7 | carbon-dex | 0x08 | 0x080000-0x08FFFF (524288-589823) |
| 8 | carbon-futures | 0x09 | 0x090000-0x09FFFF (589824-655359) |
| 9 | carbon-fractionalization | 0x0A | 0x0A0000-0x0AFFFF (655360-720895) |
| 10 | carbon-insurance | 0x0B | 0x0B0000-0x0BFFFF (720896-786431) |
| 11 | carbon-marketplace | 0x0C | 0x0C0000-0x0CFFFF (786432-851967) |
| 12 | carbon-price-oracle | 0x0D | 0x0D0000-0x0DFFFF (851968-917503) |
| 13 | community-offset-pool | 0x0E | 0x0E0000-0x0EFFFF (917504-983039) |
| 14 | contract-utils | 0x0F | 0x0F0000-0x0FFFFF (983040-1048575) |
| 15 | cross-chain-settlement | 0x10 | 0x100000-0x10FFFF (1048576-1114111) |
| 16 | donation-escrow | 0x11 | 0x110000-0x11FFFF (1114112-1179647) |
| 17 | escrow | 0x12 | 0x120000-0x12FFFF (1179648-1245183) |
| 18 | escrow-milestone | 0x13 | 0x130000-0x13FFFF (1245184-1310719) |
| 19 | farmer-bonus-pool | 0x14 | 0x140000-0x14FFFF (1310720-1376255) |
| 20 | farmer-escrow | 0x15 | 0x150000-0x15FFFF (1376256-1441791) |
| 21 | farmer-registry | 0x16 | 0x160000-0x16FFFF (1441792-1507327) |
| 22 | harvesta-errors | 0x17 | 0x170000-0x17FFFF (1507328-1572863) |
| 23 | insurance-pool | 0x18 | 0x180000-0x18FFFF (1572864-1638399) |
| 24 | kyc-attestation | 0x19 | 0x190000-0x19FFFF (1638400-1703935) |
| 25 | leaderboard | 0x1A | 0x1A0000-0x1AFFFF (1703936-1769471) |
| 26 | leakage-prevention | 0x1B | 0x1B0000-0x1BFFFF (1769472-1835007) |
| 27 | location-proof | 0x1C | 0x1C0000-0x1CFFFF (1835008-1900543) |
| 28 | naira-payout | 0x1D | 0x1D0000-0x1DFFFF (1900544-1966079) |
| 29 | nft-certificate | 0x1E | 0x1E0000-0x1EFFFF (1966080-2031615) |
| 30 | nullifier-registry | 0x1F | 0x1F0000-0x1FFFFF (2031616-2097151) |
| 31 | planter-blacklist | 0x20 | 0x200000-0x20FFFF (2097152-2162687) |
| 32 | planter-registry | 0x21 | 0x210000-0x21FFFF (2162688-2228223) |
| 33 | platform-governance | 0x22 | 0x220000-0x22FFFF (2228224-2293759) |
| 34 | planting-bond | 0x23 | 0x230000-0x23FFFF (2293760-2359295) |
| 35 | public-seal | 0x24 | 0x240000-0x24FFFF (2359296-2424831) |
| 36 | shared | 0x25 | 0x250000-0x25FFFF (2424832-2490367) |
| 37 | sponsor-receipt | 0x26 | 0x260000-0x26FFFF (2490368-2555903) |
| 38 | species-catalog | 0x27 | 0x270000-0x27FFFF (2555904-2621439) |
| 39 | species-registry | 0x28 | 0x280000-0x28FFFF (2621440-2686975) |
| 40 | species-voting | 0x29 | 0x290000-0x29FFFF (2686976-2752511) |
| 41 | staking-rewards | 0x2A | 0x2A0000-0x2AFFFF (2752512-2818047) |
| 42 | subscription-sponsorship | 0x2B | 0x2B0000-0x2BFFFF (2818048-2883583) |
| 43 | transparent-proxy | 0x2C | 0x2C0000-0x2CFFFF (2883584-2949119) |
| 44 | tree-escrow | 0x2D | 0x2D0000-0x2DFFFF (2949120-3014655) |
| 45 | tree-genetics | 0x2E | 0x2E0000-0x2EFFFF (3014656-3080191) |
| 46 | tree-registry | 0x2F | 0x2F0000-0x2FFFFF (3080192-3145727) |
| 47 | tree_registry (legacy orphan dir) | 0x30 | 0x300000-0x30FFFF (3145728-3211263) |
| 48 | tree-retirement | 0x31 | 0x310000-0x31FFFF (3211264-3276799) |
| 49 | tree-token | 0x32 | 0x320000-0x32FFFF (3276800-3342335) |
| 50 | treasury | 0x33 | 0x330000-0x33FFFF (3342336-3407871) |
| 51 | upgrade-timelock | 0x34 | 0x340000-0x34FFFF (3407872-3473407) |
| 52 | verifier-staking | 0x35 | 0x350000-0x35FFFF (3473408-3538943) |
| 53 | xlm-bridge | 0x36 | 0x360000-0x36FFFF (3538944-3604479) |
| 54 | zk-location-verifier | 0x37 | 0x370000-0x37FFFF (3604480-3670015) |
| 55 | zk-verifier | 0x38 | 0x380000-0x38FFFF (3670016-3735551) |

The same table is available at runtime/compile time as
`standard::CRATE_ERROR_RANGES`; `standard::crate_range_by_name("escrow")` and
`standard::origin_of(code)` provide lookups without hard-coding numbers.

## Contract usage

```rust
use harvesta_errors::standard;

// index 17 == "escrow", local code 1 == the first escrow-specific error.
pub const ESCROW_FIRST: u32 = standard::global_code(17, 1);
```

## Frontend usage

```ts
const SHARED = 0;

export function decodeSorobanError(code: number) {
  const namespace = code >>> 16;
  const local = code & 0xffff;
  if (namespace === SHARED) {
    return { source: "shared", code: local };
  }
  return { source: namespace, code: local };
}
```

Until a contract finishes migrating its legacy enums, clients can still use
`source === 0` to mean "shared/legacy code" and disambiguate by contract
address, exactly as before. After migration, `source` alone is authoritative.

## Migration backlog (legacy collisions)

These local enums still emit low codes that overlap the shared registry and
each other. They are listed so the migration can be tracked crate by crate;
each one should be replaced by values from its assigned block above:

- `additionality-verifier::AdditionalityError`, `bonus-pool::BonusPoolError`,
  `auth-contract::Error`, `atomic-swap::Error`, `carbon-credits::CarbonCreditsError`,
  `carbon-dex::Error`, `carbon-fractionalization::FractionError`,
  `carbon-futures::FuturesError`, `carbon-insurance::CarbonInsuranceError`,
  `community-offset-pool::PoolError`, `cross-chain-settlement::SwapError`,
  `escrow::EscrowError`, `farmer-bonus-pool::BonusPoolError`,
  `farmer-escrow::FarmerEscrowError`, `farmer-registry::Error`,
  `insurance-pool::InsurancePoolError`, `kyc-attestation::Error`,
  `leaderboard::Error`, `leakage-prevention::LeakageError`,
  `planter-registry::Error`, `planting-bond::Error`, `sponsor-receipt::Error`,
  `transparent-proxy::ProxyError`, `tree_registry::Error`,
  `upgrade-timelock::UpgradeTimelockError`, `xlm-bridge::XlmBridgeError`,
  `zk-verifier::ZkError`, `zk-verifier::RangeProofError`.

Legacy enums that already chose a high range (`nft-certificate::NftCertError`
300-310, `tree-retirement::RetirementError` 500-505, `tree-token::TreeTokenError`
14/83-94, `donation-escrow::DonationEscrowError` 82-98, `tree-registry::TreeRegistryError`
85-95, `verifier-staking::VerifierStakingError` 91-102, `species-catalog` 95-106,
`platform-governance::GovernanceError` 200-203, `marketplace::MarketplaceError`
100-117) must be moved into their crate's block as part of the same effort.

## Verification

The standard is enforced by 13 unit tests in `harvesta-errors` covering:

- shared code uniqueness (all 88 registered variants);
- internal uniqueness of the three auxiliary enums;
- every shared code inside `1..=118`;
- pinned regression values for widely used codes;
- disjointness and validity of all 56 allocations (also a compile-time `const`
  assertion);
- encode/decode round-trips and origin resolution for every crate.

Run locally with:

```sh
cd contracts
cargo fmt -p harvesta-errors -- --check
cargo test -p harvesta-errors
```
