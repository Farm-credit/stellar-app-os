/**
 * Server-side store for field team tree photo updates (#1640).
 *
 * In-process storage like `lib/api/tree-health.ts`; swap the Maps for a
 * database/object store without changing the routes. Submissions are keyed by
 * the client-generated id so a retried sync never creates a duplicate.
 */
import { getTreeById } from '@/lib/api/tree-registry';
import { recordHealthObservation } from '@/lib/api/tree-health';
import { PHOTO_LIMITS } from '@/lib/field/photo-quality';

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class FieldSubmissionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FieldSubmissionError';
    this.status = status;
  }
}

export interface FieldSubmissionInput {
  clientId: string;
  treeId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  healthScore: number | null;
  note: string | null;
  photo: { bytes: Uint8Array; contentType: string };
}

export interface FieldSubmission {
  id: string;
  treeId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  receivedAt: string;
  healthScore: number | null;
  note: string | null;
  photoUrl: string;
}

const submissions = new Map<string, FieldSubmission>();
const photos = new Map<string, { bytes: Uint8Array; contentType: string }>();

export function validateSubmission(input: FieldSubmissionInput): void {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientId)) {
    throw new FieldSubmissionError('Invalid client id');
  }
  if (!input.treeId.trim()) throw new FieldSubmissionError('Tree id is required');
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new FieldSubmissionError('Latitude must be between -90 and 90');
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new FieldSubmissionError('Longitude must be between -180 and 180');
  }
  if (Number.isNaN(new Date(input.capturedAt).getTime())) {
    throw new FieldSubmissionError('Capture time is invalid');
  }
  if (
    input.healthScore !== null &&
    (!Number.isFinite(input.healthScore) || input.healthScore < 0 || input.healthScore > 100)
  ) {
    throw new FieldSubmissionError('Health score must be between 0 and 100');
  }
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(input.photo.contentType)) {
    throw new FieldSubmissionError('Photo must be a JPEG, PNG or WebP image', 415);
  }
  if (input.photo.bytes.byteLength < PHOTO_LIMITS.minBytes) {
    throw new FieldSubmissionError('Photo is too small to be a valid capture', 422);
  }
  if (input.photo.bytes.byteLength > PHOTO_LIMITS.maxBytes) {
    throw new FieldSubmissionError('Photo exceeds the 10 MB limit', 413);
  }
}

/** Stores a submission. Returns `duplicate: true` when the client id was already synced. */
export async function recordSubmission(
  input: FieldSubmissionInput
): Promise<{ submission: FieldSubmission; duplicate: boolean }> {
  validateSubmission(input);

  const existing = submissions.get(input.clientId);
  if (existing) return { submission: existing, duplicate: true };

  const tree = await getTreeById(input.treeId);
  if (!tree) throw new FieldSubmissionError('Tree not found', 404);

  const submission: FieldSubmission = {
    id: input.clientId,
    treeId: tree.treeId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    capturedAt: input.capturedAt,
    receivedAt: new Date().toISOString(),
    healthScore: input.healthScore,
    note: input.note,
    photoUrl: `/api/field/tree-updates/${encodeURIComponent(input.clientId)}/photo`,
  };
  submissions.set(submission.id, submission);
  photos.set(submission.id, input.photo);

  // Feed the health reading into the existing alerting pipeline so sponsors are notified.
  if (input.healthScore !== null) {
    await recordHealthObservation({
      treeId: tree.treeId,
      score: input.healthScore,
      note: input.note ?? undefined,
    });
  }

  return { submission, duplicate: false };
}

export function listSubmissionsForTree(treeId: string): FieldSubmission[] {
  return [...submissions.values()]
    .filter((s) => s.treeId === treeId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function getSubmissionPhoto(id: string): { bytes: Uint8Array; contentType: string } | null {
  return photos.get(id) ?? null;
}

export function resetFieldSubmissionsForTest(): void {
  submissions.clear();
  photos.clear();
}
