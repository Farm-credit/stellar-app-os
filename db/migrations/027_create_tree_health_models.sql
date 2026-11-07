-- Issue #1715: image-derived tree-health screening and field-team feedback.
-- Store only model labels/features and a photo reference, never image bytes or GPS.
CREATE TABLE IF NOT EXISTS tree_health_predictions (
  id                BIGSERIAL PRIMARY KEY,
  tree_ref          TEXT NOT NULL,
  photo_ref         TEXT NOT NULL,
  vision_features   JSONB NOT NULL DEFAULT '[]'::jsonb,
  predicted_issues  JSONB NOT NULL DEFAULT '[]'::jsonb,
  corrected_issues  JSONB,
  confidence        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  provider          TEXT NOT NULL,
  model_version     TEXT NOT NULL,
  review_status     TEXT NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending', 'corrected')),
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tree_health_tree_created
  ON tree_health_predictions (tree_ref, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tree_health_pending
  ON tree_health_predictions (created_at ASC) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tree_health_reviewed
  ON tree_health_predictions (reviewed_at DESC) WHERE review_status = 'corrected';

-- Quarterly, versioned classifier artifacts trained from vision labels and
-- field-team corrections. A unique quarter makes scheduled retries idempotent.
CREATE TABLE IF NOT EXISTS tree_health_models (
  version       TEXT PRIMARY KEY,
  quarter       TEXT NOT NULL UNIQUE,
  model_json    JSONB NOT NULL,
  sample_count  INTEGER NOT NULL,
  accuracy      NUMERIC(6, 5),
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tree_health_models_active
  ON tree_health_models (created_at DESC) WHERE active = TRUE;
