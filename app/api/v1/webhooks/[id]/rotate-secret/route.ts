import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { UUID_RE } from '@/lib/webhook/presenters';
import { rotateExternalSubscriptionSecret } from '@/lib/webhook/subscriptionService';
import { authenticateWebhookV1Request } from '@/lib/webhook/v1Auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
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
    const rotated = await rotateExternalSubscriptionSecret(getPool(), {
      publicId: id,
      apiKeyId: auth.caller.apiKeyId,
    });
    if (!rotated) {
      return NextResponse.json(
        { error: 'not_found', message: 'Webhook subscription not found.' },
        { status: 404, headers: auth.headers }
      );
    }

    return NextResponse.json(
      {
        ...rotated.subscription,
        secret: rotated.secret,
        previousSecretExpiresAt: rotated.previousSecretExpiresAt,
      },
      { status: 200, headers: auth.headers }
    );
  } catch (error) {
    console.error('[api/v1/webhooks/[id]/rotate-secret] POST failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to rotate webhook secret.' },
      { status: 500, headers: auth.headers }
    );
  }
}
