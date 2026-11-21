/**
 * POST /api/gift-cards/:code/redeem
 * Redeems an active tree sponsorship gift card and assigns the recipient's sponsored tree(s).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { redeemGiftCard, validateGiftCardRedemptionInput } from '@/lib/gift-cards/giftCard';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', errors: { body: 'Request body must be valid JSON' } },
      { status: 400 }
    );
  }

  const validated = validateGiftCardRedemptionInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: 'Invalid redemption details', errors: validated.errors },
      { status: 400 }
    );
  }

  const result = redeemGiftCard(code, validated.value);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      return NextResponse.json(
        { error: 'Gift card not found. Please check your redemption code.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        error: 'This gift card has already been redeemed.',
        giftCard: result.giftCard,
      },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      giftCard: result.giftCard,
      assignedTreeIds: result.giftCard.redemption?.assignedTreeIds ?? [],
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
