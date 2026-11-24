/**
 * Wildlife sighting log service — Issue #1665
 *
 * Field teams and approved citizen scientists submit sightings; field-team
 * records are approved automatically, citizen-scientist records wait for
 * review. The approved subset drives the per-project habitat quality score
 * and the featured wildlife photos on the project page.
 *
 * Follows the census-service pattern: in-memory store with an explicit
 * reset helper for tests.
 */

import { computeHabitatQualityScore } from './habitat';
import {
  SUBMITTER_ROLES,
  TAXONOMIC_GROUPS,
  type HabitatQualityScore,
  type SubmitSightingInput,
  type SightingStatus,
  type TaxonomicGroup,
  type WildlifeHabitatSnapshot,
  type WildlifeSighting,
} from './types';

/** Validation failure with a field hint for API 400 responses. */
export class WildlifeSubmissionError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'WildlifeSubmissionError';
    this.field = field;
  }
}

const sightings: WildlifeSighting[] = [];

/** Approved sightings shown as "recent activity" on the project page. */
const RECENT_LIMIT = 6;
/** Approved photos featured on the project page. */
const FEATURED_PHOTO_LIMIT = 3;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function requireNonEmpty(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WildlifeSubmissionError(`${field} is required`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new WildlifeSubmissionError(`${field} must be at most ${maxLength} characters`, field);
  }
  return trimmed;
}

function validateInput(input: SubmitSightingInput, now: Date): SubmitSightingInput {
  const projectId = requireNonEmpty(input.projectId, 'projectId');
  const speciesCommonName = requireNonEmpty(input.speciesCommonName, 'speciesCommonName', 120);
  const submittedBy = requireNonEmpty(input.submittedBy, 'submittedBy', 120);

  if (!TAXONOMIC_GROUPS.includes(input.taxonomicGroup)) {
    throw new WildlifeSubmissionError(
      `taxonomicGroup must be one of: ${TAXONOMIC_GROUPS.join(', ')}`,
      'taxonomicGroup'
    );
  }
  if (!SUBMITTER_ROLES.includes(input.submitterRole)) {
    throw new WildlifeSubmissionError(
      `submitterRole must be one of: ${SUBMITTER_ROLES.join(', ')}`,
      'submitterRole'
    );
  }

  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new WildlifeSubmissionError('count must be an integer between 1 and 1000', 'count');
  }

  const observedAtMs = Date.parse(String(input.observedAt));
  if (Number.isNaN(observedAtMs)) {
    throw new WildlifeSubmissionError('observedAt must be a valid ISO-8601 date', 'observedAt');
  }
  if (observedAtMs > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new WildlifeSubmissionError('observedAt cannot be in the future', 'observedAt');
  }

  if (input.photoUrl !== undefined && input.photoUrl !== '' && !isHttpUrl(input.photoUrl)) {
    throw new WildlifeSubmissionError('photoUrl must be an http(s) URL', 'photoUrl');
  }
  if (input.notes !== undefined && input.notes.length > 500) {
    throw new WildlifeSubmissionError('notes must be at most 500 characters', 'notes');
  }
  if (input.scientificName !== undefined && input.scientificName.length > 160) {
    throw new WildlifeSubmissionError(
      'scientificName must be at most 160 characters',
      'scientificName'
    );
  }

  return {
    projectId,
    speciesCommonName,
    scientificName: input.scientificName?.trim() || undefined,
    taxonomicGroup: input.taxonomicGroup,
    count,
    observedAt: new Date(observedAtMs).toISOString(),
    submittedBy,
    submitterRole: input.submitterRole,
    photoUrl: input.photoUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
}

/**
 * Submit a sighting. Field-team records are approved immediately;
 * citizen-scientist records enter the review queue.
 */
export function submitSighting(
  input: SubmitSightingInput,
  now: Date = new Date()
): { sighting: WildlifeSighting; requiresApproval: boolean } {
  const validated = validateInput(input, now);
  const autoApproved: boolean = validated.submitterRole === 'field_team';

  const sighting: WildlifeSighting = {
    id: `sighting-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ...validated,
    status: autoApproved ? 'approved' : 'pending',
    reviewedBy: autoApproved ? 'auto (field team)' : undefined,
    reviewedAt: autoApproved ? now.toISOString() : undefined,
    createdAt: now.toISOString(),
  };

  sightings.unshift(sighting);
  return { sighting, requiresApproval: !autoApproved };
}

export type ReviewDecision = 'approve' | 'reject';

/** Approve or reject a pending sighting. Returns null when unknown. */
export function reviewSighting(
  sightingId: string,
  decision: ReviewDecision,
  reviewer: string,
  now: Date = new Date()
): WildlifeSighting | null {
  const sighting = sightings.find((record) => record.id === sightingId);
  if (!sighting) return null;
  if (sighting.status !== 'pending') {
    throw new WildlifeSubmissionError(
      `Sighting has already been reviewed (${sighting.status})`,
      'status'
    );
  }

  sighting.status = decision === 'approve' ? 'approved' : 'rejected';
  sighting.reviewedBy = reviewer.trim() || 'unknown reviewer';
  sighting.reviewedAt = now.toISOString();
  return sighting;
}

export interface SightingFilter {
  projectId?: string;
  status?: SightingStatus;
}

/** Sighting log entries, newest observation first. */
export function listSightings(filter: SightingFilter = {}): WildlifeSighting[] {
  return sightings
    .filter(
      (sighting) =>
        (!filter.projectId || sighting.projectId === filter.projectId) &&
        (!filter.status || sighting.status === filter.status)
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

/** Habitat quality score for a project (approved sightings only). */
export function getHabitatQualityScore(
  projectId: string,
  now: Date = new Date()
): HabitatQualityScore {
  return computeHabitatQualityScore(projectId, listSightings({ projectId }), now);
}

/** Score + recent approved sightings + featured wildlife photos. */
export function getWildlifeHabitatSnapshot(
  projectId: string,
  now: Date = new Date()
): WildlifeHabitatSnapshot {
  const projectSightings = listSightings({ projectId });
  const approved = projectSightings.filter((sighting) => sighting.status === 'approved');

  return {
    score: computeHabitatQualityScore(projectId, projectSightings, now),
    recentApproved: approved.slice(0, RECENT_LIMIT),
    featuredPhotos: approved
      .filter((sighting) => Boolean(sighting.photoUrl))
      .slice(0, FEATURED_PHOTO_LIMIT),
  };
}

// ─── Demo seeding ────────────────────────────────────────────────────────────
// The sighting log starts empty; like other mock-backed features the project
// page seeds a deterministic baseline so the section renders real content
// before any field submission arrives.

interface PoolEntry {
  speciesCommonName: string;
  scientificName: string;
  taxonomicGroup: TaxonomicGroup;
}

const WILDLIFE_POOL: PoolEntry[] = [
  {
    speciesCommonName: 'African Elephant',
    scientificName: 'Loxodonta africana',
    taxonomicGroup: 'mammal',
  },
  { speciesCommonName: 'Hornbill', scientificName: 'Bucorvus leadbeateri', taxonomicGroup: 'bird' },
  {
    speciesCommonName: 'Green Sea Turtle',
    scientificName: 'Chelonia mydas',
    taxonomicGroup: 'reptile',
  },
  { speciesCommonName: 'Leopard', scientificName: 'Panthera pardus', taxonomicGroup: 'mammal' },
  {
    speciesCommonName: 'African Grey Parrot',
    scientificName: 'Psittacus erithacus',
    taxonomicGroup: 'bird',
  },
  {
    speciesCommonName: 'Tree Frog',
    scientificName: 'Phyllomedusa bicolor',
    taxonomicGroup: 'amphibian',
  },
  {
    speciesCommonName: 'Forest Buffalo',
    scientificName: 'Syncerus caffer nanus',
    taxonomicGroup: 'mammal',
  },
  {
    speciesCommonName: 'Martial Eagle',
    scientificName: 'Polemaetus bellosus',
    taxonomicGroup: 'bird',
  },
  {
    speciesCommonName: 'Dwarf Crocodile',
    scientificName: 'Osteolaemus tetraspis',
    taxonomicGroup: 'reptile',
  },
  {
    speciesCommonName: 'Sitatunga',
    scientificName: 'Tragelaphus spekii',
    taxonomicGroup: 'mammal',
  },
  {
    speciesCommonName: 'Monarch Butterfly',
    scientificName: 'Danaus plexippus',
    taxonomicGroup: 'insect',
  },
  {
    speciesCommonName: 'African Grey Parakeet',
    scientificName: 'Psittacus erithacus',
    taxonomicGroup: 'bird',
  },
];

/**
 * Photo URLs reused from established image pools in this repo (tree growth
 * timeline / drone imagery) so seeded sightings never link to dead assets.
 */
const WILDLIFE_PHOTO_POOL = [
  'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80',
];

const SEEDED_SPECIES_PER_PROJECT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seed a deterministic baseline sighting log for a project (no-op when the
 * project already has records). Returns true when sightings were created.
 */
export function seedProjectWildlife(projectId: string, now: Date = new Date()): boolean {
  if (sightings.some((sighting) => sighting.projectId === projectId)) return false;

  const hash = hashString(projectId);

  for (let i = 0; i < SEEDED_SPECIES_PER_PROJECT; i++) {
    // Step of 5 over a 12-entry pool keeps indices distinct (gcd(5,12)=1).
    const entry = WILDLIFE_POOL[(hash + i * 5) % WILDLIFE_POOL.length];
    const observedAt = new Date(now.getTime() - (((hash + i * 37) % 540) + 5) * DAY_MS);
    const count = 1 + ((hash + i * 13) % 6);
    const hasPhoto = i % 3 === 0;

    sightings.push({
      id: `sighting-seed-${projectId}-${i}`,
      projectId,
      speciesCommonName: entry.speciesCommonName,
      scientificName: entry.scientificName,
      taxonomicGroup: entry.taxonomicGroup,
      count,
      observedAt: observedAt.toISOString(),
      submittedBy: `Field Team ${(hash % 7) + 1}`,
      submitterRole: 'field_team',
      status: 'approved',
      reviewedBy: 'auto (field team)',
      reviewedAt: observedAt.toISOString(),
      photoUrl: hasPhoto ? WILDLIFE_PHOTO_POOL[i % WILDLIFE_PHOTO_POOL.length] : undefined,
      notes: undefined,
      createdAt: observedAt.toISOString(),
    });
  }

  return true;
}

/** Test helper — clears the sighting log. */
export function resetWildlifeStore(): void {
  sightings.length = 0;
}
