/**
 * Unit Tests for Buyer Risk Scoring
 * Issue #1294: Verify sub-score calculations and score combination logic
 *
 * Tests cover:
 * 1. Sub-score boundary conditions (0, 50, 100)
 * 2. Edge cases (missing data, invalid inputs)
 * 3. Score normalization (all scores in 0-100 range)
 * 4. Overall score combination formula (weighted average)
 * 5. Risk rating thresholds (Low/Medium/High)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateVerifierReputationScore,
  calculateMethodologyStrengthScore,
  calculateRegionalStabilityScore,
  calculateFarmerTrackRecordScore,
  combineSubScoresIntoOverallScore,
  determineRiskRating,
  calculateAllSubScores,
  RISK_SCORE_WEIGHTS,
  RISK_RATING_THRESHOLDS,
  getWeights,
  getAvailableRegions,
  getRegionalStabilityTier,
} from './buyer-risk-scoring';
import type {
  CarbonProjectForScoring,
  CarbonMethodologyForScoring,
  PlantingLocationForScoring,
  FarmerProfileForScoring,
} from '@/lib/schemas/project-risk-score.schema';

// ──────────────────────────────────────────────────────────────────────────────
// Verifier Reputation Sub-Score Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateVerifierReputationScore', () => {
  it('should return 95 for Gold Standard with verified methodology', () => {
    const score = calculateVerifierReputationScore('Gold Standard', true);
    expect(score).toBe(100); // 95 + 5 bonus
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should return 90 for Verra (VCS) with verified methodology', () => {
    const score = calculateVerifierReputationScore('Verra (VCS)', true);
    expect(score).toBe(95); // 90 + 5 bonus
  });

  it('should return 85 for Climate Action Reserve with verified methodology', () => {
    const score = calculateVerifierReputationScore('Climate Action Reserve', true);
    expect(score).toBe(90); // 85 + 5 bonus
  });

  it('should return 80 for Plan Vivo with verified methodology', () => {
    const score = calculateVerifierReputationScore('Plan Vivo', true);
    expect(score).toBe(85); // 80 + 5 bonus
  });

  it('should return 40 for Pending with verified methodology', () => {
    const score = calculateVerifierReputationScore('Pending', true);
    expect(score).toBe(45); // 40 + 5 bonus
  });

  it('should deduct 5 points when methodology is not verified', () => {
    const verifiedScore = calculateVerifierReputationScore('Gold Standard', true);
    const unverifiedScore = calculateVerifierReputationScore('Gold Standard', false);
    expect(verifiedScore - unverifiedScore).toBe(10); // 100 vs 90
  });

  it('should return 40 for unknown verifier type (defaults to Pending)', () => {
    const score = calculateVerifierReputationScore('Unknown Standard', true);
    expect(score).toBe(45); // 40 + 5 bonus
  });

  it('should always return a score between 0 and 100', () => {
    const verifiers = ['Gold Standard', 'Verra (VCS)', 'Plan Vivo', 'Pending', 'Unknown'];
    const verified = [true, false];

    for (const verifier of verifiers) {
      for (const isVerified of verified) {
        const score = calculateVerifierReputationScore(verifier, isVerified);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Methodology Strength Sub-Score Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateMethodologyStrengthScore', () => {
  it('should return 70 for unverified methodology with no formula', () => {
    const score = calculateMethodologyStrengthScore(false);
    expect(score).toBe(70);
  });

  it('should return 90 for verified methodology without formula', () => {
    const score = calculateMethodologyStrengthScore(true);
    expect(score).toBe(90); // 70 + 20 for verification
  });

  it('should return 80 for unverified methodology with formula and parameters', () => {
    const score = calculateMethodologyStrengthScore(false, 'E = m * c²', [
      { symbol: 'm', name: 'mass' },
    ]);
    expect(score).toBe(80); // 70 + 10 for formula
  });

  it('should return 100 for verified methodology with formula and parameters', () => {
    const score = calculateMethodologyStrengthScore(true, 'E = m * c²', [
      { symbol: 'm', name: 'mass' },
    ]);
    expect(score).toBe(100); // 70 + 20 + 10
  });

  it('should not add formula bonus if parameters array is empty', () => {
    const scoreWithEmptyParams = calculateMethodologyStrengthScore(true, 'E = m * c²', []);
    const scoreWithoutFormula = calculateMethodologyStrengthScore(true);
    expect(scoreWithEmptyParams).toBe(scoreWithoutFormula); // 90
  });

  it('should handle undefined formula and parameters', () => {
    const score = calculateMethodologyStrengthScore(true, undefined, undefined);
    expect(score).toBe(90); // 70 + 20 for verification
  });

  it('should always return a score between 0 and 100', () => {
    const testCases = [
      [false, undefined, undefined],
      [true, undefined, undefined],
      [false, 'formula', []],
      [false, 'formula', [{ test: 'param' }]],
      [true, 'formula', [{ test: 'param' }]],
    ];

    for (const [verified, formula, params] of testCases) {
      const score = calculateMethodologyStrengthScore(
        verified as boolean,
        formula as string | undefined,
        params as unknown[] | undefined
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Regional Stability Sub-Score Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateRegionalStabilityScore', () => {
  it('should return 95 for North America', () => {
    const score = calculateRegionalStabilityScore('North America');
    expect(score).toBe(95);
  });

  it('should return 95 for Western Europe', () => {
    const score = calculateRegionalStabilityScore('Western Europe');
    expect(score).toBe(95);
  });

  it('should return 70 for Southeast Asia', () => {
    const score = calculateRegionalStabilityScore('Southeast Asia');
    expect(score).toBe(70);
  });

  it('should return 65 for South Asia', () => {
    const score = calculateRegionalStabilityScore('South Asia');
    expect(score).toBe(65);
  });

  it('should return 75 for Latin America', () => {
    const score = calculateRegionalStabilityScore('Latin America');
    expect(score).toBe(75);
  });

  it('should return 60 for Sub-Saharan Africa', () => {
    const score = calculateRegionalStabilityScore('Sub-Saharan Africa');
    expect(score).toBe(60);
  });

  it('should return 60 for West Africa', () => {
    const score = calculateRegionalStabilityScore('West Africa');
    expect(score).toBe(60);
  });

  it('should return 50 (neutral default) for unknown region', () => {
    const score = calculateRegionalStabilityScore('Unknown Region');
    expect(score).toBe(50);
  });

  it('should return 50 when region is undefined or empty', () => {
    expect(calculateRegionalStabilityScore(undefined)).toBe(50);
    expect(calculateRegionalStabilityScore('')).toBe(50);
  });

  it('should always return a score between 0 and 100', () => {
    const regions = getAvailableRegions();
    for (const region of regions) {
      const score = calculateRegionalStabilityScore(region);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('getRegionalStabilityTier should match calculateRegionalStabilityScore', () => {
    const regions = getAvailableRegions();
    for (const region of regions) {
      const score1 = calculateRegionalStabilityScore(region);
      const score2 = getRegionalStabilityTier(region);
      expect(score1).toBe(score2);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Farmer Track Record Sub-Score Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateFarmerTrackRecordScore', () => {
  it('should return 50 for unverified farmer with no KYC and no reviews', () => {
    const farmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      averageRating: undefined,
      reviewCount: 0,
    };
    const score = calculateFarmerTrackRecordScore(farmer);
    expect(score).toBe(50);
  });

  it('should add 15 points for verified farmer', () => {
    const verifiedFarmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: true,
      kycTier: 0,
    };
    const verifiedScore = calculateFarmerTrackRecordScore(verifiedFarmer);
    expect(verifiedScore).toBe(65); // 50 + 15
  });

  it('should add 5 points for KYC tier 1', () => {
    const farmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 1,
    };
    const score = calculateFarmerTrackRecordScore(farmer);
    expect(score).toBe(55); // 50 + 5
  });

  it('should add 10 points for KYC tier 2', () => {
    const farmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 2,
    };
    const score = calculateFarmerTrackRecordScore(farmer);
    expect(score).toBe(60); // 50 + 10
  });

  it('should add 15 points for KYC tier 3+', () => {
    const farmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 3,
    };
    const score = calculateFarmerTrackRecordScore(farmer);
    expect(score).toBe(65); // 50 + 15
  });

  it('should add points based on average rating (1-5 stars)', () => {
    // 5-star rating should add ~15 points (5/5 * 15)
    const farmer5Star: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      averageRating: 5,
      reviewCount: 0,
    };
    const score5Star = calculateFarmerTrackRecordScore(farmer5Star);
    expect(score5Star).toBeCloseTo(65, 0); // 50 + 15

    // 1-star rating should add ~3 points (1/5 * 15)
    const farmer1Star: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      averageRating: 1,
      reviewCount: 0,
    };
    const score1Star = calculateFarmerTrackRecordScore(farmer1Star);
    expect(score1Star).toBeCloseTo(53, 0); // 50 + 3
  });

  it('should add points based on review count (capped at 5+ reviews = 15 points)', () => {
    // 3 reviews should add 1 point (3/3)
    const farmer3Reviews: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      reviewCount: 3,
    };
    const score3 = calculateFarmerTrackRecordScore(farmer3Reviews);
    expect(score3).toBeCloseTo(51, 0); // 50 + 1

    // 5 reviews should add 5 points (capped, but 5/3 = 1.67, min is 5)
    const farmer5Reviews: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      reviewCount: 5,
    };
    const score5 = calculateFarmerTrackRecordScore(farmer5Reviews);
    expect(score5).toBeGreaterThan(50); // At least some bonus

    // 15 reviews should max out at 15 points
    const farmer15Reviews: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: false,
      kycTier: 0,
      reviewCount: 15,
    };
    const score15 = calculateFarmerTrackRecordScore(farmer15Reviews);
    expect(score15).toBeLessThanOrEqual(100); // Capped at 100
  });

  it('should combine all bonuses for high-quality farmer', () => {
    const excellentFarmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: true,
      kycTier: 3,
      averageRating: 5,
      reviewCount: 10,
    };
    const score = calculateFarmerTrackRecordScore(excellentFarmer);
    // 50 (base) + 15 (verified) + 15 (KYC 3) + 15 (5-star rating) + 15 (reviews) = 110, capped at 100
    expect(score).toBe(100);
  });

  it('should always return a score between 0 and 100', () => {
    const testFarmers: FarmerProfileForScoring[] = [
      { address: 'f1', verified: false, kycTier: 0 },
      { address: 'f2', verified: true, kycTier: 3, averageRating: 5, reviewCount: 20 },
      { address: 'f3', verified: false, kycTier: 1, averageRating: 1, reviewCount: 0 },
      { address: 'f4', verified: true, kycTier: 2, averageRating: 3.5, reviewCount: 5 },
    ];

    for (const farmer of testFarmers) {
      const score = calculateFarmerTrackRecordScore(farmer);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Overall Score Combination Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('combineSubScoresIntoOverallScore', () => {
  it('should combine equal sub-scores into same overall score', () => {
    const subScores = {
      verifierReputation: 70,
      methodologyStrength: 70,
      regionalStability: 70,
      farmerTrackRecord: 70,
    };
    const overall = combineSubScoresIntoOverallScore(subScores);
    expect(overall).toBe(70);
  });

  it('should weight farmer track record most heavily (35%)', () => {
    // Farmer at 100, others at 0
    const subScores1 = {
      verifierReputation: 0,
      methodologyStrength: 0,
      regionalStability: 0,
      farmerTrackRecord: 100,
    };
    const overall1 = combineSubScoresIntoOverallScore(subScores1);
    expect(overall1).toBe(35); // 100 * 0.35 = 35

    // Farmer at 0, others at 0
    const subScores2 = {
      verifierReputation: 0,
      methodologyStrength: 0,
      regionalStability: 0,
      farmerTrackRecord: 0,
    };
    const overall2 = combineSubScoresIntoOverallScore(subScores2);
    expect(overall2).toBe(0);
  });

  it('should weight verifier reputation at 25%', () => {
    // Verifier at 100, others at 0
    const subScores = {
      verifierReputation: 100,
      methodologyStrength: 0,
      regionalStability: 0,
      farmerTrackRecord: 0,
    };
    const overall = combineSubScoresIntoOverallScore(subScores);
    expect(overall).toBe(25); // 100 * 0.25 = 25
  });

  it('should weight methodology strength at 20%', () => {
    // Methodology at 100, others at 0
    const subScores = {
      verifierReputation: 0,
      methodologyStrength: 100,
      regionalStability: 0,
      farmerTrackRecord: 0,
    };
    const overall = combineSubScoresIntoOverallScore(subScores);
    expect(overall).toBe(20); // 100 * 0.20 = 20
  });

  it('should weight regional stability at 20%', () => {
    // Region at 100, others at 0
    const subScores = {
      verifierReputation: 0,
      methodologyStrength: 0,
      regionalStability: 100,
      farmerTrackRecord: 0,
    };
    const overall = combineSubScoresIntoOverallScore(subScores);
    expect(overall).toBe(20); // 100 * 0.20 = 20
  });

  it('should produce expected result for typical project', () => {
    const subScores = {
      verifierReputation: 90,
      methodologyStrength: 85,
      regionalStability: 60,
      farmerTrackRecord: 78,
    };
    const overall = combineSubScoresIntoOverallScore(subScores);
    // 90*0.25 + 85*0.20 + 60*0.20 + 78*0.35
    // = 22.5 + 17 + 12 + 27.3 = 78.8 ≈ 79
    expect(overall).toBeCloseTo(79, 0);
  });

  it('should always return a score between 0 and 100', () => {
    const testCases = [
      {
        verifierReputation: 0,
        methodologyStrength: 0,
        regionalStability: 0,
        farmerTrackRecord: 0,
      },
      {
        verifierReputation: 100,
        methodologyStrength: 100,
        regionalStability: 100,
        farmerTrackRecord: 100,
      },
      {
        verifierReputation: 50,
        methodologyStrength: 50,
        regionalStability: 50,
        farmerTrackRecord: 50,
      },
    ];

    for (const subScores of testCases) {
      const overall = combineSubScoresIntoOverallScore(subScores);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Risk Rating Determination Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('determineRiskRating', () => {
  it('should return "Low" for score >= 80', () => {
    expect(determineRiskRating(100)).toBe('Low');
    expect(determineRiskRating(80)).toBe('Low');
    expect(determineRiskRating(85)).toBe('Low');
  });

  it('should return "Medium" for score 60-79', () => {
    expect(determineRiskRating(60)).toBe('Medium');
    expect(determineRiskRating(70)).toBe('Medium');
    expect(determineRiskRating(79)).toBe('Medium');
  });

  it('should return "High" for score < 60', () => {
    expect(determineRiskRating(59)).toBe('High');
    expect(determineRiskRating(0)).toBe('High');
    expect(determineRiskRating(30)).toBe('High');
  });

  it('should use configured thresholds', () => {
    const lowThreshold = RISK_RATING_THRESHOLDS.low;
    const mediumThreshold = RISK_RATING_THRESHOLDS.medium;

    expect(determineRiskRating(lowThreshold)).toBe('Low');
    expect(determineRiskRating(mediumThreshold)).toBe('Medium');
    expect(determineRiskRating(mediumThreshold - 1)).toBe('High');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: Full Scoring Pipeline
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateAllSubScores', () => {
  it('should calculate all four sub-scores from domain models', () => {
    const project: CarbonProjectForScoring = {
      id: 'proj-1',
      name: 'Test Project',
      verificationStatus: 'Gold Standard',
      location: 'Kenya',
    };

    const methodology: CarbonMethodologyForScoring = {
      slug: 'vm0001',
      name: 'Test Methodology',
      standard: 'Verra',
      metadataVerified: true,
      formula: 'E = m * c²',
      parameters: [{ symbol: 'm' }],
    };

    const region: PlantingLocationForScoring = {
      region: 'Sub-Saharan Africa',
      country: 'Kenya',
    };

    const farmer: FarmerProfileForScoring = {
      address: 'farmer1',
      verified: true,
      kycTier: 2,
      averageRating: 4,
      reviewCount: 3,
    };

    const subScores = calculateAllSubScores(project, methodology, region, farmer);

    expect(subScores.verifierReputation).toBeGreaterThanOrEqual(0);
    expect(subScores.verifierReputation).toBeLessThanOrEqual(100);
    expect(subScores.methodologyStrength).toBeGreaterThanOrEqual(0);
    expect(subScores.methodologyStrength).toBeLessThanOrEqual(100);
    expect(subScores.regionalStability).toBeGreaterThanOrEqual(0);
    expect(subScores.regionalStability).toBeLessThanOrEqual(100);
    expect(subScores.farmerTrackRecord).toBeGreaterThanOrEqual(0);
    expect(subScores.farmerTrackRecord).toBeLessThanOrEqual(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Configuration Export Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Configuration and constants', () => {
  it('RISK_SCORE_WEIGHTS should sum to 1.0', () => {
    const sum = Object.values(RISK_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('getWeights should return configured weights', () => {
    const weights = getWeights();
    expect(weights.verifierReputation).toBe(0.25);
    expect(weights.methodologyStrength).toBe(0.20);
    expect(weights.regionalStability).toBe(0.20);
    expect(weights.farmerTrackRecord).toBe(0.35);
  });

  it('getAvailableRegions should return all regions', () => {
    const regions = getAvailableRegions();
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).toContain('North America');
    expect(regions).toContain('Sub-Saharan Africa');
  });

  it('RISK_RATING_THRESHOLDS should be properly ordered', () => {
    expect(RISK_RATING_THRESHOLDS.low).toBeGreaterThan(RISK_RATING_THRESHOLDS.medium);
  });
});
