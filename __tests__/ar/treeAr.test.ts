import { getARAssetForSpecies, TOP_20_AR_SPECIES } from '../../components/ar/arSpeciesData';

describe('AR Tree Visualisation Tests (#1668)', () => {
  it('contains exactly 20 top sponsored species with AR models', () => {
    expect(TOP_20_AR_SPECIES.length).toBe(20);
  });

  it('correctly resolves AR assets by name or scientific name', () => {
    const teak = getARAssetForSpecies('Teak');
    expect(teak).toBeDefined();
    expect(teak?.id).toBe('teak');
    expect(teak?.modelGlb).toContain('teak.glb');

    const baobab = getARAssetForSpecies('Adansonia digitata');
    expect(baobab).toBeDefined();
    expect(baobab?.id).toBe('baobab');
  });

  it('returns undefined for unsupported species', () => {
    const unknown = getARAssetForSpecies('NonExistentTreeSpecies123');
    expect(unknown).toBeUndefined();
  });
});
