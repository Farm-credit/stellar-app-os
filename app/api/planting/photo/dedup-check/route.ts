/**
 * POST /api/planting/photo/dedup-check
 *
 * Standalone pHash duplicate-photo detection endpoint.
 *
 * Accepts a single image upload (`photo` field, multipart/form-data) plus
 * optional `entityType` (`tree` | `planter`) and `entityId` context.  Returns
 * `{ hash, isDuplicate, match? }` without persisting anything.
 *
 * Use this when the caller wants to *preview* whether a photo would be
 * accepted (e.g. live UI feedback in the planter dashboard).  For a single
 * round-trip that *also* records the hash on success, use the integrated
 * `/api/planting/photo` route.
 *
 * Issue: #825
 */

import { NextResponse } from 'next/server';
import { computePHash } from '@/lib/image/phash';
import { assertValidHex } from '@/lib/image/distance';
import { findDuplicate, getDuplicateThreshold, type PhotoEntityType } from '@/lib/db/photo-hashes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — slightly larger than upload
const VALID_ENTITY_TYPES: ReadonlySet<PhotoEntityType> = new Set(['tree', 'planter']);

interface DedupCheckSuccess {
  hash: string;
  population: number;
  threshold: number;
  isDuplicate: boolean;
  match: {
    id: number;
    entityType: PhotoEntityType;
    entityId: string;
    distance: number;
    storageRef: string;
    createdAt: string;
  } | null;
}

export async function POST(request: Request) {
  // ── 1. Parse multipart body ───────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart request' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No photo file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Only JPEG, PNG and WebP images are accepted.' },
      { status: 415 }
    );
  }

  // Optional context — narrower search.
  const entityTypeRaw = formData.get('entityType');
  const entityIdRaw = formData.get('entityId');
  const entityId =
    typeof entityIdRaw === 'string' && entityIdRaw.length > 0 ? entityIdRaw : undefined;
  const entityType: PhotoEntityType | undefined =
    typeof entityTypeRaw === 'string' && VALID_ENTITY_TYPES.has(entityTypeRaw as PhotoEntityType)
      ? (entityTypeRaw as PhotoEntityType)
      : undefined;
  // entityId is accepted for API symmetry with other photo routes; the
  // current duplicate-check query only filters by entityType, so we just
  // validate the value here without threading it into the SQL.
  if (entityId !== undefined && entityId.length > 256) {
    return NextResponse.json({ error: 'entityId is too long' }, { status: 400 });
  }

  // ── 2. Compute pHash ──────────────────────────────────────────────────────
  let hash;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    hash = await computePHash(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute pHash';
    console.error('[dedup-check] hash error:', message);
    return NextResponse.json(
      { error: 'Could not compute perceptual hash for the supplied image.' },
      { status: 422 }
    );
  }

  // Sanity: ensures hex is well-formed before hitting the DB.
  assertValidHex(hash.hex);

  // ── 3. Lookup duplicates ──────────────────────────────────────────────────
  const threshold = getDuplicateThreshold();

  let match;
  try {
    match = await findDuplicate(hash.hex, {
      threshold,
      entityType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[dedup-check] db error:', message);
    return NextResponse.json({ error: 'Duplicate lookup service unavailable' }, { status: 503 });
  }

  const payload: DedupCheckSuccess = {
    hash: hash.hex,
    population: hash.population,
    threshold,
    isDuplicate: match !== null,
    match: match
      ? {
          id: match.row.id,
          entityType: match.row.entity_type,
          entityId: match.row.entity_id,
          distance: match.distance,
          storageRef: match.row.storage_ref,
          createdAt: match.row.created_at.toISOString(),
        }
      : null,
  };

  return NextResponse.json(payload, {
    headers: { 'X-Content-Type-Options': 'nosniff' },
  });
}

// Only POST is meaningful; reject the rest explicitly so callers get a
// useful 405 rather than a silent route-miss.
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST with a multipart/form-data photo upload.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
