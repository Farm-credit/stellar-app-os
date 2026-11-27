-- Leaderboard consent is independent of homepage donor-wall recognition.
CREATE TABLE IF NOT EXISTS sponsor_leaderboard_preferences (
  wallet TEXT PRIMARY KEY,
  opted_in BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  sponsor_type TEXT NOT NULL DEFAULT 'individual' CHECK (sponsor_type IN ('individual', 'corporate')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT opted_in OR char_length(btrim(display_name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_leaderboard_opted_in
  ON sponsor_leaderboard_preferences (sponsor_type, wallet) WHERE opted_in = TRUE;
