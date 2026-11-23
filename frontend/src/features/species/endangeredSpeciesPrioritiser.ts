export type IucnConservationStatus = 'CR' | 'EN' | 'VU' | 'NT' | 'LC';

export interface EndangeredTreeSpecies {
  speciesId: string;
  scientificName: string;
  commonName: string;
  iucnStatus: IucnConservationStatus;
  availableSeedlings: number;
  ecologicalImpactScore: number; // 0 - 100
}

export interface PrioritisedSpeciesEntry extends EndangeredTreeSpecies {
  priorityScore: number;
}

const IUCN_WEIGHTS: Record<IucnConservationStatus, number> = {
  CR: 100,
  EN: 75,
  VU: 50,
  NT: 25,
  LC: 10,
};

export function computeSpeciesPriorityScore(species: EndangeredTreeSpecies): number {
  const statusWeight = IUCN_WEIGHTS[species.iucnStatus] ?? 10;
  const impact = Math.max(0, Math.min(100, Number(species.ecologicalImpactScore) || 0));
  const stockBonus = species.availableSeedlings > 0 ? 15 : 0;
  return Math.round((statusWeight * 0.6 + impact * 0.4 + stockBonus) * 100) / 100;
}

export function rankEndangeredTreeSpecies(speciesList: EndangeredTreeSpecies[]): PrioritisedSpeciesEntry[] {
  return speciesList
    .map((sp) => ({
      ...sp,
      priorityScore: computeSpeciesPriorityScore(sp),
    }))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return a.speciesId.localeCompare(b.speciesId);
    });
}
