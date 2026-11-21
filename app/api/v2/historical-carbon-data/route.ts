/**
 * GET /api/v2/historical-carbon-data — Issue #1409
 *
 * Returns a market-wide historical view for carbon prices, project performance,
 * and aggregate buyer activity by region and project type.
 *
 * Query parameters:
 *   from=YYYY-MM-DD              optional, defaults to 365 days before `to`
 *   to=YYYY-MM-DD                optional, defaults to today (UTC)
 *   interval=day|week|month      optional, defaults to month
 *   regions=africa,oceania       optional
 *   projectTypes=Reforestation   optional
 *
 * Buyer activity is represented by aggregated listed volume. The public response
 * never exposes buyer identities or individual transactions.
 */

import { NextResponse } from 'next/server';
import {
  getHistoricalCarbonData,
  parseHistoricalCarbonQuery,
} from '@/lib/api/historical-carbon-data';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
  ...(apiVersionHeaders('v2') as Record<string, string>),
};

export function GET(request: Request): NextResponse {
  const parsed = parseHistoricalCarbonQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Invalid historical carbon data request', details: parsed.errors },
      { status: 400, headers }
    );
  }

  try {
    return NextResponse.json(getHistoricalCarbonData(parsed.data), { headers });
  } catch (error) {
    console.error('[api/v2/historical-carbon-data] error:', error);
    return NextResponse.json(
      { error: 'Unable to load historical carbon data' },
      { status: 500, headers }
    );
  }
}
