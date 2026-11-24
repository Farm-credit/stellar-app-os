/**
 * /api/v2/carbon-accounting — Issue #1370
 *
 * Public HTTP adapter for the GHG Protocol inventory engine. Keeping the
 * validation and calculation in `lib/api/ghg-protocol.ts` lets clients use
 * the same behaviour through POST requests and through the catalogue GET.
 */

import { NextResponse } from 'next/server';
import {
  calculateGhgInventory,
  getGhgFactorCatalogue,
  parseGhgInventoryQuery,
  parseGhgInventoryRequest,
} from '@/lib/api/ghg-protocol';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

function responseHeaders(): Record<string, string> {
  return {
    ...CACHE_HEADERS,
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

function validationResponse(details: string[]): NextResponse {
  return NextResponse.json(
    { error: 'Invalid carbon accounting request', details },
    { status: 400, headers: responseHeaders() }
  );
}

function errorResponse(error: unknown): NextResponse {
  console.error('[api/v2/carbon-accounting] error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500, headers: responseHeaders() }
  );
}

function hasInventoryParams(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (key.startsWith('scope1.') || key.startsWith('scope2.') || key.startsWith('offsets.')) {
      return true;
    }
    if (key === 'from' || key === 'to') return true;
  }
  return false;
}

export function GET(request: Request): NextResponse {
  try {
    const url = new URL(request.url);
    if (!hasInventoryParams(url.searchParams)) {
      return NextResponse.json(getGhgFactorCatalogue(), { headers: responseHeaders() });
    }

    const parsed = parseGhgInventoryQuery(url.searchParams);
    if (!parsed.ok) return validationResponse(parsed.errors);
    return NextResponse.json(calculateGhgInventory(parsed.data), {
      headers: responseHeaders(),
    });
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

    const parsed = parseGhgInventoryRequest(body);
    if (!parsed.ok) return validationResponse(parsed.errors);
    return NextResponse.json(calculateGhgInventory(parsed.data), {
      headers: responseHeaders(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
