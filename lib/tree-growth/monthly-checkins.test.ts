import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: queryMock }),
}));

import {
  createTreeMonthlyCheckIn,
  currentCheckInMonth,
  nextCheckInDate,
} from './monthly-checkins';

describe('monthly tree check-ins', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('uses UTC calendar months for the check-in cadence', () => {
    const date = new Date('2026-11-30T23:30:00.000Z');
    expect(currentCheckInMonth(date)).toBe('2026-11-01');
    expect(nextCheckInDate(date)).toBe('2026-12-01T00:00:00.000Z');
  });

  it('atomically inserts at most one check-in per tree and month', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const result = await createTreeMonthlyCheckIn({
      treeId: 'tree-1',
      photoCid: 'bafy-photo',
      imageUrl: 'https://gateway.pinata.cloud/ipfs/bafy-photo',
      submittedBy: 'Field Steward',
      caption: null,
      heightCm: null,
      now: new Date('2026-11-24T11:00:00.000Z'),
    });

    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tree_id, checkin_month) DO NOTHING'),
      ['tree-1', '2026-11-01', 'bafy-photo', 'https://gateway.pinata.cloud/ipfs/bafy-photo', 'Field Steward', null, null]
    );
  });
});
