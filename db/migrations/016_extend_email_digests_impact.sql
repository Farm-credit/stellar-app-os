BEGIN;

ALTER TABLE email_digests
  ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS community_highlights JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
