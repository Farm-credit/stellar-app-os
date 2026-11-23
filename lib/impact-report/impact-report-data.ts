/**
 * Sponsor impact report data — Issue #1654
 *
 * Pure transformation from a sponsor profile + portfolio into the figures
 * shown in the downloadable annual impact report PDF.
 */

import type { SponsorPortfolio } from '@/lib/types/sponsor-portfolio';

export interface ImpactReportSponsor {
  name?: string;
  address: string;
}

export interface ImpactReportData {
  sponsorName: string;
  sponsorAddress: string;
  reportYear: number;
  generatedOn: string;
  totalTrees: number;
  totalCo2Kg: number;
  totalCo2Tonnes: number;
  speciesCount: number;
  speciesBreakdown: { species: string; count: number; percent: number }[];
  regionCount: number;
  regionBreakdown: { region: string; count: number; percent: number }[];
}

function withPercent<K extends string>(
  rows: ({ count: number } & Record<K, string>)[],
  total: number
) {
  return rows.map((row) => ({
    ...row,
    percent: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));
}

export function buildImpactReportData(
  sponsor: ImpactReportSponsor,
  portfolio: SponsorPortfolio,
  now: Date = new Date()
): ImpactReportData {
  const { forest } = portfolio;
  const shortAddress =
    sponsor.address.length > 12
      ? `${sponsor.address.slice(0, 6)}...${sponsor.address.slice(-4)}`
      : sponsor.address;

  return {
    sponsorName: sponsor.name?.trim() || shortAddress,
    sponsorAddress: sponsor.address,
    reportYear: now.getUTCFullYear(),
    generatedOn: now.toISOString(),
    totalTrees: forest.totalTrees,
    totalCo2Kg: forest.totalCo2OffsetKg,
    totalCo2Tonnes: forest.totalCo2OffsetTonnes,
    speciesCount: forest.totalSpecies,
    speciesBreakdown: withPercent(forest.speciesBreakdown, forest.totalTrees),
    regionCount: forest.totalRegions,
    regionBreakdown: withPercent(forest.regionBreakdown, forest.totalTrees),
  };
}
