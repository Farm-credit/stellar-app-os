-- Migration: 019_create_farmer_kyc.sql
-- Closes #1397
--
-- Farmer KYC: identity verification, land ownership proof, agricultural
-- experience, and certification eligibility screening.
--
-- Design notes
-- ------------
-- * Personal identifiers (national id, land document reference) are stored as
--   salted SHA-256 digests, never in the clear. The on-chain `kyc-attestation`
--   contract takes the same position — see `ZkProofInput`'s doc comment, "no
--   PII ever appears in the transaction or ledger state". Salt comes from
--   KYC_IDENTITY_SALT (see lib/kyc/validation.ts); digests are comparable for
--   equality and duplicate detection without being reversible.
-- * `screening` holds the verdict returned by
--   `screenCertificationEligibility` at evaluation time, including its
--   `rulesetVersion`. It is stored rather than recomputed on read so a later
--   ruleset change cannot silently re-classify an already-reviewed case;
--   re-screening is explicit (`KycService.rescreenApplication`).
-- * `status` is the off-chain pipeline state. The on-chain status a verifier
--   should attest is derived from it by `toOnChainKycStatus`
--   (submitted/under_review -> pending, approved -> verified).

-- UP ─────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS farmer_kyc_applications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Farmer identity on-chain: the Stellar public key, not the person.
  farmer_address              TEXT NOT NULL,

  -- ── Identity verification ────────────────────────────────────────────────
  full_name                   TEXT NOT NULL,
  national_id_hash            TEXT NOT NULL,
  phone_number                TEXT NOT NULL,
  village                     TEXT NOT NULL,
  date_of_birth               DATE NOT NULL,
  document_type               TEXT NOT NULL,
  document_reference_hash     TEXT,
  identity_verified_at        TIMESTAMPTZ,

  -- ── Land ownership proof ─────────────────────────────────────────────────
  ownership_type              TEXT NOT NULL,
  plot_size_hectares          NUMERIC(12, 4) NOT NULL,
  latitude                    DOUBLE PRECISION NOT NULL,
  longitude                   DOUBLE PRECISION NOT NULL,
  region                      TEXT NOT NULL,
  land_verified_at            TIMESTAMPTZ,

  -- ── Agricultural experience ──────────────────────────────────────────────
  years_of_experience         NUMERIC(5, 2) NOT NULL,
  primary_crop                TEXT NOT NULL,
  secondary_crops             TEXT[] NOT NULL DEFAULT '{}',
  soil_type                   TEXT NOT NULL,
  training_programmes         TEXT[] NOT NULL DEFAULT '{}',

  -- ── Certification / jurisdiction ─────────────────────────────────────────
  jurisdiction_flags          INTEGER NOT NULL DEFAULT 0,
  required_jurisdiction_flags INTEGER NOT NULL DEFAULT 0,
  active_sanctions            TEXT[] NOT NULL DEFAULT '{}',

  -- ── Review pipeline ──────────────────────────────────────────────────────
  consent_granted             BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'submitted',
  screening                   JSONB NOT NULL,
  decision                    JSONB,
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT farmer_kyc_status_check
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'expired')),
  CONSTRAINT farmer_kyc_document_type_check
    CHECK (document_type IN ('nin', 'voter_card', 'passport', 'drivers_licence')),
  CONSTRAINT farmer_kyc_ownership_type_check
    CHECK (ownership_type IN ('title_deed', 'lease', 'customary', 'communal', 'family_inheritance')),
  CONSTRAINT farmer_kyc_plot_size_check
    CHECK (plot_size_hectares > 0),
  CONSTRAINT farmer_kyc_latitude_check
    CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT farmer_kyc_longitude_check
    CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT farmer_kyc_years_experience_check
    CHECK (years_of_experience >= 0),
  -- A documentary tenure without a document reference is exactly the case the
  -- screening engine rejects, so refuse to store it in the first place.
  CONSTRAINT farmer_kyc_documentary_tenure_needs_document
    CHECK (
      ownership_type NOT IN ('title_deed', 'lease')
      OR document_reference_hash IS NOT NULL
    )
);

-- The reviewer worklist: open cases, oldest first.
CREATE INDEX IF NOT EXISTS idx_farmer_kyc_status_submitted
  ON farmer_kyc_applications (status, submitted_at);

-- A farmer's own applications, newest first.
CREATE INDEX IF NOT EXISTS idx_farmer_kyc_farmer_address
  ON farmer_kyc_applications (farmer_address, submitted_at DESC);

-- Duplicate-application detection on the hashed national id.
CREATE INDEX IF NOT EXISTS idx_farmer_kyc_national_id_hash
  ON farmer_kyc_applications (national_id_hash);

-- Certification tier filtering (full / provisional / none) without a seq scan.
CREATE INDEX IF NOT EXISTS idx_farmer_kyc_screening_tier
  ON farmer_kyc_applications ((screening ->> 'tier'));

COMMIT;

-- ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS farmer_kyc_applications;
