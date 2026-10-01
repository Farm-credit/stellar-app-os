import { NextResponse } from 'next/server';
import { getMockAffiliateProgram } from '@/lib/api/mock/affiliateProgram';
import { processFarmerPayment, type FarmerPaymentRequest } from '@/lib/payments/farmerPayments';

export const runtime = 'nodejs';

const SUPPORTED_CURRENCIES = ['XLM', 'USDC', 'FIAT'] as const;
const SUPPORTED_METHODS = ['bank_transfer', 'crypto_wallet', 'payment_app'] as const;

const CURRENCY_METHOD_MAP: Record<(typeof SUPPORTED_CURRENCIES)[number], readonly (typeof SUPPORTED_METHODS)[number][]> = {
  XLM: ['crypto_wallet'],
  USDC: ['crypto_wallet'],
  FIAT: ['bank_transfer', 'payment_app'],
};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {};
}

/**
 * GET /api/affiliate
 */
export function GET(request: Request) {
  return NextResponse.json(getMockAffiliateProgram(), { headers: getCorsHeaders(request) });
}

/**
 * POST /api/affiliate
 * Process a farmer payment in XLM, USDC, or fiat.
 */
export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders },
    );
  }

  const payload = body as Partial<FarmerPaymentRequest>;

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400, headers: corsHeaders },
    );
  }

  const { farmerId, amount, currency, method, destination } = payload;

  if (!farmerId || typeof farmerId !== 'string') {
    return NextResponse.json(
      { error: 'farmerId is required' },
      { status: 400, headers: corsHeaders },
    );
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'amount must be a positive number' },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!currency || !SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])) {
    return NextResponse.json(
      { error: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}` },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!method || !SUPPORTED_METHODS.includes(method as (typeof SUPPORTED_METHODS)[number])) {
    return NextResponse.json(
      { error: `method must be one of: ${SUPPORTED_METHODS.join(', ')}` },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!destination || typeof destination !== 'string') {
    return NextResponse.json(
      { error: 'destination is required' },
      { status: 400, headers: corsHeaders },
    );
  }

  const allowedMethods = CURRENCY_METHOD_MAP[currency as (typeof SUPPORTED_CURRENCIES)[number]];
  if (!allowedMethods.includes(method as (typeof SUPPORTED_METHODS)[number])) {
    return NextResponse.json(
      {
        error: `method '${method}' is not supported for currency '${currency}'. Allowed methods: ${allowedMethods.join(', ')}`,
      },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const result = await processFarmerPayment({
      farmerId,
      amount,
      currency,
      method,
      destination,
    });

    return NextResponse.json(result, { status: 201, headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment processing failed';
    return NextResponse.json({ error: message }, { status: 502, headers: corsHeaders });
  }
}

/**
 * OPTIONS /api/affiliate
 */
export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
