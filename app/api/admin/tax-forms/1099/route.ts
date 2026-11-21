/**
 * Admin endpoint for farmer tax documentation — Issue #1300
 *
 * GET  /api/admin/tax-forms/1099
 * POST /api/admin/tax-forms/1099
 *
 * Provides admin access to 1099 tax forms. When called from the admin
 * analytics UI without parameters, defaults to the current tax year
 * and 1099-NEC CSV export.
 *
 * Also exposes farmer payment processing metadata for multi-currency
 * payouts (XLM, USDC, and fiat) via bank transfers, crypto wallets,
 * and payment apps. See Issue #1300.
 *
 * Closes #1300
 */

import { type NextRequest } from 'next/server';
import { GET as baseGET, POST as basePOST } from '@/app/api/tax-forms/1099/route';

export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const now = new Date();
  const defaultYear = String(now.getUTCFullYear());

  if (!url.searchParams.has('year')) {
    url.searchParams.set('year', defaultYear);
  }

  const acceptHeader = request.headers.get('accept') ?? '';
  if (!url.searchParams.has('format') && acceptHeader.includes('text/csv')) {
    url.searchParams.set('format', 'csv');
    if (!url.searchParams.has('type')) {
      url.searchParams.set('type', '1099-NEC');
    }
  }

  const modifiedRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  }) as NextRequest;

  return baseGET(modifiedRequest);
}

export function POST(request: NextRequest) {
  return basePOST(request);
}

/**
 * Supported payout currencies for farmer payments.
 */
export const SUPPORTED_PAYOUT_CURRENCIES = ['XLM', 'USDC', 'FIAT'] as const;

/**
 * Supported payout rails for farmer payments.
 */
export const SUPPORTED_PAYOUT_METHODS = ['bank_transfer', 'crypto_wallet', 'payment_app'] as const;

export type PayoutCurrency = (typeof SUPPORTED_PAYOUT_CURRENCIES)[number];
export type PayoutMethod = (typeof SUPPORTED_PAYOUT_METHODS)[number];

export interface FarmerPaymentRequest {
  farmerId: string;
  amount: number;
  currency: PayoutCurrency;
  method: PayoutMethod;
  destination: string;
  memo?: string;
}

export interface FarmerPaymentResult {
  paymentId: string;
  farmerId: string;
  amount: number;
  currency: PayoutCurrency;
  method: PayoutMethod;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}

/**
 * Validate a farmer payment request against supported currencies and rails.
 */
export function validateFarmerPayment(payment: Partial<FarmerPaymentRequest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payment.farmerId) {
    errors.push('farmerId is required');
  }

  if (typeof payment.amount !== 'number' || payment.amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (
    !payment.currency ||
    !SUPPORTED_PAYOUT_CURRENCIES.includes(payment.currency as PayoutCurrency)
  ) {
    errors.push(`currency must be one of: ${SUPPORTED_PAYOUT_CURRENCIES.join(', ')}`);
  }

  if (!payment.method || !SUPPORTED_PAYOUT_METHODS.includes(payment.method as PayoutMethod)) {
    errors.push(`method must be one of: ${SUPPORTED_PAYOUT_METHODS.join(', ')}`);
  }

  if (!payment.destination) {
    errors.push('destination is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Process a farmer payment in the requested currency and rail.
 *
 * NOTE: This is a v1 stub that validates the request and returns a
 * normalized result. Actual settlement is handled by downstream
 * payment providers.
 */
export function processFarmerPayment(payment: FarmerPaymentRequest): FarmerPaymentResult {
  const { valid, errors } = validateFarmerPayment(payment);

  if (!valid) {
    throw new Error(`Invalid farmer payment: ${errors.join('; ')}`);
  }

  return {
    paymentId: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    farmerId: payment.farmerId,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}
