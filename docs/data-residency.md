# Data Residency

Implements issue #1141: sponsor data is stored in the geographic region that
governs it — EU sponsors in the EU, APAC sponsors in APAC, and Americas
sponsors in the US.

## How it works

1. `lib/db/data-residency.ts` resolves a sponsor's region from the requested
   planting region or an optional `sponsorCountry` (ISO alpha-2 / region name).
2. `getRegionalPool(region)` returns a dedicated `pg.Pool` for that region,
   configured from:

   - `DATA_RESIDENCY_EU_DATABASE_URL`
   - `DATA_RESIDENCY_APAC_DATABASE_URL`
   - `DATA_RESIDENCY_AMERICAS_DATABASE_URL`

   If a regional URL is unset, `DATABASE_URL` is used, so local development and
   existing single-region deployments are unaffected.
3. `planting_waitlist` rows now carry a `data_region` column (migration `016`),
   and the waitlist POST route writes through the sponsor's regional pool.
4. Read paths that look up a row by id (`GET /api/planting/waitlist/[id]`)
   query across the regional pools via `queryAcrossRegions` and continue with
   the pool that owns the row, so the queue-position query stays in-region.

## Configuration

```bash
# Single-region (unchanged):
DATABASE_URL=postgres://user:pass@host:5432/db

# Multi-region (data residency):
DATA_RESIDENCY_EU_DATABASE_URL=postgres://user:pass@eu-host:5432/db
DATA_RESIDENCY_APAC_DATABASE_URL=postgres://user:pass@apac-host:5432/db
DATA_RESIDENCY_AMERICAS_DATABASE_URL=postgres://user:pass@us-host:5432/db

# Region used when a sponsor cannot be mapped (default: americas)
DATA_RESIDENCY_DEFAULT_REGION=americas
```

## Migration

```bash
npm run db:migrate
```

Rollback (manual): `psql $DATABASE_URL -f db/migrations/016_add_sponsor_data_region-rollback.sql`
