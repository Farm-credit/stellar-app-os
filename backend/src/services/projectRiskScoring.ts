// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Buyer Risk Scoring - Project Sustainability (v2)
 *
 * Issue #1418: Calculate a risk score for each project from four pillars:
 * - Verifier reputation
 * - Methodology strength
 * - Regional stability
 * - Farmer track record
 *
 * Every pillar produces a 0-100 *sustainability* score (higher is better).
 * The pillars are combined with fixed weights and the result is inverted into
 * a 0-100 *risk* score (higher is riskier) so buyers can rank projects.
 *
 * All functions are pure so the same inputs always produce the same score.
 */

export type RiskRating = 'Low' | 'Medium' | 'High';

export type RiskPillar =
  'verifierReputation' | 'methodologyStrength' | 'regionalStability' | 'farmerTrackRecord';

export type CarbonStandard =
  | 'Verra VCS'
  | 'Gold Standard'
  | 'Plan Vivo'
  | 'Climate Action Reserve'
  | 'American Carbon Registry'
  | 'Unverified';

export interface VerifierProfile {
  name: string;
  /** Accreditation bodies, e.g. "ISO 14065", "UNFCCC DOE", "ANAB". */
  accreditations: string[];
  yearsActive: number;
  verificationsCompleted: number;
  /** Share of verified credits later reversed or invalidated (0-1). */
  reversalRate: number;
  /** Disputes against the verifier that were upheld. */
  disputesUpheld: number;
}

export interface MethodologyProfile {
  standard: CarbonStandard;
  /** Committed permanence period in years. */
  permanenceYears: number;
  /** Share of credits held in a buffer pool against reversals (0-1). */
  bufferPoolShare: number;
  hasThirdPartyMonitoring: boolean;
  additionalityTested: boolean;
  leakageAssessed: boolean;
}

export interface RegionProfile {
  country: string;
  region: string;
  /** World Bank WGI political stability estimate, -2.5 (weak) to 2.5 (strong). */
  politicalStability: number;
  /** Exposure to drought, fire, flood and storms, 0 (none) to 1 (extreme). */
  climateHazard: number;
  /** Security of land tenure for the farmers, 0 (none) to 1 (fully secure). */
  landTenureSecurity: number;
}

export interface FarmerTrackRecord {
  yearsFarming: number;
  projectsCompleted: number;
  /** Average tree survival rate across past projects (0-1). */
  averageSurvivalRate: number;
  /** Delivered credits divided by committed credits on past projects. */
  deliveryRatio: number;
  complianceIncidents: number;
}

export interface ProjectRiskInput {
  projectId: string;
  projectName: string;
  verifier: VerifierProfile;
  methodology: MethodologyProfile;
  region: RegionProfile;
  farmer: FarmerTrackRecord;
}

export interface PillarScore {
  pillar: RiskPillar;
  /** 0-100, higher is more sustainable. */
  score: number;
  weight: number;
  /** Human-readable reasons behind the score, strongest signal first. */
  factors: string[];
}

export interface ProjectRiskScore {
  projectId: string;
  projectName: string;
  /** 0-100, higher is riskier. */
  riskScore: number;
  /** 0-100, higher is more sustainable (100 - riskScore). */
  sustainabilityScore: number;
  rating: RiskRating;
  pillars: PillarScore[];
  /** The pillar dragging the score down the most. */
  weakestPillar: RiskPillar;
  calculatedAt: string;
}

export const RISK_WEIGHTS: Readonly<Record<RiskPillar, number>> = Object.freeze({
  verifierReputation: 0.25,
  methodologyStrength: 0.3,
  regionalStability: 0.2,
  farmerTrackRecord: 0.25,
});

/** Risk scores at or below LOW are "Low"; at or below MEDIUM are "Medium". */
export const RISK_THRESHOLDS = Object.freeze({ low: 33, medium: 60 });

const STANDARD_BASE_SCORES: Readonly<Record<CarbonStandard, number>> = Object.freeze({
  'Gold Standard': 40,
  'Verra VCS': 36,
  'Climate Action Reserve': 34,
  'American Carbon Registry': 32,
  'Plan Vivo': 30,
  Unverified: 0,
});

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scoreVerifierReputation(verifier: VerifierProfile): PillarScore {
  const factors: string[] = [];

  const accreditation = Math.min(verifier.accreditations.length, 3) * 10;
  factors.push(
    verifier.accreditations.length > 0
      ? `Accredited by ${verifier.accreditations.join(', ')}`
      : 'No recognised accreditation'
  );

  const experience = Math.min(verifier.yearsActive, 10) * 2;
  const volume = Math.min(verifier.verificationsCompleted / 50, 1) * 20;
  if (verifier.yearsActive < 2) factors.push('Verifier has under two years of history');

  const reversalPenalty = Math.min(verifier.reversalRate * 400, 40);
  if (verifier.reversalRate > 0.02) {
    factors.push(`${round1(verifier.reversalRate * 100)}% of verified credits reversed`);
  }

  const disputePenalty = Math.min(verifier.disputesUpheld * 5, 20);
  if (verifier.disputesUpheld > 0) {
    factors.push(`${verifier.disputesUpheld} upheld dispute(s)`);
  }

  // 30 accreditation + 20 experience + 20 volume + 30 clean record = 100
  const score = clamp(accreditation + experience + volume + 30 - reversalPenalty - disputePenalty);

  return {
    pillar: 'verifierReputation',
    score: round1(score),
    weight: RISK_WEIGHTS.verifierReputation,
    factors,
  };
}

export function scoreMethodologyStrength(methodology: MethodologyProfile): PillarScore {
  const factors: string[] = [];

  let score = STANDARD_BASE_SCORES[methodology.standard] ?? 0;
  factors.push(
    methodology.standard === 'Unverified'
      ? 'Credits are not certified under a recognised standard'
      : `Certified under ${methodology.standard}`
  );

  // Permanence: 40 years or more earns the full 20 points.
  score += Math.min(methodology.permanenceYears / 40, 1) * 20;
  if (methodology.permanenceYears < 20) {
    factors.push(`Short permanence commitment (${methodology.permanenceYears} years)`);
  }

  // Buffer pools of 20% or more earn the full 10 points.
  score += Math.min(methodology.bufferPoolShare / 0.2, 1) * 10;
  if (methodology.bufferPoolShare < 0.1) factors.push('Buffer pool below 10%');

  if (methodology.hasThirdPartyMonitoring) score += 10;
  else factors.push('No independent monitoring');

  if (methodology.additionalityTested) score += 10;
  else factors.push('Additionality not demonstrated');

  if (methodology.leakageAssessed) score += 10;
  else factors.push('Leakage not assessed');

  return {
    pillar: 'methodologyStrength',
    score: round1(clamp(score)),
    weight: RISK_WEIGHTS.methodologyStrength,
    factors,
  };
}

export function scoreRegionalStability(region: RegionProfile): PillarScore {
  const factors: string[] = [];

  // Map WGI -2.5..2.5 onto 0..40.
  const political = ((clamp(region.politicalStability, -2.5, 2.5) + 2.5) / 5) * 40;
  if (region.politicalStability < -0.5) factors.push(`Political instability in ${region.country}`);

  const climate = (1 - clamp(region.climateHazard, 0, 1)) * 35;
  if (region.climateHazard > 0.5) factors.push(`High climate hazard exposure in ${region.region}`);

  const tenure = clamp(region.landTenureSecurity, 0, 1) * 25;
  if (region.landTenureSecurity < 0.5) factors.push('Insecure land tenure');

  if (factors.length === 0) factors.push(`${region.region}, ${region.country} is a stable region`);

  return {
    pillar: 'regionalStability',
    score: round1(clamp(political + climate + tenure)),
    weight: RISK_WEIGHTS.regionalStability,
    factors,
  };
}

export function scoreFarmerTrackRecord(farmer: FarmerTrackRecord): PillarScore {
  const factors: string[] = [];

  const experience = (Math.min(farmer.yearsFarming, 15) / 15) * 20;
  const history = (Math.min(farmer.projectsCompleted, 5) / 5) * 15;
  if (farmer.projectsCompleted === 0) factors.push('First project on the platform');

  const survival = clamp(farmer.averageSurvivalRate, 0, 1) * 35;
  factors.push(`${Math.round(farmer.averageSurvivalRate * 100)}% average tree survival`);

  const delivery = clamp(farmer.deliveryRatio, 0, 1) * 30;
  if (farmer.deliveryRatio < 0.9) {
    factors.push(`Delivered ${Math.round(farmer.deliveryRatio * 100)}% of committed credits`);
  }

  const incidentPenalty = Math.min(farmer.complianceIncidents * 10, 30);
  if (farmer.complianceIncidents > 0) {
    factors.push(`${farmer.complianceIncidents} compliance incident(s)`);
  }

  return {
    pillar: 'farmerTrackRecord',
    score: round1(clamp(experience + history + survival + delivery - incidentPenalty)),
    weight: RISK_WEIGHTS.farmerTrackRecord,
    factors,
  };
}

export function ratingForRisk(riskScore: number): RiskRating {
  if (riskScore <= RISK_THRESHOLDS.low) return 'Low';
  if (riskScore <= RISK_THRESHOLDS.medium) return 'Medium';
  return 'High';
}

export function calculateProjectRiskScore(
  input: ProjectRiskInput,
  now: Date = new Date()
): ProjectRiskScore {
  const pillars = [
    scoreVerifierReputation(input.verifier),
    scoreMethodologyStrength(input.methodology),
    scoreRegionalStability(input.region),
    scoreFarmerTrackRecord(input.farmer),
  ];

  const sustainability = pillars.reduce((sum, p) => sum + p.score * p.weight, 0);
  const riskScore = round1(clamp(100 - sustainability));

  const weakest = pillars.reduce((min, p) => (p.score < min.score ? p : min));

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    riskScore,
    sustainabilityScore: round1(100 - riskScore),
    rating: ratingForRisk(riskScore),
    pillars,
    weakestPillar: weakest.pillar,
    calculatedAt: now.toISOString(),
  };
}

/** Scores every project and orders them from lowest to highest risk. */
export function rankProjectsByRisk(
  inputs: ProjectRiskInput[],
  now: Date = new Date()
): ProjectRiskScore[] {
  return inputs
    .map((input) => calculateProjectRiskScore(input, now))
    .sort((a, b) => a.riskScore - b.riskScore || a.projectId.localeCompare(b.projectId));
}

/**
 * Reference project profiles used until the scoring inputs are sourced from
 * the verification and farmer registries.
 */
export const SAMPLE_PROJECT_RISK_INPUTS: ProjectRiskInput[] = [
  {
    projectId: 'proj-001',
    projectName: 'Kenya Highlands Agroforestry',
    verifier: {
      name: 'SCS Global Services',
      accreditations: ['ISO 14065', 'ANAB', 'UNFCCC DOE'],
      yearsActive: 18,
      verificationsCompleted: 420,
      reversalRate: 0.004,
      disputesUpheld: 0,
    },
    methodology: {
      standard: 'Gold Standard',
      permanenceYears: 50,
      bufferPoolShare: 0.2,
      hasThirdPartyMonitoring: true,
      additionalityTested: true,
      leakageAssessed: true,
    },
    region: {
      country: 'Kenya',
      region: 'Central Highlands',
      politicalStability: -0.3,
      climateHazard: 0.35,
      landTenureSecurity: 0.8,
    },
    farmer: {
      yearsFarming: 22,
      projectsCompleted: 6,
      averageSurvivalRate: 0.91,
      deliveryRatio: 0.98,
      complianceIncidents: 0,
    },
  },
  {
    projectId: 'proj-002',
    projectName: 'Amazon Riparian Restoration',
    verifier: {
      name: 'Aenor',
      accreditations: ['ISO 14065', 'UNFCCC DOE'],
      yearsActive: 9,
      verificationsCompleted: 140,
      reversalRate: 0.015,
      disputesUpheld: 1,
    },
    methodology: {
      standard: 'Verra VCS',
      permanenceYears: 40,
      bufferPoolShare: 0.15,
      hasThirdPartyMonitoring: true,
      additionalityTested: true,
      leakageAssessed: false,
    },
    region: {
      country: 'Brazil',
      region: 'Pará',
      politicalStability: -0.4,
      climateHazard: 0.55,
      landTenureSecurity: 0.45,
    },
    farmer: {
      yearsFarming: 8,
      projectsCompleted: 2,
      averageSurvivalRate: 0.78,
      deliveryRatio: 0.88,
      complianceIncidents: 0,
    },
  },
  {
    projectId: 'proj-003',
    projectName: 'Sahel Great Green Wall Plots',
    verifier: {
      name: 'Local Carbon Audit Co.',
      accreditations: [],
      yearsActive: 1,
      verificationsCompleted: 6,
      reversalRate: 0.06,
      disputesUpheld: 2,
    },
    methodology: {
      standard: 'Plan Vivo',
      permanenceYears: 15,
      bufferPoolShare: 0.05,
      hasThirdPartyMonitoring: false,
      additionalityTested: true,
      leakageAssessed: false,
    },
    region: {
      country: 'Niger',
      region: 'Tillabéri',
      politicalStability: -2.0,
      climateHazard: 0.85,
      landTenureSecurity: 0.3,
    },
    farmer: {
      yearsFarming: 3,
      projectsCompleted: 0,
      averageSurvivalRate: 0.55,
      deliveryRatio: 0.6,
      complianceIncidents: 1,
    },
  },
  {
    projectId: 'proj-004',
    projectName: 'Vietnam Mangrove Coast',
    verifier: {
      name: 'Bureau Veritas',
      accreditations: ['ISO 14065', 'UNFCCC DOE'],
      yearsActive: 14,
      verificationsCompleted: 260,
      reversalRate: 0.01,
      disputesUpheld: 0,
    },
    methodology: {
      standard: 'Verra VCS',
      permanenceYears: 30,
      bufferPoolShare: 0.12,
      hasThirdPartyMonitoring: true,
      additionalityTested: true,
      leakageAssessed: true,
    },
    region: {
      country: 'Vietnam',
      region: 'Mekong Delta',
      politicalStability: 0.2,
      climateHazard: 0.6,
      landTenureSecurity: 0.65,
    },
    farmer: {
      yearsFarming: 12,
      projectsCompleted: 3,
      averageSurvivalRate: 0.84,
      deliveryRatio: 0.93,
      complianceIncidents: 0,
    },
  },
];

export function findSampleProjectRiskInput(projectId: string): ProjectRiskInput | undefined {
  return SAMPLE_PROJECT_RISK_INPUTS.find((p) => p.projectId === projectId);
}
