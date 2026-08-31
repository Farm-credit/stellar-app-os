import type { AffiliateProgramInfo } from '@/lib/types/affiliate';
import { getMockAffiliateProgram } from '@/lib/api/mock/affiliateProgram';

/**
 * Fetch the affiliate program summary for the current partner from the API.
 */
export async function getAffiliateProgram(): Promise<AffiliateProgramInfo> {
  const res = await fetch('/api/affiliate');
  if (!res.ok) {
    throw new Error('Failed to load affiliate program');
  }
  return res.json() as Promise<AffiliateProgramInfo>;
}

/** Temporary mock for development / testing. */
export function getAffiliateProgramMock(): AffiliateProgramInfo {
  return getMockAffiliateProgram();
}
