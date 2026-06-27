import type { TreeSpecies } from '@/lib/types/tree';

export interface SpeciesInfo {
  name: TreeSpecies;
  co2KgPerYear: number;
  maturityYears: number;
}

export const TREE_SPECIES: SpeciesInfo[] = [
  { name: 'Teak', co2KgPerYear: 22, maturityYears: 20 },
  { name: 'Moringa', co2KgPerYear: 9, maturityYears: 3 },
  { name: 'Eucalyptus', co2KgPerYear: 31, maturityYears: 10 },
  { name: 'Mangrove', co2KgPerYear: 14, maturityYears: 15 },
];

export const TREE_SPECIES_NAMES = TREE_SPECIES.map((s) => s.name);
