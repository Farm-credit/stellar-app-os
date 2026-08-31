import { describe, expect, it } from 'vitest';
import { getEmergencyWithdrawalEligibility, PLANTING_DEADLINE_MS } from './emergency-withdrawal';

describe('getEmergencyWithdrawalEligibility', () => {
  const createdAt = '2026-01-01T00:00:00.000Z';

  it('allows a full withdrawal after 90 days when no planter is assigned', () => {
    const result = getEmergencyWithdrawalEligibility({
      createdAt,
      now: new Date(new Date(createdAt).getTime() + PLANTING_DEADLINE_MS),
    });
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('eligible');
  });

  it('blocks withdrawal before the deadline', () => {
    const result = getEmergencyWithdrawalEligibility({ createdAt, now: new Date('2026-02-01T00:00:00.000Z') });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('deadline_not_reached');
  });

  it('blocks the emergency path after the deadline when a planter is assigned', () => {
    const result = getEmergencyWithdrawalEligibility({
      createdAt,
      planterWalletAddress: 'GABC',
      now: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('planter_assigned');
  });
});
