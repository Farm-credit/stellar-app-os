import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  handleInvoicePaid,
  handleSubscriptionCanceled,
  handleSubscriptionPastDue,
} from '@/lib/services/subscription';

const WEBHOOK_SECRET = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature || !WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (err) {
      console.error('[webhook:stripe-subscriptions] Signature verification failed', { err });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        console.info('[webhook:stripe-subscriptions] invoice.paid processed', {
          subscription: invoice.subscription,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        console.info('[webhook:stripe-subscriptions] subscription.deleted processed', {
          subscription: subscription.id,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.status === 'past_due') {
          await handleSubscriptionPastDue(subscription);
          console.info('[webhook:stripe-subscriptions] subscription.past_due processed', {
            subscription: subscription.id,
          });
        }
        break;
      }

      default:
        console.info('[webhook:stripe-subscriptions] Unhandled event type', { type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook:stripe-subscriptions] Handler error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
