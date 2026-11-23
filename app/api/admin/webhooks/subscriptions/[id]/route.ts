import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { UUID_RE } from '@/lib/webhook/presenters';
import { softDeleteSubscription } from '@/lib/webhook/repository';
import {
  updateExternalSubscription,
  WebhookSubscriptionInputError,
} from '@/lib/webhook/subscriptionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAdminSelector(id: string): { id?: number; publicId?: string } | null {
  if (UUID_RE.test(id)) return { publicId: id };
  const numeric = Number(id);
  if (Number.isInteger(numeric) && numeric > 0) return { id: numeric };
  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const selector = parseAdminSelector(id);
  if (!selector) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
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
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  try {
    const subscription = await updateExternalSubscription(getPool(), selector, {
      url: body.url,
      events: body.events ?? body.eventTypes,
      description: body.description,
      active: body.active,
    });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    return NextResponse.json({ subscription });
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[api/admin/webhooks/subscriptions/[id]] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update webhook subscription' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const selector = parseAdminSelector(id);
  if (!selector) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  try {
    const deleted = await softDeleteSubscription(getPool(), selector);
    if (!deleted) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/admin/webhooks/subscriptions/[id]] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete webhook subscription' }, { status: 500 });
  }
}
