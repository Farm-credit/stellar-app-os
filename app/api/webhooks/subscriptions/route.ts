import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { insertSubscription, listSubscriptions } from '@/lib/webhook/repository';
import { randomBytes } from 'node:crypto';

const TREE_STATUS_EVENTS = ['tree.status.changed', 'planter.tree.health.updated'];

function normalizeUrl(url: string): string {
  return url.trim();
}

export async function GET() {
  try {
    const subscriptions = await listSubscriptions(getPool());
    return NextResponse.json({ subscriptions });
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      planterId?: number | string;
      url?: string;
      eventTypes?: string[];
      isActive?: boolean;
    };

    const planterId = Number(body.planterId);
    const url = normalizeUrl(body.url ?? '');
    const eventTypes = Array.isArray(body.eventTypes) && body.eventTypes.length > 0
      ? body.eventTypes
      : TREE_STATUS_EVENTS;

    if (!Number.isInteger(planterId) || planterId <= 0) {
      return NextResponse.json({ error: 'A valid planterId is required' }, { status: 400 });
    }

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'A valid http(s) callback URL is required' }, { status: 400 });
    }

    const secret = randomBytes(32).toString('hex');
    const subscription = await insertSubscription(getPool(), {
      planterId,
      url,
      secret,
      eventTypes,
      isActive: body.isActive ?? true,
    });

    return NextResponse.json(
      {
        success: true,
        subscription: {
          id: subscription.id,
          planter_id: subscription.planter_id,
          url: subscription.url,
          event_types: subscription.event_types,
          is_active: subscription.is_active,
          secret,
        },
      },
      { status: 201 }
    );
  } catch (error) {
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
