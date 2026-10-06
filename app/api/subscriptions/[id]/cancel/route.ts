import { NextResponse } from 'next/server';
import { cancelSubscription } from '@/lib/services/subscription';
import type { CancelSubscriptionRequest } from '@/lib/types/subscription';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const subscriptionId = parseInt(idStr, 10);

    if (Number.isNaN(subscriptionId)) {
      return NextResponse.json({ error: 'Invalid subscription ID' }, { status: 400 });
    }

    const body = (await request.json()) as { wallet: string };

    if (!body.wallet) {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }

    const req: CancelSubscriptionRequest = {
      subscription_id: subscriptionId,
      wallet: body.wallet,
    };

    const subscription = await cancelSubscription(req);

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[api:subscriptions:cancel] Error', { error });
    const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel subscription' },
      { status }
    );
  }
}
