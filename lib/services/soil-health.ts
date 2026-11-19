// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Soil Health Scoring & Regenerative Agriculture Incentives Service — Issue #1386
 *
 * Calculate soil health improvement scores for regenerative farming practices.
 * Award bonus carbon credits for soil sequestration above baseline.
 */

export interface RegenerativePractices {
  noTill: boolean;
  coverCropping: boolean;
  cropRotation: boolean;
  compostApplication: boolean;
  rotationalGrazing: boolean;
  agroforestry: boolean;
}

export interface SoilMeasurementInput {
  plotId: string;
  farmerAddress: string;
  baselineSocBps: number; // e.g. 150 = 1.50%
  measuredSocBps: number; // e.g. 235 = 2.35%
  microbialBiomassPpm: number;
  bulkDensityScaled: number; // e.g. 125 = 1.25 g/cm³
  practiceScore: number; // 0..100
  practices?: RegenerativePractices;
  acres: number;
  verifierAddress: string;
}

export interface SoilHealthScoreResult {
  plotId: string;
  farmerAddress: string;
  socGainBps: number;
  socGainPercent: number;
  compositeScore: number; // 0..100
  sequestrationAboveBaselineGrams: number;
  sequestrationAboveBaselineTonnes: number;
  bonusCreditsGrams: number;
  bonusCreditsTonnes: number;
  bonusAwarded: boolean;
  practiceBreakdown: {
    socScore: number; // max 40
    practiceScore: number; // max 35
    microbialScore: number; // max 25
  };
  scoredAt: string;
}

/**
 * Calculate soil health score and bonus carbon credits for regenerative practices
 */
export function calculateSoilHealthScore(input: SoilMeasurementInput): SoilHealthScoreResult {
  const socGainBps = input.measuredSocBps - input.baselineSocBps;
  if (socGainBps <= 0) {
    throw new Error('Measured Soil Organic Carbon must exceed baseline to qualify for incentives');
  }

  // Component scoring
  const socScore = Math.min(40, Math.round(((Math.min(socGainBps, 100)) * 40) / 100));
  const practiceScore = Math.min(35, Math.round((Math.min(input.practiceScore, 100) * 35) / 100));
  const microbialScore = Math.min(25, Math.round((Math.min(input.microbialBiomassPpm, 500) * 25) / 500));
  const compositeScore = Math.min(100, socScore + practiceScore + microbialScore);

  // Agronomic soil mass calculation per acre (30cm layer)
  // 1 acre = 4046.86 m² * 0.3m = 1214 m³
  // soil mass = 1214 m³ * (bulkDensityScaled * 10) kg/m³
  const soilMassPerAcreKg = 12140 * input.bulkDensityScaled;
  const totalSoilMassKg = soilMassPerAcreKg * input.acres;

  // Carbon sequestered = total soil mass * (socGainBps / 10,000)
  const carbonSequesteredKg = (totalSoilMassKg * socGainBps) / 10000;

  // CO2 equivalent = carbon * 44 / 12 * 1000 grams
  const sequestrationAboveBaselineGrams = Math.round((carbonSequesteredKg * 44 * 1000) / 12);
  const sequestrationAboveBaselineTonnes = Math.round((sequestrationAboveBaselineGrams / 1_000_000) * 100) / 100;

  // Bonus incentive credits scaled by composite score
  const bonusCreditsGrams = Math.round((sequestrationAboveBaselineGrams * compositeScore) / 100);
  const bonusCreditsTonnes = Math.round((bonusCreditsGrams / 1_000_000) * 100) / 100;

  return {
    plotId: input.plotId,
    farmerAddress: input.farmerAddress,
    socGainBps,
    socGainPercent: Math.round((socGainBps / 100) * 100) / 100,
    compositeScore,
    sequestrationAboveBaselineGrams,
    sequestrationAboveBaselineTonnes,
    bonusCreditsGrams,
    bonusCreditsTonnes,
    bonusAwarded: false,
    practiceBreakdown: {
      socScore,
      practiceScore,
      microbialScore,
    },
    scoredAt: new Date().toISOString(),
  };
}
