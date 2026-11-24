import { describe, expect, it } from 'vitest';
import {
  calculateSocialImpactScore,
  calculateTreesScore,
  calculateSpeciesScore,
  calculateGeographicScore,
  calculateEngagementScore,
  resolveImpactTier,
  getSponsorSocialImpactScore,
  MAX_IMPACT_SCORE,
  MAX_TREES_SCORE,
  MAX_SPECIES_SCORE,
  MAX_GEOGRAPHIC_SCORE,
  MAX_ENGAGEMENT_SCORE,
} from '../social-impact-score';
import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';

describe('Social Impact Score Engine', () => {
  describe('calculateTreesScore', () => {
    it('returns 0 for non-positive or invalid trees', () => {
      expect(calculateTreesScore(0)).toBe(0);
      expect(calculateTreesScore(-10)).toBe(0);
      expect(calculateTreesScore(Number.NaN)).toBe(0);
    });

    it('scales progressively with diminishing returns', () => {
      const score1 = calculateTreesScore(1);
      const score50 = calculateTreesScore(50);
      const score100 = calculateTreesScore(100);
      const score250 = calculateTreesScore(250);

      expect(score1).toBeGreaterThan(0);
      expect(score50).toBeGreaterThan(score1);
      expect(score100).toBeGreaterThan(score50);
      expect(score250).toBeGreaterThan(score100);
      expect(score250).toBeLessThan(MAX_TREES_SCORE);
    });

    it('caps at MAX_TREES_SCORE (350) for 500 or more trees', () => {
      expect(calculateTreesScore(500)).toBe(MAX_TREES_SCORE);
      expect(calculateTreesScore(1500)).toBe(MAX_TREES_SCORE);
    });
  });

  describe('calculateSpeciesScore', () => {
    it('returns 0 for 0 species', () => {
      expect(calculateSpeciesScore(0)).toBe(0);
      expect(calculateSpeciesScore(-2)).toBe(0);
    });

    it('awards 25 points per species up to 10', () => {
      expect(calculateSpeciesScore(1)).toBe(25);
      expect(calculateSpeciesScore(4)).toBe(100);
      expect(calculateSpeciesScore(10)).toBe(MAX_SPECIES_SCORE);
    });

    it('caps at MAX_SPECIES_SCORE (250) for >10 species', () => {
      expect(calculateSpeciesScore(15)).toBe(MAX_SPECIES_SCORE);
    });
  });

  describe('calculateGeographicScore', () => {
    it('returns 0 for 0 regions', () => {
      expect(calculateGeographicScore(0)).toBe(0);
      expect(calculateGeographicScore(-1)).toBe(0);
    });

    it('awards 50 points per region up to 5', () => {
      expect(calculateGeographicScore(1)).toBe(50);
      expect(calculateGeographicScore(3)).toBe(150);
      expect(calculateGeographicScore(5)).toBe(MAX_GEOGRAPHIC_SCORE);
    });

    it('caps at MAX_GEOGRAPHIC_SCORE (250) for >5 regions', () => {
      expect(calculateGeographicScore(8)).toBe(MAX_GEOGRAPHIC_SCORE);
    });
  });

  describe('calculateEngagementScore', () => {
    it('handles explicit yearsInput', () => {
      expect(calculateEngagementScore(0).score).toBe(0);
      expect(calculateEngagementScore(1.5).score).toBe(75);
      expect(calculateEngagementScore(3).score).toBe(MAX_ENGAGEMENT_SCORE);
      expect(calculateEngagementScore(5).score).toBe(MAX_ENGAGEMENT_SCORE);
    });

    it('derives years from firstPlantedAt date relative to asOfDate', () => {
      const firstPlanted = new Date('2024-01-01T00:00:00Z');
      const asOf = new Date('2026-01-01T00:00:00Z'); // exactly ~2 years later
      const result = calculateEngagementScore(undefined, firstPlanted, asOf);
      expect(result.years).toBeCloseTo(2, 0);
      expect(result.score).toBe(100);
    });

    it('handles future or invalid dates safely', () => {
      const firstPlanted = new Date('2030-01-01T00:00:00Z');
      const asOf = new Date('2026-01-01T00:00:00Z');
      const result = calculateEngagementScore(undefined, firstPlanted, asOf);
      expect(result.years).toBe(0);
      expect(result.score).toBe(0);
    });
  });

  describe('resolveImpactTier', () => {
    it('assigns tiers appropriately across thresholds', () => {
      expect(resolveImpactTier(0).tier).toBe('Seedling');
      expect(resolveImpactTier(249).tier).toBe('Seedling');
      expect(resolveImpactTier(250).tier).toBe('Canopy Guardian');
      expect(resolveImpactTier(499).tier).toBe('Canopy Guardian');
      expect(resolveImpactTier(500).tier).toBe('Forest Champion');
      expect(resolveImpactTier(749).tier).toBe('Forest Champion');
      expect(resolveImpactTier(750).tier).toBe('Biosphere Legend');
      expect(resolveImpactTier(1000).tier).toBe('Biosphere Legend');
    });
  });

  describe('calculateSocialImpactScore (aggregate)', () => {
    it('calculates score out of 1000 with detailed breakdown', () => {
      const result = calculateSocialImpactScore({
        treesFunded: 250,
        speciesCount: 6,
        regionsCount: 3,
        yearsOfEngagement: 2,
      });

      expect(result.maxScore).toBe(1000);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(MAX_IMPACT_SCORE);

      // Check all 4 factors exist with correct metadata
      expect(result.factors.treesFunded.maxScore).toBe(350);
      expect(result.factors.speciesDiversity.score).toBe(150);
      expect(result.factors.geographicSpread.score).toBe(150);
      expect(result.factors.yearsOfEngagement.score).toBe(100);

      // Check sum matches
      const expectedTotal =
        result.factors.treesFunded.score +
        result.factors.speciesDiversity.score +
        result.factors.geographicSpread.score +
        result.factors.yearsOfEngagement.score;
      expect(result.totalScore).toBe(expectedTotal);

      // Check tips provided
      expect(result.tips.length).toBeGreaterThan(0);
    });

    it('returns perfect 1000 when all criteria are maximized', () => {
      const result = calculateSocialImpactScore({
        treesFunded: 1000,
        speciesCount: 20,
        regionsCount: 10,
        yearsOfEngagement: 4,
      });

      expect(result.totalScore).toBe(1000);
      expect(result.tier).toBe('Biosphere Legend');
      expect(result.factors.treesFunded.score).toBe(350);
      expect(result.factors.speciesDiversity.score).toBe(250);
      expect(result.factors.geographicSpread.score).toBe(250);
      expect(result.factors.yearsOfEngagement.score).toBe(150);
      expect(result.tips[0]).toContain('Outstanding work');
    });

    it('returns 0 score safely for zero or missing input', () => {
      const result = calculateSocialImpactScore({
        treesFunded: 0,
        speciesCount: 0,
        regionsCount: 0,
      });

      expect(result.totalScore).toBe(0);
      expect(result.tier).toBe('Seedling');
      expect(result.factors.treesFunded.score).toBe(0);
      expect(result.factors.speciesDiversity.score).toBe(0);
      expect(result.factors.geographicSpread.score).toBe(0);
      expect(result.factors.yearsOfEngagement.score).toBe(0);
    });
  });

  describe('getSponsorSocialImpactScore', () => {
    it('returns null for unknown sponsor address', () => {
      expect(getSponsorSocialImpactScore('unknown-sponsor-address')).toBeNull();
    });

    it('returns populated social impact score for known mock sponsor', () => {
      const sponsor = mockAllTimeSponsors[0];
      const result = getSponsorSocialImpactScore(sponsor.address);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.totalScore).toBeGreaterThan(0);
        expect(result.maxScore).toBe(1000);
        expect(result.factors.treesFunded.rawValue).toBe(sponsor.totalTrees);
      }
    });
  });
});
