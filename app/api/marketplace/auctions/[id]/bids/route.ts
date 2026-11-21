import { NextResponse } from 'next/server';
import {
  competitiveAuctionRepository,
  AuctionNotFoundError,
  AuctionValidationError,
  AuctionConflictError,
} from '@/lib/api/competitive-auctions';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const bidder =
      typeof body.bidder === 'string'
        ? body.bidder
        : (request.headers.get('x-wallet-address') ?? '');
    const bid = competitiveAuctionRepository.placeBid(id, {
      bidder,
      quantity: Number(body.quantity),
      pricePerCredit: Number(body.pricePerCredit),
    });
    return NextResponse.json({ bid }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status =
      error instanceof AuctionNotFoundError
        ? 404
        : error instanceof AuctionValidationError
          ? 400
          : error instanceof AuctionConflictError
            ? 409
            : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to place bid' },
      { status }
    );
  }
}
