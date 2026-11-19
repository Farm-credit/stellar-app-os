import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '@/lib/db/client';
import { pauseSubscription, updateSpeciesPreference } from './subscription';

vi.mock('@/lib/db/client', () => ({ getPool: vi.fn() }));

const mockedGetPool = vi.mocked(getPool);
const row = {
  id: 7,
  wallet: 'GSPONSOR',
  email: null,
  amount: '25.00',
  trees_per_month: 2,
  asset: 'USDC',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  status: 'active',
  pause_until: new Date('2026-11-15T00:00:00Z'),
  species_preference: 'moringa',
  next_billing_date: new Date('2026-12-15T00:00:00Z'),
  last_billing_date: null,
  created_at: new Date('2026-01-15T00:00:00Z'),
  updated_at: new Date('2026-01-15T00:00:00Z'),
};

describe('subscription management service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects pause durations outside the one-to-three month boundary', async () => {
    await expect(
      pauseSubscription({ subscription_id: 7, wallet: 'GSPONSOR', duration_months: 4 })
    ).rejects.toThrow('Pause duration must be between 1 and 3 months');
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it('does not update a subscription owned by another wallet', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockReturnValue({ query } as never);

    await expect(
      updateSpeciesPreference({
        subscription_id: 7,
        wallet: 'GOTHER',
        species_preference: 'moringa',
      })
    ).rejects.toThrow('Subscription not found');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('updates a valid species preference for an owned subscription', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockReturnValue({ query } as never);

    const result = await updateSpeciesPreference({
      subscription_id: 7,
      wallet: 'GSPONSOR',
      species_preference: 'moringa',
    });

    expect(result.species_preference).toBe('moringa');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('status IN'), [
      7,
      'GSPONSOR',
      'moringa',
    ]);
  });
});
