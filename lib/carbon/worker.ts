/**
 * Daily Carbon Offset Calculation Cron Worker — Closes #839
 *
 * One-shot job: computes total estimated CO2 sequestered *to date* across
 * every "active" tree, and upserts one snapshot row per UTC day into
 * carbon_offset_snapshots (migration 008).
 *
 * "Active" = trees.status IN ('planted', 'verified', 'completed') AND
 * deleted_at IS NULL. There is no separate `plots` table in this schema —
 * see the migration file for the full reasoning and where to adjust it.
 *
 * Per tree, the offset-to-date is estimated as:
 *
 *   co2_kg_per_year (species rate) * min(ageYears, maturityYears)
 *
 * i.e. prorated by how long the tree has actually been growing, capped at
 * the species' maturity (the FAO/IPCC Tier-1 rate is an average annual
 * figure designed to model growth up to maturity, not indefinitely).
 * Trees whose species has no rate data are counted as active but excluded
 * from the CO2 totals ("unrated").
 *
 * Idempotent: re-running for the same UTC day upserts the existing row
 * rather than creating a duplicate — safe to retry or manually re-trigger.
 *
 * Usage:
 *   pnpm carbon:calculate
 *   (or: tsx lib/carbon/worker.ts)
 *
 * Scheduling: .github/workflows/carbon-cron.yml runs this daily.
 *
 * Required env vars:
 *   DATABASE_URL — postgres connection string (see @/lib/db/client)
 */

import type { Pool } from 'pg';
import { getPool } from '@/lib/db/client';
import {
  ACTIVE_TREE_STATUSES,
  type ActiveTreeOffsetRecord,
  type CarbonSnapshotResult,
  type CarbonSpeciesBreakdown,
} from './types';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// ── Pure calculation helpers (no DB / no I/O — unit tested directly) ─────────

/** Tree age in (fractional) years as of `asOf`. Never negative. */
export function treeAgeYears(plantedAt: Date, asOf: Date): number {
  const ms = asOf.getTime() - plantedAt.getTime();
  return Math.max(0, ms / MS_PER_YEAR);
}

/**
 * Estimated CO2 (kg) sequestered by a single tree as of `asOf`.
 * Returns null when the tree has no usable species rate data.
 */
export function computeTreeOffsetKg(record: ActiveTreeOffsetRecord, asOf: Date): number | null {
  if (record.co2KgPerYear === null || record.co2KgPerYear <= 0) return null;

  const ageYears = treeAgeYears(record.plantedAt, asOf);
  const cappedAgeYears =
    record.maturityYears !== null && record.maturityYears > 0
      ? Math.min(ageYears, record.maturityYears)
      : ageYears;

  return record.co2KgPerYear * cappedAgeYears;
}

/** Formats a Date as a UTC calendar date string, YYYY-MM-DD. */
export function todayUtcDateString(asOf: Date = new Date()): string {
  return asOf.toISOString().slice(0, 10);
}

/**
 * Aggregates a list of active-tree records into a full snapshot result.
 * Pure function — safe to unit test without touching the database.
 */
export function aggregateSnapshot(
  records: ActiveTreeOffsetRecord[],
  asOf: Date,
  computedInMs: number
): CarbonSnapshotResult {
  const speciesMap = new Map<string, { count: number; co2Kg: number }>();
  let unratedTreeCount = 0;
  let totalCo2OffsetKg = 0;

  for (const record of records) {
    const offsetKg = computeTreeOffsetKg(record, asOf);
    if (offsetKg === null || !record.speciesSlug) {
      unratedTreeCount += 1;
      continue;
    }

    totalCo2OffsetKg += offsetKg;
    const existing = speciesMap.get(record.speciesSlug) ?? { count: 0, co2Kg: 0 };
    speciesMap.set(record.speciesSlug, {
      count: existing.count + 1,
      co2Kg: existing.co2Kg + offsetKg,
    });
  }

  const bySpecies: CarbonSpeciesBreakdown[] = [...speciesMap.entries()]
    .map(([speciesSlug, { count, co2Kg }]) => ({
      speciesSlug,
      activeTreeCount: count,
      co2OffsetKg: Math.round(co2Kg * 100) / 100,
      co2OffsetTonnes: parseFloat((co2Kg / 1_000).toFixed(4)),
    }))
    .sort((a, b) => b.co2OffsetKg - a.co2OffsetKg);

  return {
    snapshotDate: todayUtcDateString(asOf),
    activeTreeCount: records.length,
    unratedTreeCount,
    totalCo2OffsetKg: Math.round(totalCo2OffsetKg * 100) / 100,
    totalCo2OffsetTonnes: parseFloat((totalCo2OffsetKg / 1_000).toFixed(4)),
    bySpecies,
    computedInMs,
  };
}

// ── DB access ──────────────────────────────────────────────────────────────────

interface ActiveTreeQueryRow {
  id: number;
  species_slug: string | null;
  planted_at: Date;
  co2_kg_per_year: string | null;
  maturity_years: number | null;
}

/** Fetches every active tree (planted, not soft-deleted) with its species rate. */
export async function fetchActiveTreeRecords(pool: Pool): Promise<ActiveTreeOffsetRecord[]> {
  const { rows } = await pool.query<ActiveTreeQueryRow>(
    `
      SELECT
        t.id,
        t.species_slug,
        t.planted_at,
        sc.co2_kg_per_year,
        sc.maturity_years
      FROM trees t
      LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
      WHERE t.deleted_at IS NULL
        AND t.status = ANY($1::text[])
        AND t.planted_at IS NOT NULL
    `,
    [ACTIVE_TREE_STATUSES]
  );

  return rows.map((r) => ({
    id: r.id,
    speciesSlug: r.species_slug,
    plantedAt: new Date(r.planted_at),
    co2KgPerYear: r.co2_kg_per_year !== null ? parseFloat(r.co2_kg_per_year) : null,
    maturityYears: r.maturity_years !== null ? Number(r.maturity_years) : null,
  }));
}

/**
 * Runs the aggregate calculation and returns the result without writing to
 * the DB. Split out from `run()` so tests / callers can exercise the
 * calculation independent of the upsert.
 */
export async function calculateSnapshot(
  pool: Pool = getPool(),
  asOf: Date = new Date()
): Promise<CarbonSnapshotResult> {
  const start = Date.now();
  const records = await fetchActiveTreeRecords(pool);
  return aggregateSnapshot(records, asOf, Date.now() - start);
}

/**
 * Upserts a day's snapshot. Safe to call more than once for the same
 * snapshotDate — the row is replaced, so retries/replays are idempotent.
 */
export async function upsertSnapshot(pool: Pool, result: CarbonSnapshotResult): Promise<void> {
  await pool.query(
    `
      INSERT INTO carbon_offset_snapshots (
        snapshot_date,
        active_tree_count,
        unrated_tree_count,
        total_co2_offset_kg,
        total_co2_offset_tonnes,
        species_breakdown,
        computed_in_ms,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (snapshot_date) DO UPDATE SET
        active_tree_count       = EXCLUDED.active_tree_count,
        unrated_tree_count      = EXCLUDED.unrated_tree_count,
        total_co2_offset_kg     = EXCLUDED.total_co2_offset_kg,
        total_co2_offset_tonnes = EXCLUDED.total_co2_offset_tonnes,
        species_breakdown       = EXCLUDED.species_breakdown,
        computed_in_ms          = EXCLUDED.computed_in_ms,
        updated_at              = NOW()
    `,
    [
      result.snapshotDate,
      result.activeTreeCount,
      result.unratedTreeCount,
      result.totalCo2OffsetKg,
      result.totalCo2OffsetTonnes,
      JSON.stringify(result.bySpecies),
      result.computedInMs,
    ]
  );
}

/** Runs the calculation and persists it. Throws on failure — callers must catch. */
export async function run(
  pool: Pool = getPool(),
  asOf: Date = new Date()
): Promise<CarbonSnapshotResult> {
  const result = await calculateSnapshot(pool, asOf);
  await upsertSnapshot(pool, result);
  return result;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.info('[carbon-worker] starting daily carbon offset calculation…');

  const result = await run();

  console.info(
    '[carbon-worker] done: %d active trees, %d kg CO2 (%d tonnes) sequestered to date, %d unrated, %dms',
    result.activeTreeCount,
    result.totalCo2OffsetKg,
    result.totalCo2OffsetTonnes,
    result.unratedTreeCount,
    result.computedInMs
  );

  if (result.unratedTreeCount > 0) {
    console.warn(
      '[carbon-worker] %d active tree(s) have no matching species_catalogue entry and were excluded from the total',
      result.unratedTreeCount
    );
  }
}

// Run only when executed directly (not when imported by tests/other modules) —
// same guard pattern as scripts/db-backup.mjs (import.meta.url comparison,
// since this file needs to be import-safe for worker.test.ts).
const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[carbon-worker] fatal:', err);
      process.exit(1);
    });
}
