-- Migration: 003_create_species_proposals.sql
-- Stores on-chain governance proposals for adding new tree species.
-- Mirrors the species-voting Soroban contract proposal records.

CREATE TABLE IF NOT EXISTS species_proposals (
  -- Unique proposal ID (matches on-chain proposal ID)
  id                  BIGSERIAL   PRIMARY KEY,

  -- Species slug (short identifier, e.g. 'mahogany')
  slug                TEXT        NOT NULL,

  -- Human-readable common name
  name                TEXT        NOT NULL,

  -- CO₂ kg/year × 100 (scaled integer from on-chain)
  co2_scaled          BIGINT      NOT NULL CHECK (co2_scaled > 0),

  -- Years to biomass maturity
  maturity_years      INTEGER     NOT NULL CHECK (maturity_years > 0),

  -- Proposer's wallet address
  proposer_address    TEXT        NOT NULL,

  -- Total votes in favor (in token base units)
  votes_for           BIGINT      NOT NULL DEFAULT 0,

  -- Total votes against (in token base units)
  votes_against       BIGINT      NOT NULL DEFAULT 0,

  -- Proposal status: active, passed, rejected, executed
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passed', 'rejected', 'executed')),

  -- On-chain creation timestamp
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Voting end timestamp
  voting_ends_at      TIMESTAMPTZ NOT NULL,

  -- On-chain transaction hash (for verification)
  tx_hash             TEXT,

  -- When the proposal was executed (if applicable)
  executed_at         TIMESTAMPTZ,

  -- Indexed fields for common queries
  CONSTRAINT unique_slug UNIQUE(slug)
);

-- Allow fast lookup of active proposals
CREATE INDEX IF NOT EXISTS idx_sp_status ON species_proposals (status);

-- Allow lookup by proposer
CREATE INDEX IF NOT EXISTS idx_sp_proposer ON species_proposals (proposer_address);

-- Allow lookup of proposals by voting end time
CREATE INDEX IF NOT EXISTS idx_sp_voting_ends ON species_proposals (voting_ends_at);

-- Table to track individual votes for audit trail
CREATE TABLE IF NOT EXISTS species_votes (
  -- Auto-incrementing ID
  id                  BIGSERIAL   PRIMARY KEY,

  -- Proposal ID (foreign key to species_proposals)
  proposal_id         BIGINT      NOT NULL REFERENCES species_proposals(id) ON DELETE CASCADE,

  -- Voter's wallet address
  voter_address       TEXT        NOT NULL,

  -- True = for, False = against
  vote_for            BOOLEAN     NOT NULL,

  -- Voting power (token balance at time of vote)
  power               BIGINT      NOT NULL CHECK (power > 0),

  -- Timestamp of vote
  voted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- On-chain transaction hash
  tx_hash             TEXT,

  -- Ensure one vote per voter per proposal
  CONSTRAINT unique_proposal_voter UNIQUE(proposal_id, voter_address)
);

-- Index for looking up votes by proposal
CREATE INDEX IF NOT EXISTS idx_sv_proposal ON species_votes (proposal_id);

-- Index for looking up votes by voter
CREATE INDEX IF NOT EXISTS idx_sv_voter ON species_votes (voter_address);
