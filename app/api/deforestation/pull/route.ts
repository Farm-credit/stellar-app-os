import { type NextRequest, NextResponse } from 'next/server';

import { pullDeforestationAlerts } from '@/lib/deforestation/service';

/**
 * POST /api/deforestation/pull
 *
 * Run a deforestation alert pull for every monitored zone now (Issue #672).
 * Body (optional): `{ "notify": false }` to record new alerts without sending
 * notification emails. The scheduled equivalent is `pnpm deforestation:pull`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let notify = true;
  try {
    const body = (await request.json()) as { notify?: unknown } | null;
    if (body && typeof body.notify === 'boolean') notify = body.notify;
  } catch {
    // Empty body — defaults apply.
  }

  const summary = await pullDeforestationAlerts({ notify });

  return NextResponse.json({ success: true, summary }, { status: 200 });
}
