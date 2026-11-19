-- Migration: 001_create_indexed_transactions.sql
-- Stores every Stellar transaction relevant to FarmCredit:
--   donations, escrow events (deposit/verify_planting/verify_survival/refund),
--   and carbon-credit token mints.

CREATE TABLE IF NOT EXISTS indexed_transactions (
  -- Stellar transaction hash (primary key — globally unique)
  tx_hash         TEXT        PRIMARY KEY,

  -- Ledger sequence number (for ordering / cursor resumption)
  ledger          BIGINT      NOT NULL,

  -- ISO-8601 timestamp from Horizon
  created_at      TIMESTAMPTZ NOT NULL,

  -- Stellar source account
  source_account  TEXT        NOT NULL,

  -- Classified event type
  tx_type         TEXT        NOT NULL
    CHECK (tx_type IN ('donation', 'escrow_deposit', 'escrow_planting',
                       'escrow_survival', 'escrow_refund', 'token_mint', 'other')),

  -- Asset code (USDC, CARBON, XLM, …)
  asset_code      TEXT,

  -- Asset issuer public key
  asset_issuer    TEXT,

  -- Transfer amount (as text to preserve precision)
  amount          NUMERIC(30, 7),

  -- Destination / recipient account
  destination     TEXT,

  -- Raw memo text (if present)
  memo            TEXT,

  -- Full Horizon transaction record (JSONB for ad-hoc queries)
  raw             JSONB       NOT NULL,

  -- Indexer bookkeeping
  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by type and time
CREATE INDEX IF NOT EXISTS idx_it_tx_type    ON indexed_transactions (tx_type);
CREATE INDEX IF NOT EXISTS idx_it_created_at ON indexed_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_it_source     ON indexed_transactions (source_account);
CREATE INDEX IF NOT EXISTS idx_it_dest       ON indexed_transactions (destination);

-- Cursor persistence: one row per (network, account) pair being watched
CREATE TABLE IF NOT EXISTS indexer_cursors (
  id              SERIAL      PRIMARY KEY,
  network         TEXT        NOT NULL,  -- 'testnet' | 'mainnet'
  watch_account   TEXT        NOT NULL,  -- Stellar account being streamed
  last_paging_token TEXT      NOT NULL DEFAULT 'now',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network, watch_account)
);

-- ---------------------------------------------------------------------------
-- 002: Auctions (competitive bidding for carbon credits)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auctions (
  id                BIGSERIAL   PRIMARY KEY,

  -- Farmer (seller) offering the credits
  seller_account    TEXT        NOT NULL,

  -- Project the credits originate from
  project_id        TEXT        NOT NULL,

  -- Region / project type denormalised for historical aggregation
  region            TEXT        NOT NULL,
  project_type      TEXT        NOT NULL,

  -- Amount of credits (tonnes CO2e) up for auction
  quantity_tons     NUMERIC(30, 7) NOT NULL CHECK (quantity_tons > 0),

  -- Reserve (minimum acceptable) price per tonne
  reserve_price     NUMERIC(30, 7) NOT NULL CHECK (reserve_price >= 0),

  -- Auction lifecycle
  status            TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'settled', 'cancelled')),

  -- Bidding window
  opening_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closing_at        TIMESTAMPTZ NOT NULL,

  -- Winning bid (set on settlement)
  winning_bid_id    BIGINT,
  settled_price     NUMERIC(30, 7),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (closing_at > opening_at)
);

-- Settlement / expiry sweeps: find open auctions by closing time
CREATE INDEX IF NOT EXISTS idx_auctions_status_closing
  ON auctions (status, closing_at);

-- Historical aggregation by region / project type over time
CREATE INDEX IF NOT EXISTS idx_auctions_region_type_created
  ON auctions (region, project_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auctions_seller
  ON auctions (seller_account);

CREATE INDEX IF NOT EXISTS idx_auctions_project
  ON auctions (project_id);

-- ---------------------------------------------------------------------------
-- Bids placed against an auction
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bids (
  id                BIGSERIAL   PRIMARY KEY,

  auction_id        BIGINT      NOT NULL
    REFERENCES auctions (id) ON DELETE CASCADE,

  -- Buyer placing the bid
  bidder_account    TEXT        NOT NULL,

  -- Bid price per tonne
  amount_per_ton    NUMERIC(30, 7) NOT NULL CHECK (amount_per_ton > 0),

  -- Quantity the buyer wants at that price
  quantity_tons     NUMERIC(30, 7) NOT NULL CHECK (quantity_tons > 0),

  -- Bid lifecycle
  status            TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'won', 'lost', 'withdrawn')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active bid per buyer per auction
  UNIQUE (auction_id, bidder_account)
);

-- Settlement tie-breaking: highest price first, earliest bid wins ties
CREATE INDEX IF NOT EXISTS idx_bids_auction_price_created
  ON bids (auction_id, amount_per_ton DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_bids_bidder
  ON bids (bidder_account);

-- Link winning bid back to the auction (added after bids exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_auctions_winning_bid'
  ) THEN
    ALTER TABLE auctions
      ADD CONSTRAINT fk_auctions_winning_bid
      FOREIGN KEY (winning_bid_id) REFERENCES bids (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 003: Certification integration (Verra / Gold Standard)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS certification_records (
  id                BIGSERIAL   PRIMARY KEY,

  -- Registry the record comes from
  registry          TEXT        NOT NULL
    CHECK (registry IN ('verra', 'gold_standard')),

  -- Registry-side project / credit identifiers
  registry_project_id TEXT      NOT NULL,
  registry_credit_id  TEXT,

  -- Local project linkage
  project_id        TEXT        NOT NULL,

  -- Region / project type denormalised for historical aggregation
  region            TEXT        NOT NULL,
  project_type      TEXT        NOT NULL,

  -- Verification state
  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'expired', 'revoked', 'renewal_due')),

  -- Validity window
  issued_at         TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,

  -- Renewal documentation tracking
  renewal_due_at    TIMESTAMPTZ,
  renewal_doc_url   TEXT,

  -- Raw registry payload (JSONB for ad-hoc queries)
  raw               JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (registry, registry_project_id)
);

-- Historical aggregation by region / project type over time
CREATE INDEX IF NOT EXISTS idx_cert_region_type_created
  ON certification_records (region, project_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cert_project
  ON certification_records (project_id);

CREATE INDEX IF NOT EXISTS idx_cert_status_renewal
  ON certification_records (status, renewal_due_at);

-- ---------------------------------------------------------------------------
-- Certification sync jobs (pull project data / verify credits / renewals)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS certification_sync_jobs (
  id                BIGSERIAL   PRIMARY KEY,

  registry          TEXT        NOT NULL
    CHECK (registry IN ('verra', 'gold_standard')),

  -- Optional linkage to a specific certification record
  certification_id  BIGINT
    REFERENCES certification_records (id) ON DELETE CASCADE,

  job_type          TEXT        NOT NULL
    CHECK (job_type IN ('pull_project', 'verify_credits', 'renewal')),

  status            TEXT        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),

  attempts          INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),

  last_error        TEXT,

  scheduled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker polling: pick up due jobs in order
CREATE INDEX IF NOT EXISTS idx_cert_jobs_status_scheduled
  ON certification_sync_jobs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_cert_jobs_registry
  ON certification_sync_jobs (registry);

CREATE INDEX IF NOT EXISTS idx_cert_jobs_certification
  ON certification_sync_jobs (certification_id);
