import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, listMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@/lib/tree-growth/monthly-checkins', () => ({
  createTreeMonthlyCheckIn: createMock,
  currentCheckInMonth: () => '2026-11-01',
  listTreeMonthlyCheckIns: listMock,
  nextCheckInDate: () => '2026-12-01T00:00:00.000Z',
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ id: 'tree-1' }) };
const request = (body: unknown) =>
  new NextRequest('http://localhost/api/trees/tree-1/monthly-checkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/trees/[id]/monthly-checkins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists monthly check-ins and reports current submission eligibility', async () => {
    listMock.mockResolvedValue([
      {
        id: 'checkin-1',
        treeId: 'tree-1',
        checkinMonth: '2026-10-01',
      },
    ]);

    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkIns: [{ checkinMonth: '2026-10-01' }],
      checkinMonth: '2026-11-01',
      canCheckIn: true,
      nextCheckInAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('creates a photo check-in with pending verification status', async () => {
    createMock.mockResolvedValue({
      id: 'checkin-2',
      treeId: 'tree-1',
      verificationStatus: 'pending',
    });
    const response = await POST(
      request({
        photoCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        submittedBy: 'Field Steward',
        caption: 'New leaves after rain',
        heightCm: 120,
      }),
      context
    );

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        treeId: 'tree-1',
        imageUrl:
          'https://gateway.pinata.cloud/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        submittedBy: 'Field Steward',
        heightCm: 120,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      checkIn: { verificationStatus: 'pending' },
    });
  });

  it('rejects invalid photo and observer inputs', async () => {
    const missingPhoto = await POST(
      request({ photoCid: 'invalid', submittedBy: 'Field Steward' }),
      context
    );
    const invalidHeight = await POST(
      request({
        photoCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        submittedBy: 'Field Steward',
        heightCm: 6000,
      }),
      context
    );
    expect(missingPhoto.status).toBe(400);
    expect(invalidHeight.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns conflict when a check-in already exists for the month', async () => {
    createMock.mockResolvedValue(null);
    const response = await POST(
      request({
        photoCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        submittedBy: 'Field Steward',
      }),
      context
    );
    expect(response.status).toBe(409);
  });
});
