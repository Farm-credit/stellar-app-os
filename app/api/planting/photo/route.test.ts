import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  uploadImageToS3,
  uploadToIpfs,
  invalidateMapCoordinateCache,
  encryptGpsCoordinates,
  sendPhotoUploadedEmail,
  getPool,
  encodeGeohash,
  buildRegionHash,
  computePHash,
  findDuplicate,
  recordPhotoHash,
} = vi.hoisted(() => ({
  uploadImageToS3: vi.fn(),
  uploadToIpfs: vi.fn(),
  invalidateMapCoordinateCache: vi.fn(),
  encryptGpsCoordinates: vi.fn(),
  sendPhotoUploadedEmail: vi.fn(),
  getPool: vi.fn(),
  encodeGeohash: vi.fn(),
  buildRegionHash: vi.fn(),
  computePHash: vi.fn(),
  findDuplicate: vi.fn(),
  recordPhotoHash: vi.fn(),
}));

vi.mock('@/lib/aws/s3', () => ({ uploadImageToS3 }));
vi.mock('@/lib/ipfs/upload', () => ({ uploadToIpfs }));
vi.mock('@/lib/cache/map-cache', () => ({ invalidateMapCoordinateCache }));
vi.mock('@/lib/zk/locationProof', () => ({ encryptGpsCoordinates }));
vi.mock('@/lib/email/sendgrid', () => ({ sendPhotoUploadedEmail }));
vi.mock('@/lib/db/client', () => ({ getPool }));
vi.mock('@/lib/geo/geohash', () => ({ encodeGeohash }));
vi.mock('@/lib/geo/regionHash', () => ({ buildRegionHash }));
vi.mock('@/lib/image/phash', () => ({ computePHash }));
vi.mock('@/lib/db/photo-hashes', () => ({ findDuplicate, recordPhotoHash }));
vi.mock('exifr', () => ({ default: { gps: vi.fn().mockResolvedValue(null) } }));

import { POST } from './route';

function makePhotoFile(): File & { arrayBuffer: () => Promise<ArrayBuffer> } {
  const photo = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' }) as File & {
    arrayBuffer: () => Promise<ArrayBuffer>;
  };

  Object.defineProperty(photo, 'arrayBuffer', {
    value: () => {
      const buffer = Buffer.from('abc');
      return Promise.resolve(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      );
    },
    configurable: true,
  });

  return photo;
}

function makeFormData(overrides: Record<string, string | File> = {}): {
  get: (key: string) => any;
} {
  const photo = makePhotoFile();
  const values: Record<string, any> = {
    photo,
    lat: '9.5',
    lon: '7.4',
    farmerId: 'farmer-1',
    treeId: 'tree-1',
    region: 'north',
  };

  Object.entries(overrides).forEach(([key, value]) => {
    values[key] = value;
  });

  return {
    get: (key: string) => values[key] ?? null,
  };
}

function makeRouteRequest(formData: { get: (key: string) => any }): Request {
  return {
    formData: () => Promise.resolve(formData),
  } as Request;
}

describe('planting photo upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImageToS3.mockResolvedValue('planting-photos/farmer-1/test.jpg');
    uploadToIpfs.mockResolvedValue({
      cid: 'bafy123',
      ipfsUrl: 'https://ipfs.example/bafy123',
      gatewayUrl: 'https://gateway.example/bafy123',
    });
    invalidateMapCoordinateCache.mockResolvedValue(undefined);
    encryptGpsCoordinates.mockResolvedValue('encrypted-gps');
    getPool.mockReturnValue({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    encodeGeohash.mockReturnValue('abcde');
    buildRegionHash.mockReturnValue({ regionKey: 'region-1', centerLat: 9.5, centerLon: 7.4 });
    computePHash.mockResolvedValue({ hex: '0123456789abcdef', bits: 1n, population: 1 });
    findDuplicate.mockResolvedValue(null);
    recordPhotoHash.mockResolvedValue(42);
  });

  it('rejects duplicate photos before upload', async () => {
    findDuplicate.mockResolvedValueOnce({
      row: { id: 9 },
      distance: 0,
    });

    const response = await POST(makeRouteRequest(makeFormData()));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'Duplicate photo detected.',
      distance: 0,
      duplicateOf: 9,
    });
    expect(uploadImageToS3).not.toHaveBeenCalled();
    expect(uploadToIpfs).not.toHaveBeenCalled();
  });

  it('accepts a unique photo and records the hash', async () => {
    const response = await POST(makeRouteRequest(makeFormData()));

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.hash).toBe('0123456789abcdef');
    expect(recordPhotoHash).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'tree',
        hashHex: '0123456789abcdef',
      })
    );
    expect(uploadToIpfs).toHaveBeenCalled();
  });
});
