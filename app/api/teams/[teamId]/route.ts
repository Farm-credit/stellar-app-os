import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { addTreeToSponsorTeam, getSponsorTeam, isValidTeamWallet } from '@/lib/team-forest';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { teamId } = await context.params;
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim() ?? '';
  if (!teamId || !isValidTeamWallet(wallet)) {
    return NextResponse.json({ error: 'teamId and a valid wallet are required' }, { status: 400 });
  }

  try {
    const team = await getSponsorTeam(getPool(), teamId, wallet);
    return NextResponse.json(team, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load team';
    return NextResponse.json(
      { error: message },
      { status: message === 'Team membership required' ? 403 : 404 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { teamId } = await context.params;
  let body: { wallet?: string; treeRef?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wallet = body.wallet?.trim() ?? '';
  const treeRef = body.treeRef?.trim() ?? '';
  if (!teamId || !isValidTeamWallet(wallet) || !treeRef) {
    return NextResponse.json(
      { error: 'teamId, wallet, and treeRef are required' },
      { status: 400 }
    );
  }

  try {
    await addTreeToSponsorTeam(getPool(), teamId, wallet, treeRef);
    return NextResponse.json({ shared: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to share tree';
    const status = message === 'Team membership required' ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
