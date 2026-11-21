import { NextResponse } from 'next/server';
import {
  competitiveAuctionRepository,
  AuctionValidationError,
} from '@/lib/api/competitive-auctions';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { auctions: competitiveAuctionRepository.list() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const seller =
      typeof body.seller === 'string'
        ? body.seller
        : (request.headers.get('x-wallet-address') ?? '');
    const auction = competitiveAuctionRepository.create({
      seller,
      projectId: typeof body.projectId === 'string' ? body.projectId : '',
      quantity: Number(body.quantity),
      reservePrice: Number(body.reservePrice),
      endAt: typeof body.endAt === 'string' ? body.endAt : '',
    });
    return NextResponse.json(
      { auction },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const status = error instanceof AuctionValidationError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create auction' },
      { status }
    );
  }
}
