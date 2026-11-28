import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { UUID_RE } from '@/lib/webhook/presenters';
import { rotateExternalSubscriptionSecret } from '@/lib/webhook/subscriptionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const selector = UUID_RE.test(id)
    ? { publicId: id }
    : Number.isInteger(Number(id)) && Number(id) > 0
      ? { id: Number(id) }
      : null;

  if (!selector) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  try {
    const rotated = await rotateExternalSubscriptionSecret(getPool(), selector);
    if (!rotated) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    return NextResponse.json(rotated);
  } catch (error) {
    console.error('[api/admin/webhooks/subscriptions/[id]/rotate-secret] POST failed:', error);
    return NextResponse.json({ error: 'Failed to rotate signing secret' }, { status: 500 });
  }
}
