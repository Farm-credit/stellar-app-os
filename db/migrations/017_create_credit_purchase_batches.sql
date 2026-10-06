-- Migration 017: Batched credit purchases (Issue #1328)
-- Durable record of purchases coalesced into single on-chain transactions.

BEGIN;

CREATE TABLE IF NOT EXISTS credit_purchase_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     VARCHAR(64) NOT NULL UNIQUE,
  batch_id        VARCHAR(120),
  buyer_wallet    VARCHAR(80) NOT NULL,
  project_id      VARCHAR(64) NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  amount_stroops  BIGINT NOT NULL CHECK (amount_stroops > 0),
  asset           VARCHAR(80) NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'submitted', 'failed')),
  tx_hash         VARCHAR(80),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ
);

-- Worker query: pending purchases per asset, oldest first
CREATE INDEX IF NOT EXISTS idx_credit_purchase_batches_pending
  ON credit_purchase_batches (asset, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_credit_purchase_batches_batch
  ON credit_purchase_batches (batch_id);

COMMIT;
