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
 *   from       \u2014 filter cohorts from this month (YYYY-MM)
 *   to         \u2014 filter cohorts up to this month (YYYY-MM)
 *   max_periods \u2014 max period offsets to include (default 12)
 *   wallet     \u2014 if provided, returns a single sponsor's retention summary instead
 *   payment_method \u2014 optional filter by payment method (e.g. 'xlm' for Stellar)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  const paymentMethod = url.searchParams.get('payment_method') ?? undefined;

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
      payment_method: paymentMethod,
    });

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[sponsor-cohort] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch cohort retention data' }, { status: 500 });
  }
}

/***
 * Generates IRS 1099 forms for sponsors with >$20k annual sponsorships.
 * This is a placeholder implementation that returns the list of eligible sponsors.
 * In production, this should generate actual PDF forms and store them securely.
 */
async function generate1099Forms(pool: any) {
  const result = await pool.query(`
    SELECT 
      s.id AS sponsor_id,
      s.name,
      s.email,
      SUM(sp.amount) AS total_annual
    FROM sponsors s
    JOIN sponsorships sp ON sp.sponsor_id = s.id
    WHERE sp.created_at >= NOW() - INTERVAL '1 year'
    GROUP BY s.id, s.name, s.email
    HAVING SUM(sp.amount) > 20000
  `);
  const sponsors = result.rows;
  return sponsors.map((sponsor: any) => ({ sponsor_id, name, email, total_annual: Number(sponsor.total_annual), tax_form: '1099', generated_at: new Date().toISOString() }));
}

/**
 * POST /api/admin/analytics/sponsor-cohort
 *
 * Triggers a cohort retention refresh (recomputes the snapshot table)
 * or generates 1099 forms for high-value sponsors.
 *
 * Query params:
 *   action \u2014 optional. Set to 'generate_1099' to generate tax forms.
 *           If omitted, the default cohort refresh is performed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'generate_1099') {
      const forms = await generate1099Forms(getPool());
      return NextResponse.json({
        success: true,
        forms_generated: forms.length,
        forms,
      });
    }

    const result = await refreshCohortRetention(getPool());
    return NextResponse.json({
      success: true,
      cohorts_processed: result.cohorts_processed,
      rows_upserted: result.rows_upserted,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sponsor-cohort] POST error', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}