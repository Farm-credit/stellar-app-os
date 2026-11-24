import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildAndSubmitEscrowReleaseMock,
  emitMilestonePayoutApprovedMock,
  findDuplicateMock,
  recordPhotoHashMock,
  getDuplicateThresholdMock,
} = vi.hoisted(() => ({
  buildAndSubmitEscrowReleaseMock: vi.fn(),
  emitMilestonePayoutApprovedMock: vi.fn(),
  findDuplicateMock: vi.fn(),
  recordPhotoHashMock: vi.fn(),
  getDuplicateThresholdMock: vi.fn(() => 5),
}));

vi.mock('@/lib/stellar/escrow', () => ({
  buildAndSubmitEscrowRelease: buildAndSubmitEscrowReleaseMock,
}));

vi.mock('@/lib/webhook/events', () => ({
  emitMilestonePayoutApproved: emitMilestonePayoutApprovedMock,
}));

vi.mock('@/lib/db/photo-hashes', () => ({
  findDuplicate: findDuplicateMock,
  recordPhotoHash: recordPhotoHashMock,
  getDuplicateThreshold: getDuplicateThresholdMock,
}));

import { resetMilestoneFinalizations } from '@/lib/escrow/milestone-finalization';
import { POST } from './route';

async function makeFieldJpegBase64(): Promise<string> {
  const sharp = (await import('sharp')).default;
  const buf = await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 3,
      background: { r: 20, g: 160, b: 80 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

describe('POST /api/escrow/release perceptual hash duplicate guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMilestoneFinalizations();
    findDuplicateMock.mockResolvedValue(null);
    recordPhotoHashMock.mockResolvedValue(55);
    buildAndSubmitEscrowReleaseMock.mockResolvedValue({
      transactionHash: 'tx-escrow-123',
      releasedAmountUsdc: 750,
      farmerWalletAddress: 'GCFARMEREXAMPLE',
      explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-escrow-123',
    });
  });

  it('refuses escrow release with 422 when the field verification photo is a duplicate', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    findDuplicateMock.mockResolvedValueOnce({
      row: {
        id: 31,
        entity_type: 'tree',
        entity_id: 'loan-prev',
        hash_hex: '0000000000000000',
        storage_ref: 'escrow:tx-old',
        metadata: {},
        duplicate_of: null,
        created_at: new Date(),
      },
      distance: 2,
    });

    const photoBase64 = await makeFieldJpegBase64();
    const req = new Request('http://localhost/api/escrow/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId: 'loan-1931',
        farmerWalletAddress: 'GCFARMEREXAMPLE',
        escrowSecretKey: 'SESCROWEXAMPLE',
        network: 'testnet',
        totalAmountUsdc: 1000,
        verification: {
          gpsCoordinates: { latitude: 11.99, longitude: 8.52 },
          photoBase64,
          photoMimeType: 'image/jpeg',
          submittedAt: '2026-11-23T12:00:00.000Z',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data).toMatchObject({
      code: 'DUPLICATE_PHOTO',
      duplicateOf: 31,
      distance: 2,
    });
    expect(buildAndSubmitEscrowReleaseMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('releases escrow funds and records photo hash for an original field photo', async () => {
    const photoBase64 = await makeFieldJpegBase64();
    const req = new Request('http://localhost/api/escrow/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId: 'loan-1931-unique',
        farmerWalletAddress: 'GCFARMEREXAMPLE',
        escrowSecretKey: 'SESCROWEXAMPLE',
        network: 'testnet',
        totalAmountUsdc: 1000,
        verification: {
          gpsCoordinates: { latitude: 11.99, longitude: 8.52 },
          photoBase64,
          photoMimeType: 'image/jpeg',
          submittedAt: '2026-11-23T12:00:00.000Z',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactionHash).toBe('tx-escrow-123');
    expect(data.photoHash).toMatch(/^[0-9a-f]{16}$/);
    expect(buildAndSubmitEscrowReleaseMock).toHaveBeenCalledTimes(1);
    expect(recordPhotoHashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'tree',
        entityId: 'loan-1931-unique',
        storageRef: 'escrow:tx-escrow-123',
      })
    );
  });

  it('queues milestone approval with 2% verifier split when gracePeriodEndsAt is provided', async () => {
    const photoBase64 = await makeFieldJpegBase64();
    const gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const req = new Request('http://localhost/api/escrow/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId: 'loan-1930-grace',
        farmerWalletAddress: 'GCFARMEREXAMPLE',
        verifierWalletAddress: 'GCVERIFIEREXAMPLE',
        escrowSecretKey: 'SESCROWEXAMPLE',
        network: 'testnet',
        totalAmountUsdc: 1000,
        gracePeriodEndsAt,
        verification: {
          gpsCoordinates: { latitude: 11.99, longitude: 8.52 },
          photoBase64,
          photoMimeType: 'image/jpeg',
          submittedAt: '2026-11-23T12:00:00.000Z',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toMatchObject({
      finalizationStatus: 'pending_grace',
      releasedAmountUsdc: 750,
      farmerPayoutUsdc: 735,
      verifierWalletAddress: 'GCVERIFIEREXAMPLE',
      verifierRewardUsdc: 15,
      gracePeriodEndsAt,
    });
    expect(buildAndSubmitEscrowReleaseMock).not.toHaveBeenCalled();
  });
});
