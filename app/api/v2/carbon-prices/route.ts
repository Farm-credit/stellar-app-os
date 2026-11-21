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
} from '@/lib/api/carbon-prices';
import { apiVersionHeaders } from '@/lib/api/versioning';

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
