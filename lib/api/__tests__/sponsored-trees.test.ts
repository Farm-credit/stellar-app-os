import { describe, expect, it } from 'vitest';
import {
  fetchSponsoredTrees,
  isValidCoordinate,
  parsePlantingYear,
  isValidSpeciesFilter,
  isValidYearFilter,
} from '../sponsored-trees';

describe('sponsored-trees data service', () => {
  describe('isValidCoordinate', () => {
    it('accepts valid coordinates', () => {
      expect(isValidCoordinate(12.04, 8.48)).toBe(true);
      expect(isValidCoordinate(-1.27, 36.78)).toBe(true);
      expect(isValidCoordinate(0.01, -0.01)).toBe(true);
      expect(isValidCoordinate(-90, -180)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
    });

    it('rejects Null Island (0, 0)', () => {
      expect(isValidCoordinate(0, 0)).toBe(false);
    });

    it('rejects coordinates out of bounds', () => {
      expect(isValidCoordinate(91, 0)).toBe(false);
      expect(isValidCoordinate(-90.1, 0)).toBe(false);
      expect(isValidCoordinate(0, 180.1)).toBe(false);
      expect(isValidCoordinate(0, -181)).toBe(false);
    });

    it('rejects NaN or Infinity', () => {
      expect(isValidCoordinate(NaN, 10)).toBe(false);
      expect(isValidCoordinate(10, Infinity)).toBe(false);
      expect(isValidCoordinate(-Infinity, 10)).toBe(false);
    });
  });

  describe('parsePlantingYear', () => {
    it('extracts year from ISO date', () => {
      expect(parsePlantingYear('2024-03-12T08:00:00Z')).toBe(2024);
      expect(parsePlantingYear('2023-11-05T14:00:00Z')).toBe(2023);
    });

    it('returns null for undefined or invalid date string', () => {
      expect(parsePlantingYear(undefined)).toBeNull();
      expect(parsePlantingYear('')).toBeNull();
      expect(parsePlantingYear('invalid-date')).toBeNull();
    });

    it('returns null for unrealistic years', () => {
      expect(parsePlantingYear('1990-01-01T00:00:00Z')).toBeNull();
      expect(parsePlantingYear('2150-01-01T00:00:00Z')).toBeNull();
    });
  });

  describe('isValidSpeciesFilter & isValidYearFilter', () => {
    it('validates species filter', () => {
      expect(isValidSpeciesFilter('all', ['Teak', 'Moringa'])).toBe(true);
      expect(isValidSpeciesFilter('Teak', ['Teak', 'Moringa'])).toBe(true);
      expect(isValidSpeciesFilter('UnknownSpecies', ['Teak', 'Moringa'])).toBe(false);
    });

    it('validates year filter', () => {
      expect(isValidYearFilter(2024)).toBe(true);
      expect(isValidYearFilter('2024')).toBe(false);
      expect(isValidYearFilter(1999)).toBe(false);
      expect(isValidYearFilter(2024.5)).toBe(false);
    });
  });

  describe('fetchSponsoredTrees', () => {
    it('returns only sponsored trees with valid coordinates', () => {
      const response = fetchSponsoredTrees();
      expect(response.trees.length).toBeGreaterThan(0);

      // Verify every returned tree has a sponsorName, sponsorId, and valid coords
      for (const tree of response.trees) {
        expect(tree.sponsorName).toBeTruthy();
        expect(tree.sponsorId).toBeTruthy();
        expect(isValidCoordinate(tree.lat, tree.lng)).toBe(true);
      }

      // Check totalCount
      expect(response.totalCount).toBe(response.trees.length);
    });

    it('generates filter options matching the sponsored tree dataset', () => {
      const response = fetchSponsoredTrees();
      const { filterOptions } = response;

      expect(filterOptions.species.length).toBeGreaterThan(0);
      expect(filterOptions.plantingYears.length).toBeGreaterThan(0);
      expect(filterOptions.sponsors.length).toBeGreaterThan(0);

      // Verify all sponsors have id and name
      for (const sponsor of filterOptions.sponsors) {
        expect(sponsor.id).toBeTruthy();
        expect(sponsor.name).toBeTruthy();
      }
    });

    it('filters trees by species correctly', () => {
      const allResponse = fetchSponsoredTrees();
      const firstSpecies = allResponse.filterOptions.species[0];

      const filtered = fetchSponsoredTrees({
        species: firstSpecies,
        plantingYear: 'all',
        sponsor: 'all',
      });

      expect(filtered.trees.length).toBeGreaterThan(0);
      for (const tree of filtered.trees) {
        expect(tree.species).toBe(firstSpecies);
      }
    });

    it('filters trees by planting year correctly', () => {
      const allResponse = fetchSponsoredTrees();
      const firstYear = allResponse.filterOptions.plantingYears[0];

      const filtered = fetchSponsoredTrees({
        species: 'all',
        plantingYear: firstYear,
        sponsor: 'all',
      });

      expect(filtered.trees.length).toBeGreaterThan(0);
      for (const tree of filtered.trees) {
        expect(parsePlantingYear(tree.plantedAt)).toBe(firstYear);
      }
    });

    it('filters trees by sponsor correctly', () => {
      const allResponse = fetchSponsoredTrees();
      const firstSponsor = allResponse.filterOptions.sponsors[0];

      const filtered = fetchSponsoredTrees({
        species: 'all',
        plantingYear: 'all',
        sponsor: firstSponsor.id,
      });

      expect(filtered.trees.length).toBeGreaterThan(0);
      for (const tree of filtered.trees) {
        expect(tree.sponsorId).toBe(firstSponsor.id);
        expect(tree.sponsorName).toBe(firstSponsor.name);
      }
    });

    it('applies combined filters together (AND logic)', () => {
      const allResponse = fetchSponsoredTrees();
      const sampleTree = allResponse.trees[0];
      const year = parsePlantingYear(sampleTree.plantedAt);

      if (year !== null) {
        const filtered = fetchSponsoredTrees({
          species: sampleTree.species,
          plantingYear: year,
          sponsor: sampleTree.sponsorId,
        });

        expect(filtered.trees.length).toBeGreaterThan(0);
        for (const tree of filtered.trees) {
          expect(tree.species).toBe(sampleTree.species);
          expect(parsePlantingYear(tree.plantedAt)).toBe(year);
          expect(tree.sponsorId).toBe(sampleTree.sponsorId);
        }
      }
    });

    it('handles empty results gracefully when filters match nothing', () => {
      const filtered = fetchSponsoredTrees({
        species: 'all',
        plantingYear: 2099, // Unmatched year
        sponsor: 'all',
      });

      expect(filtered.trees).toEqual([]);
      expect(filtered.totalCount).toBe(0);
    });
  });
});
