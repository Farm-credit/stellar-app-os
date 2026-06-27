-- Migration: 003_create_planters.sql
-- Closes #546
--
-- Stores off-chain planter (farmer) metadata, linked to a Stellar wallet.
-- Soft-deleted via deleted_at so historical planting records remain intact.

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planters (
  -- Internal surrogate key
  id                BIGSERIAL     PRIMARY KEY,

  -- Stellar public key — unique identity for a planter
  stellar_address   TEXT          NOT NULL UNIQUE,

  -- Display name (from onboarding / KYC)
  full_name         TEXT          NOT NULL,

  -- ISO 3166-1 alpha-2 country code, e.g. 'NG', 'GH', 'KE'
  country_code      CHAR(2)       NOT NULL,

  -- Approximate region / state (for map clustering)
  region            TEXT          NOT NULL,

  -- GPS coordinates of the planter's primary farm (fuzzed for privacy)
  lat               NUMERIC(9, 6),
  lng               NUMERIC(9, 6),

  -- Phone number (E.164 format) for SMS verification
  phone_e164        TEXT,

  -- KYC / onboarding status
  kyc_status        TEXT          NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending', 'verified', 'rejected', 'suspended')),

  -- Optional link to an off-chain identity document hash (IPFS CID or SHA-256)
  identity_hash     TEXT,

  -- Timestamps
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Soft delete — set to NOW() to deactivate; NULL means active
  deleted_at        TIMESTAMPTZ
);

-- Indexes for common look-ups
CREATE INDEX IF NOT EXISTS idx_planters_stellar    ON planters (stellar_address);
CREATE INDEX IF NOT EXISTS idx_planters_country    ON planters (country_code);
CREATE INDEX IF NOT EXISTS idx_planters_kyc        ON planters (kyc_status);
CREATE INDEX IF NOT EXISTS idx_planters_active     ON planters (deleted_at) WHERE deleted_at IS NULL;
