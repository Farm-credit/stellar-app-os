/**
 * /api/v2/carbon-prices/history — Issue #1388
 *
 * Historical carbon credit pricing for one listed series, aggregated into
 * daily, weekly or monthly buckets.
 *
 * GET /api/v2/carbon-prices/history
 *   ?assetCode=CARBON-PROJ-004-2024   required
 *   &interval=day|week|month          optional (default: day)
 *   &from=<ISO date>                  optional (default: 90 days before `to`)
 *   &to=<ISO date>                    optional (default: today, UTC)
 *
 * Responses:
 *   200  CarbonPriceHistory
 *   400  { error, details: string[] }                 — validation failure
 *   404  { error }                                    — asset not listed
 *   502  { error, failures: [{ sourceId, message }] } — price source unreachable
 *   500  { error }
 *
 * Closes #1388
 */

import { NextResponse } from 'next/server';
import {
  CarbonPriceError,
  getCarbonPriceHistory,
  parseCarbonPriceHistoryQuery,
} from '@/lib/api/carbon-prices';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
};

function responseHeaders(): Record<string, string> {
  return {
    ...CACHE_HEADERS,
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = parseCarbonPriceHistoryQuery(url.searchParams);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid carbon price history request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const history = await getCarbonPriceHistory(parsed.data);
    if (!history) {
      return NextResponse.json(
        { error: `Unknown assetCode: ${parsed.data.assetCode}` },
        { status: 404, headers: responseHeaders() }
      );
    }

    return NextResponse.json(history, { headers: responseHeaders() });
  } catch (error) {
    if (error instanceof CarbonPriceError) {
      console.error('[api/v2/carbon-prices/history] source failed:', error.failures);
      return NextResponse.json(
        { error: error.message, failures: error.failures },
        { status: 502, headers: responseHeaders() }
      );
    }

    console.error('[api/v2/carbon-prices/history] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
