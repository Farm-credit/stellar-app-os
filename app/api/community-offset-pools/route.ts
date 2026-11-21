import { NextResponse } from 'next/server';
import {
  createCommunityPool,
  joinCommunityPool,
  listCommunityPools,
} from '@/lib/services/community-offset-pools';
import type {
  CreateCommunityPoolInput,
  JoinCommunityPoolInput,
} from '@/lib/types/community-offset-pool';
export const runtime = 'nodejs';
export function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status') as
    'open' | 'funded' | 'purchased' | 'cancelled' | null;
  return NextResponse.json({ pools: listCommunityPools(status ?? undefined) });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateCommunityPoolInput & {
      action?: 'join';
      poolId?: string;
      wallet?: string;
      amount?: number;
    };
    if (body.action === 'join')
      return NextResponse.json({
        pool: joinCommunityPool(body as unknown as JoinCommunityPoolInput),
      });
    return NextResponse.json({ pool: createCommunityPool(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to process community pool request',
      },
      { status: 400 }
    );
  }
}
