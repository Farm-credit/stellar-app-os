import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isValidTeamWallet, joinSponsorTeam } from '@/lib/team-forest';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { inviteCode?: string; wallet?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wallet = body.wallet?.trim() ?? '';
  const inviteCode = body.inviteCode?.trim() ?? '';
  if (!inviteCode || !isValidTeamWallet(wallet)) {
    return NextResponse.json(
      { error: 'inviteCode and a valid wallet are required' },
      { status: 400 }
    );
  }

  try {
    const result = await joinSponsorTeam(getPool(), inviteCode, wallet);
    return NextResponse.json({ joined: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join team';
    return NextResponse.json(
      { error: message },
      { status: message === 'Invite code not found' ? 404 : 400 }
    );
  }
}
