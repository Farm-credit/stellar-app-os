import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { toPublicSubscriptionDto } from '@/lib/webhook/presenters';
import { listSubscriptions } from '@/lib/webhook/repository';
import {
  createExternalSubscription,
  WebhookSubscriptionInputError,
} from '@/lib/webhook/subscriptionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await listSubscriptions(getPool());
    return NextResponse.json({
      subscriptions: rows.map(toPublicSubscriptionDto),
    });
  } catch (error) {
    console.error('[api/admin/webhooks/subscriptions] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load webhook subscriptions' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    url?: unknown;
    events?: unknown;
    eventTypes?: unknown;
    description?: unknown;
    active?: unknown;
    planterId?: number | string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  try {
    const planterId =
      body.planterId !== undefined && body.planterId !== null && body.planterId !== ''
        ? Number(body.planterId)
        : null;

    if (planterId !== null && (!Number.isInteger(planterId) || planterId <= 0)) {
      return NextResponse.json({ error: 'planterId must be a positive integer' }, { status: 400 });
    }

    const { subscription, secret } = await createExternalSubscription(getPool(), {
      url: body.url,
      events: body.events ?? body.eventTypes,
      description: body.description,
      active: body.active,
      planterId,
      clientId: planterId === null ? 'admin' : null,
    });

    return NextResponse.json({ subscription, secret }, { status: 201 });
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[api/admin/webhooks/subscriptions] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create webhook subscription' }, { status: 500 });
  }
}
