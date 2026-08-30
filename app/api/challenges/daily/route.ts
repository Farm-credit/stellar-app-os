import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  claimRewards,
  getChallengeHistory,
  getDailyChallenges,
  seedChallengeTemplates,
  trackChallengeProgress,
} from '@/lib/gamification/daily-challenges';
import type { TrackProgressInput } from '@/lib/types/daily-challenge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/challenges/daily
 *
 * Get today's daily challenges for a sponsor.
 * Query params:
 *   wallet  — the sponsor's Stellar wallet (required)
 *   history — if "true", returns challenge history instead
 *   days    — number of days of history (default 30)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');

  if (!wallet?.trim()) {
    return NextResponse.json({ error: 'wallet query param is required' }, { status: 400 });
  }

  try {
    // Check if requesting history.
    const history = url.searchParams.get('history');
    if (history === 'true') {
      const daysParam = url.searchParams.get('days');
      const days = daysParam ? Number.parseInt(daysParam, 10) : 30;
      const entries = await getChallengeHistory(getPool(), wallet.trim(), days);
      return NextResponse.json(entries, {
        headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60' },
      });
    }

    const response = await getDailyChallenges(getPool(), wallet.trim());
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[challenges/daily] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch daily challenges' }, { status: 500 });
  }
}

/**
 * POST /api/challenges/daily
 *
 * Actions (via x-action header or query param):
 *   track   — Track progress on today's challenges (called by donation/staking flows)
 *   claim   — Claim all unclaimed rewards
 *   seed    — Seed challenge templates (admin only)
 *
 * Body for "track":
 *   { wallet, challenge_type, increment, species_slug?, region? }
 *
 * Body for "claim":
 *   { wallet }
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? request.headers.get('x-action');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'track': {
        const wallet = String(body.wallet ?? '').trim();
        if (!wallet) {
          return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
        }

        const input: TrackProgressInput = {
          wallet,
          challenge_type: String(body.challenge_type ?? '') as TrackProgressInput['challenge_type'],
          increment:
            typeof body.increment === 'number' ? body.increment : Number(body.increment ?? 1),
          species_slug: body.species_slug ? String(body.species_slug) : undefined,
          region: body.region ? String(body.region) : undefined,
        };

        if (!input.challenge_type) {
          return NextResponse.json({ error: 'challenge_type is required' }, { status: 400 });
        }

        const result = await trackChallengeProgress(getPool(), input);
        return NextResponse.json(result, { status: 200 });
      }

      case 'claim': {
        const wallet = String(body.wallet ?? '').trim();
        if (!wallet) {
          return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
        }

        const result = await claimRewards(getPool(), wallet);
        return NextResponse.json(result, { status: 200 });
      }

      case 'seed': {
        const result = await seedChallengeTemplates(getPool());
        return NextResponse.json(result, { status: 201 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use 'track', 'claim', or 'seed'.` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed';
    console.error('[challenges/daily] POST error', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
