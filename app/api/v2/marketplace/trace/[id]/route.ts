/**
 * GET /api/v2/marketplace/trace/:id — Issue #1420
 *
 * Supply chain trace for a carbon credit batch. `id` may be a batch id or the
 * marketplace listing id the batch backs.
 *
 * 200 { trace, verification, summary }
 *     `trace.farmer` is redacted unless the farmer consented to sharing.
 * 404 { error } — no trace (e.g. non nature-based credits have no farm origin)
 */

import { NextResponse } from 'next/server';
import {
  findCreditTrace,
  summarizeTrace,
  toPublicTrace,
  verifyTrace,
} from '@/lib/marketplace/supplyChainTrace';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const trace = findCreditTrace(id);

  if (!trace) {
    return NextResponse.json(
      { error: `No supply chain trace found for ${id}` },
      { status: 404, headers: apiVersionHeaders('v2') }
    );
  }

  return NextResponse.json(
    {
      trace: toPublicTrace(trace),
      verification: verifyTrace(trace),
      summary: summarizeTrace(trace),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        ...(apiVersionHeaders('v2') as Record<string, string>),
      },
    }
  );
}
