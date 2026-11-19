import { describe, it, expect, vi } from 'vitest';
import { calculateChecksum, DEFAULT_SPECIES_CATALOG } from '../species-migration-runner';

describe('Species Migration Runner', () => {
  it('calculates reproducible sha256 checksums', () => {
    const checksum1 = calculateChecksum('CREATE TABLE test;');
    const checksum2 = calculateChecksum('CREATE TABLE test;');
    const checksum3 = calculateChecksum('CREATE TABLE test_diff;');

    expect(checksum1).toBe(checksum2);
    expect(checksum1).not.toBe(checksum3);
    expect(checksum1.length).toBe(64);
  });

  it('provides default species catalog entries with valid properties', () => {
    expect(DEFAULT_SPECIES_CATALOG.length).toBeGreaterThan(0);
    for (const species of DEFAULT_SPECIES_CATALOG) {
      expect(species.species_slug).toBeDefined();
      expect(species.name).toBeDefined();
      expect(species.co2_kg_per_year).toBeGreaterThan(0);
      expect(Array.isArray(species.native_regions)).toBe(true);
    }
  });
});
