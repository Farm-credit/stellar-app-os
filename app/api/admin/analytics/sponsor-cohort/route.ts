import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  getCohortRetentionReport,
  refreshCohortRetention,
  getSponsorRetentionSummary,
} from '@/lib/analytics/sponsor-cohort-retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/sponsor-cohort
 *
 * Returns the sponsor cohort retention matrix.
 *
 * Query params:
 *   from       — filter cohorts from this month (YYYY-MM)
 *   to         — filter cohorts up to this month (YYYY-MM)
 *   max_periods — max period offsets to include (default 12)
 *   wallet     — if provided, returns a single sponsor's retention summary instead
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');

  try {
    if (wallet) {
      const summary = await getSponsorRetentionSummary(getPool(), wallet.trim());
      if (!summary) {
        return NextResponse.json(
          { error: 'No cohort data found for this wallet' },
          { status: 404 }
        );
      }
      return NextResponse.json(summary, {
        headers: { 'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;
    const maxPeriodsParam = url.searchParams.get('max_periods');
    const maxPeriods = maxPeriodsParam ? Number.parseInt(maxPeriodsParam, 10) : undefined;

    const report = await getCohortRetentionReport(getPool(), {
      from,
      to,
      max_periods: maxPeriods && maxPeriods > 0 ? maxPeriods : undefined,
    });

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[sponsor-cohort] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch cohort retention data' }, { status: 500 });
  }
}

/**
 * POST /api/admin/analytics/sponsor-cohort
 *
 * Trigger a cohort retention refresh (recomputes the snapshot table).
 * Should be called by a monthly cron job or on-demand.
 */
export async function POST() {
  try {
    const result = await refreshCohortRetention(getPool());
    return NextResponse.json({
      success: true,
      cohorts_processed: result.cohorts_processed,
      rows_upserted: result.rows_upserted,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sponsor-cohort] POST refresh error', error);
    return NextResponse.json({ error: 'Failed to refresh cohort retention data' }, { status: 500 });
  }
}
