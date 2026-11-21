import {
  computeSpeciesPriorityScore,
  rankEndangeredTreeSpecies,
} from './endangeredSpeciesPrioritiser';

describe('endangeredSpeciesPrioritiser (#1642)', () => {
  it('assigns higher priority scores to Critically Endangered (CR) species with available seedlings', () => {
    const crScore = computeSpeciesPriorityScore({
      speciesId: 'SP-01',
      scientificName: 'Araucaria angustifolia',
      commonName: 'Parana Pine',
      iucnStatus: 'CR',
      availableSeedlings: 500,
      ecologicalImpactScore: 90,
    });
    const vuScore = computeSpeciesPriorityScore({
      speciesId: 'SP-02',
      scientificName: 'Swietenia macrophylla',
      commonName: 'Big-leaf Mahogany',
      iucnStatus: 'VU',
      availableSeedlings: 500,
      ecologicalImpactScore: 80,
    });
    expect(crScore).toBeGreaterThan(vuScore);
  });

  it('orders species deterministically by descending priorityScore then speciesId', () => {
    const ranked = rankEndangeredTreeSpecies([
      {
        speciesId: 'SP-02',
        scientificName: 'Swietenia macrophylla',
        commonName: 'Big-leaf Mahogany',
        iucnStatus: 'VU',
        availableSeedlings: 200,
        ecologicalImpactScore: 75,
      },
      {
        speciesId: 'SP-01',
        scientificName: 'Araucaria angustifolia',
        commonName: 'Parana Pine',
        iucnStatus: 'CR',
        availableSeedlings: 350,
        ecologicalImpactScore: 95,
      },
    ]);
    expect(ranked[0].speciesId).toBe('SP-01');
    expect(ranked[1].speciesId).toBe('SP-02');
  });
});
