/**
 * Browser-safe perceptual hashing (pHash) and instant upload precheck utility.
 *
 * Computes a 64-bit DCT perceptual hash directly in the browser before an
 * upload hits IPFS/S3, checks both a local recent-submissions cache (works
 * offline too) and the `/api/planting/photo/dedup-check` endpoint, and emits
 * structured console warnings whenever a reused or stock photo is flagged.
 *
 * Issue: #1931
 */

import {
  PHASH_RESIZE,
  computePHashFromGrayscale,
  rgbaToGrayscale32x32,
  type PHashHex,
  type PHashResult,
} from '@/lib/image/dct-core';
import { assertValidHex, hammingDistance, similarity } from '@/lib/image/distance';

export const CLIENT_DEFAULT_DUPLICATE_THRESHOLD = 5;
export const LOCAL_PHASH_STORAGE_KEY = 'farmcredit_submitted_photo_phashes_v1';
const MAX_LOCAL_HISTORY_ENTRIES = 200;

export type DuplicateDetectionSource = 'local-history' | 'server-dedup' | 'upload-response';

export interface LocalPhotoHashEntry {
  hash: PHashHex;
  entityType: 'tree' | 'planter';
  entityId: string;
  fileName?: string;
  storageRef?: string;
  recordedAt: string;
}

export interface DuplicateFlagDetails {
  hash: PHashHex;
  matchedHash?: string;
  distance: number;
  threshold: number;
  /** Value in [0, 1] where 1.0 means identical 64-bit fingerprint. */
  similarityScore: number;
  source: DuplicateDetectionSource;
  duplicateId?: number | string;
  matchedEntityId?: string;
  matchedCreatedAt?: string;
}

export interface ClientDuplicatePrecheckResult {
  hash: PHashResult | null;
  isDuplicate: boolean;
  flag: DuplicateFlagDetails | null;
}

export interface ClientDuplicatePrecheckOptions {
  entityType?: 'tree' | 'planter';
  entityId?: string;
  threshold?: number;
  /** Skip the `/api/planting/photo/dedup-check` network probe when false. */
  checkServer?: boolean;
  /** Custom decoder seam for deterministic unit testing in jsdom. */
  decodeToGrayscale?: (file: Blob) => Promise<Float64Array>;
  /** Custom fetch seam for unit testing. */
  fetchImpl?: typeof fetch;
}

interface DedupCheckApiResponse {
  hash: string;
  population: number;
  threshold: number;
  isDuplicate: boolean;
  match: {
    id: number;
    entityType: 'tree' | 'planter';
    entityId: string;
    distance: number;
    storageRef: string;
    createdAt: string;
  } | null;
}

/**
 * Emit a standardized, developer-actionable console warning whenever a
 * duplicate or near-duplicate photo is detected in the upload pipeline.
 */
export function warnDuplicatePhotoDetected(
  flag: DuplicateFlagDetails,
  contextLabel?: string
): void {
  const similarityPct = Math.round(flag.similarityScore * 1000) / 10;
  const scope = contextLabel ? ` [${contextLabel}]` : '';
  const matchRef =
    flag.duplicateId !== undefined
      ? `#${flag.duplicateId}`
      : (flag.matchedEntityId ?? flag.matchedHash ?? 'previous submission');

  console.warn(
    `[pHash:upload-pipeline]${scope} Flagged potential duplicate or reused photo (${flag.source}): ` +
      `hash=${flag.hash}, distance=${flag.distance}/${flag.threshold} bits (${similarityPct}% visual match), ` +
      `matched=${matchRef}`,
    {
      hash: flag.hash,
      matchedHash: flag.matchedHash,
      distance: flag.distance,
      threshold: flag.threshold,
      similarityPct,
      source: flag.source,
      duplicateId: flag.duplicateId,
      matchedEntityId: flag.matchedEntityId,
      matchedCreatedAt: flag.matchedCreatedAt,
    }
  );
}

/**
 * Decode an image `Blob`/`File` in the browser to a 32×32 greyscale matrix.
 */
export async function decodeBlobToGrayscale32x32(blob: Blob): Promise<Float64Array> {
  if (typeof document === 'undefined') {
    throw new Error('decodeBlobToGrayscale32x32 requires a browser DOM environment');
  }

  const canvas = document.createElement('canvas');
  canvas.width = PHASH_RESIZE;
  canvas.height = PHASH_RESIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable for perceptual hashing');
  }

  // Paint white backdrop first so transparent PNG/WebP regions hash consistently.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PHASH_RESIZE, PHASH_RESIZE);

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      ctx.drawImage(bitmap, 0, 0, PHASH_RESIZE, PHASH_RESIZE);
    } finally {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  } else {
    await drawBlobViaImageElement(blob, ctx);
  }

  const imageData = ctx.getImageData(0, 0, PHASH_RESIZE, PHASH_RESIZE);
  return rgbaToGrayscale32x32(imageData.data, PHASH_RESIZE, PHASH_RESIZE);
}

function drawBlobViaImageElement(blob: Blob, ctx: CanvasRenderingContext2D): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, PHASH_RESIZE, PHASH_RESIZE);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image for perceptual hash check'));
    };
    img.src = url;
  });
}

/**
 * Read locally recorded photo hashes from `localStorage` (safe no-op on SSR
 * or restricted storage contexts).
 */
export function readLocalPhotoHashes(): LocalPhotoHashEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PHASH_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalPhotoHashEntry => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.hash === 'string' &&
        /^[0-9a-f]{16}$/.test(candidate.hash) &&
        (candidate.entityType === 'tree' || candidate.entityType === 'planter') &&
        typeof candidate.entityId === 'string' &&
        typeof candidate.recordedAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

/**
 * Persist an accepted photo's pHash locally so subsequent attempts to re-upload
 * the same or lightly modified image from this device are flagged immediately,
 * even while offline.
 */
export function recordLocalPhotoHash(entry: {
  hash: string;
  entityType: 'tree' | 'planter';
  entityId: string;
  fileName?: string;
  storageRef?: string;
}): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const validHash = assertValidHex(entry.hash.toLowerCase());
    const existing = readLocalPhotoHashes().filter(
      (item) => !(item.entityType === entry.entityType && item.hash === validHash)
    );
    const next: LocalPhotoHashEntry[] = [
      {
        hash: validHash,
        entityType: entry.entityType,
        entityId: entry.entityId,
        fileName: entry.fileName,
        storageRef: entry.storageRef,
        recordedAt: new Date().toISOString(),
      },
      ...existing,
    ].slice(0, MAX_LOCAL_HISTORY_ENTRIES);

    window.localStorage.setItem(LOCAL_PHASH_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[pHash:upload-pipeline] Unable to persist local photo hash cache:', err);
  }
}

/**
 * Check a candidate pHash hex against locally recorded submissions.
 */
export function findLocalDuplicatePhotoHash(
  candidateHex: PHashHex,
  options: { entityType?: 'tree' | 'planter'; threshold?: number } = {}
): DuplicateFlagDetails | null {
  assertValidHex(candidateHex);
  const threshold = options.threshold ?? CLIENT_DEFAULT_DUPLICATE_THRESHOLD;
  const entries = readLocalPhotoHashes();

  let closest: { entry: LocalPhotoHashEntry; distance: number } | null = null;
  for (const entry of entries) {
    if (options.entityType && entry.entityType !== options.entityType) continue;
    const distance = hammingDistance(candidateHex, entry.hash);
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { entry, distance };
      if (distance === 0) break;
    }
  }

  if (!closest) return null;

  return {
    hash: candidateHex,
    matchedHash: closest.entry.hash,
    distance: closest.distance,
    threshold,
    similarityScore: similarity(candidateHex, closest.entry.hash),
    source: 'local-history',
    duplicateId: closest.entry.storageRef,
    matchedEntityId: closest.entry.entityId,
    matchedCreatedAt: closest.entry.recordedAt,
  };
}

/**
 * Full client-side preflight check for an uploaded image file:
 *   1. Compute 64-bit DCT pHash locally (when browser canvas decoding succeeds).
 *   2. Compare against recent device submissions (`localStorage`).
 *   3. Probe `/api/planting/photo/dedup-check` when online.
 *   4. Emit an informative `console.warn` if a duplicate/reused image is found.
 */
export async function runClientDuplicatePrecheck(
  file: File,
  options: ClientDuplicatePrecheckOptions = {}
): Promise<ClientDuplicatePrecheckResult> {
  const threshold = options.threshold ?? CLIENT_DEFAULT_DUPLICATE_THRESHOLD;
  const decode = options.decodeToGrayscale ?? decodeBlobToGrayscale32x32;
  const fetchFn = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);

  let computedHash: PHashResult | null = null;
  try {
    const grayscale = await decode(file);
    computedHash = computePHashFromGrayscale(grayscale);
  } catch (err) {
    // Non-fatal in headless/test environments without canvas rasterization;
    // server-side pHash still enforces duplicate detection.
    console.warn(
      '[pHash:upload-pipeline] Client-side canvas decode unavailable, deferring to server pHash check:',
      err instanceof Error ? err.message : String(err)
    );
  }

  if (computedHash) {
    const localFlag = findLocalDuplicatePhotoHash(computedHash.hex, {
      entityType: options.entityType,
      threshold,
    });
    if (localFlag) {
      warnDuplicatePhotoDetected(localFlag, options.entityType ?? 'planting-proof');
      return {
        hash: computedHash,
        isDuplicate: true,
        flag: localFlag,
      };
    }
  }

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (options.checkServer !== false && fetchFn && isOnline) {
    try {
      const formData = new FormData();
      formData.append('photo', file);
      if (options.entityType) {
        formData.append('entityType', options.entityType);
      }
      if (options.entityId) {
        formData.append('entityId', options.entityId);
      }

      const response = await fetchFn('/api/planting/photo/dedup-check', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const payload = (await response.json()) as DedupCheckApiResponse;
        const resolvedHex = assertValidHex(payload.hash.toLowerCase());
        const hashResult: PHashResult = computedHash ?? {
          hex: resolvedHex,
          bits: BigInt(`0x${resolvedHex}`) as PHashResult['bits'],
          population: payload.population,
        };

        if (payload.isDuplicate && payload.match) {
          const distance = payload.match.distance;
          const serverThreshold = payload.threshold ?? threshold;
          const flag: DuplicateFlagDetails = {
            hash: hashResult.hex,
            distance,
            threshold: serverThreshold,
            similarityScore: Math.max(0, Math.min(1, 1 - distance / 64)),
            source: 'server-dedup',
            duplicateId: payload.match.id,
            matchedEntityId: payload.match.entityId,
            matchedCreatedAt: payload.match.createdAt,
          };
          warnDuplicatePhotoDetected(flag, options.entityType ?? 'planting-proof');
          return {
            hash: hashResult,
            isDuplicate: true,
            flag,
          };
        }

        return {
          hash: hashResult,
          isDuplicate: false,
          flag: null,
        };
      }
    } catch (err) {
      console.warn(
        '[pHash:upload-pipeline] Server precheck unreachable; server upload route will still validate on submit:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return {
    hash: computedHash,
    isDuplicate: false,
    flag: null,
  };
}
