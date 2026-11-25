/**
 * GET  /api/v1/farmers/payments   — list payouts (filter by farmerId, status, currency)
 * POST /api/v1/farmers/payments   — initiate a new multi-currency farmer payout
 *
 * Issue #1276 — Farmer payment processing: multi-currency
 * Supports XLM, USDC, EURC, NGNT and fiat currencies (USD, EUR, GBP, NGN,
 * KES, GHS, BRL, INR, PHP) delivered via crypto wallet, bank transfer, or
 * mobile-money / payment app.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  processFarmerPayout,
  listFarmerPayouts,
  getSupportedPaymentChannels,
  type InitiatePayoutRequest,
  type PayoutStatus,
  type PayoutCurrency,
} from '@/lib/farmers/paymentProcessing';

export const runtime = 'nodejs';

// ── Validation schemas ────────────────────────────────────────────────────────

const cryptoWalletSchema = z.object({
  stellarAddress: z.string().min(56).max(56),
  memoType: z.enum(['text', 'id', 'hash']).optional(),
  memo: z.string().max(28).optional(),
  network: z.enum(['mainnet', 'testnet']).optional(),
});

const bankTransferSchema = z.object({
  rail: z.enum(['ach', 'sepa', 'faster_payments', 'nuban', 'swift']),
  accountHolderName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(34),
  bankName: z.string().min(1).max(200),
  routingNumber: z.string().optional(),
  bankCode: z.string().optional(),
  country: z.string().min(2).max(60),
});

const paymentAppSchema = z.object({
  provider: z.enum(['m_pesa', 'chipper_cash', 'flutterwave', 'paystack', 'paypal', 'venmo', 'revolut']),
  accountIdentifier: z.string().min(1).max(100),
  providerReference: z.string().optional(),
  recipientName: z.string().min(1).max(200),
});

const destinationSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('crypto_wallet'),
    crypto: cryptoWalletSchema,
    bank: z.undefined().optional(),
    paymentApp: z.undefined().optional(),
  }),
  z.object({
    channel: z.literal('bank_transfer'),
    bank: bankTransferSchema,
    crypto: z.undefined().optional(),
    paymentApp: z.undefined().optional(),
  }),
  z.object({
    channel: z.literal('payment_app'),
    paymentApp: paymentAppSchema,
    crypto: z.undefined().optional(),
    bank: z.undefined().optional(),
  }),
]);

const initiatePayoutSchema = z.object({
  farmerId: z.string().min(1).max(128),
  farmerName: z.string().min(1).max(200),
  projectId: z.string().optional(),
  quoteId: z.string().optional(),
  sourceCurrency: z.enum(['USD', 'USDC', 'XLM']),
  sourceAmount: z.number().finite().positive(),
  targetCurrency: z.enum([
    'XLM', 'USDC', 'EURC', 'NGNT',
    'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'BRL', 'INR', 'PHP',
  ]),
  destination: destinationSchema,
  idempotencyKey: z.string().max(128).optional(),
  narration: z.string().max(255).optional(),
});

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/farmers/payments
 *
 * Query params:
 *   farmerId  — filter by farmer
 *   status    — filter by payout status
 *   currency  — filter by source or target currency
 *   limit     — max records (default 50)
 *   channels  — if set to "supported" return the payment channel catalogue
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    // Return channel catalogue when ?channels=supported
    if (sp.get('channels') === 'supported') {
      return NextResponse.json({ channels: getSupportedPaymentChannels() });
    }

    const payouts = listFarmerPayouts({
      farmerId: sp.get('farmerId') ?? undefined,
      status: (sp.get('status') as PayoutStatus) ?? undefined,
      currency: (sp.get('currency') as PayoutCurrency) ?? undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : 50,
    });

    return NextResponse.json({
      payouts,
      total: payouts.length,
    });
  } catch (error) {
    console.error('[v1/farmers/payments] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/farmers/payments
 *
 * Initiates a multi-currency payout for a farmer. Supports:
 *   - Crypto wallets (XLM, USDC, EURC, NGNT on Stellar)
 *   - Bank transfers (ACH, SEPA, Faster Payments, NUBAN, SWIFT)
 *   - Payment apps / mobile money (M-Pesa, Chipper Cash, PayPal, Venmo, etc.)
 *
 * Returns 201 with the payout record on success.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = initiatePayoutSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return NextResponse.json({ error: 'Validation failed', details }, { status: 400 });
  }

  try {
    const payout = processFarmerPayout(parsed.data as InitiatePayoutRequest);
    return NextResponse.json({ payout }, { status: 201 });
  } catch (error) {
    console.error('[v1/farmers/payments] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
