import type { TreeSpecies } from '@/lib/types/tree';

export interface SpeciesInfo {
  name: TreeSpecies;
  slug: string;
  co2KgPerYear: number;
  maturityYears: number;
}

export const TREE_SPECIES: SpeciesInfo[] = [
  { name: 'Teak', slug: 'teak', co2KgPerYear: 22, maturityYears: 20 },
  { name: 'Moringa', slug: 'moringa', co2KgPerYear: 9, maturityYears: 3 },
  { name: 'Eucalyptus', slug: 'eucalyptus', co2KgPerYear: 31, maturityYears: 10 },
  { name: 'Mangrove', slug: 'mangrove', co2KgPerYear: 14, maturityYears: 15 },
  { name: 'Acacia', slug: 'acacia', co2KgPerYear: 11, maturityYears: 12 },
  { name: 'Neem', slug: 'neem', co2KgPerYear: 13, maturityYears: 10 },
  { name: 'African Mahogany', slug: 'mahogany', co2KgPerYear: 18, maturityYears: 25 },
  { name: 'Baobab', slug: 'baobab', co2KgPerYear: 8, maturityYears: 50 },
  { name: 'Bamboo (Moso)', slug: 'bamboo', co2KgPerYear: 35, maturityYears: 5 },
  { name: 'West African Cedar', slug: 'cedar', co2KgPerYear: 20, maturityYears: 30 },
  { name: 'Caribbean Pine', slug: 'pine', co2KgPerYear: 25, maturityYears: 15 },
  { name: 'Iroko', slug: 'iroko', co2KgPerYear: 16, maturityYears: 35 },
  { name: 'Shea', slug: 'shea', co2KgPerYear: 7, maturityYears: 20 },
  { name: 'Cashew', slug: 'cashew', co2KgPerYear: 10, maturityYears: 10 },
  { name: 'African Locust Bean', slug: 'locust_bean', co2KgPerYear: 12, maturityYears: 25 },
];

export const TREE_SPECIES_NAMES = TREE_SPECIES.map((s) => s.name);
