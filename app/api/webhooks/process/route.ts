import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { processDueDeliveries } from '@/lib/webhook/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backoff processor: redelivers webhook deliveries whose retry timer has
 * elapsed. Intended to be invoked on a schedule (Vercel Cron GET or external
 * scheduler POST), e.g. every 5 minutes.
 *
 * Protected by a shared secret in the `Authorization: Bearer <WEBHOOK_CRON_SECRET>`
 * (or `<CRON_SECRET>`) header so it can't be triggered by arbitrary callers.
 */
async function handleProcess(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.WEBHOOK_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'WEBHOOK_CRON_SECRET is not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const processed = await processDueDeliveries(getPool());

    return NextResponse.json({
      processed: processed.length,
      succeeded: processed.filter((d) => d.status === 'success').length,
      stillRetrying: processed.filter((d) => d.status === 'retrying').length,
      failed: processed.filter((d) => d.status === 'failed').length,
    });
  } catch (error) {
    console.error('Webhook process error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process due webhooks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export function GET(request: NextRequest): Promise<NextResponse> {
  return handleProcess(request);
}

export function POST(request: NextRequest): Promise<NextResponse> {
  return handleProcess(request);
}
