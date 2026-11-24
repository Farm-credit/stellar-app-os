import { describe, it, expect } from 'vitest';
import { loadMethodologyDataset } from '../dataset';
import { METHODOLOGY_CATEGORIES } from '../types';

const dataset = loadMethodologyDataset();

describe('carbon methodology dataset', () => {
  it('contains at least 50 methodologies', () => {
    expect(dataset.length).toBeGreaterThanOrEqual(50);
  });

  it.each(METHODOLOGY_CATEGORIES)('has at least 10 methodologies in %s', (category) => {
    expect(dataset.filter((m) => m.category === category).length).toBeGreaterThanOrEqual(10);
  });

  it('has unique slugs', () => {
    const slugs = dataset.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has unique parameter symbols within each methodology', () => {
    for (const m of dataset) {
      const symbols = m.parameters.map((p) => p.symbol);
      expect(new Set(symbols).size, `${m.slug} has duplicate parameter symbols`).toBe(
        symbols.length
      );
    }
  });

  it('never marks an entry verified without a source reference', () => {
    for (const m of dataset.filter((x) => x.metadataVerified)) {
      expect(m.sourceRef.length, m.slug).toBeGreaterThan(0);
    }
  });

  it('includes the platform default and known anchor methodologies', () => {
    const slugs = new Set(dataset.map((m) => m.slug));
    for (const expected of [
      'vm0047',
      'acm0002',
      'ams-iii-d',
      'vm0042',
      'fao-ipcc-tier1-species-rate',
    ]) {
      expect(slugs.has(expected), expected).toBe(true);
    }
  });
});
