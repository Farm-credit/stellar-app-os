import type { TreeSpecies, TreeStatus } from './tree';

export interface SponsorTreeEntry {
  id: string;
  treeId: string;
  species: TreeSpecies;
  region: string;
  status: TreeStatus;
  plantedAt: string;
  projectName: string;
  co2OffsetKgPerYear: number;
}

export interface ForestStatistics {
  totalTrees: number;
  totalSpecies: number;
  totalRegions: number;
  totalProjects: number;
  totalCo2OffsetKg: number;
  totalCo2OffsetTonnes: number;
  speciesBreakdown: { species: TreeSpecies; count: number }[];
  regionBreakdown: { region: string; count: number }[];
  statusBreakdown: { status: TreeStatus; count: number }[];
}

export interface SponsorPortfolio {
  forest: ForestStatistics;
  plantingHistory: SponsorTreeEntry[];
}
