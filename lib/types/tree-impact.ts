export type TreeSpecies =
  'teak' | 'moringa' | 'eucalyptus' | 'mangrove' | 'oak' | 'pine' | 'acacia' | 'bamboo';

export interface TreeImpactMetrics {
  species: TreeSpecies;
  co2PerYear: number; // kg CO2 per year
  waterSavedPerYear: number; // liters water per year
  habitatRestoredM2: number; // m² habitat restored per tree
  oxygenProducedPerYear: number; // kg O2 per year
  biodiversityScore: number; // 0-100
  maturityYears: number; // years to full maturity
  nativeTo: string[]; // regions
  description: string;
}

export interface TreeImpactCalculation {
  metrics: TreeImpactMetrics;
  treeCount: number;
  years: number;
  totalCO2: number;
  totalWater: number;
  totalHabitat: number;
  totalOxygen: number;
  co2EquivalentCars: number; // cars taken off road equivalent
  waterEquivalentShowers: number; // number of showers equivalent
}
