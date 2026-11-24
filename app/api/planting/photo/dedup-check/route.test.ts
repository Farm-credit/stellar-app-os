import { beforeEach, describe, expect, it, vi } from 'vitest';

const { computePHashMock, findDuplicateMock, getDuplicateThresholdMock } = vi.hoisted(() => ({
  computePHashMock: vi.fn(),
  findDuplicateMock: vi.fn(),
  getDuplicateThresholdMock: vi.fn(() => 5),
}));

vi.mock('@/lib/image/phash', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  computePHash: computePHashMock,
}));

vi.mock('@/lib/db/photo-hashes', () => ({
  findDuplicate: findDuplicateMock,
  getDuplicateThreshold: getDuplicateThresholdMock,
}));

import { GET, POST } from './route';

function makePhotoFile(
  content = 'valid-jpeg-bytes',
  type = 'image/jpeg',
  sizeOverride?: number
): File {
  const file = new File([content], 'planting.jpg', { type });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => {
      const buf = Buffer.from(content);
      return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    },
    configurable: true,
  });
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride, configurable: true });
  }
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

describe('POST /api/planting/photo/dedup-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDuplicateThresholdMock.mockReturnValue(5);
    computePHashMock.mockResolvedValue({
      hex: '0123456789abcdef',
      bits: 0x0123456789abcdefn,
      population: 32,
    });
    findDuplicateMock.mockResolvedValue(null);
  });

  it('returns 405 on GET requests', () => {
    const res = GET();
    expect(res.status).toBe(405);
  });

  it('returns 400 when no photo file is supplied', async () => {
    const res = await POST(makeFormRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 413 when file exceeds 10 MB', async () => {
    const bigFile = makePhotoFile('x', 'image/jpeg', 11 * 1024 * 1024);
    const res = await POST(makeFormRequest({ photo: bigFile }));
    expect(res.status).toBe(413);
  });

  it('returns 415 on unsupported MIME type', async () => {
    const gifFile = makePhotoFile('gif', 'image/gif');
    const res = await POST(makeFormRequest({ photo: gifFile }));
    expect(res.status).toBe(415);
  });

  it('returns isDuplicate=false for a unique planting photo', async () => {
    const res = await POST(
      makeFormRequest({
        photo: makePhotoFile(),
        entityType: 'tree',
        entityId: 'na-001',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isDuplicate).toBe(false);
    expect(json.hash).toBe('0123456789abcdef');
    expect(json.match).toBeNull();
  });

  it('flags duplicate photo, returns match details, and emits console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    findDuplicateMock.mockResolvedValueOnce({
      row: {
        id: 14,
        entity_type: 'tree',
        entity_id: 'HRV-2026-004',
        hash_hex: '0123456789abcdee',
        storage_ref: 'ipfs://bafy14',
        metadata: {},
        duplicate_of: null,
        created_at: new Date('2026-11-20T12:00:00Z'),
      },
      distance: 1,
    });

    const res = await POST(makeFormRequest({ photo: makePhotoFile(), entityType: 'tree' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isDuplicate).toBe(true);
    expect(json.match).toMatchObject({
      id: 14,
      entityType: 'tree',
      entityId: 'HRV-2026-004',
      distance: 1,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[dedup-check]'));
    warnSpy.mockRestore();
  });
});
