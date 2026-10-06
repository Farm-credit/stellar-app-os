/**
 * /api/v2/buyer-analytics — Issue #1413
 *
 * Buyer analytics API for corporate carbon buyers. Returns a single dashboard
 * view of a buyer's offset purchases: totals and effective cost per tonne,
 * purchased co-benefits, a per-project supply chain (chain of custody), and a
 * period-over-period trend analysis.
 *
 * Sourced from the offset-aggregation feeds via `lib/api/buyer-analytics.ts`.
 *
 * GET /api/v2/buyer-analytics
 *   ?buyerId=<id>                required — buyer scope
 *   &account=<G… 56-char>        optional — Stellar account backing the buyer
 *   &platforms=verra,gold-standard
 *   &projectIds=proj-001,proj-004
 *   &status=all|active|retired   (default: all)
 *   &from=<ISO date>             inclusive lower bound on recordedAt
 *   &to=<ISO date>               inclusive upper bound on recordedAt
 *   &interval=month|quarter      (default: month)
 *   &dataSource=synthetic|ledger|all (default: synthetic)
 *
 * POST /api/v2/buyer-analytics
 *   Same fields as JSON: { buyerId, account?, platforms?, projectIds?,
 *   status?, from?, to?, interval?, dataSource? }
 *
 * `dataSource=ledger` reads the buyer's real corporate purchase ledger and
 * retirement receipts from PostgreSQL; `buyerId` may be a Stellar wallet or a
 * corporate program UUID (see `lib/api/buyer-offset-ledger.ts`).
 *
 * Responses:
 *   200  BuyerAnalyticsSummary
 *   400  { error, details: string[] }                 — validation failure
 *   502  { error, failures: [{ sourceId, message }] } — every source failed
 *   500  { error }
 *
 * Closes #1289
 */

import { NextResponse } from 'next/server';
import {
  BuyerAnalyticsError,
  aggregateBuyerAnalytics,
  parseBuyerAnalyticsQuery,
  parseBuyerAnalyticsRequest,
} from '@/lib/api/buyer-analytics';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

// Buyer data is scoped to an organization, so it must never be cached publicly.
const CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0',
};

function responseHeaders(): Record<string, string> {
  return {
    ...CACHE_HEADERS,
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof BuyerAnalyticsError) {
    console.error('[api/v2/buyer-analytics] all sources failed:', error.failures);
    return NextResponse.json(
      { error: error.message, failures: error.failures },
      { status: 502, headers: responseHeaders() }
    );
  }

  console.error('[api/v2/buyer-analytics] error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500, headers: responseHeaders() }
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = parseBuyerAnalyticsQuery(url.searchParams);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid buyer analytics request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const summary = await aggregateBuyerAnalytics(parsed.data);
    return NextResponse.json(summary, { headers: responseHeaders() });
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

    const parsed = parseBuyerAnalyticsRequest(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid buyer analytics request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const summary = await aggregateBuyerAnalytics(parsed.data);
    return NextResponse.json(summary, { headers: responseHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
