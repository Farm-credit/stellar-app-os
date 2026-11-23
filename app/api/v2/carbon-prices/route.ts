/**
 * /api/v2/carbon-prices — Issue #1388
 *
 * Public real-time carbon credit market data. Returns one quote per listed
 * credit series, filtered by project type, region and certification standard,
 * plus aggregates by each of those dimensions.
 *
 * GET /api/v2/carbon-prices
 *   ?types=Reforestation,Mangrove%20Restoration   optional
 *   &regions=africa,latin-america                 optional
 *   &standards=Verra%20(VCS),Gold%20Standard      optional
 *   &projectIds=PROJ-001,PROJ-004                 optional
 *   &assetCodes=CARBON-PROJ-004-2024              optional
 *   &limit=1..500                                 optional (default: all)
 *
 * POST /api/v2/carbon-prices
 *   Same fields as JSON: { types?, regions?, standards?, projectIds?,
 *   assetCodes?, limit? }
 *
 * Responses:
 *   200  CarbonPriceSnapshot
 *   400  { error, details: string[] }                 — validation failure
 *   502  { error, failures: [{ sourceId, message }] } — price source unreachable
 *   500  { error }
 *
 * Historical series per asset: GET /api/v2/carbon-prices/history
 *
 * Closes #1388
 */

import { NextResponse } from 'next/server';
import {
  CarbonPriceError,
  aggregateCarbonPrices,
  parseCarbonPriceQuery,
  parseCarbonPriceRequest,
  updateCarbonPrice,
} from '@/lib/api/carbon-prices';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { isAdminRequest } from '@/lib/auth/admin';
import { notifyPriceChanged } from '@/lib/webhook/offset-verification-bridge';

export const runtime = 'nodejs';

// Market data is public and identical for every caller, so a short shared
// cache is safe (and intentional — it absorbs polling traffic).
const CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
};

function responseHeaders(): Record<string, string> {
  return {
    ...CACHE_HEADERS,
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

function mutationHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof CarbonPriceError) {
    console.error('[api/v2/carbon-prices] source failed:', error.failures);
    return NextResponse.json(
      { error: error.message, failures: error.failures },
      { status: 502, headers: responseHeaders() }
    );
  }

  console.error('[api/v2/carbon-prices] error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500, headers: responseHeaders() }
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = parseCarbonPriceQuery(url.searchParams);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid carbon price request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const snapshot = await aggregateCarbonPrices(parsed.data);
    return NextResponse.json(snapshot, { headers: responseHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: responseHeaders() }
      );
    }

    const parsed = parseCarbonPriceRequest(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid carbon price request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const snapshot = await aggregateCarbonPrices(parsed.data);
    return NextResponse.json(snapshot, { headers: responseHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: mutationHeaders() }
    );
  }

  let body: {
    assetCode?: unknown;
    projectId?: unknown;
    pricePerTon?: unknown;
    currency?: unknown;
    reason?: unknown;
    transactionHash?: unknown;
    explorerUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: mutationHeaders() }
    );
  }

  const assetCode = typeof body.assetCode === 'string' ? body.assetCode.trim() : '';
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined;
  const pricePerTon = Number(body.pricePerTon);

  if (!assetCode) {
    return NextResponse.json(
      { error: 'assetCode is required' },
      { status: 400, headers: mutationHeaders() }
    );
  }
  if (!Number.isFinite(pricePerTon) || pricePerTon <= 0) {
    return NextResponse.json(
      { error: 'pricePerTon must be a positive number' },
      { status: 400, headers: mutationHeaders() }
    );
  }

  const updated = updateCarbonPrice({
    assetCode,
    projectId: projectId || undefined,
    pricePerTon,
  });

  if (!updated) {
    return NextResponse.json(
      { error: 'Carbon credit series not found' },
      { status: 404, headers: mutationHeaders() }
    );
  }

  const currency =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : 'USD';

  if (updated.changed) {
    void notifyPriceChanged({
      assetCode: updated.record.assetCode,
      projectId: updated.record.projectId,
      currency,
      previousPricePerTon: updated.previousPricePerTon,
      pricePerTon: updated.pricePerTon,
      reason: typeof body.reason === 'string' ? body.reason : null,
      transactionHash: typeof body.transactionHash === 'string' ? body.transactionHash : null,
      explorerUrl: typeof body.explorerUrl === 'string' ? body.explorerUrl : null,
      changedAt: updated.record.updatedAt,
    });
  }

  return NextResponse.json(
    {
      assetCode: updated.record.assetCode,
      projectId: updated.record.projectId,
      currency,
      previousPricePerTon: updated.previousPricePerTon,
      pricePerTon: updated.pricePerTon,
      changed: updated.changed,
      updatedAt: updated.record.updatedAt,
    },
    { status: 200, headers: mutationHeaders() }
  );
}
