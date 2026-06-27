# feat(backend): Species data seeder — FAO CO₂ rates CSV → DB + on-chain contract

## Summary

This PR implements issue #554.  It introduces a full pipeline for loading FAO/IPCC Tier-1 biomass CO₂ sequestration rates from a curated CSV into both PostgreSQL and the new Soroban `species-registry` smart contract.

---

## Changes

### 1. `data/fao_co2_rates.csv`

A curated reference dataset of **15 tree species** sourced from FAO FRA 2020 and IPCC 2006 Vol.4 Ch.4.

Columns:

| Column | Description |
|---|---|
| `slug` | Short unique key (`teak`, `moringa`, …) |
| `common_name` | Human-readable name |
| `scientific_name` | Latin binomial |
| `co2_kg_per_year` | Average kg CO₂ sequestered per tree per year |
| `maturity_years` | Years to biomass maturity |
| `biome` | Typical biome (e.g. "Tropical moist forest") |
| `native_regions` | ISO 3166-1 alpha-2 codes of primary planting countries |
| `source_ref` | Data source citation |

Species included: Teak, Moringa, Eucalyptus, Mangrove, Acacia, Neem, African Mahogany, Baobab, Bamboo (Moso), West African Cedar, Caribbean Pine, Iroko, Shea, Cashew, African Locust Bean.

---

### 2. `db/migrations/002_create_species_catalogue.sql`

Creates the `species_catalogue` PostgreSQL table with:

- `slug TEXT PRIMARY KEY` — matches CSV slug
- `common_name`, `scientific_name`
- `co2_kg_per_year NUMERIC(10,2)` — positive check constraint
- `maturity_years INTEGER` — positive check constraint
- `biome`, `native_regions`, `source_ref`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Index on `biome` for regional filtering queries

---

### 3. `scripts/seed-species.mjs`

ESM Node.js script that:

1. **Parses** `data/fao_co2_rates.csv` using Node's built-in `readline` (no extra dependencies).
2. **Upserts** every row into `species_catalogue` via a single `BEGIN`/`COMMIT` transaction (`ON CONFLICT (slug) DO UPDATE`) so re-runs are idempotent.
3. **Registers** each species on-chain via the `species-registry` Soroban contract (`register_species` invocations), when `SPECIES_REGISTRY_ID` and `ADMIN_SECRET` are set.  Skips on-chain seeding gracefully when either env var is absent — safe for CI/CD environments without a live network.

**Required env vars:**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SPECIES_REGISTRY_ID` | Deployed species-registry contract ID *(optional — skips on-chain if unset)* |
| `STELLAR_NETWORK` | `testnet` \| `mainnet` *(default: testnet)* |
| `ADMIN_SECRET` | Stellar secret key of the contract admin *(optional)* |

**Usage:**

```bash
# Run migration first
npm run db:migrate:species

# Seed DB (and optionally on-chain)
npm run seed:species
```

---

### 4. `contracts/species-registry/` — new Soroban contract

A minimal, auditable Soroban contract (`#![no_std]`) that stores species records on-chain.

**Storage layout:**

- Instance: `ADMIN` → admin `Address`
- Persistent: `(SPECIES, slug)` → `SpeciesRecord { slug, co2_scaled, maturity_years, updated_at }`

`co2_scaled` is kg CO₂/year × 100 (integer) to avoid floating-point on-chain.  The seeder divides by 100 when displaying or comparing off-chain.

**Public functions:**

| Function | Auth | Description |
|---|---|---|
| `initialize(admin)` | — | One-time setup; panics if already initialized |
| `register_species(slug, co2_scaled, maturity_years)` | admin | Upsert a species record; emits `species/register` event |
| `get_species(slug)` | public | Returns full `SpeciesRecord`; panics if slug unknown |
| `get_co2_rate(slug)` | public | Returns `co2_scaled` only (convenience accessor) |

**Tests (3):**

- `test_register_and_get` — happy-path register + get + rate
- `test_get_unknown_species_panics` — panics on missing slug
- `test_reject_zero_co2` — rejects `co2_scaled ≤ 0`

---

### 5. `contracts/Cargo.toml`

Added `"species-registry"` to the workspace `members` list.

---

### 6. `package.json`

Two new npm scripts:

```json
"db:migrate:species": "psql $DATABASE_URL -f db/migrations/002_create_species_catalogue.sql",
"seed:species": "node scripts/seed-species.mjs"
```

---

## How to test

```bash
# 1. Apply the migration
npm run db:migrate:species

# 2. Run the seeder (DB only — no contract env vars needed)
npm run seed:species

# 3. Verify rows in PostgreSQL
psql $DATABASE_URL -c "SELECT slug, co2_kg_per_year, maturity_years FROM species_catalogue ORDER BY slug;"

# 4. Build and test the contract
cd contracts && cargo test -p species-registry
```

---

## Data sources

- FAO Global Forest Resources Assessment (FRA) 2020 — [fao.org/forest-resources-assessment](https://www.fao.org/forest-resources-assessment)
- IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Volume 4, Chapter 4

---

## Checklist

- [x] Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT … DO UPDATE`)
- [x] Seeder is safe to re-run in CI (no `DATABASE_URL` = early error; no `SPECIES_REGISTRY_ID` = graceful skip)
- [x] Contract uses `#![no_std]`, `panic = "abort"`, `lto = true`
- [x] 3 unit tests cover happy path, missing slug, and invalid input
- [x] No new npm dependencies introduced

closes #554
