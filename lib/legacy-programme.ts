import type { Tree } from '@/lib/types/tree';

export const LEGACY_MINIMUM_YEARS = 10;

export interface LegacyProgrammeStatus {
  eligible: boolean;
  tier: 'legacy' | null;
  commitmentYears: number;
  groveName: string | null;
}

export interface LegacyGroveReport {
  sponsorName: string;
  groveName: string;
  commitmentYears: number;
  generatedAt: string;
  stats: {
    totalTrees: number;
    livingTrees: number;
    failedTrees: number;
    survivalRatePct: number;
    regions: string[];
    species: Record<string, number>;
  };
}

export function getLegacyStatus(
  sponsorName: string,
  commitmentYears: number,
  groveName?: string
): LegacyProgrammeStatus {
  const eligible = commitmentYears >= LEGACY_MINIMUM_YEARS;
  return {
    eligible,
    tier: eligible ? 'legacy' : null,
    commitmentYears,
    groveName: eligible ? groveName?.trim() || `${sponsorName.trim()}'s Legacy Grove` : null,
  };
}

export function buildLegacyGroveReport(
  sponsorName: string,
  trees: Tree[],
  commitmentYears: number,
  groveName?: string,
  now = new Date()
): LegacyGroveReport {
  const livingTrees = trees.filter((tree) => tree.status !== 'failed').length;
  const species = trees.reduce<Record<string, number>>((counts, tree) => {
    counts[tree.species] = (counts[tree.species] ?? 0) + 1;
    return counts;
  }, {});
  const status = getLegacyStatus(sponsorName, commitmentYears, groveName);
  if (!status.eligible || !status.groveName) {
    throw new Error(`Legacy programme requires a ${LEGACY_MINIMUM_YEARS}-year commitment`);
  }
  return {
    sponsorName,
    groveName: status.groveName,
    commitmentYears,
    generatedAt: now.toISOString(),
    stats: {
      totalTrees: trees.length,
      livingTrees,
      failedTrees: trees.length - livingTrees,
      survivalRatePct: trees.length ? Math.round((livingTrees / trees.length) * 1000) / 10 : 0,
      regions: [...new Set(trees.map((tree) => tree.region))].sort(),
      species,
    },
  };
}
