-- Migration: 010_create_sponsor_teams.sql
-- Issue #1016 — collaborative sponsor team forests.

CREATE TABLE IF NOT EXISTS sponsor_teams (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  owner_wallet    TEXT NOT NULL,
  invite_code     TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsor_team_members (
  team_id         BIGINT NOT NULL REFERENCES sponsor_teams (id) ON DELETE CASCADE,
  wallet          TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, wallet)
);

CREATE TABLE IF NOT EXISTS sponsor_team_trees (
  team_id         BIGINT NOT NULL REFERENCES sponsor_teams (id) ON DELETE CASCADE,
  tree_id         BIGINT NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
  added_by_wallet TEXT NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, tree_id)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_team_members_wallet
  ON sponsor_team_members (wallet);
CREATE INDEX IF NOT EXISTS idx_sponsor_team_trees_tree
  ON sponsor_team_trees (tree_id);
