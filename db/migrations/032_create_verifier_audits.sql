CREATE TABLE IF NOT EXISTS verifier_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id             TEXT NOT NULL,
  verifier_address    TEXT NOT NULL,
  assigned_at         TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ NOT NULL,
  decision            TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  disputed_at         TIMESTAMPTZ,
  dispute_outcome     TEXT CHECK (dispute_outcome IN ('upheld', 'overturned')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verifier_audits_completion_after_assignment
    CHECK (completed_at >= assigned_at),
  CONSTRAINT verifier_audits_outcome_requires_dispute
    CHECK (dispute_outcome IS NULL OR disputed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_verifier_audits_verifier_completed
  ON verifier_audits (verifier_address, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifier_audits_disputed
  ON verifier_audits (disputed_at DESC)
  WHERE disputed_at IS NOT NULL;
