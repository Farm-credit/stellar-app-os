import { NextResponse } from 'next/server';
import { updateSpeciesPreference } from '@/lib/services/subscription';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = (await request.json()) as { wallet?: string; species_preference?: string | null };
    if (!Number.isInteger(id) || !body.wallet || !('species_preference' in body)) {
      return NextResponse.json(
        { error: 'subscription id, wallet, and species_preference are required' },
        { status: 400 }
      );
    }
    const subscription = await updateSpeciesPreference({
      subscription_id: id,
      wallet: body.wallet,
      species_preference: body.species_preference ?? null,
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update species preference';
    return NextResponse.json(
      { error: message },
      { status: message.includes('not found') ? 404 : 400 }
    );
  }
}
