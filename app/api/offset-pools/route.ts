import { NextResponse } from 'next/server';
import {
  createCommunityOffsetPool,
  listCommunityOffsetPools,
} from '@/lib/services/community-offset-pools';
export function GET() {
  return NextResponse.json({ pools: listCommunityOffsetPools() });
}
export async function POST(request: Request) {
  try {
    return NextResponse.json(createCommunityOffsetPool(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create pool' },
      { status: 400 }
    );
  }
}
