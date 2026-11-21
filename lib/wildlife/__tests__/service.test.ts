import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  WildlifeSubmissionError,
  getHabitatQualityScore,
  getWildlifeHabitatSnapshot,
  listSightings,
  resetWildlifeStore,
  reviewSighting,
  seedProjectWildlife,
  submitSighting,
} from '../service';
import type { SubmitSightingInput } from '../types';

const NOW = new Date('2026-10-23T12:00:00.000Z');

function input(overrides: Partial<SubmitSightingInput> = {}): SubmitSightingInput {
  return {
    projectId: 'proj-wl-1',
    speciesCommonName: 'African Grey Parrot',
    scientificName: 'Psittacus erithacus',
    taxonomicGroup: 'bird',
    count: 3,
    observedAt: '2026-10-01T09:00:00.000Z',
    submittedBy: 'Faith Wanjiku',
    submitterRole: 'field_team',
    photoUrl: 'https://images.example.com/parrot.jpg',
    notes: 'Flock feeding near the river',
    ...overrides,
  };
}

describe('Wildlife sighting log service (Issue #1665)', () => {
  beforeEach(() => {
    resetWildlifeStore();
  });

  afterEach(() => {
    resetWildlifeStore();
  });

  describe('submission', () => {
    it('auto-approves field-team sightings', () => {
      const result = submitSighting(input(), NOW);
      expect(result.requiresApproval).toBe(false);
      expect(result.sighting.status).toBe('approved');
      expect(result.sighting.reviewedBy).toBe('auto (field team)');
      expect(result.sighting.observedAt).toBe('2026-10-01T09:00:00.000Z');
    });

    it('queues citizen-scientist sightings for review', () => {
      const result = submitSighting(input({ submitterRole: 'citizen_scientist' }), NOW);
      expect(result.requiresApproval).toBe(true);
      expect(result.sighting.status).toBe('pending');
      expect(result.sighting.reviewedAt).toBeUndefined();
    });

    it.each([
      ['missing species', input({ speciesCommonName: '  ' }), 'speciesCommonName'],
      ['missing project', input({ projectId: '' }), 'projectId'],
      ['missing observer', input({ submittedBy: '' }), 'submittedBy'],
      ['unknown group', { ...input(), taxonomicGroup: 'fungus' as never }, 'taxonomicGroup'],
      ['unknown role', { ...input(), submitterRole: 'tourist' as never }, 'submitterRole'],
      ['zero count', input({ count: 0 }), 'count'],
      ['fractional count', input({ count: 2.5 }), 'count'],
      ['bad date', input({ observedAt: 'yesterday' }), 'observedAt'],
      ['future date', input({ observedAt: '2027-01-01T00:00:00.000Z' }), 'observedAt'],
      ['bad photo', input({ photoUrl: 'ftp://x' }), 'photoUrl'],
    ])('rejects %s', (_label, payload, field) => {
      expect(() => submitSighting(payload as SubmitSightingInput, NOW)).toThrow(
        WildlifeSubmissionError
      );
      try {
        submitSighting(payload as SubmitSightingInput, NOW);
      } catch (error) {
        expect((error as WildlifeSubmissionError).field).toBe(field);
      }
    });
  });

  describe('review workflow', () => {
    it('approves a pending sighting with the reviewer recorded', () => {
      const { sighting } = submitSighting(input({ submitterRole: 'citizen_scientist' }), NOW);

      const reviewed = reviewSighting(sighting.id, 'approve', 'Dr. Amina', NOW);
      expect(reviewed?.status).toBe('approved');
      expect(reviewed?.reviewedBy).toBe('Dr. Amina');
      expect(reviewed?.reviewedAt).toBe(NOW.toISOString());
    });

    it('rejects a pending sighting', () => {
      const { sighting } = submitSighting(input({ submitterRole: 'citizen_scientist' }), NOW);
      const reviewed = reviewSighting(sighting.id, 'reject', 'Dr. Amina', NOW);
      expect(reviewed?.status).toBe('rejected');
    });

    it('returns null for unknown ids and throws on double review', () => {
      expect(reviewSighting('missing', 'approve', 'X', NOW)).toBeNull();

      const { sighting } = submitSighting(input(), NOW); // auto-approved
      expect(() => reviewSighting(sighting.id, 'approve', 'X', NOW)).toThrow(
        WildlifeSubmissionError
      );
    });
  });

  describe('listing and habitat snapshot', () => {
    it('filters by project and status, newest observation first', () => {
      submitSighting(input({ projectId: 'proj-a', observedAt: '2026-01-01T00:00:00.000Z' }), NOW);
      submitSighting(input({ projectId: 'proj-a', observedAt: '2026-06-01T00:00:00.000Z' }), NOW);
      submitSighting(input({ projectId: 'proj-b', submitterRole: 'citizen_scientist' }), NOW);

      const projA = listSightings({ projectId: 'proj-a' });
      expect(projA).toHaveLength(2);
      expect(projA[0].observedAt).toBe('2026-06-01T00:00:00.000Z');

      const pending = listSightings({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].projectId).toBe('proj-b');
    });

    it('seeds a deterministic baseline log once per project', () => {
      expect(seedProjectWildlife('proj-seed')).toBe(true);
      expect(seedProjectWildlife('proj-seed')).toBe(false);
      expect(listSightings({ projectId: 'proj-seed' })).toHaveLength(8);
      // Seeded records are approved field-team sightings.
      expect(listSightings({ projectId: 'proj-seed' }).every((s) => s.status === 'approved')).toBe(
        true
      );
    });

    it('produces a snapshot with score, recent sightings and featured photos', () => {
      seedProjectWildlife('proj-snap', NOW);

      const snapshot = getWildlifeHabitatSnapshot('proj-snap', NOW);
      expect(snapshot.score.projectId).toBe('proj-snap');
      expect(snapshot.score.score).toBeGreaterThan(0);
      expect(snapshot.score.speciesRichness).toBeGreaterThan(1);
      expect(snapshot.recentApproved.length).toBeGreaterThan(0);
      expect(snapshot.recentApproved.length).toBeLessThanOrEqual(6);
      expect(snapshot.featuredPhotos.length).toBeGreaterThan(0);
      expect(snapshot.featuredPhotos.length).toBeLessThanOrEqual(3);
      for (const photo of snapshot.featuredPhotos) {
        expect(photo.status).toBe('approved');
        expect(photo.photoUrl).toBeTruthy();
      }
    });

    it('excludes citizen-scientist sightings until approved', () => {
      submitSighting(input({ projectId: 'proj-review', submitterRole: 'citizen_scientist' }), NOW);

      const before = getHabitatQualityScore('proj-review', NOW);
      expect(before.approvedSightings).toBe(0);
      expect(before.totalSightings).toBe(1);
      expect(before.score).toBe(0);

      const pendingId = listSightings({ projectId: 'proj-review' })[0].id;
      reviewSighting(pendingId, 'approve', 'Reviewer', NOW);

      const after = getHabitatQualityScore('proj-review', NOW);
      expect(after.approvedSightings).toBe(1);
      expect(after.score).toBeGreaterThan(0);
    });
  });
});
