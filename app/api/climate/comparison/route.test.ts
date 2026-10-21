import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/climate/comparison', () => {
  it('returns all climate comparisons with open meteorological API attribution', async () => {
    const req = new Request('http://localhost:3000/api/climate/comparison');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.source).toContain('Open-Meteo & NASA POWER');
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects.length).toBeGreaterThan(0);

    const first = data.projects[0];
    expect(first.historical.annualRainfallMm).toBeGreaterThan(0);
    expect(first.current.annualRainfallMm).toBeGreaterThan(0);
    expect(first.plantingConditions).toBeDefined();
  });

  it('filters by projectId', async () => {
    const req = new Request('http://localhost:3000/api/climate/comparison?projectId=proj-001');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].projectId).toBe('proj-001');
    expect(data.projects[0].projectName).toContain('Amazon');
  });

  it('returns 404 for unknown projectId', async () => {
    const req = new Request(
      'http://localhost:3000/api/climate/comparison?projectId=non-existent-id'
    );
    const res = await GET(req);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe('Project not found');
  });
});
