import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { claimDueDeliveries } from '../repository';

describe('claimDueDeliveries', () => {
  it('atomically leases due rows so concurrent processors cannot claim them again', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const now = new Date('2026-01-01T00:00:00.000Z');

    await claimDueDeliveries(pool, 25, now, 90_000);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WITH due AS');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('UPDATE webhook_deliveries');
    expect(sql).toContain('SET next_attempt_at = $3');
    expect(params).toEqual([now, 25, new Date('2026-01-01T00:01:30.000Z')]);
  });
});