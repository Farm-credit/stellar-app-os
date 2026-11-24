import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
  PHASH_RESIZE,
  computePHashFromGrayscale,
  rgbaToGrayscale32x32,
} from '@/lib/image/dct-core';
import { hammingDistance } from '@/lib/image/distance';
import {
  LOCAL_PHASH_STORAGE_KEY,
  findLocalDuplicatePhotoHash,
  readLocalPhotoHashes,
  recordLocalPhotoHash,
  runClientDuplicatePrecheck,
} from '@/lib/image/client-phash';

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

import {
  classifyStellarEntityId,
  guardUploadAgainstDuplicates,
  safelyRecordUploadedPhotoHash,
} from '@/lib/image/upload-dedup';

function buildPatternRgba(width: number, height: number, mode: 'gradient' | 'rings'): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width - 1);
      const idx = (y * width + x) * 4;
      if (mode === 'gradient') {
        // Multi-frequency synthetic canopy + horizon scene (non-degenerate AC spectrum)
        const canopy =
          120 + 70 * Math.cos(nx * Math.PI * 3.2) * Math.sin(ny * Math.PI * 2.4) + 45 * (nx - ny);
        const clamped = Math.max(0, Math.min(255, Math.round(canopy)));
        rgba[idx] = clamped;
        rgba[idx + 1] = Math.max(0, Math.min(255, Math.round(clamped * 0.85 + 20)));
        rgba[idx + 2] = 60;
      } else {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const ring = Math.sin(Math.sqrt(dx * dx + dy * dy) * Math.PI * 10) > 0 ? 240 : 20;
        rgba[idx] = ring;
        rgba[idx + 1] = 255 - ring;
        rgba[idx + 2] = ring;
      }
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

async function makePatternJpeg(mode: 'gradient' | 'rings', quality = 85): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const width = 64;
  const height = 64;
  const rgba = buildPatternRgba(width, height, mode);
  return sharp(Buffer.from(rgba), {
    raw: { width, height, channels: 4 },
  })
    .jpeg({ quality })
    .toBuffer();
}

describe('dct-core rgbaToGrayscale32x32 + perceptual hash stability', () => {
  it('produces near-identical hashes across different resolutions of the same visual scene', () => {
    const small = rgbaToGrayscale32x32(buildPatternRgba(32, 32, 'gradient'), 32, 32);
    const large = rgbaToGrayscale32x32(buildPatternRgba(96, 64, 'gradient'), 96, 64);

    const hashSmall = computePHashFromGrayscale(small);
    const hashLarge = computePHashFromGrayscale(large);

    expect(hammingDistance(hashSmall.hex, hashLarge.hex)).toBeLessThanOrEqual(2);
  });

  it('separates visually distinct scenes by a wide Hamming margin', () => {
    const grad = computePHashFromGrayscale(
      rgbaToGrayscale32x32(buildPatternRgba(64, 64, 'gradient'), 64, 64)
    );
    const rings = computePHashFromGrayscale(
      rgbaToGrayscale32x32(buildPatternRgba(64, 64, 'rings'), 64, 64)
    );

    expect(hammingDistance(grad.hex, rings.hex)).toBeGreaterThan(10);
  });

  it('rejects invalid dimensions or truncated RGBA buffers', () => {
    expect(() => rgbaToGrayscale32x32(new Uint8Array(16), 0, 4)).toThrow(/invalid dimensions/);
    expect(() => rgbaToGrayscale32x32(new Uint8Array(10), 4, 4)).toThrow(/RGBA bytes/);
  });
});

describe('client-phash local history and precheck pipeline', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LOCAL_PHASH_STORAGE_KEY);
    vi.clearAllMocks();
  });

  it('records local hashes and flags near-duplicates within threshold', () => {
    recordLocalPhotoHash({
      hash: '9a3f0e8c7b1d4256',
      entityType: 'tree',
      entityId: 'na-001',
      storageRef: 'bafy-orig',
    });

    expect(readLocalPhotoHashes()).toHaveLength(1);

    // 1 bit flipped on last nibble (6 -> 7)
    const nearMatch = findLocalDuplicatePhotoHash('9a3f0e8c7b1d4257' as never, {
      entityType: 'tree',
      threshold: 5,
    });
    expect(nearMatch).not.toBeNull();
    expect(nearMatch?.distance).toBe(1);
    expect(nearMatch?.source).toBe('local-history');

    // Completely unrelated hash
    const farMatch = findLocalDuplicatePhotoHash('65c0f17384e2bda9' as never, {
      entityType: 'tree',
      threshold: 5,
    });
    expect(farMatch).toBeNull();
  });

  it('instantly flags local duplicates in runClientDuplicatePrecheck and emits console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const matrix = rgbaToGrayscale32x32(buildPatternRgba(32, 32, 'gradient'), 32, 32);
    const expected = computePHashFromGrayscale(matrix);

    recordLocalPhotoHash({
      hash: expected.hex,
      entityType: 'tree',
      entityId: 'na-001',
      storageRef: 'bafy-prev',
    });

    const fetchMock = vi.fn();
    const file = new File(['dummy'], 'reused-proof.jpg', { type: 'image/jpeg' });
    const result = await runClientDuplicatePrecheck(file, {
      entityType: 'tree',
      decodeToGrayscale: () => Promise.resolve(matrix),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.flag?.source).toBe('local-history');
    expect(result.flag?.distance).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pHash:upload-pipeline]'),
      expect.objectContaining({ hash: expected.hex, distance: 0 })
    );
    warnSpy.mockRestore();
  });

  it('flags server-detected duplicates via /api/planting/photo/dedup-check', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const matrix = new Float64Array(PHASH_RESIZE * PHASH_RESIZE).fill(120);
    const expected = computePHashFromGrayscale(matrix);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          hash: expected.hex,
          population: expected.population,
          threshold: 5,
          isDuplicate: true,
          match: {
            id: 77,
            entityType: 'tree',
            entityId: 'HRV-2026-009',
            distance: 2,
            storageRef: 'ipfs://bafy77',
            createdAt: '2026-11-23T00:00:00.000Z',
          },
        }),
    });

    const file = new File(['dummy'], 'stock-tree.jpg', { type: 'image/jpeg' });
    const result = await runClientDuplicatePrecheck(file, {
      entityType: 'tree',
      entityId: 'na-002',
      decodeToGrayscale: () => Promise.resolve(matrix),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.flag?.source).toBe('server-dedup');
    expect(result.flag?.duplicateId).toBe(77);
    expect(result.flag?.distance).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('server-dedup'),
      expect.objectContaining({ duplicateId: 77 })
    );
    warnSpy.mockRestore();
  });
});

describe('server upload-dedup guard + Stellar SDK identity classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDuplicateThresholdMock.mockReturnValue(5);
  });

  it('recognises valid Stellar Ed25519 public keys via @stellar/stellar-sdk StrKey', () => {
    const keypair = Keypair.random();
    expect(classifyStellarEntityId(keypair.publicKey())).toBe('ed25519');
    expect(classifyStellarEntityId('tree-job-001')).toBe('external');
  });

  it('flags recompressed duplicate JPEGs and emits an informative console warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalBuf = await makePatternJpeg('rings', 90);
    const recompressedBuf = await makePatternJpeg('rings', 35);

    findDuplicateMock.mockResolvedValueOnce(null);
    const firstVerdict = await guardUploadAgainstDuplicates(originalBuf, {
      entityType: 'tree',
      entityId: Keypair.random().publicKey(),
      routeLabel: 'test/upload',
    });
    expect(firstVerdict.isDuplicate).toBe(false);
    expect(firstVerdict.stellarIdentityKind).toBe('ed25519');

    findDuplicateMock.mockResolvedValueOnce({
      row: {
        id: 108,
        entity_type: 'tree',
        entity_id: 'na-001',
        hash_hex: firstVerdict.phash.hex,
        storage_ref: 'bafy108',
        metadata: {},
        duplicate_of: null,
        created_at: new Date(),
      },
      distance: 1,
    });

    const secondVerdict = await guardUploadAgainstDuplicates(recompressedBuf, {
      entityType: 'tree',
      entityId: 'na-002',
      routeLabel: 'test/upload',
    });

    expect(secondVerdict.isDuplicate).toBe(true);
    expect(secondVerdict.duplicateOf).toBe(108);
    expect(secondVerdict.distance).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test/upload] Flagged duplicate tree photo'),
      expect.objectContaining({ duplicateOf: 108, distance: 1 })
    );
    warnSpy.mockRestore();
  });

  it('degrades gracefully when DATABASE_URL is unconfigured', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const buf = await makePatternJpeg('gradient', 80);
    findDuplicateMock.mockRejectedValueOnce(new Error('DATABASE_URL is not configured'));
    recordPhotoHashMock.mockRejectedValueOnce(new Error('DATABASE_URL is not configured'));

    const verdict = await guardUploadAgainstDuplicates(buf, {
      entityType: 'planter',
      entityId: 'planter-1',
    });
    expect(verdict.isDuplicate).toBe(false);

    const rowId = await safelyRecordUploadedPhotoHash({
      entityType: 'planter',
      entityId: 'planter-1',
      hashHex: verdict.phash.hex,
      storageRef: 'bafy-planter',
    });
    expect(rowId).toBeNull();
    warnSpy.mockRestore();
  });
});
