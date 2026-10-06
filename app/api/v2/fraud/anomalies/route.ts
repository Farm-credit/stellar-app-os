/**
 * POST /api/v2/fraud/anomalies — Issue #1381
 *
 * Accepts farmer/project/sale events and returns investigation flags for
 * double-selling, fake farmers, project inflation, and manipulated metrics.
 */

import { NextResponse } from 'next/server';
import { scanFraudEvents, type FraudEvent } from '@/lib/fraud/anomaly-monitor';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

function headers(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

function asEvents(body: unknown): FraudEvent[] | null {
  if (!body || typeof body !== 'object') return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  return events.filter((event) => event && typeof event === 'object') as FraudEvent[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: headers() });
  }

  const events = asEvents(body);
  if (!events) {
    return NextResponse.json(
      { error: 'Expected { events: FraudEvent[] }' },
      { status: 400, headers: headers() }
    );
  }

  return NextResponse.json(scanFraudEvents(events), { headers: headers() });
}
