-- Migration: 014_create_fraud_alerts.sql
-- Closes #1319 — Fraud detection: anomaly monitoring (v1)
--
-- Stores anomaly alerts produced by the fraud-detection monitor
-- (lib/monitor/fraud.ts) and tracks their investigation lifecycle.
--
-- The detector is rule/scoring based (deterministic z-scores and heuristics
-- over planter/tree/payment telemetry) and structured so a real ML model can
-- replace `score*()` implementations behind the same interface later.
--
-- Signal families covered in v1:
--   double_selling   — the same tree/credits sold or retired more than once
--   fake_farmer      — KYC gaps, shared identity hashes, implausible activity
--   project_inflation — claimed sequestration far above species/region norms
--   metric_manipulation — GPS/photo evidence inconsistent with history

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id              BIGSERIAL       PRIMARY KEY,

  -- Detector family that produced the alert.
  alert_type      TEXT            NOT NULL CHECK (alert_type IN (
    'double_selling',
    'fake_farmer',
    'project_inflation',
    'metric_manipulation'
  )),

  -- Entity under suspicion, e.g. 'planter', 'tree', 'escrow_order', 'project'.
  entity_type     TEXT            NOT NULL,
  entity_id       TEXT            NOT NULL,

  -- 0–100 confidence score from the detector.
  score           INTEGER         NOT NULL CHECK (score >= 0 AND score <= 100),

  -- low / medium / high / critical — derived from score, stored for fast
  -- dashboard filtering without recomputation.
  severity        TEXT            NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Human-readable explanation: which rule fired, observed vs expected.
  reason          TEXT            NOT NULL,

  -- Structured detector context: observed values, baseline stats, rule ids.
  metadata        JSONB           NOT NULL DEFAULT '{}',

  -- One alert per (type, entity) pair while still open — re-detections
  -- upsert instead of spamming duplicates. Resolved alerts can re-fire.
  status          TEXT            NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'investigating', 'dismissed', 'confirmed')),

  -- Optional linkage to the disputes workflow (migration 006).
  dispute_id      BIGINT          REFERENCES disputes (id) ON DELETE SET NULL,

  investigated_by TEXT,
  resolution_note TEXT,
  resolved_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Only one OPEN alert per (alert_type, entity) pair.
  CONSTRAINT uq_fraud_alerts_open UNIQUE (alert_type, entity_type, entity_id, status)
    WHERE status IN ('open', 'investigating')
);

-- Partial indexes matching the operational query patterns.
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_open
  ON fraud_alerts (severity DESC, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_entity
  ON fraud_alerts (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_type
  ON fraud_alerts (alert_type);

-- Detection-run bookkeeping so operators can tell "no anomalies" apart from
-- "detector broken/not running".
CREATE TABLE IF NOT EXISTS fraud_scan_runs (
  id                BIGSERIAL     PRIMARY KEY,
  started_at        TIMESTAMPTZ   NOT NULL,
  finished_at       TIMESTAMPTZ,
  alerts_created    INTEGER       NOT NULL DEFAULT 0,
  alerts_updated    INTEGER       NOT NULL DEFAULT 0,
  planters_scanned  INTEGER       NOT NULL DEFAULT 0,
  trees_scanned     INTEGER       NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fraud_alerts IS
  'Anomaly alerts from the fraud-detection monitor (issue #1319), with investigation lifecycle.';
COMMENT ON TABLE fraud_scan_runs IS
  'One row per fraud-detector scan so silence is distinguishable from failure.';

-- DOWN ────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS fraud_scan_runs;
-- DROP TABLE IF EXISTS fraud_alerts;
