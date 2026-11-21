-- Migration: 007_create_photo_hashes.sql
-- Issue: #825
--
-- Stores 64-bit perceptual hashes (pHash) for every planting photo accepted
-- into the system.  Used by the duplicate-detection engine to reject
-- resubmissions and stock-photo fraud.
--
-- The `hash` column is a fixed-width BIT(64) so PostgreSQL can compute
-- Hamming distances natively with the built-in `bit_count()` function
-- (available since PostgreSQL 14):
--
--   SELECT bit_count(hash # $1::bit(64)) AS distance
--     FROM photo_hashes
--    WHERE bit_count(hash # $1::bit(64)) <= $2
--    ORDER BY distance ASC
--    LIMIT 1;
--
-- A B-Tree index on the literal hash makes exact-duplicate lookups O(log n);
-- the XOR/popcount scan is bounded by the optional `entity_type` filter
-- (tree vs. planter) and the Hamming-distance threshold, which keeps
-- query latency acceptable up to ~1M rows.

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS photo_hashes (
  -- Internal surrogate key
  id              BIGSERIAL     PRIMARY KEY,

  -- What kind of entity owns the photo.
  --   'tree'     — a tree-verification photo (uploaded via /api/planting/photo)
  --   'planter'  — a planter KYC photo       (uploaded via /api/planters/upload-photo)
  entity_type     TEXT          NOT NULL
                  CHECK (entity_type IN ('tree', 'planter')),

  -- Foreign identifier within the entity type:
  --   'tree'    → tree_ref  (e.g. "HRV-2024-0001")
  --   'planter' → stellar_address (e.g. "GABCD…")
  -- We use TEXT rather than FKs because the references live on-chain
  -- (Soroban) or in IPFS and may not yet be mirrored into the local DB.
  entity_id       TEXT          NOT NULL,

  -- The 64-bit pHash value.  Hex representation is 16 chars; we store the
  -- raw bits so we can run native bitwise ops.
  hash            BIT(64)       NOT NULL,

  -- Hex form for debugging / external inspection (always lowercase).
  hash_hex        CHAR(16)      NOT NULL,

  -- Where the photo lives — S3 key, IPFS CID, or `inline:<sha256>` for
  -- streamed uploads.  Free-form; just a pointer for cross-referencing.
  storage_ref     TEXT          NOT NULL,

  -- Optional context: planter region, sponsor wallet, upload IP, etc.
  metadata        JSONB         NOT NULL DEFAULT '{}'::jsonb,

  -- 32-bit bigint Hamming distance to the nearest known duplicate at insert
  -- time, so the application layer can quickly tell "this was auto-rejected
  -- because it was within 3 bits of photo #12345".  NULL = first occurrence.
  duplicate_of    BIGINT        REFERENCES photo_hashes (id) ON DELETE SET NULL,

  -- Audit timestamps
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Idempotency: the same entity may not record the same hash twice.
  -- Closes the check-then-insert TOCTOU race in the application layer:
  -- concurrent uploads of the same image both call INSERT … ON CONFLICT
  -- DO NOTHING and only one row is ever created.
  CONSTRAINT photo_hashes_entity_hash_uniq UNIQUE (entity_type, hash_hex)
);

-- ── Indices ──────────────────────────────────────────────────────────────────

-- Exact-duplicate lookups (B-Tree on the literal hash bits).
CREATE INDEX IF NOT EXISTS idx_photo_hashes_hash
  ON photo_hashes (hash);

-- Lookups by entity — "show all hashes for tree T" / "show all hashes for
-- planter P".
CREATE INDEX IF NOT EXISTS idx_photo_hashes_entity
  ON photo_hashes (entity_type, entity_id);

-- Time-bounded scans for the Hamming-distance queries; combined with the
-- entity_type filter this keeps the search space small in practice.
CREATE INDEX IF NOT EXISTS idx_photo_hashes_created_at
  ON photo_hashes (created_at DESC);

-- Partial index for the "still active" hashes — soft-deletes are rare.
-- (We don't currently soft-delete, but this is cheap insurance.)
-- CREATE INDEX IF NOT EXISTS idx_photo_hashes_active
--   ON photo_hashes (hash)
--   WHERE duplicate_of IS NULL;

-- ── View: latest 50 hashes per entity ────────────────────────────────────────

CREATE OR REPLACE VIEW photo_hashes_recent AS
  SELECT *
    FROM photo_hashes
   WHERE created_at > NOW() - INTERVAL '90 days'
   ORDER BY created_at DESC;

-- ── Down (rollback) — kept for symmetry; the project doesn't auto-apply ────
-- DROP VIEW  IF EXISTS photo_hashes_recent;
-- DROP TABLE IF EXISTS photo_hashes;