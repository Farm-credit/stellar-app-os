import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { createSponsorTeam, isValidTeamWallet } from '@/lib/team-forest';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { name?: string; ownerWallet?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ownerWallet = body.ownerWallet?.trim() ?? '';
  if (!isValidTeamWallet(ownerWallet) || !body.name?.trim()) {
    return NextResponse.json(
      { error: 'name and a valid ownerWallet are required' },
      { status: 400 }
    );
  }

  try {
    const team = await createSponsorTeam(getPool(), ownerWallet, body.name);
    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create team';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
