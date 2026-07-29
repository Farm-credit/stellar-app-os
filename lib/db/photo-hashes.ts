/**
 * PostgreSQL storage layer for pHash fingerprints.
 *
 * Issue: #825
 *
 * Public surface:
 *   - recordPhotoHash()    – insert a new hash + return its row id.
 *   - findDuplicate()      – Hamming-distance nearest-neighbour lookup.
 *   - findExactDuplicate() – O(log n) exact-match lookup.
 *   - listHashesForEntity() – paginated history for an entity.
 *   - deletePhotoHash()    – GDPR-style hard delete.
 *
 * Design notes
 * ------------
 *  • All functions tolerate a missing `photo_hashes` table — useful in
 *    local-dev environments where migrations haven't been applied yet.
 *    In that case the duplicate detection degrades to a no-op rather
 *    than blocking all uploads (logged at WARN level).
 *  • `findDuplicate` uses PostgreSQL 14's native `bit_count()` function
 *    when available.  For older deployments we fall back to a portable
 *    bit-string XOR expression.  The candidate hex is passed as a
 *    parameter (decoded server-side) — no string interpolation of
 *    attacker-controlled data into SQL.
 *  • The table has a `UNIQUE (entity_type, hash_hex)` constraint so that
 *    `INSERT … ON CONFLICT DO NOTHING` makes duplicate inserts a safe,
 *    idempotent no-op (closes the check-then-insert TOCTOU race).
 *  • Configuration is environment-driven so operators can tune the
 *    Hamming threshold and the maximum lookback window without a code
 *    change.
 */

import { getPool } from '@/lib/db/client';
import { assertValidHex } from '@/lib/image/distance';
import type { PHashHex } from '@/lib/image/phash';

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Default Hamming distance below which a candidate photo is considered
 * a duplicate.  Empirically:
 *   distance ≤ 2  → identical image (resaved, recompressed)
 *   distance ≤ 5  → very near duplicate (cropped, watermarked, slight crop)
 *   distance ≤ 10 → visually similar (same scene, different angle)
 *
 * Operators can override with PHASH_DUPLICATE_THRESHOLD.
 */
export const DEFAULT_DUPLICATE_THRESHOLD = 5;

/** When scanning, only consider hashes newer than this.  Default 90 d. */
const DEFAULT_LOOKBACK_DAYS = 90;

/** Read the configured threshold from env, falling back to the constant. */
export function getDuplicateThreshold(): number {
  const raw = process.env.PHASH_DUPLICATE_THRESHOLD;
  if (raw === undefined || raw === '') return DEFAULT_DUPLICATE_THRESHOLD;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 64) {
    console.warn(
      `[photo-hashes] invalid PHASH_DUPLICATE_THRESHOLD="${raw}", using default ${DEFAULT_DUPLICATE_THRESHOLD}`
    );
    return DEFAULT_DUPLICATE_THRESHOLD;
  }
  return parsed;
}

/** Read the configured lookback window (days) from env. */
export function getDuplicateLookbackDays(): number {
  const raw = process.env.PHASH_DUPLICATE_LOOKBACK_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3650) {
    console.warn(
      `[photo-hashes] invalid PHASH_LOOKBACK_DAYS="${raw}", using default ${DEFAULT_LOOKBACK_DAYS}`
    );
    return DEFAULT_LOOKBACK_DAYS;
  }
  return parsed;
}

// ── Row types ────────────────────────────────────────────────────────────────

export type PhotoEntityType = 'tree' | 'planter';

export interface PhotoHashRow {
  id: number;
  entity_type: PhotoEntityType;
  entity_id: string;
  /** Hex form, e.g. "9a3f0e8c7b1d4256". */
  hash_hex: string;
  /** Storage pointer — S3 key, IPFS CID, or `inline:<sha256>`. */
  storage_ref: string;
  metadata: Record<string, unknown>;
  duplicate_of: number | null;
  created_at: Date;
}

export interface DuplicateMatch {
  row: PhotoHashRow;
  /** 0..64 — number of differing bits. */
  distance: number;
}

export interface RecordPhotoHashInput {
  entityType: PhotoEntityType;
  entityId: string;
  hashHex: PHashHex;
  storageRef: string;
  metadata?: Record<string, unknown>;
}

// ── Low-level SQL helpers ────────────────────────────────────────────────────

/**
 * Detect the PostgreSQL major version at runtime so we can decide whether
 * `bit_count()` is available.  Returns `null` if the version cannot be
 * determined.
 */
let cachedServerMajor: number | null = null;
async function getServerMajor(): Promise<number | null> {
  if (cachedServerMajor !== null) return cachedServerMajor;
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ v: string }>('SHOW server_version');
    const raw = rows[0]?.v ?? '';
    const major = Number.parseInt(raw.split('.')[0] ?? '', 10);
    cachedServerMajor = Number.isFinite(major) ? major : 0;
    return cachedServerMajor;
  } catch (err) {
    console.warn('[photo-hashes] could not detect PostgreSQL version:', err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Insert a new photo hash.  Returns the row id (or `null` if the table is
 * missing — useful for local-dev where migrations aren't applied).
 *
 * Uses `INSERT … ON CONFLICT DO NOTHING` so re-inserting an identical
 * hash for the same entity is idempotent.  Two truly concurrent uploads
 * of the same image may both call this, but only one row is created and
 * the second returns `null` rather than throwing.
 *
 * Never throws on a missing table; logs a warning instead.  Other DB
 * errors propagate.
 */
export async function recordPhotoHash(input: RecordPhotoHashInput): Promise<number | null> {
  const { entityType, entityId, hashHex, storageRef, metadata = {} } = input;
  assertValidHex(hashHex);

  if (!entityId || typeof entityId !== 'string') {
    throw new TypeError('recordPhotoHash: entityId must be a non-empty string');
  }
  if (!storageRef || typeof storageRef !== 'string') {
    throw new TypeError('recordPhotoHash: storageRef must be a non-empty string');
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO photo_hashes
         (entity_type, entity_id, hash, hash_hex, storage_ref, metadata)
       VALUES ($1, $2, decode($3, 'hex')::bit(64), $3, $4, $5::jsonb)
       ON CONFLICT (entity_type, hash_hex) DO NOTHING
       RETURNING id`,
      [entityType, entityId, hashHex, storageRef, JSON.stringify(metadata)]
    );
    const idStr = rows[0]?.id;
    return idStr ? Number.parseInt(idStr, 10) : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) {
      console.warn(
        '[photo-hashes] photo_hashes table missing — duplicate detection disabled. Apply db/migrations/007_create_photo_hashes.sql'
      );
      return null;
    }
    throw err;
  }
}

/**
 * Find the closest match in the photo_hashes table by Hamming distance.
 * Returns `null` if no candidate is within `threshold` bits.
 *
 * Defaults to `threshold = getDuplicateThreshold()`.
 *
 * The candidate hash hex is passed as a `$2` parameter and decoded
 * server-side via `decode($2, 'hex')::bit(64)` — no SQL interpolation of
 * attacker-controlled data.
 */
export async function findDuplicate(
  hashHex: PHashHex,
  options: { threshold?: number; lookbackDays?: number; entityType?: PhotoEntityType } = {}
): Promise<DuplicateMatch | null> {
  assertValidHex(hashHex);

  const threshold = options.threshold ?? getDuplicateThreshold();
  const lookbackDays = options.lookbackDays ?? getDuplicateLookbackDays();
  const major = await getServerMajor();
  const useBitCount = major !== null && major >= 14;

  // SQL fragments for the Hamming-distance expression.  Both branches use
  // the same parameter positions so the pg driver sees one shape.
  const distanceExpr = useBitCount
    ? `bit_count(hash # decode($2, 'hex')::bit(64))`
    : `length(replace((hash # decode($2, 'hex')::bit(64))::text, '0', ''))`;

  // Optional entity_type filter — `$4` slot when used.
  const entityFilter = options.entityType ? 'AND entity_type = $4' : '';
  const params: unknown[] = options.entityType
    ? [threshold, hashHex, lookbackDays, options.entityType]
    : [threshold, hashHex, lookbackDays];

  const sql = `
    SELECT id, entity_type, entity_id, hash_hex, storage_ref,
           metadata, duplicate_of, created_at,
           ${distanceExpr} AS distance
      FROM photo_hashes
     WHERE created_at > NOW() - ($3::text || ' days')::interval
       AND ${distanceExpr} <= $1
       ${entityFilter}
     ORDER BY distance ASC, created_at DESC
     LIMIT 1
  `;

  try {
    const pool = getPool();
    const { rows } = await pool.query<PhotoHashRow & { distance: string | number }>(sql, params);
    const first = rows[0];
    if (!first) return null;
    const distance =
      typeof first.distance === 'string' ? Number.parseInt(first.distance, 10) : first.distance;
    return { row: first, distance };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) {
      console.warn('[photo-hashes] photo_hashes table missing — duplicate detection disabled.');
      return null;
    }
    throw err;
  }
}

/** O(log n) exact-match lookup.  Returns the row or `null`. */
export async function findExactDuplicate(hashHex: PHashHex): Promise<PhotoHashRow | null> {
  assertValidHex(hashHex);
  const pool = getPool();
  try {
    const { rows } = await pool.query<PhotoHashRow>(
      `SELECT id, entity_type, entity_id, hash_hex, storage_ref,
              metadata, duplicate_of, created_at
         FROM photo_hashes
        WHERE hash_hex = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [hashHex]
    );
    return rows[0] ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) {
      console.warn('[photo-hashes] photo_hashes table missing — exact lookup disabled.');
      return null;
    }
    throw err;
  }
}

/** Return up to `limit` hashes for an entity, newest first. */
export async function listHashesForEntity(
  entityType: PhotoEntityType,
  entityId: string,
  limit = 20
): Promise<PhotoHashRow[]> {
  if (!entityId) throw new TypeError('listHashesForEntity: entityId required');
  const pool = getPool();
  const cappedLimit = Math.max(1, Math.min(limit, 200));
  try {
    const { rows } = await pool.query<PhotoHashRow>(
      `SELECT id, entity_type, entity_id, hash_hex, storage_ref,
              metadata, duplicate_of, created_at
         FROM photo_hashes
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [entityType, entityId, cappedLimit]
    );
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) {
      console.warn('[photo-hashes] photo_hashes table missing — list disabled.');
      return [];
    }
    throw err;
  }
}

/** Hard-delete a photo hash row.  Used for GDPR data-subject erasure. */
export async function deletePhotoHash(id: number): Promise<boolean> {
  const pool = getPool();
  try {
    const { rowCount } = await pool.query('DELETE FROM photo_hashes WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) return false;
    throw err;
  }
}

/** Aggregate stats for an admin dashboard. */
export interface PhotoHashStats {
  total: number;
  byEntityType: Record<PhotoEntityType, number>;
  oldestHashAt: Date | null;
  newestHashAt: Date | null;
}

export async function getPhotoHashStats(): Promise<PhotoHashStats> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{
      total: string | number;
      trees: string | number;
      planters: string | number;
      oldest: Date | null;
      newest: Date | null;
    }>(
      `SELECT
         COUNT(*)::bigint                                                       AS total,
         COUNT(*) FILTER (WHERE entity_type = 'tree')::bigint                   AS trees,
         COUNT(*) FILTER (WHERE entity_type = 'planter')::bigint                AS planters,
         MIN(created_at)                                                        AS oldest,
         MAX(created_at)                                                        AS newest
       FROM photo_hashes`
    );
    const first = rows[0] ?? { total: 0, trees: 0, planters: 0, oldest: null, newest: null };
    const num = (v: string | number | null | undefined) =>
      typeof v === 'string' ? Number.parseInt(v, 10) || 0 : (v ?? 0);
    return {
      total: num(first.total),
      byEntityType: {
        tree: num(first.trees),
        planter: num(first.planters),
      },
      oldestHashAt: first.oldest,
      newestHashAt: first.newest,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "photo_hashes" does not exist/i.test(message)) {
      return {
        total: 0,
        byEntityType: { tree: 0, planter: 0 },
        oldestHashAt: null,
        newestHashAt: null,
      };
    }
    throw err;
  }
}

/**
 * Convenience wrapper: hash → check duplicate → record.  Returns the
 * detected match (if any) along with the new row id.
 *
 * Note: `recordPhotoHash` uses `ON CONFLICT DO NOTHING` so the worst case
 * for a check-then-insert race is a no-op duplicate row, not a 500 error.
 *
 * This is the function API routes should call.
 */
export async function checkAndRecordPhotoHash(
  input: RecordPhotoHashInput,
  options: { threshold?: number; lookbackDays?: number } = {}
): Promise<{ match: DuplicateMatch | null; rowId: number | null }> {
  const match = await findDuplicate(input.hashHex, options);
  if (match) {
    console.info(`[photo-hashes] duplicate rejected for ${input.entityType}:${input.entityId}`, {
      hash: input.hashHex,
      distance: match.distance,
      duplicate_of: match.row.id,
    });
    return { match, rowId: null };
  }
  const rowId = await recordPhotoHash(input);
  return { match: null, rowId };
}
