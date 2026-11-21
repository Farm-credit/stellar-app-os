import { NextResponse } from 'next/server';
import { createCooperative, listCooperatives } from '@/lib/api/cooperatives';
import {
  cooperativeErrorResponse,
  invalidJsonResponse,
  readJsonBody,
} from '@/lib/api/cooperatives-http';
import type { CooperativeStatus, CreateCooperativeInput } from '@/lib/types/cooperative';

export const runtime = 'nodejs';

/**
 * GET /api/cooperatives
 *
 * Lists cooperatives. Supports `region`, `status`, `search` and `memberId`
 * filters so a farmer can find cooperatives in their area or their own.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cooperatives = listCooperatives({
      region: searchParams.get('region') ?? undefined,
      status: (searchParams.get('status') as CooperativeStatus | null) ?? undefined,
      search: searchParams.get('search') ?? undefined,
      memberId: searchParams.get('memberId') ?? undefined,
    });

    return NextResponse.json({
      success: true,
      totalCount: cooperatives.length,
      cooperatives,
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * POST /api/cooperatives
 *
 * Forms a new cooperative. The caller becomes the founder member.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateCooperativeInput>(request);
    if (!body) return invalidJsonResponse();

    const cooperative = createCooperative(body);
    return NextResponse.json({ success: true, cooperative }, { status: 201 });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}
