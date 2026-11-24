/**
 * Tests for the dynamic OpenGraph image feature — Issue #1109
 *
 * Covers:
 *  1. OG image route: correct size, contentType exports
 *  2. OG image route: renders without throwing for known and unknown tree IDs
 *  3. generateMetadata: correct titles, descriptions, and OG/Twitter tags
 *  4. Fallback API route GET /api/og/tree: redirect & error responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock next/og ─────────────────────────────────────────────────────────────
// ImageResponse is not available in jsdom — mock it to return a Response-like
// object so we can verify that the route constructs it correctly.
vi.mock('next/og', () => {
  return {
    ImageResponse: vi
      .fn()
      .mockImplementation((jsx: unknown, options: { width: number; height: number }) => ({
        _isImageResponse: true,
        jsx,
        options,
        headers: new Headers({ 'Content-Type': 'image/png' }),
        status: 200,
      })),
  };
});

// ── Mock tree-registry ────────────────────────────────────────────────────────
vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: vi.fn(),
}));

import { getTreeById } from '@/lib/api/tree-registry';
import type { Tree } from '@/lib/types/tree';

const mockGetTreeById = vi.mocked(getTreeById);

const MOCK_TREE: Tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 22,
  projectName: 'Northern Savanna Reforestation',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. OG Image Route — exports
// ─────────────────────────────────────────────────────────────────────────────
describe('app/trees/[id]/opengraph-image — module exports', () => {
  it('exports size as 1200×630', async () => {
    const mod = await import('@/app/trees/[id]/opengraph-image');
    expect(mod.size).toEqual({ width: 1200, height: 630 });
  });

  it('exports contentType as image/png', async () => {
    const mod = await import('@/app/trees/[id]/opengraph-image');
    expect(mod.contentType).toBe('image/png');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. OG Image Route — Image() function
// ─────────────────────────────────────────────────────────────────────────────
describe('app/trees/[id]/opengraph-image — Image()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an ImageResponse for a known tree', async () => {
    mockGetTreeById.mockResolvedValueOnce(MOCK_TREE);
    const { default: Image } = await import('@/app/trees/[id]/opengraph-image');
    const result = await Image({ params: { id: 'tree-001' } });

    expect(result).toBeDefined();
    // The mock ImageResponse captures the JSX; just verify it resolves
    expect(result).toHaveProperty('_isImageResponse', true);
  });

  it('renders a fallback ImageResponse when tree is not found', async () => {
    mockGetTreeById.mockRejectedValueOnce(new Error('not found'));
    const { default: Image } = await import('@/app/trees/[id]/opengraph-image');
    // Should not throw even if tree fetch fails
    await expect(Image({ params: { id: 'unknown-id' } })).resolves.toBeDefined();
  });

  it('uses correct dimensions from size export', async () => {
    mockGetTreeById.mockResolvedValueOnce(MOCK_TREE);
    const { default: Image, size } = await import('@/app/trees/[id]/opengraph-image');
    const result = (await Image({ params: { id: 'tree-001' } })) as {
      options: { width: number; height: number };
    };

    expect(result.options).toMatchObject({ width: size.width, height: size.height });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. generateMetadata
// ─────────────────────────────────────────────────────────────────────────────
describe('app/trees/[id]/page — generateMetadata()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct title and description for a known tree', async () => {
    mockGetTreeById.mockResolvedValueOnce(MOCK_TREE);
    const { generateMetadata } = await import('@/app/trees/[id]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'tree-001' }) });

    expect(meta.title).toContain('Teak');
    expect(meta.title).toContain('Northern Savanna Reforestation');
    expect(typeof meta.description).toBe('string');
    expect(meta.description).toContain('Kano, Nigeria');
  });

  it('includes openGraph images pointing to the OG image route', async () => {
    mockGetTreeById.mockResolvedValueOnce(MOCK_TREE);
    const { generateMetadata } = await import('@/app/trees/[id]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'tree-001' }) });

    const ogImages = meta.openGraph?.images;
    expect(Array.isArray(ogImages)).toBe(true);
    const firstImage = (ogImages as Array<{ url: string; width: number; height: number }>)[0];
    expect(firstImage.url).toBe('/trees/tree-001/opengraph-image');
    expect(firstImage.width).toBe(1200);
    expect(firstImage.height).toBe(630);
  });

  it('includes twitter card with summary_large_image', async () => {
    mockGetTreeById.mockResolvedValueOnce(MOCK_TREE);
    const { generateMetadata } = await import('@/app/trees/[id]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'tree-001' }) });

    expect(meta.twitter?.card).toBe('summary_large_image');
    const twitterImages = meta.twitter?.images as string[];
    expect(twitterImages[0]).toContain('/trees/tree-001/opengraph-image');
  });

  it('falls back gracefully when tree is not found', async () => {
    mockGetTreeById.mockRejectedValueOnce(new Error('not found'));
    const { generateMetadata } = await import('@/app/trees/[id]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'unknown' }) });

    expect(meta.title).toBeTruthy();
    expect(meta.openGraph?.images).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fallback API route GET /api/og/tree
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/og/tree', () => {
  it('redirects to the canonical OG image URL when id is provided', async () => {
    const { GET } = await import('@/app/api/og/tree/route');
    const req = new Request('http://localhost:3000/api/og/tree?id=tree-001');
    const res = await GET(req as never);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/trees/tree-001/opengraph-image');
  });

  it('returns 400 when id is missing', async () => {
    const { GET } = await import('@/app/api/og/tree/route');
    const req = new Request('http://localhost:3000/api/og/tree');
    const res = await GET(req as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('id is required');
  });

  it('encodes the tree id in the redirect URL', async () => {
    const { GET } = await import('@/app/api/og/tree/route');
    const req = new Request('http://localhost:3000/api/og/tree?id=HRV-2024-0001');
    const res = await GET(req as never);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(encodeURIComponent('HRV-2024-0001'));
  });
});
