import { NextResponse } from 'next/server';
import { buildBulkPurchaseTransaction } from '@/lib/stellar/transaction';
import { BULK_PURCHASE_MIN_QUANTITY } from '@/lib/types/carbon';
import type { BulkPurchaseOrder } from '@/lib/types/carbon';
import { withWalletLock } from '@/lib/cache/redlock';
import Stripe from 'stripe';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

// Initialize Stripe lazily to avoid errors when not configured
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEI;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BulkPurchaseOrder & {
      paymentMethod?: 'crypto' | 'card';
      fiatAmount?: number;
      currency?: string;
      successUrl?: string;
      cancelUrl?: string;
    };
    const {
      projectId,
      quantity,
      totalPrice,
      buyerPublicKey,
      network,
      metadata,
      paymentMethod = 'crypto',
      fiatAmount,
      currency = 'usd',
      successUrl,
      cancelUrl,
    } = body;

    if (!projectId || !buyerPublicKey || !network) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (quantity < BULK_PURCHASE_MIN_QUANTITY) {
      return NextResponse.json(
        { error: `Minimum quantity for bulk purchase is ${BULK_PURCHASE_MIN_QUANTITY}` },
        { status: 400 }
      );
    }

    if (totalPrice <= 0) {
      return NextResponse.json({ error: 'Total price must be greater than zero' }, { status: 400 });
    }

    if (network !== 'testnet' && network !== 'mainnet') {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 });
    }

    if (paymentMethod === 'card') {
      // Credit card payment via Stripe
      if (!fiatAmount || fiatAmount <= 0) {
        return NextResponse.json(
          { error: 'fiatAmount must be greater than zero for card payments' },
          { status: 400 }
        );
      }
      if (!successUrl || !cancelUrl) {
        return NextResponse.json(
          { error: 'successUrl and cancelUrl are required for card payments' },
          { status: 400 }
        );
      }

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Bulk Purchase: ${projectId}`,
                metadata: {
                  projectId,
                  quantity: String(quantity),
                  buyerPublicKey,
                  network,
                },
              },
              unit_amount: Math.round(fiatAmount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: buyerPublicKey,
        metadata: {
          projectId,
          quantity: String(quantity),
          buyerPublicKey,
          network,
          totalPrice: String(totalPrice),
          fiatAmount: String(fiatAmount),
          currency,
        },
      });

      logger.info('[api:bulk-purchase] Stripe checkout session created', {
        sessionId: session.id,
        buyerPublicKey,
        projectId,
        quantity,
      });

      return NextResponse.json({ checkoutUrl: session.url });
    }

    // Crypto payment via Stellar
    const result = await withWallletLock(
      buyerPublicKey,
      async () => {
        logger.info('[api:bulk-purchase] Building bulk purchase tx with wallet lock', {
          buyerPublicKey,
          projectId,
          quantity,
        });
        return buildBulkPurchaseTransaction({
          projectId,
          quantity,
          totalPrice,
          buyerPublicKey,
          network,
          metadata,
        });
      },
      { ttlMs: 15_000, retryCount: 15 }
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[api:bulk-purchase] Bulk purchase transaction build failed', { error });
    const message = error instanceof Error ? error.message : 'Failed to build transaction';
    const status = message.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}