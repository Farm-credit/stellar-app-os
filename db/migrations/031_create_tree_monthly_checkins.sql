CREATE TABLE IF NOT EXISTS tree_monthly_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id         TEXT NOT NULL,
  checkin_month   DATE NOT NULL,
  photo_cid       TEXT NOT NULL,
  image_url       TEXT NOT NULL,
  submitted_by    TEXT NOT NULL,
  caption         TEXT,
  height_cm       NUMERIC(7, 2),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_by     TEXT,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tree_monthly_checkins_one_per_month UNIQUE (tree_id, checkin_month),
  CONSTRAINT tree_monthly_checkins_verified_metadata CHECK (
    verification_status <> 'verified'
    OR (verified_by IS NOT NULL AND btrim(verified_by) <> '' AND verified_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tree_monthly_checkins_timeline
  ON tree_monthly_checkins (tree_id, checkin_month DESC);
