/**
 * GET /api/gift-cards/:code
 * Looks up a tree sponsorship gift card by its redemption code.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getGiftCardByCode } from '@/lib/gift-cards/giftCard';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await context.params;
  const giftCard = getGiftCardByCode(code);

  if (!giftCard) {
    return NextResponse.json(
      { error: 'Gift card not found. Please check your redemption code.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ giftCard }, { headers: { 'Cache-Control': 'no-store' } });
}
