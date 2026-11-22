import { describe, expect, it } from 'vitest';
import { TREE_SPECIES } from '@/lib/constants/species';
import {
  buildRedListUrl,
  getPrioritisedPlantingList,
  getSpeciesWithConservation,
  isPriorityCategory,
} from '../conservation';

describe('species conservation data', () => {
  it('covers every catalogue species', () => {
    expect(getSpeciesWithConservation()).toHaveLength(TREE_SPECIES.length);
  });

  it('flags only threatened categories as endangered', () => {
    expect(isPriorityCategory('CR')).toBe(true);
    expect(isPriorityCategory('EN')).toBe(true);
    expect(isPriorityCategory('VU')).toBe(true);
    expect(isPriorityCategory('NT')).toBe(false);
    expect(isPriorityCategory('LC')).toBe(false);
  });

  it('gives every endangered species a priority reason and Red List link', () => {
    const list = getPrioritisedPlantingList();
    expect(list.length).toBeGreaterThan(0);
    for (const species of list) {
      expect(species.priorityReason).toBeTruthy();
      expect(species.redListUrl).toMatch(/^https:\/\/www\.iucnredlist\.org\//);
    }
  });

  it('orders the planting list by urgency', () => {
    const categories = getPrioritisedPlantingList().map((s) => s.category);
    const order = ['CR', 'EN', 'VU'];
    const ranks = categories.map((c) => order.indexOf(c));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('url-encodes scientific names in Red List links', () => {
    expect(buildRedListUrl('Tectona grandis')).toContain('query=Tectona%20grandis');
  });
});
