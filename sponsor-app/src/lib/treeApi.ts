export interface TreeSpecies {
  id: string;
  name: string;
  co2PerYearKg: number;
  priceXlm: number;
}

export interface TreeProgress {
  treeId: string;
  species: string;
  region: string;
  status: 'planted' | 'growing';
  heightMeters: number;
  lastUpdate: string;
}

const MOCK_SPECIES: TreeSpecies[] = [
  { id: 'acacia', name: 'Acacia', co2PerYearKg: 22, priceXlm: 5 },
  { id: 'mango', name: 'Mango', co2PerYearKg: 25, priceXlm: 8 },
  { id: 'neem', name: 'Neem', co2PerYearKg: 30, priceXlm: 6 },
  { id: 'teak', name: 'Teak', co2PerYearKg: 35, priceXlm: 12 },
];

/**
 * Fetch sponsorable species. Uses a local catalogue while the GraphQL API
 * endpoint is wired up; the contract surface is unchanged so swapping the
 * implementation later does not touch screens.
 */
export async function fetchTreeSpecies(): Promise<TreeSpecies[]> {
  return MOCK_SPECIES;
}

/** Fetch growth progress for a sponsored tree (mock until the API is wired). */
export async function fetchTreeProgress(treeId: string): Promise<TreeProgress> {
  return {
    treeId,
    species: 'Acacia',
    region: 'West Africa',
    status: 'growing',
    heightMeters: 1.4,
    lastUpdate: new Date().toISOString(),
  };
}
