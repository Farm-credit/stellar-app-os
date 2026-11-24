import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findDuplicateMock, recordPhotoHashMock, getDuplicateThresholdMock } = vi.hoisted(() => ({
  findDuplicateMock: vi.fn(),
  recordPhotoHashMock: vi.fn(),
  getDuplicateThresholdMock: vi.fn(() => 5),
}));

vi.mock('@/lib/db/photo-hashes', () => ({
  findDuplicate: findDuplicateMock,
  recordPhotoHash: recordPhotoHashMock,
  getDuplicateThreshold: getDuplicateThresholdMock,
}));

import { POST } from './route';

async function createValidJpegFile(): Promise<File> {
  const sharp = (await import('sharp')).default;
  const jpegBuffer = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 34, g: 139, b: 34 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  const file = new File([jpegBuffer], 'planter.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      Promise.resolve(
        jpegBuffer.buffer.slice(
          jpegBuffer.byteOffset,
          jpegBuffer.byteOffset + jpegBuffer.byteLength
        )
      ),
    configurable: true,
  });
  return file;
}

function makeFormRequest(fields: Record<string, unknown>): Request {
  return {
    formData: () =>
      Promise.resolve({
        get: (key: string) => (key in fields ? fields[key] : null),
      }),
  } as unknown as Request;
}

describe('POST /api/planters/upload-photo pHash duplicate protection', () => {
  const originalPinataJwt = process.env.PINATA_JWT;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PINATA_JWT = 'test-pinata-jwt';
    findDuplicateMock.mockResolvedValue(null);
    recordPhotoHashMock.mockResolvedValue(101);
  });

  afterEach(() => {
    if (originalPinataJwt === undefined) {
      delete process.env.PINATA_JWT;
    } else {
      process.env.PINATA_JWT = originalPinataJwt;
    }
    globalThis.fetch = originalFetch;
  });

  it('rejects duplicate planter photos with 422 before pinning to IPFS', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    findDuplicateMock.mockResolvedValueOnce({
      row: {
        id: 23,
        entity_type: 'planter',
        entity_id: 'planter-prev',
        hash_hex: 'ffffffffffffffff',
        storage_ref: 'bafy-old',
        metadata: {},
        duplicate_of: null,
        created_at: new Date(),
      },
      distance: 0,
    });

    const photo = await createValidJpegFile();
    const res = await POST(makeFormRequest({ photo, walletAddress: 'planter-abc' }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'DUPLICATE_PHOTO',
      duplicateOf: 23,
      distance: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[planters/upload-photo] Flagged duplicate planter photo'),
      expect.any(Object)
    );
    warnSpy.mockRestore();
  });

  it('pins unique planter photos to IPFS and records their perceptual hash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          IpfsHash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        }),
    }) as unknown as typeof fetch;

    const photo = await createValidJpegFile();
    const res = await POST(makeFormRequest({ photo, walletAddress: 'planter-unique' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
    expect(body.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(recordPhotoHashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'planter',
        entityId: 'planter-unique',
        storageRef: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      })
    );
  });
});
