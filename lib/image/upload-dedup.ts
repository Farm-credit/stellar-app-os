/**
 * Server-side upload pipeline duplicate image guard via perceptual hashing (pHash).
 *
 * Centralises pHash computation, Hamming-distance lookup, Stellar address
 * normalisation (`@stellar/stellar-sdk` `StrKey`), structured console warnings,
 * and safe persistence across planting proof, planter KYC, and milestone
 * verification upload routes.
 *
 * Issue: #1931
 */

import { StrKey } from '@stellar/stellar-sdk';
import { computePHash, type PHashHex, type PHashResult } from '@/lib/image/phash';
import { similarity } from '@/lib/image/distance';
import * as photoHashesDb from '@/lib/db/photo-hashes';

const FALLBACK_DUPLICATE_THRESHOLD = 5;

export interface UploadDedupCheckOptions {
  entityType: photoHashesDb.PhotoEntityType;
  entityId: string;
  threshold?: number;
  routeLabel?: string;
}

export interface UploadDuplicateVerdict {
  phash: PHashResult;
  threshold: number;
  isDuplicate: boolean;
  distance: number | null;
  similarityScore: number | null;
  duplicateOf: number | null;
  matchedEntityId: string | null;
  stellarIdentityKind: 'ed25519' | 'contract' | 'external';
}

/**
 * Classify whether an entity identifier is a valid Stellar Ed25519 public key
 * (`G...`), Soroban contract address (`C...`), or off-chain identifier.
 */
export function classifyStellarEntityId(entityId: string): 'ed25519' | 'contract' | 'external' {
  const trimmed = entityId.trim();
  if (StrKey.isValidEd25519PublicKey(trimmed)) return 'ed25519';
  if (StrKey.isValidContract(trimmed)) return 'contract';
  return 'external';
}

function resolveThreshold(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return explicit;
  }
  try {
    if (typeof photoHashesDb.getDuplicateThreshold === 'function') {
      return photoHashesDb.getDuplicateThreshold();
    }
  } catch {
    // Tolerate partial module mocks in unit tests that omit getDuplicateThreshold.
  }
  return FALLBACK_DUPLICATE_THRESHOLD;
}

function isTransientDbUnavailableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /DATABASE_URL|ECONNREFUSED|ENOTFOUND|connect ETIMEDOUT|Connection terminated|relation "photo_hashes" does not exist/i.test(
    message
  );
}

/**
 * Compute the 64-bit perceptual hash of an uploaded image buffer and check
 * against existing submissions before pinning to IPFS / S3 or releasing funds.
 */
export async function guardUploadAgainstDuplicates(
  buffer: Buffer | Uint8Array,
  options: UploadDedupCheckOptions
): Promise<UploadDuplicateVerdict> {
  const phash = await computePHash(buffer);
  const threshold = resolveThreshold(options.threshold);
  const stellarIdentityKind = classifyStellarEntityId(options.entityId);
  const routeTag = options.routeLabel ?? 'upload-pipeline';

  let match: photoHashesDb.DuplicateMatch | null = null;
  try {
    match = await photoHashesDb.findDuplicate(phash.hex, {
      threshold,
      entityType: options.entityType,
    });
  } catch (err) {
    if (isTransientDbUnavailableError(err)) {
      console.warn(
        `[${routeTag}] Duplicate hash database unavailable — proceeding with computed pHash ${phash.hex}:`,
        err instanceof Error ? err.message : String(err)
      );
      match = null;
    } else {
      throw err;
    }
  }

  if (match) {
    const matchedHex =
      typeof match.row.hash_hex === 'string' && /^[0-9a-f]{16}$/.test(match.row.hash_hex)
        ? (match.row.hash_hex as PHashHex)
        : undefined;
    const simScore = matchedHex
      ? similarity(phash.hex, matchedHex)
      : Math.max(0, Math.min(1, 1 - match.distance / 64));
    const simPct = Math.round(simScore * 1000) / 10;

    console.warn(
      `[${routeTag}] Flagged duplicate ${options.entityType} photo for ${options.entityId} ` +
        `(${stellarIdentityKind}): hash=${phash.hex}, distance=${match.distance}/${threshold} bits ` +
        `(${simPct}% similarity), duplicateOf=#${match.row.id}`,
      {
        entityType: options.entityType,
        entityId: options.entityId,
        stellarIdentityKind,
        hash: phash.hex,
        distance: match.distance,
        threshold,
        similarityPct: simPct,
        duplicateOf: match.row.id,
        matchedEntityId: match.row.entity_id ?? null,
      }
    );

    return {
      phash,
      threshold,
      isDuplicate: true,
      distance: match.distance,
      similarityScore: simScore,
      duplicateOf: match.row.id,
      matchedEntityId: match.row.entity_id ?? null,
      stellarIdentityKind,
    };
  }

  return {
    phash,
    threshold,
    isDuplicate: false,
    distance: null,
    similarityScore: null,
    duplicateOf: null,
    matchedEntityId: null,
    stellarIdentityKind,
  };
}

/**
 * Best-effort persistence of a newly accepted upload's perceptual hash.
 * Never fails an already-pinned IPFS/S3 upload if the database is unreachable.
 */
export async function safelyRecordUploadedPhotoHash(input: {
  entityType: photoHashesDb.PhotoEntityType;
  entityId: string;
  hashHex: PHashHex;
  storageRef: string;
  metadata?: Record<string, unknown>;
  routeLabel?: string;
}): Promise<number | null> {
  const routeTag = input.routeLabel ?? 'upload-pipeline';
  try {
    const stellarIdentityKind = classifyStellarEntityId(input.entityId);
    const id = await photoHashesDb.recordPhotoHash({
      entityType: input.entityType,
      entityId: input.entityId,
      hashHex: input.hashHex,
      storageRef: input.storageRef,
      metadata: {
        ...input.metadata,
        stellarIdentityKind,
      },
    });
    return id;
  } catch (err) {
    console.warn(
      `[${routeTag}] Could not persist photo hash ${input.hashHex} for ${input.entityType}:${input.entityId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
