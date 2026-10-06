import { NextResponse } from 'next/server';
import { createSubscription, listSubscriptions } from '@/lib/services/subscription';
import type { CreateSubscriptionRequest, SubscriptionStatus } from '@/lib/types/subscription';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet') || undefined;
    const status = (searchParams.get('status') || undefined) as SubscriptionStatus | undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await listSubscriptions({
      wallet,
      status,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api:subscriptions] List error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list subscriptions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSubscriptionRequest;

    if (!body.wallet || !body.amount) {
      return NextResponse.json({ error: 'wallet and amount are required' }, { status: 400 });
    }

    if (body.amount <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
    }

    if (!/^G[A-Z2-7]{55}$/.test(body.wallet)) {
      return NextResponse.json({ error: 'Invalid Stellar public key' }, { status: 400 });
    }

    const subscription = await createSubscription(body);

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    console.error('[api:subscriptions] Create error', { error });
    const status = error instanceof Error && error.message.includes('already exists') ? 409 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subscription' },
      { status }
    );
  }
}
