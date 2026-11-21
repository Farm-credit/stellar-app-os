import { NextResponse } from 'next/server';
import { competitiveAuctionRepository, AuctionNotFoundError } from '@/lib/api/competitive-auctions';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(
      { auction: competitiveAuctionRepository.get(id) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const status = error instanceof AuctionNotFoundError ? 404 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load auction' },
      { status }
    );
  }
}
