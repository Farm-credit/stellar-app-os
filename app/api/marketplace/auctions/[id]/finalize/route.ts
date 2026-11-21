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
    const caller =
      typeof body.caller === 'string'
        ? body.caller
        : (request.headers.get('x-wallet-address') ?? '');
    const auction = competitiveAuctionRepository.finalize(id, caller);
    return NextResponse.json({ auction }, { headers: { 'Cache-Control': 'no-store' } });
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
      { error: error instanceof Error ? error.message : 'Unable to finalize auction' },
      { status }
    );
  }
}
