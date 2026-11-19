export const PLANTING_DEADLINE_DAYS = 90;
export const PLANTING_DEADLINE_MS = PLANTING_DEADLINE_DAYS * 24 * 60 * 60 * 1000;

export interface EmergencyWithdrawalInput {
  createdAt: string;
  planterWalletAddress?: string | null;
  now?: Date;
}

export interface EmergencyWithdrawalEligibility {
  eligible: boolean;
  deadlineAt: string;
  reason: 'deadline_not_reached' | 'planter_assigned' | 'eligible';
}

/** A sponsor may withdraw the full escrow only after 90 days without a planter. */
export function getEmergencyWithdrawalEligibility({
  createdAt,
  planterWalletAddress,
  now = new Date(),
}: EmergencyWithdrawalInput): EmergencyWithdrawalEligibility {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) throw new Error('createdAt must be a valid ISO date');
  const deadline = new Date(created.getTime() + PLANTING_DEADLINE_MS);
  if (planterWalletAddress?.trim()) return { eligible: false, deadlineAt: deadline.toISOString(), reason: 'planter_assigned' };
  if (now.getTime() < deadline.getTime()) return { eligible: false, deadlineAt: deadline.toISOString(), reason: 'deadline_not_reached' };
  return { eligible: true, deadlineAt: deadline.toISOString(), reason: 'eligible' };
}
