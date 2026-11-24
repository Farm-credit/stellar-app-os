import type { Pool } from 'pg';

export interface CorporateEsgImpactFilters {
  sponsorId?: string;
  from?: string;
  to?: string;
  framework?: string;
}

export interface CorporateEsgImpactReport {
  generatedAt: string;
  treesFunded: number;
  co2SequesteredTonnes: number;
  biodiversityScore: number;
  engagedEmployees: number;
}

function readParam(
  input: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseCorporateEsgImpactFilters(
  input: URLSearchParams | Record<string, unknown>
): CorporateEsgImpactFilters {
  return {
    sponsorId: readParam(input, 'sponsorId'),
    from: readParam(input, 'from'),
    to: readParam(input, 'to'),
    framework: readParam(input, 'framework'),
  };
}

export function getCorporateEsgImpact(
  _pool: Pick<Pool, 'query'>,
  _filters: CorporateEsgImpactFilters
): Promise<CorporateEsgImpactReport> {
  return Promise.resolve({
    generatedAt: new Date().toISOString(),
    treesFunded: 0,
    co2SequesteredTonnes: 0,
    biodiversityScore: 0,
    engagedEmployees: 0,
  });
}
