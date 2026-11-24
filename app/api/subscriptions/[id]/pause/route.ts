import { NextResponse } from 'next/server';
import { pauseSubscription } from '@/lib/services/subscription';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = (await request.json()) as { wallet?: string; duration_months?: number };
    if (!Number.isInteger(id) || !body.wallet || !Number.isInteger(body.duration_months)) {
      return NextResponse.json(
        { error: 'subscription id, wallet, and duration_months are required' },
        { status: 400 }
      );
    }
    const subscription = await pauseSubscription({
      subscription_id: id,
      wallet: body.wallet,
      duration_months: body.duration_months,
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause subscription';
    return NextResponse.json(
      { error: message },
      { status: message.includes('not found') ? 404 : 400 }
    );
  }
}
