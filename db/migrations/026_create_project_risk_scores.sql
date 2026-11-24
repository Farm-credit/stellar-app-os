-- Migration: 026_create_project_risk_scores.sql
--
-- Project risk scoring for buyer sustainability assessment (Issue #1294).
--
-- Calculates a risk score (0-100, lower = less risky) for each carbon credit
-- project based on four factors:
--   1. Verifier reputation (25% weight)
--   2. Methodology strength (20% weight)
--   3. Regional stability (20% weight)
--   4. Farmer track record (35% weight)
--
-- Each factor produces a 0-100 sub-score. The overall score is a weighted
-- average. Risk ratings are assigned based on score thresholds:
--   >= 80: 'Low' (safe investment)
--   >= 60: 'Medium' (acceptable with monitoring)
--   <  60: 'High' (elevated risk)
--
-- Scores are persisted for auditability and caching. Recalculated on-demand
-- when the endpoint is hit, or when related data changes (farmer reviews,
-- project verification status, etc.).

CREATE TABLE IF NOT EXISTS project_risk_scores (
  -- Unique identifier for this score record
  id                 TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Reference to the project being scored (unique: one score per project at a time)
  project_id         TEXT        NOT NULL UNIQUE,

  -- Overall risk score (0-100)
  overall_score      SMALLINT    NOT NULL
    CHECK (overall_score >= 0 AND overall_score <= 100),

  -- Risk rating category derived from overall_score
  risk_rating        VARCHAR(10) NOT NULL
    CHECK (risk_rating IN ('Low', 'Medium', 'High')),

  -- Individual sub-score components (0-100 each)
  verifier_reputation_score     SMALLINT NOT NULL
    CHECK (verifier_reputation_score >= 0 AND verifier_reputation_score <= 100),
  
  methodology_strength_score    SMALLINT NOT NULL
    CHECK (methodology_strength_score >= 0 AND methodology_strength_score <= 100),
  
  regional_stability_score      SMALLINT NOT NULL
    CHECK (regional_stability_score >= 0 AND regional_stability_score <= 100),
  
  farmer_track_record_score     SMALLINT NOT NULL
    CHECK (farmer_track_record_score >= 0 AND farmer_track_record_score <= 100),

  -- Data gap documentation (JSON array of strings)
  -- Documents limitations affecting this score (e.g., missing verifier metrics,
  -- static regional stability tier, absence of escrow history)
  data_gaps          TEXT[]      NOT NULL DEFAULT '{}',

  -- Timestamps
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_risk_scores_project_id 
  ON project_risk_scores (project_id);

CREATE INDEX IF NOT EXISTS idx_project_risk_scores_rating 
  ON project_risk_scores (risk_rating);

CREATE INDEX IF NOT EXISTS idx_project_risk_scores_updated_at 
  ON project_risk_scores (updated_at DESC);

-- Unique constraint ensures one score per project at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_risk_scores_unique_project 
  ON project_risk_scores (project_id);
