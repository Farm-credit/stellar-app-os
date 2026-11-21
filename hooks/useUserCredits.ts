import { useQuery } from '@tanstack/react-query';
import { fetchUserCredits } from '@/lib/stellar/listing';
import type { Credit } from '@/lib/types/listing';

export type CertificationProvider = 'verra' | 'gold-standard' | 'none';

export interface CertificationMetadata {
  provider: CertificationProvider;
  verificationStatus: 'verified' | 'pending' | 'expired' | 'unverified';
  renewalDueDate: string | null;
  projectId: string | null;
  eligibleForAuction: boolean;
  needsRenewalDocumentation: boolean;
}

export interface CertifiedCredit extends Credit {
  certification: CertificationMetadata;
}

const RENEWAL_WINDOW_DAYS = 30;

function deriveCertification(credit: Credit): CertificationMetadata {
  const raw = (credit as unknown as { certification?: Partial<CertificationMetadata> })
    .certification;

  const provider: CertificationProvider =
    raw?.provider === 'verra' || raw?.provider === 'gold-standard'
      ? raw.provider
      : 'none';

  const verificationStatus =
    raw?.verificationStatus === 'verified' ||
    raw?.verificationStatus === 'pending' ||
    raw?.verificationStatus === 'expired'
      ? raw.verificationStatus
      : 'unverified';

  const renewalDueDate = raw?.renewalDueDate ?? null;
  const projectId = raw?.projectId ?? null;

  const needsRenewalDocumentation =
    provider !== 'none' &&
    (verificationStatus === 'expired' ||
      (renewalDueDate !== null && isWithinRenewalWindow(renewalDueDate)));

  const eligibleForAuction =
    provider !== 'none' &&
    verificationStatus === 'verified' &&
    !needsRenewalDocumentation;

  return {
    provider,
    verificationStatus,
    renewalDueDate,
    projectId,
    eligibleForAuction,
    needsRenewalDocumentation,
  };
}

function isWithinRenewalWindow(dueDate: string): boolean {
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  const windowMs = RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return due - now <= windowMs;
}

export function useUserCredits(publicKey: string | null) {
  return useQuery({
    queryKey: ['user-credits', publicKey],
    queryFn: async (): Promise<CertifiedCredit[]> => {
      if (!publicKey) return [];
      const credits = await fetchUserCredits(publicKey);
      return credits.map((credit) => ({
        ...credit,
        certification: deriveCertification(credit),
      }));
    },
    enabled: !!publicKey,
    staleTime: 30000,
    retry: 2,
  });
}