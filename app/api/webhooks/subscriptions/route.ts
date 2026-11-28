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

const TREE_STATUS_EVENTS = [
  'tree.planted',
  'tree.verified',
  'tree.grown',
  'tree.died',
  'tree.status.changed',
  'planter.tree.health.updated',
];

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const subscriptions = await listSubscriptions(getPool());
    return NextResponse.json({
      subscriptions: subscriptions.map(toPublicSubscriptionDto),
    });
  } catch (error) {
    console.error('Webhook subscriptions fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch webhook subscriptions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    planterId?: number | string;
    url?: string;
    eventTypes?: string[];
    events?: string[];
    description?: string;
    isActive?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  try {
    const rawPlanterId = body.planterId;
    let planterId: number | null = null;
    if (rawPlanterId !== undefined && rawPlanterId !== null && rawPlanterId !== '') {
      const parsedPlanterId = Number(rawPlanterId);
      if (!Number.isInteger(parsedPlanterId) || parsedPlanterId <= 0) {
        return NextResponse.json({ error: 'A valid planterId is required' }, { status: 400 });
      }
      planterId = parsedPlanterId;
    }

    const rawEvents = body.eventTypes ?? body.events;
    const events =
      Array.isArray(rawEvents) && rawEvents.length > 0 ? rawEvents : TREE_STATUS_EVENTS;

    const { subscription, secret } = await createExternalSubscription(getPool(), {
      planterId,
      clientId: planterId === null ? 'admin' : null,
      url: body.url,
      events,
      description: body.description,
      active: body.isActive ?? true,
    });

    return NextResponse.json(
      {
        success: true,
        subscription: {
          ...subscription,
          secret,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('Webhook subscription create error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create webhook subscription',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
