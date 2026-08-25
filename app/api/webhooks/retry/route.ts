import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { retryDelivery } from '@/lib/webhook/dispatch';

/**
 * Manually retry a single webhook delivery (used by the admin webhook viewer).
 *
 * Body: { deliveryId: number }  (legacy callers may send { eventId } with the
 * numeric delivery id — both are accepted).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      deliveryId?: number | string;
      eventId?: number | string;
    };
    const rawId = body.deliveryId ?? body.eventId;
    const deliveryId = Number(rawId);

    if (rawId === undefined || rawId === null || !Number.isInteger(deliveryId) || deliveryId <= 0) {
      return NextResponse.json({ error: 'A numeric deliveryId is required' }, { status: 400 });
    }

    const delivery = await retryDelivery(getPool(), deliveryId);

    if (!delivery) {
      return NextResponse.json(
        { error: 'Delivery not found or no longer retryable' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: delivery.status === 'success',
        deliveryId: delivery.id,
        status: delivery.status,
        attemptCount: delivery.attempt_count,
        httpStatus: delivery.http_status,
        nextAttemptAt: delivery.next_attempt_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook retry error:', error);
    return NextResponse.json(
      {
        error: 'Failed to retry webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
