/**
 * Subscription billing service – manages monthly recurring sponsorships.
 * Uses Stripe for payment processing and PostgreSQL for persistence.
 * Closes #1137
 */

import { getPool } from '@/lib/db/client';
import Stripe from 'stripe';
import type {
  SponsorshipSubscription,
  CreateSubscriptionRequest,
  CancelSubscriptionRequest,
  SubscriptionListFilters,
} from '@/lib/types/subscription';

// ── Stripe helpers ──────────────────────────────────────────────────────────

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripeClient = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }
  return stripeClient;
}

// ── Create subscription ─────────────────────────────────────────────────────

export async function createSubscription(
  req: CreateSubscriptionRequest
): Promise<SponsorshipSubscription> {
  const pool = getPool();
  const { wallet, email, amount, trees_per_month = 1, asset = 'USDC', payment_method_id } = req;

  if (!wallet || amount <= 0) {
    throw new Error('Valid wallet and positive amount are required');
  }

  // Check for existing active subscription for this wallet
  const existing = await pool.query(
    `SELECT id FROM sponsorship_subscriptions
     WHERE wallet = $1 AND status = 'active' LIMIT 1`,
    [wallet]
  );
  if (existing.rows.length > 0) {
    throw new Error('An active subscription already exists for this wallet');
  }

  // Create or retrieve Stripe customer
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;

  try {
    const stripe = getStripe();

    // Find existing customer by wallet in metadata
    const customers = await stripe.customers.search({
      query: `metadata["wallet"]:"${wallet}"`,
    });

    let customer: Stripe.Customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { wallet },
      });
    }
    stripeCustomerId = customer.id;

    // Attach payment method if provided
    if (payment_method_id) {
      await stripe.paymentMethods.attach(payment_method_id, {
        customer: stripeCustomerId,
      });
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: payment_method_id },
      });
    }

    // Create Stripe subscription
    const stripeSub = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100), // cents
            recurring: { interval: 'month' },
            product: undefined, // use inline product
          } as Stripe.SubscriptionCreateParams['items'][0],
        },
      ],
      metadata: { wallet, trees_per_month: String(trees_per_month) },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice'],
    });

    stripeSubscriptionId = stripeSub.id;
  } catch (err) {
    // Stripe not configured (e.g. missing key) — allow subscription without Stripe
    if (err instanceof Error && err.message.includes('STRIPE_SECRET_KEY')) {
      console.warn('[subscription] Stripe not configured, creating subscription without Stripe');
    } else {
      throw err;
    }
  }

  // Insert into database
  const result = await pool.query(
    `INSERT INTO sponsorship_subscriptions
       (wallet, email, amount, trees_per_month, asset,
        stripe_subscription_id, stripe_customer_id, status, next_billing_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW() + INTERVAL '1 month')
     RETURNING *`,
    [wallet, email || null, amount, trees_per_month, asset, stripeSubscriptionId, stripeCustomerId]
  );

  return mapRow(result.rows[0]);
}

// ── Cancel subscription ─────────────────────────────────────────────────────

export async function cancelSubscription(
  req: CancelSubscriptionRequest
): Promise<SponsorshipSubscription> {
  const pool = getPool();
  const { subscription_id, wallet } = req;

  // Fetch existing
  const existing = await pool.query(
    `SELECT * FROM sponsorship_subscriptions WHERE id = $1 AND wallet = $2`,
    [subscription_id, wallet]
  );
  if (existing.rows.length === 0) {
    throw new Error('Subscription not found or not owned by this wallet');
  }

  const sub = mapRow(existing.rows[0]);
  if (sub.status === 'canceled') {
    throw new Error('Subscription is already canceled');
  }

  // Cancel on Stripe if connected
  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      console.error('[subscription] Failed to cancel Stripe subscription', { err });
    }
  }

  const result = await pool.query(
    `UPDATE sponsorship_subscriptions
     SET status = 'canceled', updated_at = NOW()
     WHERE id = $1 AND wallet = $2
     RETURNING *`,
    [subscription_id, wallet]
  );

  return mapRow(result.rows[0]);
}

// ── List subscriptions ──────────────────────────────────────────────────────

export async function listSubscriptions(
  filters: SubscriptionListFilters = {}
): Promise<{ data: SponsorshipSubscription[]; total: number }> {
  const pool = getPool();
  const { wallet, status, page = 1, limit = 20 } = filters;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (wallet) {
    conditions.push(`wallet = $${idx++}`);
    params.push(wallet);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM sponsorship_subscriptions ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM sponsorship_subscriptions ${where}`, params),
  ]);

  return {
    data: dataResult.rows.map(mapRow),
    total: countResult.rows[0]?.total ?? 0,
  };
}

// ── Get single subscription ─────────────────────────────────────────────────

export async function getSubscription(
  id: number,
  wallet?: string
): Promise<SponsorshipSubscription | null> {
  const pool = getPool();
  const conditions = ['id = $1'];
  const params: unknown[] = [id];

  if (wallet) {
    conditions.push('wallet = $2');
    params.push(wallet);
  }

  const result = await pool.query(
    `SELECT * FROM sponsorship_subscriptions WHERE ${conditions.join(' AND ')}`,
    params
  );

  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

// ── Stripe webhook helpers ──────────────────────────────────────────────────

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const pool = getPool();

  const subscriptionId = (invoice as Record<string, unknown>).subscription as string | null;
  if (!subscriptionId) return;

  await pool.query(
    `UPDATE sponsorship_subscriptions
     SET status = 'active',
         last_billing_date = NOW(),
         next_billing_date = NOW() + INTERVAL '1 month',
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
}

export async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE sponsorship_subscriptions
     SET status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
}

export async function handleSubscriptionPastDue(subscription: Stripe.Subscription): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE sponsorship_subscriptions
     SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): SponsorshipSubscription {
  return {
    id: row.id as number,
    wallet: row.wallet as string,
    email: row.email as string | null,
    amount: parseFloat(row.amount as string),
    trees_per_month: row.trees_per_month as number,
    asset: row.asset as string,
    stripe_subscription_id: row.stripe_subscription_id as string | null,
    stripe_customer_id: row.stripe_customer_id as string | null,
    status: row.status as SponsorshipSubscription['status'],
    next_billing_date: row.next_billing_date ? new Date(row.next_billing_date as string) : null,
    last_billing_date: row.last_billing_date ? new Date(row.last_billing_date as string) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}
