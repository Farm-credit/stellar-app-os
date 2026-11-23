# Species Registry — ecological yield multipliers (issue [#1807](https://github.com/Farm-credit/stellar-app-os/issues/1807))

Status: **implemented** — crate `contracts/species-registry`.

## Purpose

The registry started (issue #554) as a passive lookup table: `slug → CO₂ kg/yr,
years to maturity`. Every species was therefore credited at its raw FAO/IPCC
Tier-1 mature-tree rate, which treats a slow-growing native hardwood and a
short-rotation introduced plantation crop as ecologically interchangeable. This
change assigns each species an **ecological yield multiplier** so that carbon
credits reflect the ecological value of what was planted, while keeping the
original baseline rate intact and auditable.

## Multiplier policy

Rates are integers scaled ×100 (`co2_scaled`) and multipliers are expressed in
**basis points**: `10_000 bps = 1.00×`.

| Category | Built-in multiplier | Rationale |
| -------- | ------------------- | --------- |
| `Native` | `12_000` (1.20×) | Native to the project's biome: local biodiversity, seed source, permanence. |
| `FastGrowing` | `8_000` (0.80×) | Quick-growing, usually introduced plantation species: high gross uptake but lower permanence and biodiversity value. |
| `Unclassified` | `10_000` (1.00×) | Neutral. Every record written before #1807 lands here, so historical rates are unchanged. |

```text
effective_co2_scaled = co2_scaled × yield_multiplier_bps / 10_000
```

The multiplication truncates toward zero (Soroban integer division). Example:
teak at `2200` (22.00 kg/yr) classified `Native` → `2200 × 12_000 / 10_000 =
2640` (26.40 kg/yr of credited sequestration). Eucalyptus at `3100` classified
`FastGrowing` → `2480`, i.e. it still sequesters more per year than the teak in
absolute terms, but earns less credit per tonne.

Admin-set multipliers are bounded to `1_000..=30_000` bps (0.10×–3.00×) — see
`MIN_MULTIPLIER_BPS` / `MAX_MULTIPLIER_BPS`. The floor stops a typo from
reducing a species to a rounding-error rate; the ceiling stops one species from
capturing an outsized share of an issuance round. Out-of-range values are
rejected with `InvalidMultiplier` (`2_621_441`, global error code `64` in the
harvesta error map).

## Two layers of control

1. **Per-category default** (`set_category_multiplier`) — what future
   registrations of that category receive. Changing it does **not** rewrite
   existing records: a species' multiplier is snapshotted at registration so an
   issuance round already priced on it stays reproducible.
2. **Per-species override** (`set_species_multiplier`) — wins over the category
   default and survives later category-default changes. It is replaced only by
   another override or by `classify_species`.

`classify_species` is the migration path for records seeded before #1807: it
keeps `co2_scaled` and `maturity_years` untouched, sets the category and snaps
the multiplier to that category's current default (resetting any override —
re-apply it afterwards if the species still needs one).

## Interface

| Function | Auth | Description |
| -------- | ---- | ----------- |
| `initialize(admin)` | — | One-time admin bootstrap; reverts with `AlreadyInitialized`. |
| `register_species(slug, co2_scaled, maturity_years)` | admin | Legacy (#554) path: registers as `Unclassified`, neutral 1.00×. |
| `register_classified_species(slug, co2_scaled, maturity_years, category)` | admin | Registers with the category's current default multiplier. |
| `classify_species(slug, category)` | admin | Re-classifies an existing record; resets the multiplier to the category default. |
| `set_species_multiplier(slug, bps)` | admin | Per-species override (`1_000..=30_000`). |
| `set_category_multiplier(category, bps)` | admin | Category default for future registrations. |
| `get_species(slug)` | — | Full `SpeciesRecord` (base rate, maturity, category, multiplier, `updated_at`). |
| `get_co2_rate(slug)` | — | Base rate only — unchanged since #554. |
| `get_effective_co2_rate(slug)` | — | Multiplier-adjusted rate; use this for credit issuance. |
| `get_multiplier(slug)` / `get_category(slug)` | — | Stored multiplier / category. |
| `get_category_multiplier(category)` | — | Current default for a category (override or built-in). |

All write paths require the stored admin's authorization; reading an unknown
slug reverts with `SpeciesNotFound`.

## Events

Published under the `species` topic so indexers can rebuild both the raw and the
credited rate from the ledger alone.

| Topics | Data | Emitted by |
| ------ | ---- | ---------- |
| `(species, register)` | `(slug, co2_scaled, maturity_years)` | every registration |
| `(species, classify)` | `(slug, category_code, multiplier_bps)` | registrations and `classify_species` |
| `(species, setmult)` | `(slug, multiplier_bps)` | `set_species_multiplier` |
| `(species, catmult)` | `(category_code, multiplier_bps)` | `set_category_multiplier` |

`category_code` is the stable on-chain code: `0 = Unclassified`, `1 = Native`,
`2 = FastGrowing`. The codes are part of the observable interface — never
renumber them.

## Storage

| Key | Type | Space | Notes |
| --- | ---- | ----- | ----- |
| `ADMIN` | `Address` | instance | Set once by `initialize`. |
| `("SPECIES", slug)` | `SpeciesRecord` | persistent | Includes `category` and `yield_multiplier_bps`. |
| `("CATMULT", category_code)` | `u32` | instance | Only present after an admin override; absence means the built-in default. |

## Seeder classification

`data/fao_co2_rates.csv` gained a `species_category` column
(`native` / `fast_growing` / `unclassified`) and `scripts/seed-species.mjs`
registers classified rows through `register_classified_species`.

A fieldless Soroban enum is a union with void cases, so the argument is a
**one-element `Vec` holding the variant name as a `Symbol`** —
`xdr.ScVal.scvVec([nativeToScVal('FastGrowing', { type: 'symbol' })])` — not a
bare symbol and not the integer code used in events. The contract test
`test_category_wire_format_is_variant_symbol_in_vec` pins this format and
rejects both alternatives; changing it would silently break seeding.

Unknown or blank values fall back to the legacy `register_species` path with a
console warning, so seeding never fails on a typo in the CSV.

Current assignments (West African project biomes):

| Species | Category | Note |
| ------- | -------- | ---- |
| mangrove, acacia, mahogany, baobab, iroko, shea, locust_bean | `native` | Native to West African forest / savanna / mangrove biomes. |
| moringa, eucalyptus, bamboo, cedar, pine, cashew | `fast_growing` | Introduced, fast-establishing plantation species. |
| teak, neem | `unclassified` | Introduced but long-rotation / naturalised; awaiting ecological review — neutral 1.00× until then. |

To reclassify a species on chain without re-seeding, call
`classify_species(slug, category)` from the admin key.

## Compatibility and regression notes

* `register_species`, `get_species`, `get_co2_rate` keep their signatures and
  semantics; `SpeciesRecord` only gained trailing fields, and legacy records
  decode as `Unclassified`/1.00×.
* Because the neutral multiplier is exactly `10_000`, `get_effective_co2_rate`
  equals `get_co2_rate` for every pre-#1807 record — no existing tests, UI or
  issuance path changes behaviour until a species is explicitly classified.
* `co2_scaled`, not the adjusted rate, remains the stored baseline; consumers
  that must account for ecology should call `get_effective_co2_rate`.
