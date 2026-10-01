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
 * Get /api/admin/analytics/sponsor-cohort
 *
 * Returns the sponsor cohort retention matrix.
 *
 * Query params:
 *   from       - filter cohorts from this month (YYYY-MM)
 *   to         - filter cohorts up to this month (YYYY-MM)
 *   max_periods - max period offsets to include (default 12)
 *   wallet     - if provided, returns a single sponsor's retention summary instead
 *   payment_method - optional filter by payment method (e.g. 'xlm' for Stellar, 'usdc', 'bank', 'fiat')
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet') ?? null;
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

    await logAuditEvent(request, action, { from: from ?? null, to: to ?? null, max_periods: maxPeriods ?? null, payment_method: paymentMethod ?? null, status: 'success' });
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    await logAuditEvent(request, action, { wallet, status: 'error', error: (error as Error).message });
    console.error('[sponsor-cohort] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch cohort retention data' }, { status: 500 });
  }
}

/**
 * Generates ISS 1099 forms for sponsors with >$20k annual sponsorships.
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
  return sponsors.map((sponsor: any) => ({
    sponsor_id: sponsor.sponsor_id,
    name: sponsor.name,
    email: sponsor.email,
    total_annual: Number(sponsor.total_annual),
    tax_form: '1099',
    generated_at: new Date().toISOString(),
  }));
}

/**
 * Generates buyer compliance reports for regulatory requirements.
 * Supports SEC, EPA, and carbon tax reporting with automatic calculation
 * of offsets vs. emissions for regulatory filings.
 */
async function generateComplianceReport(
  pool: any,
  buyerId: string,
  framework: 'SEC' | 'EPA' | 'carbon_tax',
  periodStart: string,
  periodEnd: string,
) {
  const buyerResult = await pool.query(
    `SELECT id, name, email, wallet_address FROM buyers WHERE id = $1 OR wallet_address = $1`,
    [buyerId]
  );
  if (buyerResult.rows.length === 0) {
    return null;
  }
  const buyer = buyerResult.rows[0];

  const emissionsResult = await pool.query(
    `SELECT
       COALESCE(SUM(tonnes_co2e), 0) AS co2e_tonnes,
       COALESCE(SUM(energy_kjh), 0) AS energy_kjh,
       COALESCE(SUM(methane_tonnes_co2e), 0) AS methane_co2e_tonnes,
       COALESCE(SUM(nitrous_oxide_tonnes_co2e), 0) AS nitrous_off_co2e_tonnes
     FROM emission_records
     WHERE buyer_id = $1 AND recorded_at >= $2::timestamptz AND recorded_at < $3::timestamptz + INTERVAL '1 day'`,
    [buyer.id, periodStart, periodEnd]
  );
  const emissions = emissionsResult.rows[0];

  const offsetsResult = await pool.query(
    `SELECT
       COALESCE(SUM(tonnes_co2e_offset), 0) AS offset_tonnes,
       COALESCE(SUM(credit_amount), 0) AS offset_credits_amount,
       COUNT(*) AS offset_count
     FROM carbon_offsets
     WHERE buyer_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz + INTERVAL '1 day'`,
    [buyer.id, periodStart, periodEnd]
  );
  const offsets = offsetsResult.rows[0];

  const grossEmissionsTonnes =
    Number(emissions.co2e_tonnes) +
    Number(emissions.methane_co2e_tonnes) * 28 +
    Number(emissions.nitrous_off_co2e_tonnes) * 273;
  const offsetTonnes = Number(offsets.offset_tonnes);
  const netEmissionsTonnes = Math.max(0, grossEmissionsTonnes - offsetTonnes);
  const offsetRatio = grossEmissionsTonnes > 0 ? offsetTonnes / grossEmissionsTonnes : 0;

  const carbonPricePerTonne = framework === 'carbon_tax' ? 50 : 0;
  const carbonTaxLiability = netEmissionsTonnes * carbonPricePerTonne;

  const complianceStatus =
    framework === 'carbon_tax'
      ? netEmissionsTonnes === 0
        ? 'compliant'
        : 'non_compliant'
      : offsetRatio >= 1 ? 'compliant' : 'partially_compliant';

  const reportId = `compliance-${framework}-${buyer.id}-${periodStart}-${periodEnd}`;

  const report = {
    report_id: reportId,
    framework,
    buyer: {
      id: buyer.id,
      name: buyer.name,
      email: buyer.email,
      wallet_address: buyer.wallet_address,
    },
    period: { start: periodStart, end: periodEnd },
    emissions: {
      co2e_tonnes: Number(emissions.co2e_tonnes),
      methane_co2e_tonnes: Number(emissions.methane_co2e_tonnes),
      nitrous_off_co2e_tonnes: Number(emissions.nitrous_off_co2e_tonnes),
      energy_kjh: Number(emissions.energy_kjh),
      gross_co2e_tonnes: grossEmissionsTonnes,
    },
    offsets: {
      offset_tonnes: offsetTonnes,
      offset_count: Number(offsets.offset_count),
      offset_credits_amount: Number(offsets.offset_credits_amount),
    },
    net_emissions_tonnes: netEmissionsTonnes,
    offset_ratio: Number(offsetRatio.toFixed(4)),
    carbon_tax_liability_usd: Number(carbonTaxLiability.toFixed(2)),
    compliance_status: complianceStatus,
    generated_at: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO compliance_reports (report_id, buyer_id, framework, period_start, period_end, payload, created_at)
     VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz, $5::jsonb, NOW())
     ON CONFLICT (report_id) DO UPDATE SET payload = EXCLUDED.$5::jsonb`,
    [reportId, buyer.id, framework, periodStart, periodEnd, JSON.stringify(report)]
  );

  return report;
}

/**
 * POST /api/admin/analytics/sponsor-cohort
 *
 * Triggers a cohort retention refresh (recomputes the snapshot table)
 * or generates 1099 forms for high-value sponsors.
 *
 * Query params:
 *   action — optional. Set to 'generate_1099' to generate tax forms.
 *           Set to 'generate_compliance_report' to generate a regulatory compliance report.
 *           If omitted, the default cohort refresh is performed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'generate_1099') {
      const forms = await generate1099Forms(getPool());
      await logAuditEvent(request, 'generate_1099', {
        forms_generated: forms.length,
        status: 'success',
      });
      return NextResponse.json({
        success: true,
        forms_generated: forms.length,
        forms,
      });
    }

    if (action === 'generate_compliance_report') {
      const buyerId = url.searchParams.get('buyer_id');
      const framework = url.searchParams.get('framework');
      const periodStart = url.searchParams.get('period_start');
      const periodEnd = url.searchParams.get('period_end');

      if (!buyerId || !framework || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: 'Missing required parameters: buyer_id, framework, period_start, period_end' },
          { status: 400 }
        );
      }

      if (!['SEC', 'EPA', 'carbon_tax'].includes(framework!)) {
        return NextResponse.json(
          { error: 'Unsupported framework. Must be one of: SEC, EPA, carbon_tax' },
          { status: 400 }
        );
      }

      const report = await generateComplianceReport(
        getPool(),
        buyerId,
        framework as 'SEC' | 'EPA' | 'carbon_tax',
        periodStart,
        periodEnd
      );

      if (!report) {
        await logAuditEvent(request, 'generate_compliance_report', {
          buyer_id: buyerId,
          framework,
          status: 'not_found',
        });
        return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      }

      await logAuditEvent(request, 'generate_compliance_report', {
        buyer_id: buyerId,
        framework,
        period_start: periodStart,
        period_end: periodEnd,
        compliance_status: report.compliance_status,
        status: 'success',
      });

      return NextResponse.json({ success: true, report });
    }

    const result = await refreshCohortRetention(getPool());
    await logAuditEvent(request, 'refresh_cohort_retention', {
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
    await logAuditEvent(request, action ?? 'refresh_cohort_retention', { status: 'error', error: (error as Error).message });
    console.error('[sponsor-cohort] POST error', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function logAuditEvent(request: Request, action: string, details: Record<string, unknown>): Promise<void> {
  try {
    const pool = getPool();
    const actor = request.headers.get('x-admin-user') || request.headers.get('x-user-id') || 'unknown';
    await pool.query(
      `INSERT INTO admin_audit_log (actor_id, action, resource, details, created_at)
VALUES ($1, $2, 'sponsor-cohort-analytics', $3::jsonb, NOW())
      `,
      [actor, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
