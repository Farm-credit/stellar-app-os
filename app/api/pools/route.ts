/**
 * GET  /api/pools        — list all pools (query: ?status=open|all)
 * POST /api/pools        — create a new pooled sponsorship
 */

import { NextResponse } from 'next/server';
import { createPool, listOpenPools, listAllPools } from '@/lib/services/pooled-sponsorship';
import type { CreatePoolRequest } from '@/lib/types/pooled-sponsorship';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'open';
    const pools = status === 'all' ? listAllPools() : listOpenPools();
    return NextResponse.json({ pools });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list pools';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePoolRequest;
    const { treeRef, species, region, targetUsdc, sponsorAddress, contributionUsdc } = body;

    if (!treeRef || !species || !region || !sponsorAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!targetUsdc || targetUsdc <= 0) {
      return NextResponse.json({ error: 'targetUsdc must be greater than zero' }, { status: 400 });
    }
    if (contributionUsdc < 0) {
      return NextResponse.json({ error: 'contributionUsdc cannot be negative' }, { status: 400 });
    }
    if (contributionUsdc > targetUsdc) {
      return NextResponse.json(
        { error: 'contributionUsdc cannot exceed targetUsdc' },
        { status: 400 }
      );
    }

    const pool = createPool(body);
    return NextResponse.json(pool, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create pool';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
