/**
 * Sponsor portfolio service — Issue #1105
 *
 * Builds a sponsor's planting history and forest statistics from the
 * shared mock tree registry. Entries are deterministically attributed
 * per sponsor address and scaled to the sponsor's on-record totals so
 * the portfolio stays consistent with the profile header.
 */

import { getMockTrees } from '@/lib/api/mock/trees';
import type { TreeSpecies, TreeStatus } from '@/lib/types/tree';
import type {
  ForestStatistics,
  SponsorPortfolio,
  SponsorTreeEntry,
} from '@/lib/types/sponsor-portfolio';

// Fixed window so server renders are deterministic.
const HISTORY_START = Date.UTC(2023, 0, 1);
const HISTORY_END = Date.UTC(2025, 5, 30);

interface PortfolioTotals {
  totalTrees: number;
  totalCo2OffsetTonnes: number;
}

function hashAddress(addr: string): number {
  return [...addr].reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

/**
 * Older entries mature, newer ones are still growing — a plausible
 * lifecycle that is stable for a given position in the portfolio.
 */
function statusFor(index: number, total: number, hash: number): TreeStatus {
  const progress = index / Math.max(total, 1);
  if (progress < 0.5) return 'completed';
  if (progress < 0.75) return 'verified';
  if (progress < 0.9) return (index + hash) % 2 === 0 ? 'verified' : 'planted';
  return (index + hash) % 3 === 0 ? 'funded' : 'planted';
}

function plantedAtFor(index: number, total: number, hash: number): string {
  const span = HISTORY_END - HISTORY_START;
  const jitter = (hash % 24) * 60 * 60 * 1000; // up to 24h of deterministic jitter
  const time = HISTORY_START + Math.floor((index / Math.max(total, 1)) * span) + jitter;
  return new Date(time).toISOString();
}

function treesForSponsor(address: string, totals: PortfolioTotals): SponsorTreeEntry[] {
  const templates = getMockTrees();
  if (templates.length === 0 || totals.totalTrees <= 0) return [];

  const hash = hashAddress(address);
  const perTreeKg = (totals.totalCo2OffsetTonnes * 1000) / totals.totalTrees;

  return Array.from({ length: totals.totalTrees }, (_, i) => {
    const template = templates[(i + hash) % templates.length];
    const plantedAt = plantedAtFor(i, totals.totalTrees, hash);
    const year = new Date(plantedAt).getUTCFullYear();
    const prefix = template.treeId.split('-')[0];

    return {
      id: `${address}-${i}`,
      treeId: `${prefix}-${year}-${String(i + 1).padStart(4, '0')}`,
      species: template.species,
      region: template.region,
      status: statusFor(i, totals.totalTrees, hash),
      plantedAt,
      projectName: template.projectName,
      co2OffsetKgPerYear: Math.round(perTreeKg * 10) / 10,
    };
  });
}

function buildForestStats(trees: SponsorTreeEntry[]): ForestStatistics {
  const speciesMap = new Map<TreeSpecies, number>();
  const regionMap = new Map<string, number>();
  const statusMap = new Map<TreeStatus, number>();
  const projects = new Set<string>();

  let totalCo2 = 0;

  for (const t of trees) {
    speciesMap.set(t.species, (speciesMap.get(t.species) ?? 0) + 1);
    regionMap.set(t.region, (regionMap.get(t.region) ?? 0) + 1);
    statusMap.set(t.status, (statusMap.get(t.status) ?? 0) + 1);
    projects.add(t.projectName);
    totalCo2 += t.co2OffsetKgPerYear;
  }

  return {
    totalTrees: trees.length,
    totalSpecies: speciesMap.size,
    totalRegions: regionMap.size,
    totalProjects: projects.size,
    totalCo2OffsetKg: Math.round(totalCo2),
    totalCo2OffsetTonnes: Math.round((totalCo2 / 1000) * 10) / 10,
    speciesBreakdown: [...speciesMap.entries()]
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count),
    regionBreakdown: [...regionMap.entries()]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count),
    statusBreakdown: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function getSponsorPortfolio(address: string, totals: PortfolioTotals): SponsorPortfolio {
  const trees = treesForSponsor(address, totals);
  const forest = buildForestStats(trees);

  return {
    forest,
    plantingHistory: [...trees].sort(
      (a, b) => new Date(b.plantedAt).getTime() - new Date(a.plantedAt).getTime()
    ),
  };
}
