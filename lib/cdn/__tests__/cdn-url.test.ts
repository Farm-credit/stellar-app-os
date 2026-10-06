import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as cdnUrlModule from '../cdn-url';

/**
 * Deterministic unit coverage for the global-CDN URL helpers added for the
 * edge-delivery work in #1122 (`lib/cdn/cdn-url.ts`).
 *
 * `CDN_URL` and `CLOUDFRONT_DISTRIBUTION_ID` are read from `process.env` at
 * module-evaluation time, so every test re-imports a fresh module instance
 * with the environment it needs.
 */

const CDN = 'https://cdn.example.com';
const ORIGINAL_CDN = process.env.NEXT_PUBLIC_CDN_URL;
const ORIGINAL_DISTRIBUTION = process.env.CLOUDFRONT_DISTRIBUTION_ID;

type CdnModule = typeof cdnUrlModule;

function loadCdn(env: { cdn?: string; distributionId?: string } = {}): Promise<CdnModule> {
  vi.resetModules();

  if (env.cdn === undefined) {
    delete process.env.NEXT_PUBLIC_CDN_URL;
  } else {
    process.env.NEXT_PUBLIC_CDN_URL = env.cdn;
  }

  if (env.distributionId === undefined) {
    delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
  } else {
    process.env.CLOUDFRONT_DISTRIBUTION_ID = env.distributionId;
  }

  return import('../cdn-url');
}

vi.mock('@aws-sdk/client-cloudfront', () => {
  const send = vi.fn();
  return {
    __send: send,
    CloudFrontClient: vi.fn(() => ({ send })),
    CreateInvalidationCommand: vi.fn((input: unknown) => ({ input })),
  };
});

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_CDN === undefined) {
    delete process.env.NEXT_PUBLIC_CDN_URL;
  } else {
    process.env.NEXT_PUBLIC_CDN_URL = ORIGINAL_CDN;
  }

  if (ORIGINAL_DISTRIBUTION === undefined) {
    delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
  } else {
    process.env.CLOUDFRONT_DISTRIBUTION_ID = ORIGINAL_DISTRIBUTION;
  }

  vi.restoreAllMocks();
});

describe('isCdnEnabled / getDistributionId', () => {
  it('reports disabled when nothing is configured', async () => {
    const cdn = await loadCdn();

    expect(cdn.isCdnEnabled()).toBe(false);
    expect(cdn.getDistributionId()).toBeUndefined();
  });

  it('reports the configured CDN URL and distribution id', async () => {
    const cdn = await loadCdn({ cdn: CDN, distributionId: 'E123' });

    expect(cdn.isCdnEnabled()).toBe(true);
    expect(cdn.getDistributionId()).toBe('E123');
  });
});

describe('getCdnPhotoUrl', () => {
  it('falls back to the photo proxy and warns when the CDN is unset', async () => {
    const cdn = await loadCdn();

    expect(cdn.getCdnPhotoUrl('planting-photos/a b.jpg')).toBe(
      '/api/planting/photo/planting-photos%2Fa%20b.jpg'
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('CDN_URL not configured'));
  });

  it('prefixes the CDN origin and preserves the object key', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    expect(cdn.getCdnPhotoUrl('planting-photos/harvest.jpg')).toBe(
      `${CDN}/planting-photos/harvest.jpg`
    );
  });

  it('appends image optimization parameters', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    const url = new URL(
      cdn.getCdnPhotoUrl('p.jpg', {
        width: 640,
        height: 480,
        quality: 80,
        format: 'avif',
      })
    );

    expect(url.searchParams.get('w')).toBe('640');
    expect(url.searchParams.get('h')).toBe('480');
    expect(url.searchParams.get('q')).toBe('80');
    expect(url.searchParams.get('format')).toBe('avif');
  });

  it('omits falsy optimization values', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    const url = new URL(cdn.getCdnPhotoUrl('p.jpg', { width: 0, quality: 0 }));

    expect(url.search).toBe('');
  });
});

describe('getCdnMapTilesUrl', () => {
  it('resolves against the CDN origin when configured', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    const url = new URL(cdn.getCdnMapTilesUrl({ region: 'amazon', zoom: 4, bbox: '1,2,3,4' }));

    expect(url.origin).toBe(CDN);
    expect(url.pathname).toBe('/api/planting/map');
    expect(url.searchParams.get('region')).toBe('amazon');
    expect(url.searchParams.get('zoom')).toBe('4');
    expect(url.searchParams.get('bbox')).toBe('1,2,3,4');
  });

  it('honours a zoom level of 0 (whole world)', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    const url = new URL(cdn.getCdnMapTilesUrl({ zoom: 0 }));

    expect(url.searchParams.get('zoom')).toBe('0');
  });

  it('omits the query string when no parameters are given', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    expect(cdn.getCdnMapTilesUrl()).toBe(`${CDN}/api/planting/map`);
  });

  it('falls back to the current origin in the browser', async () => {
    const cdn = await loadCdn();

    const url = new URL(cdn.getCdnMapTilesUrl({ region: 'amazon' }));

    expect(url.origin).toBe(window.location.origin);
    expect(url.searchParams.get('region')).toBe('amazon');
  });

  it('returns a root-relative path during SSR (no window)', async () => {
    const cdn = await loadCdn();
    vi.stubGlobal('window', undefined);

    try {
      expect(cdn.getCdnMapTilesUrl({ zoom: 3 })).toBe('/api/planting/map?zoom=3');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getCdnAssetUrl', () => {
  it('serves assets from the CDN when configured', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    expect(cdn.getCdnAssetUrl('icons/icon-192x192.png')).toBe(`${CDN}/icons/icon-192x192.png`);
  });

  it('falls back to Next.js static serving', async () => {
    const cdn = await loadCdn();

    expect(cdn.getCdnAssetUrl('assets/logo.svg')).toBe('/assets/logo.svg');
  });
});

describe('getCdnImageSrcSet', () => {
  it('builds a WebP srcset at the default widths', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    const entries = cdn.getCdnImageSrcSet('p.jpg').split(', ');

    expect(entries).toHaveLength(4);
    expect(entries[0]).toBe(`${CDN}/p.jpg?w=320&q=85&format=webp 320w`);
    expect(entries[3]).toContain(' 1920w');
  });

  it('supports custom widths and AVIF', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    expect(cdn.getCdnImageSrcSet('p.jpg', [100, 200], 'avif')).toBe(
      `${CDN}/p.jpg?w=100&q=85&format=avif 100w, ${CDN}/p.jpg?w=200&q=85&format=avif 200w`
    );
  });

  it('returns an empty string for an empty width list', async () => {
    const cdn = await loadCdn({ cdn: CDN });

    expect(cdn.getCdnImageSrcSet('p.jpg', [])).toBe('');
  });
});

describe('getCdnCacheHeaders', () => {
  it('returns the per-content-type cache policies', async () => {
    const cdn = await loadCdn();

    expect(cdn.getCdnCacheHeaders('photo')).toEqual({
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'max-age=86400',
    });
    expect(cdn.getCdnCacheHeaders('map')).toEqual({
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
      'CDN-Cache-Control': 'max-age=300',
    });
    expect(cdn.getCdnCacheHeaders('static')).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'max-age=31536000',
    });
  });
});

describe('invalidateCdnCache', () => {
  it('returns null and warns when no distribution is configured', async () => {
    const cdn = await loadCdn();

    await expect(cdn.invalidateCdnCache(['/a'])).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('CLOUDFRONT_DISTRIBUTION_ID')
    );
  });

  it('returns the invalidation id reported by CloudFront', async () => {
    const cdn = await loadCdn({ distributionId: 'E123' });
    const sdk = await import('@aws-sdk/client-cloudfront');
    (sdk as unknown as { __send: ReturnType<typeof vi.fn> }).__send.mockResolvedValueOnce({
      Invalidation: { Id: 'INV-1' },
    });

    await expect(cdn.invalidateCdnCache(['/a'])).resolves.toBe('INV-1');
  });

  it('returns null and logs when the CloudFront call fails', async () => {
    const cdn = await loadCdn({ distributionId: 'E123' });
    const sdk = await import('@aws-sdk/client-cloudfront');
    (sdk as unknown as { __send: ReturnType<typeof vi.fn> }).__send.mockRejectedValueOnce(
      new Error('boom')
    );

    await expect(cdn.invalidateCdnCache(['/a'])).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
