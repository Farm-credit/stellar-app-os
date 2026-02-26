import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { StripePaymentIntentRequest } from '@/lib/types/donation-payment';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-04-30.basil',
});

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    const body = (await request.json()) as StripePaymentIntentRequest;
    const { amount, currency, donorEmail, donorName, isMonthly, idempotencyKey } = body;

    if (!amount || amount < 500) {
      return NextResponse.json({ error: 'Minimum donation is $5.00' }, { status: 400 });
    }

    if (!idempotencyKey) {
      return NextResponse.json({ error: 'Missing idempotency key' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: currency || 'usd',
        receipt_email: donorEmail || undefined,
        metadata: {
          donorName: donorName || 'Anonymous',
          isMonthly: String(isMonthly),
          idempotencyKey,
          source: 'donation-flow',
        },
      },
      { idempotencyKey }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    const message = error instanceof Error ? error.message : 'Failed to create payment intent';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
