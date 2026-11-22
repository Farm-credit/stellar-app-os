import { describe, expect, it } from 'vitest';
import { evaluatePaymentProtection } from './payment-protection';

const periodEnd = '2026-11-20T00:00:00.000Z';
const afterPeriod = new Date('2026-11-21T00:00:00.000Z');

describe('evaluatePaymentProtection', () => {
  it('holds funds while credits are pending verification', () => {
    expect(
      evaluatePaymentProtection({
        verificationStatus: 'pending',
        verificationPeriodEndsAt: periodEnd,
        now: afterPeriod,
      })
    ).toMatchObject({ eligible: false, status: 'held', reason: 'awaiting_verification' });
  });

  it('holds verified funds until the protection period ends', () => {
    expect(
      evaluatePaymentProtection({
        verificationStatus: 'verified',
        verificationPeriodEndsAt: periodEnd,
        now: new Date('2026-11-19T00:00:00.000Z'),
      })
    ).toMatchObject({ eligible: false, status: 'held', reason: 'verification_period_active' });
  });

  it('releases verified or retired funds after the protection period', () => {
    for (const verificationStatus of ['verified', 'retired'] as const) {
      expect(
        evaluatePaymentProtection({
          verificationStatus,
          verificationPeriodEndsAt: periodEnd,
          now: afterPeriod,
        })
      ).toMatchObject({ eligible: true, status: 'released', reason: 'eligible' });
    }
  });
});
