import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { toPublicSubscriptionDto } from '@/lib/webhook/presenters';
import { listSubscriptions } from '@/lib/webhook/repository';
import {
  createExternalSubscription,
  WebhookSubscriptionInputError,
} from '@/lib/webhook/subscriptionService';
import { authenticateWebhookV1Request } from '@/lib/webhook/v1Auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:read');
  if (!auth.ok) return auth.response;

  try {
    const rows = await listSubscriptions(getPool(), { apiKeyId: auth.caller.apiKeyId });
    return NextResponse.json(
      {
        subscriptions: rows.map(toPublicSubscriptionDto),
      },
      { status: 200, headers: auth.headers }
    );
  } catch (error) {
    console.error('[api/v1/webhooks] GET failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to list webhook subscriptions.' },
      { status: 500, headers: auth.headers }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:write');
  if (!auth.ok) return auth.response;

  let body: {
    url?: unknown;
    events?: unknown;
    eventTypes?: unknown;
    description?: unknown;
    active?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Request body must be valid JSON.' },
      { status: 400, headers: auth.headers }
    );
  }

  try {
    const { subscription, secret } = await createExternalSubscription(getPool(), {
      url: body.url,
      events: body.events ?? body.eventTypes,
      description: body.description,
      active: body.active,
      apiKeyId: auth.caller.apiKeyId,
      ownerWallet: auth.caller.ownerWallet,
      clientId: auth.caller.prefix,
    });

    return NextResponse.json(
      {
        ...subscription,
        secret,
      },
      { status: 201, headers: auth.headers }
    );
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: 'bad_request', message: error.message, details: error.details },
        { status: error.status, headers: auth.headers }
      );
    }
    console.error('[api/v1/webhooks] POST failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to create webhook subscription.' },
      { status: 500, headers: auth.headers }
    );
  }
}
