import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getTrees } from '@/app/api/v1/trees/route';
import { GET as getProjects } from '@/app/api/v1/projects/route';
import { GET as getSpecies } from '@/app/api/v1/species/route';
import { GET as getCo2Stats } from '@/app/api/v1/co2/stats/route';

function makeAuthedRequest(url: string, token = 'sandbox_bearer_token'): NextRequest {
  const headers = new Headers();
  headers.set('authorization', `Bearer ${token}`);
  return new NextRequest(url, { method: 'GET', headers });
}

describe('Public API for Tree Sponsorship Data Integration (Issue #1651)', () => {
  describe('GET /api/v1/trees', () => {
    it('returns 401 when no credentials are provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/trees', { method: 'GET' });
      const res = await getTrees(req);
      expect(res.status).toBe(401);
    });

    it('returns sponsored tree records with OAuth2 bearer token', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/trees?per_page=5');
      const res = await getTrees(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeLessThanOrEqual(5);

      if (json.data.length > 0) {
        const first = json.data[0];
        expect(first).toHaveProperty('treeId');
        expect(first).toHaveProperty('species');
        expect(first).toHaveProperty('sponsored');
        expect(first).toHaveProperty('co2OffsetKgPerYear');
        expect(first).toHaveProperty('projectName');
      }
    });

    it('filters trees by species and sponsored flag', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/trees?species=Teak&sponsored=true');
      const res = await getTrees(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      for (const item of json.data) {
        expect(item.species.toLowerCase()).toBe('teak');
        expect(item.sponsored).toBe(true);
      }
    });
  });

  describe('GET /api/v1/projects', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/projects', { method: 'GET' });
      const res = await getProjects(req);
      expect(res.status).toBe(401);
    });

    it('returns reforestation projects with tree metrics', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/projects');
      const res = await getProjects(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('data');
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      const project = json.data[0];
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('country');
      expect(project).toHaveProperty('totalTrees');
      expect(project).toHaveProperty('sponsoredTrees');
      expect(project).toHaveProperty('totalCo2OffsetKgPerYear');
    });

    it('filters projects by country', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/projects?country=Nigeria');
      const res = await getProjects(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      for (const p of json.data) {
        expect(p.country).toBe('Nigeria');
      }
    });
  });

  describe('GET /api/v1/species', () => {
    it('returns tree species catalogue with growth rates and CO2 absorption', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/species');
      const res = await getSpecies(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('data');
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      const sp = json.data[0];
      expect(sp).toHaveProperty('name');
      expect(sp).toHaveProperty('scientificName');
      expect(sp).toHaveProperty('co2KgPerYear');
      expect(sp).toHaveProperty('growthRate');
      expect(sp).toHaveProperty('ecologicalBenefits');
    });

    it('filters species by minimum CO2 sequestration', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/species?min_co2=25');
      const res = await getSpecies(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      for (const sp of json.data) {
        expect(sp.co2KgPerYear).toBeGreaterThanOrEqual(25);
      }
    });
  });

  describe('GET /api/v1/co2/stats', () => {
    it('returns aggregate CO2 metrics and equivalencies', async () => {
      const req = makeAuthedRequest('http://localhost:3000/api/v1/co2/stats');
      const res = await getCo2Stats(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('summary');
      expect(json.summary).toHaveProperty('totalTreesTracked');
      expect(json.summary).toHaveProperty('totalCo2OffsetKgPerYear');
      expect(json.summary).toHaveProperty('totalCo2OffsetTonnesPerYear');

      expect(json).toHaveProperty('impactEquivalencies');
      expect(json.impactEquivalencies).toHaveProperty('passengerVehiclesOffRoadPerYear');
      expect(json.impactEquivalencies).toHaveProperty('passengerFlightsOffset');

      expect(json).toHaveProperty('breakdownBySpecies');
      expect(Array.isArray(json.breakdownBySpecies)).toBe(true);
      expect(json).toHaveProperty('breakdownByProject');
      expect(Array.isArray(json.breakdownByProject)).toBe(true);
    });
  });
});
