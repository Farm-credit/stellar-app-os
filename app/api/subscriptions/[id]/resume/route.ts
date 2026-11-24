import { NextResponse } from 'next/server';
import { resumeSubscription } from '@/lib/services/subscription';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = (await request.json()) as { wallet?: string };
    if (!Number.isInteger(id) || !body.wallet)
      return NextResponse.json(
        { error: 'subscription id and wallet are required' },
        { status: 400 }
      );
    const subscription = await resumeSubscription({ subscription_id: id, wallet: body.wallet });
    return NextResponse.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume subscription';
    return NextResponse.json(
      { error: message },
      { status: message.includes('not found') ? 404 : 400 }
    );
  }
}
