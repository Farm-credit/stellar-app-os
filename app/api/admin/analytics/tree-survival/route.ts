import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';
import { getTreeAnalytics, parseTreeAnalyticsFilters } from '@/lib/analytics/tree-survival';
import { getCarbonOffsetEstimate, parseCarbonOffsetInput } from '@/lib/analytics/carbon-offset';
import { processFarmerPayment, parseFarmerPaymentInput } from '@/lib/payments/farmer-payment';
import { getFarmerPaymentMethods, parseFarmerPaymentMethodFilters } from '@/lib/payments/farmer-payment-methods';
import { getFarmerIncomePrediction, parseFarmerIncomePredictionInput } from '@/lib/analytics/farmer-income';
import { createAuction, parseCreateAuctionInput } from '@/lib/marketplace/auction-create';
import { placeBid, parsePlaceBidInput } from '@/lib/marketplace/auction-bid';
import { closeAuction, parseCloseAuctionInput } from '@/lib/marketplace/auction-close';
import { getAuction, parseGetAuctionInput } from '@/lib/marketplace/auction-get';

export const runtime = 'nodejs';

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
    const report = await getTreeAnalytics(getPool(), filters);
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
    const methods = await getFarmerPaymentMethods(getPool(), filters);
    return NextResponse.json(methods, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load farmer payment methods';
    const status = /must be|required|invalid|unsupported|non-negative/.test(message) ? 400 : 500;
    console.error('[farmer-payment-methods]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/admin/analytics/tree-survival
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
    const prediction = await getFarmerIncomePrediction(getPool(), input);
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
 * OPTIONS /api/admin/analytics/tree-survival
 *
 * Advertises the auction mechanism capabilities and the accepted request
 * shapes for creating an auction, placing a bid, closing an auction, and
 * fetching an auction.
 */
export async function OPTIONS(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    feature: 'auction-mechanism',
    version: 'v1',
    operations: [
      {
        action: 'create',
        method: 'POST',
        description: 'Create a carbon credit auction with a reserve price and closing time.',
        fields: ['farmerId', 'creditAmount', 'reservePrice', 'currency', 'closesAt'],
      },
      {
        action: 'bid',
        method: 'PUT',
        description: 'Place a competitive bid on an open auction. Highest bid at close wins.',
        fields: ['auctionId', 'bidderId', 'amount'],
      },
      {
        action: 'close',
        method: 'PATCH',
        description: 'Close an auction and determine the winning bid with transparent price discovery.',
        fields: ['auctionId'],
      },
      {
        action: 'get',
        method: 'DELETE',
        description: 'Fetch an auction with its current highest bid and bid history.',
        fields: ['auctionId'],
      },
    ],
  });
}

/**
 * DELETE /api/admin/analytics/tree-survival
 *
 * Fetches an auction along with its current highest bid and bid history for
 * transparent price discovery.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseGetAuctionInput(new URL(request.url).searchParams);
    const auction = await getAuction(getPool(), input);
    return NextResponse.json(auction, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch auction';
    const status = /must be|required|invalid|not found/.test(message) ? 400 : 500;
    console.error('[auction-get]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * HEAD /api/admin/analytics/tree-survival
 *
 * Creates a carbon credit auction with a reserve price and closing time.
 */
export async function HEAD(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const input = parseCreateAuctionInput(await request.json());
    const auction = await createAuction(getPool(), input);
    return NextResponse.json(auction, {
      status: 201,
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create auction';
    const status = /must be|required|invalid|unsupported|non-negative|must be in the future/.test(message) ? 400 : 500;
    console.error('[auction-create]', error);
    return NextResponse.json({ error: message }, { status });
  }
}
