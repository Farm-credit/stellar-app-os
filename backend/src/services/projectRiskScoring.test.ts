// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Buyer Risk Scoring Tests
 * Issue #1418
 */

import {
  RISK_WEIGHTS,
  SAMPLE_PROJECT_RISK_INPUTS,
  calculateProjectRiskScore,
  findSampleProjectRiskInput,
  rankProjectsByRisk,
  ratingForRisk,
  scoreFarmerTrackRecord,
  scoreMethodologyStrength,
  scoreRegionalStability,
  scoreVerifierReputation,
  type ProjectRiskInput,
} from './projectRiskScoring';

const NOW = new Date('2026-01-01T00:00:00Z');

function sample(id: string): ProjectRiskInput {
  const input = findSampleProjectRiskInput(id);
  if (!input) throw new Error(`missing sample ${id}`);
  return structuredClone(input);
}

describe('Project risk scoring', () => {
  it('uses weights that sum to 1', () => {
    const total = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  describe('scoreVerifierReputation', () => {
    it('rewards accredited, experienced verifiers with clean records', () => {
      const strong = scoreVerifierReputation(sample('proj-001').verifier);
      expect(strong.score).toBeGreaterThanOrEqual(95);
    });

    it('penalises reversals and upheld disputes', () => {
      const verifier = sample('proj-001').verifier;
      const clean = scoreVerifierReputation(verifier).score;
      const dirty = scoreVerifierReputation({ ...verifier, reversalRate: 0.05, disputesUpheld: 2 });
      expect(dirty.score).toBeLessThan(clean);
      expect(dirty.factors.join(' ')).toMatch(/reversed/);
      expect(dirty.factors.join(' ')).toMatch(/upheld dispute/);
    });

    it('never drops below zero', () => {
      const result = scoreVerifierReputation({
        name: 'x',
        accreditations: [],
        yearsActive: 0,
        verificationsCompleted: 0,
        reversalRate: 1,
        disputesUpheld: 50,
      });
      expect(result.score).toBe(0);
    });
  });

  describe('scoreMethodologyStrength', () => {
    it('gives full marks to a complete Gold Standard methodology', () => {
      expect(scoreMethodologyStrength(sample('proj-001').methodology).score).toBe(100);
    });

    it('scores unverified credits low and explains why', () => {
      const result = scoreMethodologyStrength({
        standard: 'Unverified',
        permanenceYears: 5,
        bufferPoolShare: 0,
        hasThirdPartyMonitoring: false,
        additionalityTested: false,
        leakageAssessed: false,
      });
      expect(result.score).toBeLessThan(10);
      expect(result.factors).toContain('No independent monitoring');
      expect(result.factors).toContain('Leakage not assessed');
    });
  });

  describe('scoreRegionalStability', () => {
    it('maps the WGI range onto the political component', () => {
      const base = { country: 'X', region: 'Y', climateHazard: 0, landTenureSecurity: 1 };
      expect(scoreRegionalStability({ ...base, politicalStability: 2.5 }).score).toBe(100);
      expect(scoreRegionalStability({ ...base, politicalStability: -2.5 }).score).toBe(60);
    });

    it('flags hazard and tenure concerns', () => {
      const result = scoreRegionalStability(sample('proj-003').region);
      expect(result.factors.some((f) => f.includes('climate hazard'))).toBe(true);
      expect(result.factors).toContain('Insecure land tenure');
    });
  });

  describe('scoreFarmerTrackRecord', () => {
    it('reflects survival and delivery history', () => {
      const good = scoreFarmerTrackRecord(sample('proj-001').farmer);
      const poor = scoreFarmerTrackRecord(sample('proj-003').farmer);
      expect(good.score).toBeGreaterThan(poor.score);
      expect(poor.factors).toContain('First project on the platform');
    });
  });

  describe('ratingForRisk', () => {
    it('buckets risk scores', () => {
      expect(ratingForRisk(0)).toBe('Low');
      expect(ratingForRisk(33)).toBe('Low');
      expect(ratingForRisk(33.1)).toBe('Medium');
      expect(ratingForRisk(60)).toBe('Medium');
      expect(ratingForRisk(60.1)).toBe('High');
    });
  });

  describe('calculateProjectRiskScore', () => {
    it('combines pillars into a risk score that mirrors sustainability', () => {
      const result = calculateProjectRiskScore(sample('proj-001'), NOW);
      expect(result.pillars).toHaveLength(4);
      expect(result.riskScore + result.sustainabilityScore).toBeCloseTo(100, 5);
      expect(result.rating).toBe('Low');
      expect(result.calculatedAt).toBe(NOW.toISOString());
    });

    it('rates the weakest sample project as high risk', () => {
      const result = calculateProjectRiskScore(sample('proj-003'), NOW);
      expect(result.rating).toBe('High');
      expect(result.riskScore).toBeGreaterThan(60);
    });

    it('identifies the weakest pillar', () => {
      const input = sample('proj-001');
      input.farmer = {
        yearsFarming: 0,
        projectsCompleted: 0,
        averageSurvivalRate: 0.1,
        deliveryRatio: 0.1,
        complianceIncidents: 3,
      };
      expect(calculateProjectRiskScore(input, NOW).weakestPillar).toBe('farmerTrackRecord');
    });

    it('is deterministic', () => {
      const a = calculateProjectRiskScore(sample('proj-002'), NOW);
      const b = calculateProjectRiskScore(sample('proj-002'), NOW);
      expect(a).toEqual(b);
    });
  });

  describe('rankProjectsByRisk', () => {
    it('orders projects from lowest to highest risk', () => {
      const ranked = rankProjectsByRisk(SAMPLE_PROJECT_RISK_INPUTS, NOW);
      expect(ranked).toHaveLength(SAMPLE_PROJECT_RISK_INPUTS.length);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].riskScore).toBeGreaterThanOrEqual(ranked[i - 1].riskScore);
      }
      expect(ranked[0].projectId).toBe('proj-001');
      expect(ranked[ranked.length - 1].projectId).toBe('proj-003');
    });
  });
});
