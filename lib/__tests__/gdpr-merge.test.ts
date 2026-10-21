import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteUserData, exportUserData, getUserDataForExport } from '@/lib/gdpr';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

beforeEach(() => query.mockReset());

describe('GDPR entry points after merge repair', () => {
  it('exports persisted records through both historical entry points', async () => {
    query.mockResolvedValue({ rows: [{ user_id: 'wallet-1' }] });
    expect(getUserDataForExport).toBe(exportUserData);
    const data = await getUserDataForExport('wallet-1');
    expect(data.trees).toEqual([{ userId: 'wallet-1' }]);
    expect(query).toHaveBeenCalledTimes(4);
    for (const call of query.mock.calls) expect(call[1]).toEqual(['wallet-1']);
  });

  it('deletes persisted records instead of returning a stub success', async () => {
    query.mockResolvedValue({ rowCount: 2 });
    const result = await deleteUserData('wallet-1');
    expect(result.deletedFrom).toEqual([
      'trees(2)',
      'progress_updates(2)',
      'notifications(2)',
      'newsletter_subscriptions(2)',
    ]);
    expect(query).toHaveBeenCalledTimes(4);
    for (const call of query.mock.calls) {
      expect(call[0]).toMatch(/^DELETE FROM/);
      expect(call[1]).toEqual(['wallet-1']);
    }
  });
});
