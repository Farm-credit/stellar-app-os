-- 017: Sponsorship subscriptions – monthly recurring tree-planting sponsorships
-- Closes #1137

CREATE TYPE sponsorship_subscription_status AS ENUM (
  'active',
  'past_due',
  'canceled',
  'paused'
);

CREATE TABLE sponsorship_subscriptions (
  id              SERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,                          -- sponsor Stellar public key
  email           TEXT,                                   -- optional email for Stripe receipts
  amount          NUMERIC(12,2) NOT NULL,                -- monthly amount in USD
  trees_per_month INTEGER NOT NULL DEFAULT 1,            -- trees planted each billing cycle
  asset           TEXT NOT NULL DEFAULT 'USDC',          -- payment asset
  stripe_subscription_id TEXT UNIQUE,                     -- Stripe subscription ID
  stripe_customer_id     TEXT,                            -- Stripe customer ID
  status          sponsorship_subscription_status NOT NULL DEFAULT 'active',
  next_billing_date TIMESTAMPTZ,                         -- next billing cycle start
  last_billing_date TIMESTAMPTZ,                         -- last successful billing
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sponsorship_subscriptions_wallet
  ON sponsorship_subscriptions (wallet);

CREATE INDEX idx_sponsorship_subscriptions_status
  ON sponsorship_subscriptions (status);

CREATE INDEX idx_sponsorship_subscriptions_stripe_id
  ON sponsorship_subscriptions (stripe_subscription_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_sponsorship_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sponsorship_subscription_updated
  BEFORE UPDATE ON sponsorship_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_sponsorship_subscription_timestamp();
