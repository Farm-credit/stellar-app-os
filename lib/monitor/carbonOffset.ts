import { Pool } from 'pg';
import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';
import { CO2_KG_PER_TREE } from '@/lib/stellar/tree-asset';

export interface SpeciesBreakdown {
  speciesSlug: string | null;
  treeCount: number;
  co2OffsetKg: number;
  co2OffsetTonnes: number;
}

export interface CarbonSummary {
  totalTrees: number;
  totalCo2OffsetKg: number;
  totalCo2OffsetTonnes: number;
  bySpecies: SpeciesBreakdown[];
  computedAt: string; // ISO
}

/**
 * Compute the cumulative CO2 (kg) for a single tree.
 * - plantedAt may be null (not planted yet) -> returns 0
 * - co2KgPerYear may be null -> fallback to CO2_KG_PER_TREE
 * - maturityYears may be null -> no cap
 */
export function computeTreeCumulativeKg(
  plantedAt: string | null,
  co2KgPerYear: number | null,
  maturityYears: number | null,
  now = Date.now()
): number {
  if (!plantedAt) return 0;
  const plantedTs = new Date(plantedAt).getTime();
  if (isNaN(plantedTs) || plantedTs > now) return 0;

  const years = (now - plantedTs) / (1000 * 60 * 60 * 24 * 365.2425);
  const cap = maturityYears && maturityYears > 0 ? maturityYears : Number.POSITIVE_INFINITY;
  const effectiveYears = Math.min(years, cap);
  const rate = co2KgPerYear && co2KgPerYear > 0 ? co2KgPerYear : CO2_KG_PER_TREE;
  return effectiveYears * rate;
}

/**
 * Query the DB for active trees and aggregate cumulative CO2 to date.
 */
export async function computeCarbonSummary(
  pool: Pool | null = null
): Promise<CarbonSummary> {
  const db = pool ?? getPool();

  // Active trees: exclude soft-deleted and failed/funded states. We include
  // planted, verified, completed as active. This is conservative and can be
  // tuned later.
  const sql = `
    SELECT
      t.species_slug,
      t.planted_at,
      s.co2_kg_per_year::text AS co2_kg_per_year,
      s.maturity_years::int AS maturity_years
    FROM trees t
    LEFT JOIN species_catalogue s ON t.species_slug = s.slug
    WHERE t.deleted_at IS NULL
      AND t.status IN ('planted', 'verified', 'completed')
  `;

  logger.info('[carbon-worker] querying active trees for carbon summary');

  const { rows } = await db.query(
    sql
  );

  const bySpeciesMap: Map<string, { count: number; co2Kg: number }> = new Map();
  let totalTrees = 0;
  let totalCo2Kg = 0;

  for (const r of rows) {
    const species: string | null = r.species_slug ?? null;
    const planted_at: string | null = r.planted_at ?? null;
    const co2Val = r.co2_kg_per_year != null ? Number(r.co2_kg_per_year) : null;
    const maturity = r.maturity_years != null ? Number(r.maturity_years) : null;

    const kg = computeTreeCumulativeKg(planted_at, co2Val, maturity);

    const key = species ?? 'unknown';
    const existing = bySpeciesMap.get(key) ?? { count: 0, co2Kg: 0 };
    existing.count += 1;
    existing.co2Kg += kg;
    bySpeciesMap.set(key, existing);

    totalTrees += 1;
    totalCo2Kg += kg;
  }

  const bySpecies: SpeciesBreakdown[] = [...bySpeciesMap.entries()].map(([species, v]) => ({
    speciesSlug: species === 'unknown' ? null : species,
    treeCount: v.count,
    co2OffsetKg: Math.round(v.co2Kg),
    co2OffsetTonnes: parseFloat((v.co2Kg / 1000).toFixed(6)),
  }));

  // Sort by tree count desc
  bySpecies.sort((a, b) => b.treeCount - a.treeCount);

  const summary: CarbonSummary = {
    totalTrees,
    totalCo2OffsetKg: Math.round(totalCo2Kg),
    totalCo2OffsetTonnes: parseFloat((totalCo2Kg / 1000).toFixed(6)),
    bySpecies,
    computedAt: new Date().toISOString(),
  };

  return summary;
}

/**
 * Helper to parse a cron spec like "0 6 * * *" and return hour/minute in UTC.
 */
function parseCronSchedule(cron: string): { hour: number; minute: number } {
  const parts = cron.trim().split(/\s+/);
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  return { hour: Number.isNaN(hour) ? 6 : hour, minute: Number.isNaN(minute) ? 0 : minute };
}

function shouldRunDaily(lastRunDay: number | null, cron: string): boolean {
  const { hour, minute } = parseCronSchedule(cron);
  const now = new Date();
  const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMinute = hour * 60 + minute;
  const today = now.getUTCDate() | (now.getUTCMonth() << 5) | (now.getUTCFullYear() << 9);

  if (lastRunDay === today) return false;
  if (Math.abs(currentMinute - targetMinute) > 5) return false;
  return true;
}

export async function runOnceAndLog(pool: Pool | null = null): Promise<CarbonSummary> {
  const db = pool ?? getPool();
  try {
    const summary = await computeCarbonSummary(db);
    logger.info('[carbon-worker] computed carbon summary', {
      totalTrees: summary.totalTrees,
      totalCo2OffsetTonnes: summary.totalCo2OffsetTonnes,
      computedAt: summary.computedAt,
    });
    // Future: persist to `daily_carbon_summaries` table or emit metrics
    return summary;
  } catch (err) {
    logger.error('[carbon-worker] error computing carbon summary', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// ── CLI worker ───────────────────────────────────────────────────────────────

if (require.main === module) {
  (async function main() {
    const POLL_INTERVAL_MS = Number(process.env.CARBON_POLL_INTERVAL_MS) || 300_000; // 5m fallback
    const DAILY_CRON = process.env.CARBON_DAILY_CRON ?? '0 6 * * *';

    logger.info('[carbon-worker] starting', { cron: DAILY_CRON, pollIntervalMs: POLL_INTERVAL_MS });

    let lastRun: number | null = null;

    while (true) {
      try {
        if (shouldRunDaily(lastRun, DAILY_CRON)) {
          await runOnceAndLog();
          lastRun = new Date().getUTCDate() | (new Date().getUTCMonth() << 5) | (new Date().getUTCFullYear() << 9);
          logger.info('[carbon-worker] daily calculation completed');
        }
      } catch (err) {
        logger.error('[carbon-worker] unexpected error in main loop', { error: err instanceof Error ? err.message : String(err) });
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  })();
}
