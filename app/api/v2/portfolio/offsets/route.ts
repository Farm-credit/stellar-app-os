/**
 * /api/v2/portfolio/offsets — Issue #1302 / #1426
 *
 * Offset aggregation API for portfolio managers. Returns a single view of a
 * portfolio's carbon positions and retirements across platforms, sourced from
 * the aggregation service in `lib/api/offset-aggregation.ts`.
 *
 * GET /api/v2/portfolio/offsets
 *   ?portfolioId=<id>            required — portfolio manager scope
 *   &account=<G… 56-char>        optional — Stellar account backing the portfolio
 *   &platforms=verra,gold-standard
 *   &projectIds=proj-001,proj-004
 *   &status=all|active|retired   (default: all)
 *   &from=<ISO date>             inclusive lower bound on recordedAt
 *   &to=<ISO date>               inclusive upper bound on recordedAt
 *   &limit=<1..500>              (default: 100)
 *
 * POST /api/v2/portfolio/offsets
 *   Same fields as JSON: { portfolioId, account?, platforms?, projectIds?,
 *   status?, from?, to?, limit? }
 *
 * Responses:
 *   200  PortfolioOffsetSummary
 *   400  { error, details: string[] }   — validation failure
 *   502  { error, failures: [{ sourceId, message }] } — every source failed
 *   500  { error }
 *
 * Closes #1302, #1426
 */

import { NextResponse } from 'next/server';
import {
  OffsetAggregationError,
  aggregatePortfolioOffsets,
  parseOffsetAggregationQuery,
  parseOffsetAggregationRequest,
} from '@/lib/api/offset-aggregation';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

// Portfolio data is scoped to a manager, so it must never be cached publicly.
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
  if (error instanceof OffsetAggregationError) {
    console.error('[api/v2/portfolio/offsets] all sources failed:', error.failures);
    return NextResponse.json(
      { error: error.message, failures: error.failures },
      { status: 500, headers: responseHeaders() }
    );
  }

  console.error('[api/v2/portfolio/offsets] error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500, headers: responseHeaders() }
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = parseOffsetAggregationQuery(url.searchParams);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid offset aggregation request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const summary = await aggregatePortfolioOffsets(parsed.data);
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

    const parsed = parseOffsetAggregationRequest(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid offset aggregation request', details: parsed.errors },
        { status: 400, headers: responseHeaders() }
      );
    }

    const summary = await aggregatePortfolioOffsets(parsed.data);
    return NextResponse.json(summary, { headers: responseHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
