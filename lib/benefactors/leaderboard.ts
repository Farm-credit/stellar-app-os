import { StrKey } from '@stellar/stellar-sdk';

export type BenefactorType = 'corporate' | 'individual';
export type BenefactorFilterType = 'all' | BenefactorType;
export type BenefactorPeriod = 'all-time' | 'quarterly' | 'monthly';
export type BenefactorSortBy =
  | 'hectares'
  | 'impactScore'
  | 'stewardsSupported'
  | 'creditsFunded';

export interface BenefactorStewardImpact {
  farmers: number;
  urbanPlanters: number;
  communitySchools: number;
  verifiers: number;
}

export interface BenefactorRecord {
  id: string;
  name: string;
  type: BenefactorType;
  stellarAddress: string;
  region: string;
  verified: boolean;
  hectaresRestored: number;
  ecologicalCreditsFunded: number;
  communityImpactScore: number; // 0-100 composite index
  stewards: BenefactorStewardImpact;
  rankChange: 'up' | 'down' | 'same';
  lastContributionAt: string;
}

export interface RankedBenefactorEntry extends BenefactorRecord {
  rank: number;
  acresRestored: number;
  totalStewardsSupported: number;
}

export interface BenefactorLeaderboardQuery {
  type?: BenefactorFilterType;
  period?: BenefactorPeriod;
  sortBy?: BenefactorSortBy;
  search?: string;
  limit?: number;
}

export interface BenefactorLeaderboardSummary {
  totalHectaresRestored: number;
  totalAcresRestored: number;
  totalEcologicalCreditsFunded: number;
  totalStewardsSupported: number;
  stewardBreakdown: BenefactorStewardImpact;
  corporateCount: number;
  individualCount: number;
  totalBenefactors: number;
}

export interface BenefactorLeaderboardResult {
  entries: RankedBenefactorEntry[];
  summary: BenefactorLeaderboardSummary;
  meta: {
    type: BenefactorFilterType;
    period: BenefactorPeriod;
    sortBy: BenefactorSortBy;
    totalCount: number;
    updatedAt: string;
  };
}

export const ACRES_PER_HECTARE = 2.47105;

const PERIOD_MULTIPLIERS: Record<BenefactorPeriod, number> = {
  'all-time': 1,
  quarterly: 0.34,
  monthly: 0.12,
};

const VALID_TYPES = new Set<BenefactorFilterType>(['all', 'corporate', 'individual']);
const VALID_PERIODS = new Set<BenefactorPeriod>(['all-time', 'quarterly', 'monthly']);
const VALID_SORT_BY = new Set<BenefactorSortBy>([
  'hectares',
  'impactScore',
  'stewardsSupported',
  'creditsFunded',
]);

export function hectaresToAcres(hectares: number): number {
  if (!Number.isFinite(hectares) || hectares < 0) {
    console.warn('[BenefactorLeaderboard] Invalid hectares value provided:', hectares);
    return 0;
  }
  return Number((hectares * ACRES_PER_HECTARE).toFixed(2));
}

export function isValidBenefactorAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    console.warn('[BenefactorLeaderboard] Missing or non-string Stellar address.');
    return false;
  }
  const valid = StrKey.isValidEd25519PublicKey(address.trim());
  if (!valid) {
    console.warn(
      `[BenefactorLeaderboard] Invalid Stellar Ed25519 public key detected: "${address}"`
    );
  }
  return valid;
}

export function formatStellarAddress(address: string, visibleChars = 6): string {
  const trimmed = address.trim();
  if (trimmed.length <= visibleChars * 2 + 3) {
    return trimmed;
  }
  return `${trimmed.slice(0, visibleChars)}...${trimmed.slice(-visibleChars)}`;
}

export function getTotalStewards(stewards: BenefactorStewardImpact): number {
  return (
    stewards.farmers +
    stewards.urbanPlanters +
    stewards.communitySchools +
    stewards.verifiers
  );
}

export const SEED_BENEFACTORS: readonly BenefactorRecord[] = [
  {
    id: 'ben-01',
    name: 'Verdant Horizon Collective',
    type: 'corporate',
    stellarAddress: 'GCRHL2HAEVIBZSINXNTBAEGMJK6GCYPVJDZZKKWPM3P6277FFSEDUQNO',
    region: 'East Africa',
    verified: true,
    hectaresRestored: 1420.5,
    ecologicalCreditsFunded: 42615,
    communityImpactScore: 98,
    stewards: {
      farmers: 312,
      urbanPlanters: 84,
      communitySchools: 26,
      verifiers: 38,
    },
    rankChange: 'same',
    lastContributionAt: '2026-11-18T14:20:00Z',
  },
  {
    id: 'ben-02',
    name: 'Helios Agro-Climate Fund',
    type: 'corporate',
    stellarAddress: 'GC7W554RZMKIV3I4C5N42REFBNJFX27Q4XROVUETS2EM3SBQIGJ446H6',
    region: 'West Africa',
    verified: true,
    hectaresRestored: 1185.2,
    ecologicalCreditsFunded: 35556,
    communityImpactScore: 95,
    stewards: {
      farmers: 268,
      urbanPlanters: 62,
      communitySchools: 19,
      verifiers: 31,
    },
    rankChange: 'up',
    lastContributionAt: '2026-11-19T09:45:00Z',
  },
  {
    id: 'ben-03',
    name: 'TerraNova Regenerative Partners',
    type: 'corporate',
    stellarAddress: 'GAEMIG4N5BSPFCJBJZG6RXHDMAHLCP3TCFMBOU6PZDIRGWUOU2JV3AD6',
    region: 'Latin America',
    verified: true,
    hectaresRestored: 964.8,
    ecologicalCreditsFunded: 28944,
    communityImpactScore: 93,
    stewards: {
      farmers: 215,
      urbanPlanters: 54,
      communitySchools: 22,
      verifiers: 27,
    },
    rankChange: 'down',
    lastContributionAt: '2026-11-17T18:10:00Z',
  },
  {
    id: 'ben-04',
    name: 'Dr. Amara Okafor',
    type: 'individual',
    stellarAddress: 'GBS2WAHPUWOGC5PVLJOM5JRP73YQOF2X7TKWLOFLYXQMBXCEZHF6XEJZ',
    region: 'West Africa',
    verified: true,
    hectaresRestored: 612.4,
    ecologicalCreditsFunded: 18372,
    communityImpactScore: 91,
    stewards: {
      farmers: 134,
      urbanPlanters: 48,
      communitySchools: 18,
      verifiers: 16,
    },
    rankChange: 'up',
    lastContributionAt: '2026-11-20T11:05:00Z',
  },
  {
    id: 'ben-05',
    name: 'Nordic Canopy Ventures',
    type: 'corporate',
    stellarAddress: 'GCZUW5AYAQROLCDFZKHK3PPRTX66NQBBGNBBA2RV3TEIWNS5SXIX6ILW',
    region: 'Southeast Asia',
    verified: true,
    hectaresRestored: 548.0,
    ecologicalCreditsFunded: 16440,
    communityImpactScore: 88,
    stewards: {
      farmers: 122,
      urbanPlanters: 39,
      communitySchools: 14,
      verifiers: 19,
    },
    rankChange: 'same',
    lastContributionAt: '2026-11-16T08:30:00Z',
  },
  {
    id: 'ben-06',
    name: 'Elena Rostova',
    type: 'individual',
    stellarAddress: 'GDCJ7SFMA6QXDG4RTXQX77SJXVOENKKDHX7URL2OWM2O4WVBOCIFSE4B',
    region: 'East Africa',
    verified: true,
    hectaresRestored: 418.6,
    ecologicalCreditsFunded: 12558,
    communityImpactScore: 86,
    stewards: {
      farmers: 96,
      urbanPlanters: 35,
      communitySchools: 12,
      verifiers: 14,
    },
    rankChange: 'up',
    lastContributionAt: '2026-11-19T16:40:00Z',
  },
  {
    id: 'ben-07',
    name: 'Kofi & Amina Mensah Foundation',
    type: 'individual',
    stellarAddress: 'GBHFTGA474WCVJLQ72BB7XTCFS2U2LU6HKTAV54HCPPVITYIXWJOF2NN',
    region: 'West Africa',
    verified: true,
    hectaresRestored: 342.9,
    ecologicalCreditsFunded: 10287,
    communityImpactScore: 89,
    stewards: {
      farmers: 78,
      urbanPlanters: 42,
      communitySchools: 21,
      verifiers: 12,
    },
    rankChange: 'same',
    lastContributionAt: '2026-11-15T12:15:00Z',
  },
  {
    id: 'ben-08',
    name: 'Pacific BioCredit Alliance',
    type: 'corporate',
    stellarAddress: 'GAX64EQXWLCMC5T4XZ4DU6WDPP7MCACS3TI6DYXVXZXTORZWWHHGNZEB',
    region: 'Southeast Asia',
    verified: true,
    hectaresRestored: 289.5,
    ecologicalCreditsFunded: 8685,
    communityImpactScore: 84,
    stewards: {
      farmers: 68,
      urbanPlanters: 29,
      communitySchools: 11,
      verifiers: 10,
    },
    rankChange: 'down',
    lastContributionAt: '2026-11-14T19:00:00Z',
  },
  {
    id: 'ben-09',
    name: 'Mateo Silva',
    type: 'individual',
    stellarAddress: 'GCZWVRSAGV6WJVDX6P4QZUFVFAI5TDXRZ65UBOH5IFXRY62ZHUWJOHFS',
    region: 'Latin America',
    verified: false,
    hectaresRestored: 194.2,
    ecologicalCreditsFunded: 5826,
    communityImpactScore: 81,
    stewards: {
      farmers: 44,
      urbanPlanters: 24,
      communitySchools: 9,
      verifiers: 8,
    },
    rankChange: 'up',
    lastContributionAt: '2026-11-18T07:50:00Z',
  },
  {
    id: 'ben-10',
    name: 'Sora Takahashi',
    type: 'individual',
    stellarAddress: 'GDUUQL3V4D6D6GHQYTA5NZJLHW3SX55VTQFRMAYZUW7GAU3MQ5A6HTA4',
    region: 'Southeast Asia',
    verified: true,
    hectaresRestored: 146.7,
    ecologicalCreditsFunded: 4401,
    communityImpactScore: 79,
    stewards: {
      farmers: 36,
      urbanPlanters: 21,
      communitySchools: 8,
      verifiers: 6,
    },
    rankChange: 'same',
    lastContributionAt: '2026-11-13T21:10:00Z',
  },
];

function scaleRecordForPeriod(
  record: BenefactorRecord,
  period: BenefactorPeriod
): BenefactorRecord {
  const factor = PERIOD_MULTIPLIERS[period];
  if (factor === 1) {
    return record;
  }

  return {
    ...record,
    hectaresRestored: Number((record.hectaresRestored * factor).toFixed(2)),
    ecologicalCreditsFunded: Math.max(
      1,
      Math.round(record.ecologicalCreditsFunded * factor)
    ),
    stewards: {
      farmers: Math.max(1, Math.round(record.stewards.farmers * factor)),
      urbanPlanters: Math.max(1, Math.round(record.stewards.urbanPlanters * factor)),
      communitySchools: Math.max(
        1,
        Math.round(record.stewards.communitySchools * factor)
      ),
      verifiers: Math.max(1, Math.round(record.stewards.verifiers * factor)),
    },
  };
}

export function normalizeQuery(
  query: BenefactorLeaderboardQuery = {}
): Required<Omit<BenefactorLeaderboardQuery, 'limit'>> & { limit?: number } {
  let type: BenefactorFilterType = 'all';
  if (query.type !== undefined) {
    if (VALID_TYPES.has(query.type)) {
      type = query.type;
    } else {
      console.warn(
        `[BenefactorLeaderboard] Unknown benefactor type "${String(query.type)}"; falling back to "all".`
      );
    }
  }

  let period: BenefactorPeriod = 'all-time';
  if (query.period !== undefined) {
    if (VALID_PERIODS.has(query.period)) {
      period = query.period;
    } else {
      console.warn(
        `[BenefactorLeaderboard] Unknown period "${String(query.period)}"; falling back to "all-time".`
      );
    }
  }

  let sortBy: BenefactorSortBy = 'hectares';
  if (query.sortBy !== undefined) {
    if (VALID_SORT_BY.has(query.sortBy)) {
      sortBy = query.sortBy;
    } else {
      console.warn(
        `[BenefactorLeaderboard] Unknown sortBy "${String(query.sortBy)}"; falling back to "hectares".`
      );
    }
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';

  let limit: number | undefined;
  if (query.limit !== undefined) {
    if (Number.isInteger(query.limit) && query.limit > 0) {
      limit = query.limit;
    } else {
      console.warn(
        `[BenefactorLeaderboard] Invalid limit "${String(query.limit)}"; ignoring limit.`
      );
    }
  }

  return { type, period, sortBy, search, limit };
}

export function rankBenefactors(
  records: readonly BenefactorRecord[],
  rawQuery: BenefactorLeaderboardQuery = {}
): BenefactorLeaderboardResult {
  const { type, period, sortBy, search, limit } = normalizeQuery(rawQuery);
  const normalizedSearch = search.toLowerCase();

  const validRecords = records
    .filter((record) => isValidBenefactorAddress(record.stellarAddress))
    .map((record) => scaleRecordForPeriod(record, period));

  const filtered = validRecords.filter((record) => {
    if (type !== 'all' && record.type !== type) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return (
      record.name.toLowerCase().includes(normalizedSearch) ||
      record.region.toLowerCase().includes(normalizedSearch) ||
      record.stellarAddress.toLowerCase().includes(normalizedSearch)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let primaryDiff = 0;
    switch (sortBy) {
      case 'impactScore':
        primaryDiff = b.communityImpactScore - a.communityImpactScore;
        break;
      case 'stewardsSupported':
        primaryDiff = getTotalStewards(b.stewards) - getTotalStewards(a.stewards);
        break;
      case 'creditsFunded':
        primaryDiff = b.ecologicalCreditsFunded - a.ecologicalCreditsFunded;
        break;
      case 'hectares':
      default:
        primaryDiff = b.hectaresRestored - a.hectaresRestored;
        break;
    }

    if (primaryDiff !== 0) {
      return primaryDiff;
    }
    if (b.hectaresRestored !== a.hectaresRestored) {
      return b.hectaresRestored - a.hectaresRestored;
    }
    return a.name.localeCompare(b.name);
  });

  const rankedAll: RankedBenefactorEntry[] = sorted.map((record, index) => ({
    ...record,
    rank: index + 1,
    acresRestored: hectaresToAcres(record.hectaresRestored),
    totalStewardsSupported: getTotalStewards(record.stewards),
  }));

  const summary = rankedAll.reduce<BenefactorLeaderboardSummary>(
    (acc, entry) => {
      acc.totalHectaresRestored = Number(
        (acc.totalHectaresRestored + entry.hectaresRestored).toFixed(2)
      );
      acc.totalEcologicalCreditsFunded += entry.ecologicalCreditsFunded;
      acc.totalStewardsSupported += entry.totalStewardsSupported;
      acc.stewardBreakdown.farmers += entry.stewards.farmers;
      acc.stewardBreakdown.urbanPlanters += entry.stewards.urbanPlanters;
      acc.stewardBreakdown.communitySchools += entry.stewards.communitySchools;
      acc.stewardBreakdown.verifiers += entry.stewards.verifiers;
      if (entry.type === 'corporate') {
        acc.corporateCount += 1;
      } else {
        acc.individualCount += 1;
      }
      acc.totalBenefactors += 1;
      return acc;
    },
    {
      totalHectaresRestored: 0,
      totalAcresRestored: 0,
      totalEcologicalCreditsFunded: 0,
      totalStewardsSupported: 0,
      stewardBreakdown: {
        farmers: 0,
        urbanPlanters: 0,
        communitySchools: 0,
        verifiers: 0,
      },
      corporateCount: 0,
      individualCount: 0,
      totalBenefactors: 0,
    }
  );
  summary.totalAcresRestored = hectaresToAcres(summary.totalHectaresRestored);

  const entries = limit !== undefined ? rankedAll.slice(0, limit) : rankedAll;

  return {
    entries,
    summary,
    meta: {
      type,
      period,
      sortBy,
      totalCount: rankedAll.length,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function getBenefactorLeaderboard(
  query: BenefactorLeaderboardQuery = {}
): BenefactorLeaderboardResult {
  return rankBenefactors(SEED_BENEFACTORS, query);
}
