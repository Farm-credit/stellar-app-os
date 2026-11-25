/**
 * GET /api/v1/farmers/payments/[payoutId]
 *
 * Retrieves a single farmer payout record by its ID.
 *
 * Issue #1276 — Farmer payment processing: multi-currency
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFarmerPayoutById } from '@/lib/farmers/paymentProcessing';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ payoutId: string }>;
}

/**
 * GET /api/v1/farmers/payments/:payoutId
 *
 * Returns the payout record or 404 if not found.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { payoutId } = await params;

    if (!payoutId) {
      return NextResponse.json({ error: 'payoutId is required' }, { status: 400 });
    }

    const payout = getFarmerPayoutById(payoutId);
    if (!payout) {
      return NextResponse.json(
        { error: `Payout not found: ${payoutId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ payout });
  } catch (error) {
    console.error('[v1/farmers/payments/:payoutId] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
