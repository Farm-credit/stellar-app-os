import { describe, expect, it } from 'vitest';
import { TREE_SPECIES } from '@/lib/constants/species';
import {
  SPECIES_EDUCATION,
  getSpeciesPageData,
  speciesPathForName,
  speciesPathForSlug,
} from './education';

describe('species education content (#1681)', () => {
  it('has a page for every tree species', () => {
    for (const species of TREE_SPECIES) {
      expect(getSpeciesPageData(species.slug), species.slug).toBeDefined();
    }
    expect(SPECIES_EDUCATION).toHaveLength(TREE_SPECIES.length);
  });

  it('covers ecology, culture, threats, conservation and fun facts for each species', () => {
    for (const entry of SPECIES_EDUCATION) {
      expect(entry.ecology.length).toBeGreaterThan(0);
      expect(entry.culturalSignificance.length).toBeGreaterThan(0);
      expect(entry.threats.length).toBeGreaterThan(0);
      expect(entry.conservationNote.length).toBeGreaterThan(0);
      expect(entry.funFacts.length).toBeGreaterThan(0);
    }
  });

  it('provides a kid-friendly version of each page', () => {
    for (const entry of SPECIES_EDUCATION) {
      expect(entry.kids.headline.length).toBeGreaterThan(0);
      expect(entry.kids.funFacts.length).toBeGreaterThan(0);
      expect(entry.kids.activity.length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for an unknown slug', () => {
    expect(getSpeciesPageData('not-a-tree')).toBeUndefined();
  });

  it('builds /species/{slug} paths from slugs and display names', () => {
    expect(speciesPathForSlug('baobab')).toBe('/species/baobab');
    expect(speciesPathForSlug('baobab', true)).toBe('/species/baobab/kids');
    expect(speciesPathForName('African Mahogany')).toBe('/species/mahogany');
    expect(speciesPathForName('Unknown Tree')).toBeNull();
  });
});
