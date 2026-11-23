import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { toPublicSubscriptionDto, UUID_RE } from '@/lib/webhook/presenters';
import { getSubscriptionByPublicId, softDeleteSubscription } from '@/lib/webhook/repository';
import {
  updateExternalSubscription,
  WebhookSubscriptionInputError,
} from '@/lib/webhook/subscriptionService';
import { authenticateWebhookV1Request } from '@/lib/webhook/v1Auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:read');
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'not_found', message: 'Webhook subscription not found.' },
      { status: 404, headers: auth.headers }
    );
  }

  try {
    const row = await getSubscriptionByPublicId(getPool(), id, {
      apiKeyId: auth.caller.apiKeyId,
    });
    if (!row) {
      return NextResponse.json(
        { error: 'not_found', message: 'Webhook subscription not found.' },
        { status: 404, headers: auth.headers }
      );
    }
    return NextResponse.json(toPublicSubscriptionDto(row), {
      status: 200,
      headers: auth.headers,
    });
  } catch (error) {
    console.error('[api/v1/webhooks/[id]] GET failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch webhook subscription.' },
      { status: 500, headers: auth.headers }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:write');
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'not_found', message: 'Webhook subscription not found.' },
      { status: 404, headers: auth.headers }
    );
  }

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
    const updated = await updateExternalSubscription(
      getPool(),
      { publicId: id, apiKeyId: auth.caller.apiKeyId },
      {
        url: body.url,
        events: body.events ?? body.eventTypes,
        description: body.description,
        active: body.active,
      }
    );

    if (!updated) {
      return NextResponse.json(
        { error: 'not_found', message: 'Webhook subscription not found.' },
        { status: 404, headers: auth.headers }
      );
    }

    return NextResponse.json(updated, { status: 200, headers: auth.headers });
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: 'bad_request', message: error.message, details: error.details },
        { status: error.status, headers: auth.headers }
      );
    }
    console.error('[api/v1/webhooks/[id]] PATCH failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to update webhook subscription.' },
      { status: 500, headers: auth.headers }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:write');
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'not_found', message: 'Webhook subscription not found.' },
      { status: 404, headers: auth.headers }
    );
  }

  try {
    const deleted = await softDeleteSubscription(getPool(), {
      publicId: id,
      apiKeyId: auth.caller.apiKeyId,
    });
    if (!deleted) {
      return NextResponse.json(
        { error: 'not_found', message: 'Webhook subscription not found.' },
        { status: 404, headers: auth.headers }
      );
    }
    return new NextResponse(null, { status: 204, headers: auth.headers });
  } catch (error) {
    console.error('[api/v1/webhooks/[id]] DELETE failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to delete webhook subscription.' },
      { status: 500, headers: auth.headers }
    );
  }
}
