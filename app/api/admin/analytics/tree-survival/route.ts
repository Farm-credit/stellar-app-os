import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { getReadPool } from '@/lib/db/read-replica';
import { isAdminRequest } from '@/lib/auth/admin';
import { getTreeAnalytics, parseTreeAnalyticsFilters } from '@/lib/analytics/tree-survival';
import { getCarbonOffsetEstimate, parseCarbonOffsetInput } from '@/lib/analytics/carbon-offset';
import { processFarmerPayment, parseFarmerPaymentInput } from '@/lib/payments/farmer-payment';
import {
  getFarmerPaymentMethods,
  parseFarmerPaymentMethodFilters,
} from '@/lib/payments/farmer-payment-methods';
import '@/lib/analytics/project-comparison';
import {
  getFarmerIncomePrediction,
  parseFarmerIncomePredictionInput,
} from '@/lib/analytics/farmer-income';
import '@/lib/analytics/compliance-report';
import { searchOffsetProjects, parseOffsetProjectSearchParams } from '@/lib/offset/project-search';
import {
  getTreeAge,
  parseTreeAgeInput,
  parseTreeMilestoneInput,
  processTreeMilestones,
} from '@/lib/analytics/tree-age';
import {
  getCorporateEsgImpact,
  parseCorporateEsgImpactFilters,
} from '@/lib/analytics/corporate-esg-impact';

export const runtime = 'nodejs';

/**
 * GHG Protocol scope reference used by carbon accounting endpoints:
 * - Scope 1: direct emissions from owned or controlled sources (e.g. fuel use)
 * - Scope 2: indirect emissions from purchased energy (electricity, heat, steam)
 * - Scope 3: all other indirect value-chain emissions
 */

/**
 * GET /api/admin/analytics/tree-survival
 *
 * Returns survival rate, lifecycle counts, cost per tree, and sponsor retention
 * grouped independently by species, region, and planter team.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const filters = parseTreeAnalyticsFilters(new URL(request.url).searchParams);
    const report = await getTreeAnalytics(getReadPool(), filters);
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tree analytics';
    const status = /must be|valid ISO|before or equal/.test(message) ? 400 : 500;
    console.error('[tree-survival-analytics]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * GET /api/admin/analytics/tree-survival/age
 *
 * Calculates a tree's age from its planting date and returns the current
 * growth milestone badge along with the next upcoming milestone.
 */
export async function GET_TREE_AGE(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseTreeAgeInput(new URL(request.url).searchParams);
    const age = getTreeAge(input);
    return NextResponse.json(age, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate tree age';
    const status = /must be|required|invalid|before or equal|future/.test(message) ? 400 : 500;
    console.error('[tree-age]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * GET /api/admin/analytics/tree-survival/corporate-impact
 *
 * Returns the corporate ESG impact dashboard for a sponsor account: trees
 * funded, CO2 sequestered, biodiversity contribution, and employee engagement,
 * aligned to ESG reporting frameworks (GRI, SASB, CDP, TSFD, SEBi).
 */
export async function GET_CORPORATE_IMPACT(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const filters = parseCorporateEsgImpactFilters(new URL(request.url).searchParams);
    const report = await getCorporateEsgImpact(getReadPool(), filters);
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate corporate ESG impact';
    const status = /must be|required|invalid|unsupported|non-negative|unknown|before or equal/.test(
      message
    )
      ? 400
      : 500;
    console.error('[corporate-esg-impact]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * GET /api/admin/analytics/tree-survival/payment-methods
 *
 * Returns the supported farmer payment methods across XLM, USDC, and fiat
 * currencies, including bank transfers, crypto wallets, and payment apps.
 */
export async function GET_PAYMENT_METHODS(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const filters = parseFarmerPaymentMethodFilters(new URL(request.url).searchParams);
    const methods = await getFarmerPaymentMethods(getReadPool(), filters);
    return NextResponse.json(methods, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load farmer payment methods';
    const status = /must be|required|invalid|unsupported|non-negative/.test(message) ? 400 : 500;
    console.error('[farmer-payment-methods]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PU /api/admin/analytics/tree-survival
 *
 * Processes a farmer payment in XLM, USDC, or fiat currency via bank transfer,
 * crypto wallet, or payment app.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseFarmerPaymentInput(await request.json());
    const result = await processFarmerPayment(getPool(), input);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process farmer payment';
    const status = /must be|required|invalid|unsupported|non-negative/.test(message) ? 400 : 500;
    console.error('[farmer-payment]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/analytics/tree-survival
 *
 * Estimates the number of carbon credits an individual needs to offset their
 * annual emissions based on household size, car usage, and energy consumption.
 * Emissions are structured per GHG Protocol scopes (Scope 1, 2, 3) to align
 * offset calculations with corporate carbon accounting standards.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseCarbonOffsetInput(await request.json());
    const estimate = getCarbonOffsetEstimate(input);
    return NextResponse.json(estimate, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to estimate carbon offset';
    const status = /must be|required|invalid|non-negative/.test(message) ? 400 : 500;
    console.error('[carbon-offset-estimate]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/admin/analytics/tree-survival
 *
 * Predicts potential farmer income from a carbon project based on land size,
 * location, practice type, and historical carbon prices.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseFarmerIncomePredictionInput(await request.json());
    const prediction = await getFarmerIncomePrediction(getReadPool(), input);
    return NextResponse.json(prediction, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to predict farmer income';
    const status = /must be|required|invalid|unsupported|non-negative/.test(message) ? 400 : 500;
    console.error('[farmer-income-prediction]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/admin/analytics/tree-survival
 *
 * Searches carbon offset projects with filters: project type, location,
 * co-benefits (biodiversity, water, soil), certification standard, and
 * price range.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const params = parseOffsetProjectSearchParams(new URL(request.url).searchParams);
    const results = await searchOffsetProjects(getPool(), params);
    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search offset projects';
    const status = /must be|required|invalid|unsupported|non-negative|unknown/.test(message)
      ? 400
      : 500;
    console.error('[offset-project-search]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/analytics/tree-survival/milestones
 *
 * Detects newly reached growth milestones (1 month, 6 months, 1 year, 5 years)
 * for trees, persists digital milestone badges on the tree profile, and sends
 * milestone notification emails to the sponsor.
 */
export async function POST_MILESTONES(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseTreeMilestoneInput(await request.json());
    const result = await processTreeMilestones(getPool(), input);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process tree milestones';
    const status = /must be|required|invalid|unsupported|non-negative|not found/.test(message)
      ? 400
      : 500;
    console.error('[tree-milestones]', error);
    return NextResponse.json({ error: message }, { status });
  }
}
