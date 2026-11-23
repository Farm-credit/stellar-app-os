export interface EcosystemMetrics {
  survivalRate: number; // 0 to 100
  speciesDiversity: number; // 0 to 100 (from Shannon index)
  wildlifeSightings: number; // 0 to 100 (normalized sighting frequency)
  soilHealth: number; // 0 to 100
}

export interface EcosystemScoreResult {
  totalScore: number;
  breakdown: {
    label: string;
    value: number;
    weight: number;
    contribution: number;
  }[];
}

const WEIGHTS = {
  survivalRate: 0.35,
  speciesDiversity: 0.25,
  wildlifeSightings: 0.2,
  soilHealth: 0.2,
};

/**
 * Computes a composite Forest Ecosystem Health Score (0-100).
 * Weights: Survival (35%), Diversity (25%), Wildlife (20%), Soil (20%).
 */
export function calculateEcosystemScore(metrics: EcosystemMetrics): EcosystemScoreResult {
  // Ensure values are clamped between 0 and 100
  const safe = (val: number) => Math.min(100, Math.max(0, val));

  const survival = safe(metrics.survivalRate);
  const diversity = safe(metrics.speciesDiversity);
  const wildlife = safe(metrics.wildlifeSightings);
  const soil = safe(metrics.soilHealth);

  const survivalContrib = survival * WEIGHTS.survivalRate;
  const diversityContrib = diversity * WEIGHTS.speciesDiversity;
  const wildlifeContrib = wildlife * WEIGHTS.wildlifeSightings;
  const soilContrib = soil * WEIGHTS.soilHealth;

  const totalScore = Math.round(survivalContrib + diversityContrib + wildlifeContrib + soilContrib);

  return {
    totalScore,
    breakdown: [
      {
        label: 'Survival Rate',
        value: survival,
        weight: WEIGHTS.survivalRate * 100,
        contribution: survivalContrib,
      },
      {
        label: 'Species Diversity',
        value: diversity,
        weight: WEIGHTS.speciesDiversity * 100,
        contribution: diversityContrib,
      },
      {
        label: 'Wildlife Sightings',
        value: wildlife,
        weight: WEIGHTS.wildlifeSightings * 100,
        contribution: wildlifeContrib,
      },
      {
        label: 'Soil Health',
        value: soil,
        weight: WEIGHTS.soilHealth * 100,
        contribution: soilContrib,
      },
    ],
  };
}
