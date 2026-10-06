/**
 * Subscription billing types – monthly recurring sponsorships.
 * Closes #1137
 */

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'paused';

export interface SponsorshipSubscription {
  id: number;
  wallet: string;
  email: string | null;
  amount: number;
  trees_per_month: number;
  asset: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: SubscriptionStatus;
  next_billing_date: Date | null;
  last_billing_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSubscriptionRequest {
  wallet: string;
  email?: string;
  amount: number; // monthly USD
  trees_per_month?: number; // default 1
  asset?: string; // default USDC
  payment_method_id?: string; // Stripe PaymentMethod ID for card payments
}

export interface CancelSubscriptionRequest {
  subscription_id: number;
  wallet: string; // must match owner
}

export interface SubscriptionListFilters {
  wallet?: string;
  status?: SubscriptionStatus;
  page?: number;
  limit?: number;
}
