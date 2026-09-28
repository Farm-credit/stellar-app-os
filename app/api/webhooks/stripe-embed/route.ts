import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  completeOffsetPurchaseSession,
  expireOffsetPurchaseSession,
} from '@/backend/src/services/carbonOffsetApi';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_EMBED_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe embed webhook is not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === 'paid' && session.metadata?.companyId && session.metadata?.projectId) {
      const completed = await completeOffsetPurchaseSession(session.id);
      if (!completed) {
        return NextResponse.json({ error: 'Purchase could not be fulfilled' }, { status: 409 });
      }
    }
  }

  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.companyId && session.metadata?.projectId) {
      const expired = await expireOffsetPurchaseSession(session.id);
      if (!expired) {
        return NextResponse.json({ error: 'Purchase session could not be expired' }, { status: 409 });
      }
    }
  }

  return NextResponse.json({ received: true });
}