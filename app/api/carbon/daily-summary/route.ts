import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import type { CarbonOffsetSnapshotRow, CarbonSpeciesBreakdown } from '@/lib/carbon/types';

/**
 * GET /api/carbon/daily-summary?days=7
 *
 * Returns the most recent daily carbon-offset snapshot(s) computed by the
 * cron worker (lib/carbon/worker.ts, run via .github/workflows/carbon-cron.yml).
 *
 * `days` (optional, default 7, max 90) — how many of the most recent daily
 * snapshots to include in `history`. `latest` is always the single most
 * recent snapshot, or null if the job hasn't run yet.
 *
 * Response shape:
 * {
 *   latest: {
 *     snapshotDate: string;
 *     activeTreeCount: number;
 *     unratedTreeCount: number;
 *     totalCo2OffsetKg: number;
 *     totalCo2OffsetTonnes: number;
 *     bySpecies: Array<{ speciesSlug, activeTreeCount, co2OffsetKg, co2OffsetTonnes }>;
 *     computedInMs: number;
 *   } | null;
 *   history: Array<...same shape as latest, without bySpecies...>;
 * }
 */
export const runtime = 'nodejs';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

function toApiShape(row: CarbonOffsetSnapshotRow, includeBreakdown: boolean) {
  const base = {
    snapshotDate: row.snapshot_date,
    activeTreeCount: row.active_tree_count,
    unratedTreeCount: row.unrated_tree_count,
    totalCo2OffsetKg: parseFloat(row.total_co2_offset_kg),
    totalCo2OffsetTonnes: parseFloat(row.total_co2_offset_tonnes),
    computedInMs: row.computed_in_ms,
  };

  if (!includeBreakdown) return base;

  return {
    ...base,
    bySpecies: row.species_breakdown as CarbonSpeciesBreakdown[],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDays = parseInt(searchParams.get('days') ?? '', 10);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), MAX_DAYS)
      : DEFAULT_DAYS;

    const pool = getPool();
    const { rows } = await pool.query<CarbonOffsetSnapshotRow>(
      `SELECT * FROM carbon_offset_snapshots ORDER BY snapshot_date DESC LIMIT $1`,
      [days]
    );

    const latest = rows[0] ? toApiShape(rows[0], true) : null;
    const history = rows.map((r) => toApiShape(r, false));

    return NextResponse.json(
      { latest, history },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' } }
    );
  } catch (error) {
    // If the table doesn't exist yet (migration not run) return an empty
    // result so callers don't hard-fail before the job has ever run.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ latest: null, history: [] });
    }
    console.error('[carbon/daily-summary] error:', error);
    return NextResponse.json({ error: 'Failed to load carbon offset data' }, { status: 500 });
  }
}
