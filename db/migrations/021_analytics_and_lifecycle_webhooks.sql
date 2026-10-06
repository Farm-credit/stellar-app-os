-- Issue #1112: planter team dimension and analytics query indexes.
-- Issue #1115: partner-facing tree lifecycle webhook event types.

CREATE TABLE IF NOT EXISTS planter_teams (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planter_team_members (
  team_id     BIGINT NOT NULL REFERENCES planter_teams (id) ON DELETE CASCADE,
  planter_id  BIGINT NOT NULL REFERENCES planters (id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, planter_id)
);

CREATE INDEX IF NOT EXISTS idx_planter_team_members_planter
  ON planter_team_members (planter_id);
CREATE INDEX IF NOT EXISTS idx_trees_analytics_dimensions
  ON trees (species_slug, region, planter_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trees_analytics_lifecycle
  ON trees (planted_at, verified_at, completed_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sponsorship_events_tree
  ON sponsorship_events (tree_id);

-- Webhook event names are stored as text in webhook_subscriptions.event_types,
-- so adding lifecycle names requires no database enum change.
