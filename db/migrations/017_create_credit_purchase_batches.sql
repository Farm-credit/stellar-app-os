-- Migration 018: Auctions, bids, certification integration, and historical aggregation indexes
-- Issues: #1280 (auction mechanism), #1285 (historical carbon data API), #1286 (certification integration)

BEGIN;

-- ---------------------------------------------------------------------------
-- Auctions (Issue #1280): farmers auction carbon credits to multiple buyers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auctions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id        VARCHAR(64) NOT NULL UNIQUE,
  project_id        VARCHAR(64) NOT NULL,
  seller_wallet     VARCHAR(80) NOT NULL,
  region            VARCHAR(80),
  project_type      VARCHAR(80),
  quantity          INT NOT NULL CHECK (quantity > 0),
  reserve_price     BIGINT NOT NULL CHECK (reserve_price >= 0),
  min_increment     BIGINT NOT NULL DEFAULT 0 CHECK (min_increment >= 0),
  asset             VARCHAR(80) NOT NULL,
  status            VARCHAR(12) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'closed', 'cancelled', 'settled')),
  winning_bid_id    UUID,
  start_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at            TIMESTAMPTZ NOT NULL,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

-- Auction lifecycle queries: open auctions ordered by end time
CREATE INDEX IF NOT EXISTS idx_auctions_status_end_at
  ON auctions (status, end_at);
CREATE INDEX IF NOT EXISTS idx_auctions_project
  ON auctions (project_id);
CREATE INDEX IF NOT EXISTS idx_auctions_region_type
  ON auctions (region, project_type);

-- ---------------------------------------------------------------------------
-- Bids (Issue #1280): competitive bidding, highest bidder wins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bids (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id          VARCHAR(64) NOT NULL UNIQUE,
  auction_id      UUID NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  bidder_wallet   VARCHAR(80) NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  price_per_ton   BIGINT NOT NULL CHECK (price_per_ton >= 0),
  status          VARCHAR(12) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'winning', 'outbid', 'withdrawn', 'won', 'lost')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Price discovery: highest bids first per auction
CREATE INDEX IF NOT EXISTS idx_bids_auction_price
  ON bids (auction_id, price_per_ton DESC);
CREATE INDEX IF NOT EXISTS idx_bids_bidder
  ON bids (bidder_wallet);

-- ---------------------------------------------------------------------------
-- Certification records (Issue #1286): Verra / Gold Standard integration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certification_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              VARCHAR(20) NOT NULL
                          CHECK (provider IN ('verra', 'gold_standard')),
  external_project_id   VARCHAR(120) NOT NULL,
  project_id            VARCHAR(64),
  region                VARCHAR(80),
  project_type          VARCHAR(80),
  status                VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'verified', 'expired', 'revoked', 'renewal_due')),
  credits_issued        BIGINT,
  verified_at           TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  last_synced_at        TIMESTAMPTZ,
  raw_payload           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_project_id)
);

-- Lookup by provider + external project id
CREATE INDEX IF NOT EXISTS idx_certification_records_provider_external
  ON certification_records (provider, external_project_id);
CREATE INDEX IF NOT EXISTS idx_certification_records_project
  ON certification_records (project_id);
CREATE INDEX IF NOT EXISTS idx_certification_records_status_expires
  ON certification_records (status, expires_at);

-- ---------------------------------------------------------------------------
-- Renewal documents (Issue #1286): manage renewal documentation automatically
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renewal_documents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id               VARCHAR(64) NOT NULL UNIQUE,
  certification_record_id   UUID NOT NULL REFERENCES certification_records (id) ON DELETE CASCADE,
  document_type             VARCHAR(80) NOT NULL,
  status                    VARCHAR(16) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'expired')),
  file_url                  TEXT,
  due_at                    TIMESTAMPTZ,
  submitted_at              TIMESTAMPTZ,
  reviewed_at               TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Renewal scheduling: documents per certification ordered by due date
CREATE INDEX IF NOT EXISTS idx_renewal_documents_cert_due
  ON renewal_documents (certification_record_id, due_at);
CREATE INDEX IF NOT EXISTS idx_renewal_documents_status_due
  ON renewal_documents (status, due_at);

-- ---------------------------------------------------------------------------
-- Historical aggregation support (Issue #1285)
-- ---------------------------------------------------------------------------

-- Composite index for time-series aggregation of purchases by project
CREATE INDEX IF NOT EXISTS idx_credit_purchase_batches_created_project
  ON credit_purchase_batches (created_at, project_id);

-- Region / project_type columns for historical aggregation queries
ALTER TABLE credit_purchase_batches
  ADD COLUMN IF NOT EXISTS region VARCHAR(80),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_credit_purchase_batches_region_type_created
  ON credit_purchase_batches (region, project_type, created_at);

COMMIT;