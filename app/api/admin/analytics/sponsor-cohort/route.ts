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
 *   from           - filter cohorts from this month (YYYY-MM)
 *   to             - filter cohorts up to this month (YYYY-MM)
 *   max_periods    - max period offsets to include (default 12)
 *   wallet         - if provided, returns a single sponsor's retention summary instead
 *   payment_method - optional filter by payment method (e.g. 'xlm' for Stellar)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet')?.trim() ?? null;
  const paymentMethod = url.searchParams.get('payment_method') ?? undefined;
  const action = wallet ? 'view_sponsor_retention' : 'view_cohort_retention';

  try {
    if (wallet) {
      const summary = await getSponsorRetentionSummary(getPool(), wallet);
      if (!summary) {
        await logAuditEvent(request, action, { wallet, status: 'not_found' });
        return NextResponse.json(
          { error: 'No cohort data found for this wallet' },
          { status: 404 }
        );
      }
      await logAuditEvent(request, action, { wallet, status: 'success' });
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

    await logAuditEvent(request, action, {
      from: from ?? null,
      to: to ?? null,
      max_periods: maxPeriods ?? null,
      payment_method: paymentMethod ?? null,
      status: 'success',
    });
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    await logAuditEvent(request, action, {
      wallet,
      status: 'error',
      error: (error as Error).message,
    });
    console.error('[sponsor-cohort] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch cohort retention data' }, { status: 500 });
  }
}

/**
 * POST /api/admin/analytics/sponsor-cohort
 *
 * Triggers a cohort retention refresh (recomputes the snapshot table)
 * or generates 1099 forms for high-value sponsors.
 *
 * Query params:
 *   action - optional. Set to 'generate_1099' to generate tax forms.
 *            If omitted, the default cohort refresh is performed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'refresh_cohort_retention';

  try {
    if (action === 'generate_1099') {
      const forms = await generate1099Forms(getPool());
      await logAuditEvent(request, action, {
        forms_generated: forms.length,
        status: 'success',
      });
      return NextResponse.json({
        success: true,
        forms_generated: forms.length,
        forms,
      });
    }

    const result = await refreshCohortRetention(getPool());
    await logAuditEvent(request, action, {
      cohorts_processed: result.cohorts_processed,
      rows_upserted: result.rows_upserted,
      status: 'success',
    });
    return NextResponse.json({
      success: true,
      cohorts_processed: result.cohorts_processed,
      rows_upserted: result.rows_upserted,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    await logAuditEvent(request, action, { status: 'error', error: (error as Error).message });
    console.error('[sponsor-cohort] POST error', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

/**
 * Generates IRS 1099 forms for sponsors with >$20k annual sponsorships.
 * This is a placeholder implementation that returns the list of eligible sponsors.
 * In production, this should generate actual PDF forms and store them securely.
 */
async function generate1099Forms(pool: ReturnType<typeof getPool>) {
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
  return result.rows.map(
    (sponsor: {
      sponsor_id: string;
      name: string;
      email: string;
      total_annual: string | number;
    }) => ({
      sponsor_id: sponsor.sponsor_id,
      name: sponsor.name,
      email: sponsor.email,
      total_annual: Number(sponsor.total_annual),
      tax_form: '1099',
      generated_at: new Date().toISOString(),
    })
  );
}

async function logAuditEvent(
  request: Request,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const pool = getPool();
    const actor =
      request.headers.get('x-admin-user') || request.headers.get('x-user-id') || 'unknown';
    await pool.query(
      `INSERT INTO admin_audit_log (actor_id, action, resource, details, created_at)
       VALUES ($1, $2, 'sponsor-cohort-analytics', $3::jsonb, NOW())`,
      [actor, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
