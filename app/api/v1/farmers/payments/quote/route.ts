/**
 * POST /api/v1/farmers/payments/quote
 *
 * Returns a 15-minute locked exchange-rate quote for a proposed payout.
 * Clients should request a quote first, then pass the returned quoteId
 * when calling POST /api/v1/farmers/payments to lock in the rate.
 *
 * Issue #1276 — Farmer payment processing: multi-currency
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculatePayoutQuote } from '@/lib/farmers/paymentProcessing';

export const runtime = 'nodejs';

const quoteRequestSchema = z.object({
  farmerId: z.string().min(1).max(128),
  sourceCurrency: z.enum(['USD', 'USDC', 'XLM']),
  sourceAmount: z.number().finite().positive(),
  targetCurrency: z.enum([
    'XLM', 'USDC', 'EURC', 'NGNT',
    'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'BRL', 'INR', 'PHP',
  ]),
  channel: z.enum(['crypto_wallet', 'bank_transfer', 'payment_app']),
});

/**
 * POST /api/v1/farmers/payments/quote
 *
 * Body: { farmerId, sourceCurrency, sourceAmount, targetCurrency, channel }
 *
 * Returns a quote with locked exchange rate valid for 15 minutes.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return NextResponse.json({ error: 'Validation failed', details }, { status: 400 });
  }

  try {
    const quote = calculatePayoutQuote(parsed.data);
    return NextResponse.json({ quote }, { status: 200 });
  } catch (error) {
    console.error('[v1/farmers/payments/quote] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/farmers/payments/quote
 *
 * Convenience GET variant — accepts query params for simple integrations.
 * Params: farmerId, sourceCurrency, sourceAmount, targetCurrency, channel
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raw = {
    farmerId: sp.get('farmerId'),
    sourceCurrency: sp.get('sourceCurrency'),
    sourceAmount: sp.get('sourceAmount') ? Number(sp.get('sourceAmount')) : undefined,
    targetCurrency: sp.get('targetCurrency'),
    channel: sp.get('channel'),
  };

  const parsed = quoteRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return NextResponse.json({ error: 'Validation failed', details }, { status: 400 });
  }

  try {
    const quote = calculatePayoutQuote(parsed.data);
    return NextResponse.json({ quote });
  } catch (error) {
    console.error('[v1/farmers/payments/quote] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
