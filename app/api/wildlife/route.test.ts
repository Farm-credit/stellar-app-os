import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { resetWildlifeStore, submitSighting } from '@/lib/wildlife/service';
import type { SubmitSightingInput } from '@/lib/wildlife/types';
import { GET as listGet, POST as listPost } from './sightings/route';
import { POST as reviewPost } from './sightings/[id]/review/route';
import { GET as habitatGet } from './habitat/route';

function jsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_SIGHTING: SubmitSightingInput = {
  projectId: 'proj-api-wl',
  speciesCommonName: 'Martial Eagle',
  taxonomicGroup: 'bird',
  count: 2,
  observedAt: '2026-10-01T08:00:00.000Z',
  submittedBy: 'Field Team 3',
  submitterRole: 'field_team',
};

describe('Wildlife sighting API routes (Issue #1665)', () => {
  beforeEach(() => {
    resetWildlifeStore();
  });

  describe('GET /api/wildlife/sightings', () => {
    it('seeds and returns the demo log for a project', async () => {
      const res = await listGet(
        new NextRequest('http://localhost:3000/api/wildlife/sightings?projectId=proj-001')
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { sightings: unknown[]; count: number };
      expect(data.count).toBeGreaterThan(0);
      expect(data.sightings).toHaveLength(data.count);
    });

    it('rejects an invalid status filter', async () => {
      const res = await listGet(
        new NextRequest('http://localhost:3000/api/wildlife/sightings?status=maybe')
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/wildlife/sightings', () => {
    it('accepts a field-team sighting with auto-approval', async () => {
      const res = await listPost(
        jsonRequest('http://localhost:3000/api/wildlife/sightings', VALID_SIGHTING)
      );
      expect(res.status).toBe(201);

      const data = (await res.json()) as {
        success: boolean;
        requiresApproval: boolean;
        sighting: { status: string; projectId: string };
      };
      expect(data.success).toBe(true);
      expect(data.requiresApproval).toBe(false);
      expect(data.sighting.status).toBe('approved');
      expect(data.sighting.projectId).toBe('proj-api-wl');
    });

    it('queues citizen-scientist sightings for approval', async () => {
      const res = await listPost(
        jsonRequest('http://localhost:3000/api/wildlife/sightings', {
          ...VALID_SIGHTING,
          submitterRole: 'citizen_scientist',
        })
      );
      expect(res.status).toBe(201);
      const data = (await res.json()) as {
        requiresApproval: boolean;
        sighting: { status: string };
      };
      expect(data.requiresApproval).toBe(true);
      expect(data.sighting.status).toBe('pending');
    });

    it('returns 400 with the offending field on validation errors', async () => {
      const res = await listPost(
        jsonRequest('http://localhost:3000/api/wildlife/sightings', {
          ...VALID_SIGHTING,
          count: 0,
        })
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string; field: string };
      expect(data.field).toBe('count');
      expect(data.error).toMatch(/count/);
    });
  });

  describe('POST /api/wildlife/sightings/[id]/review', () => {
    it('approves a pending sighting', async () => {
      const { sighting } = submitSighting({
        ...VALID_SIGHTING,
        submitterRole: 'citizen_scientist',
      });

      const res = await reviewPost(
        jsonRequest(`http://localhost:3000/api/wildlife/sightings/${sighting.id}/review`, {
          decision: 'approve',
          reviewer: 'Dr. Amina',
        }),
        { params: Promise.resolve({ id: sighting.id }) }
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { sighting: { status: string; reviewedBy: string } };
      expect(data.sighting.status).toBe('approved');
      expect(data.sighting.reviewedBy).toBe('Dr. Amina');
    });

    it('returns 404 for an unknown sighting', async () => {
      const res = await reviewPost(
        jsonRequest('http://localhost:3000/api/wildlife/sightings/nope/review', {
          decision: 'approve',
        }),
        { params: Promise.resolve({ id: 'nope' }) }
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid decision', async () => {
      const res = await reviewPost(
        jsonRequest('http://localhost:3000/api/wildlife/sightings/any/review', {
          decision: 'maybe',
        }),
        { params: Promise.resolve({ id: 'any' }) }
      );
      expect(res.status).toBe(400);
    });

    it('returns 409 when reviewing twice', async () => {
      const { sighting } = submitSighting({
        ...VALID_SIGHTING,
        submitterRole: 'citizen_scientist',
      });
      await reviewPost(
        jsonRequest(`http://localhost:3000/api/wildlife/sightings/${sighting.id}/review`, {
          decision: 'approve',
        }),
        { params: Promise.resolve({ id: sighting.id }) }
      );

      const second = await reviewPost(
        jsonRequest(`http://localhost:3000/api/wildlife/sightings/${sighting.id}/review`, {
          decision: 'reject',
        }),
        { params: Promise.resolve({ id: sighting.id }) }
      );
      expect(second.status).toBe(409);
    });
  });

  describe('GET /api/wildlife/habitat', () => {
    it('requires a projectId', async () => {
      const res = await habitatGet(new NextRequest('http://localhost:3000/api/wildlife/habitat'));
      expect(res.status).toBe(400);
    });

    it('returns the score, recent sightings, featured photos and method', async () => {
      const res = await habitatGet(
        new NextRequest('http://localhost:3000/api/wildlife/habitat?projectId=proj-001')
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        score: { score: number; speciesRichness: number };
        recentApproved: unknown[];
        featuredPhotos: Array<{ photoUrl?: string }>;
        method: string;
      };
      expect(data.score.score).toBeGreaterThan(0);
      expect(data.score.speciesRichness).toBeGreaterThan(1);
      expect(data.recentApproved.length).toBeGreaterThan(0);
      expect(data.featuredPhotos.length).toBeGreaterThan(0);
      expect(data.method).toMatch(/evenness/i);
    });
  });
});
