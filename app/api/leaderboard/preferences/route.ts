import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { StrKey } from '@stellar/stellar-sdk';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import {
  getLeaderboardPreferences,
  saveLeaderboardPreferences,
} from '@/lib/leaderboard/treeSponsors';
import { leaderboardPreferencesSchema } from '@/lib/leaderboard/treeSponsorsSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
async function authenticatedWallet(request: NextRequest): Promise<string | null> {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) return null;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const payload = await verifyPlanterJwt(authorization.slice(7));
  return payload?.type === 'access' &&
    typeof payload.sub === 'string' &&
    StrKey.isValidEd25519PublicKey(payload.sub)
    ? payload.sub
    : null;
}
export async function GET(request: NextRequest) {
  const wallet = await authenticatedWallet(request);
  if (!wallet)
    return NextResponse.json(
      { error: 'Authenticate your wallet to manage privacy.' },
      { status: 401, headers }
    );
  try {
    return NextResponse.json(await getLeaderboardPreferences(wallet), { headers });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load leaderboard preferences.' },
      { status: 503, headers }
    );
  }
}
export async function PUT(request: NextRequest) {
  const wallet = await authenticatedWallet(request);
  if (!wallet)
    return NextResponse.json(
      { error: 'Authenticate your wallet to manage privacy.' },
      { status: 401, headers }
    );
  const parsed = leaderboardPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Provide a valid display name, sponsor type and privacy choice.' },
      { status: 400, headers }
    );
  try {
    await saveLeaderboardPreferences(wallet, parsed.data);
    return NextResponse.json(parsed.data, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Unable to save leaderboard preferences.' },
      { status: 503, headers }
    );
  }
}
