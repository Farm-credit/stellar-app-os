BEGIN;

CREATE TABLE IF NOT EXISTS embed_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_domains TEXT[] NOT NULL,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
  primary_color TEXT NOT NULL DEFAULT '#22c55e',
  show_project_selector BOOLEAN NOT NULL DEFAULT TRUE,
  default_project_id TEXT,
  default_amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP')),
  locale TEXT NOT NULL DEFAULT 'en',
  webhook_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  widget_title TEXT,
  brand_name TEXT,
  show_branding BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embed_api_keys_company_active
  ON embed_api_keys (company_id, active);

CREATE TABLE IF NOT EXISTS embed_checkout_sessions (
  session_id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL REFERENCES embed_api_keys (key_hash) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
  price_per_ton NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  return_url TEXT,
  cancel_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_embed_checkout_sessions_company_created
  ON embed_checkout_sessions (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION complete_embed_checkout(p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checkout embed_checkout_sessions%ROWTYPE;
BEGIN
  SELECT * INTO checkout
    FROM embed_checkout_sessions
    WHERE session_id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF checkout.status = 'completed' THEN
    RETURN TRUE;
  END IF;

  IF checkout.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  UPDATE embed_checkout_sessions
    SET status = 'completed', completed_at = NOW()
    WHERE session_id = p_session_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_embed_project_credits(p_project_id TEXT, p_amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE projects
    SET available_credits = available_credits - p_amount
    WHERE id::TEXT = p_project_id
      AND status = 'active'
      AND available_credits >= p_amount;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION release_embed_project_credits(p_project_id TEXT, p_amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE projects
    SET available_credits = available_credits + p_amount
    WHERE id::TEXT = p_project_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION expire_embed_checkout(p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checkout embed_checkout_sessions%ROWTYPE;
BEGIN
  SELECT * INTO checkout
    FROM embed_checkout_sessions
    WHERE session_id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF checkout.status = 'failed' THEN
    RETURN TRUE;
  END IF;

  IF checkout.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  UPDATE projects
    SET available_credits = available_credits + checkout.amount
    WHERE id::TEXT = checkout.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found while releasing embed credits', checkout.project_id;
  END IF;

  UPDATE embed_checkout_sessions SET status = 'failed' WHERE session_id = p_session_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION complete_embed_checkout(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_embed_project_credits(TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_embed_project_credits(TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_embed_checkout(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_embed_checkout(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_embed_project_credits(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION release_embed_project_credits(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION expire_embed_checkout(TEXT) TO service_role;

COMMIT;