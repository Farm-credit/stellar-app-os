export type VerificationStatus = 'pending' | 'verified' | 'retired';

export interface PaymentProtectionInput {
  verificationStatus: VerificationStatus;
  verificationPeriodEndsAt: string;
  now?: Date;
}

export interface PaymentProtectionDecision {
  eligible: boolean;
  status: 'held' | 'released';
  reason: 'awaiting_verification' | 'verification_period_active' | 'eligible';
  verificationPeriodEndsAt: string;
}

/**
 * Buyer funds remain held until credits are verified or retired and the
 * configured verification period has elapsed.
 */
export function evaluatePaymentProtection({
  verificationStatus,
  verificationPeriodEndsAt,
  now = new Date(),
}: PaymentProtectionInput): PaymentProtectionDecision {
  const periodEnd = new Date(verificationPeriodEndsAt);
  if (Number.isNaN(periodEnd.getTime())) {
    throw new Error('verificationPeriodEndsAt must be a valid ISO date');
  }

  if (verificationStatus === 'pending') {
    return {
      eligible: false,
      status: 'held',
      reason: 'awaiting_verification',
      verificationPeriodEndsAt: periodEnd.toISOString(),
    };
  }

  if (now.getTime() < periodEnd.getTime()) {
    return {
      eligible: false,
      status: 'held',
      reason: 'verification_period_active',
      verificationPeriodEndsAt: periodEnd.toISOString(),
    };
  }

  return {
    eligible: true,
    status: 'released',
    reason: 'eligible',
    verificationPeriodEndsAt: periodEnd.toISOString(),
  };
}
