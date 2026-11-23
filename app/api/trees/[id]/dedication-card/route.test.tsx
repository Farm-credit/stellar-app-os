import { describe, expect, it, vi } from 'vitest';

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse extends Response {
    constructor(_element: unknown, init?: { width?: number; height?: number }) {
      super('mock-png-bytes', {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'x-image-width': String(init?.width ?? 1200),
          'x-image-height': String(init?.height ?? 630),
        },
      });
    }
  },
}));

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: vi.fn(async (id: string) => {
    if (id === 'tree-001') {
      return {
        id: 'tree-001',
        treeId: 'HRV-2024-0001',
        species: 'Teak',
        region: 'Kano, Nigeria',
        status: 'verified',
        lat: 12.04,
        lng: 8.48,
        co2OffsetKgPerYear: 25,
        projectName: 'Northern Savanna Reforestation',
        sponsorName: 'Acme EcoSolutions',
        dedication: 'In loving memory of Grandma Rose.',
      };
    }
    return {
      id: 'tree-002',
      treeId: 'HRV-2024-0002',
      species: 'Moringa',
      region: 'Kano, Nigeria',
      status: 'planted',
      lat: 11.98,
      lng: 8.55,
      co2OffsetKgPerYear: 18,
      projectName: 'Northern Savanna Reforestation',
    };
  }),
}));

import { GET } from './route';

describe('GET /api/trees/[id]/dedication-card', () => {
  it('returns an auto-generated 1200x630 PNG for a dedicated tree', async () => {
    const req = new Request('http://localhost/api/trees/tree-001/dedication-card');
    const res = await GET(req, { params: Promise.resolve({ id: 'tree-001' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-image-width')).toBe('1200');
    expect(res.headers.get('x-image-height')).toBe('630');
  });

  it('returns 404 when a tree has no dedication and none is passed in query', async () => {
    const req = new Request('http://localhost/api/trees/tree-002/dedication-card');
    const res = await GET(req, { params: Promise.resolve({ id: 'tree-002' }) });

    expect(res.status).toBe(404);
  });

  it('supports rendering a dedication passed via query parameter', async () => {
    const req = new Request(
      'http://localhost/api/trees/tree-002/dedication-card?dedication=For%20my%20daughter'
    );
    const res = await GET(req, { params: Promise.resolve({ id: 'tree-002' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
