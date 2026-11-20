/**
 * /api/gift-cards
 *
 * GET /api/gift-cards
 *   Returns fixed gift card denominations and available tree assignment options.
 *
 * POST /api/gift-cards
 *   Purchases a tree sponsorship gift card in a fixed denomination, delivers it
 *   via email to the recipient (with optional personalised message), and returns
 *   the gift card details and redemption landing page URL.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  GIFT_CARD_DENOMINATIONS,
  GIFT_CARD_REGIONS,
  GIFT_CARD_SPECIES,
  buildGiftCardRedeemUrl,
  createGiftCard,
  renderGiftCardEmail,
  validateGiftCardPurchaseInput,
} from '@/lib/gift-cards/giftCard';
import { sendGiftCardEmail } from '@/lib/email/sendgrid';
import { MemoryRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const purchaseLimiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 10 });
const emailLimiter = new MemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 10 });

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function baseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

function tooManyRequests(retryAfter?: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter ?? 60) } }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    denominations: GIFT_CARD_DENOMINATIONS,
    species: GIFT_CARD_SPECIES,
    regions: GIFT_CARD_REGIONS,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);
  const limit = await purchaseLimiter.limit(`gift-card:${ip}`);
  if (!limit.success) return tooManyRequests(limit.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', errors: { body: 'Request body must be valid JSON' } },
      { status: 400 }
    );
  }

  const validated = validateGiftCardPurchaseInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: 'Invalid gift card purchase details', errors: validated.errors },
      { status: 400 }
    );
  }

  const emailLimit = await emailLimiter.limit(`gift-card-email:${ip}`);
  if (!emailLimit.success) return tooManyRequests(emailLimit.retryAfter);

  const giftCard = createGiftCard(validated.value);
  const redeemUrl = buildGiftCardRedeemUrl(giftCard.code, baseUrl(request));

  let emailSent = false;
  try {
    const email = renderGiftCardEmail(giftCard, redeemUrl);
    emailSent = await sendGiftCardEmail({
      to: giftCard.recipientEmail,
      ...email,
    });
  } catch (error) {
    console.error('[api/gift-cards] email delivery failed:', error);
  }

  return NextResponse.json(
    { giftCard, redeemUrl, emailSent },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
