# Daily Carbon Offset Calculation — Cron Job

Closes #839.

## What it does

Once a day, `.github/workflows/carbon-cron.yml` runs `pnpm carbon:calculate`
(`lib/carbon/worker.ts`), which:

1. Fetches every **active tree** — `trees.status IN ('planted', 'verified',
   'completed')` and `deleted_at IS NULL` — joined against
   `species_catalogue` for its FAO/IPCC Tier-1 `co2_kg_per_year` rate.
2. Estimates each tree's CO₂ sequestered **to date** as:

   ```
   co2_kg_per_year × min(age_in_years, maturity_years)
   ```

   A tree planted yesterday contributes ~0kg, not a full year's rate — the
   contribution is prorated by how long it's actually been growing, and
   capped at the species' maturity (the Tier-1 rate is an average designed
   to model growth up to maturity, not indefinitely).
3. Sums this across all active trees, and upserts one row per UTC calendar
   day into `carbon_offset_snapshots` (migration `008`). Re-running for the
   same day replaces that day's row — the job is safe to retry or manually
   re-trigger from the Actions tab (`workflow_dispatch`).

Trees whose species has no rate data yet are still counted as active, but
excluded from the CO₂ totals and tracked separately as `unrated_tree_count`,
so a data gap is visible instead of silently undercounting.

## Two assumptions worth knowing about

There is no `plots` table in this schema — only individual `trees` rows — so
this job treats an "active tree" as the equivalent of an "active plot". Two
places where that could reasonably have been decided differently:

- **Which statuses count as active.** `completed` is included alongside
  `planted`/`verified` because it's a distinct status from `failed` in this
  schema — a completed tree finished its monitoring lifecycle successfully,
  it did not die. To narrow this, edit `ACTIVE_TREE_STATUSES` in
  `lib/carbon/types.ts`.
- **Cumulative-to-date vs. current annual rate.** This job reports a
  cumulative total ("how much CO₂ has been sequestered so far"), not the
  current annual sequestration rate ("how much CO₂/year is being
  sequestered right now"). This is also distinct from the flat 48kg/tree
  lifetime constant used elsewhere for simplified per-sponsor display (see
  `docs/tree-token.md`) — that's a marketing-facing average, not this job's
  per-species, age-aware estimate.

## Running it

```bash
# Locally / manually, against DATABASE_URL in your environment
pnpm carbon:calculate

# Scheduled: .github/workflows/carbon-cron.yml, daily at 02:00 UTC
# Can also be triggered manually from the Actions tab (workflow_dispatch)
```

Requires the `DATABASE_URL` secret to be configured for GitHub Actions
(Settings → Secrets and variables → Actions) before the scheduled workflow
can run.

## Reading the results

`GET /api/carbon/daily-summary?days=7` returns the latest snapshot (with a
per-species breakdown) plus up to `days` (default 7, max 90) of recent daily
totals for trend display.

## Applying the migration

The migration file doesn't apply itself — run it once per environment:

```bash
pnpm db:migrate
```

## Tests

```bash
pnpm test lib/carbon
```

Covers the pure calculation functions (age proration, maturity capping,
unrated-tree handling, per-species aggregation) without a database, plus the
DB-touching functions (query shape, upsert/idempotency, error propagation)
against a mocked `pg` pool.
