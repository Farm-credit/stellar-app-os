export type PestPresence = 'none' | 'mild' | 'moderate' | 'severe';
export type WateringStatus = 'optimal' | 'adequate' | 'dry' | 'critical';
export type HealthStatus = 'healthy' | 'fair' | 'at_risk' | 'critical';

export interface HealthObservationInput {
  heightCm: number;
  pestPresence: PestPresence;
  wateringStatus: WateringStatus;
}

export interface HealthObservation extends HealthObservationInput {
  id: string;
  treeId: string;
  observedAt: string;
  observerName: string;
  notes?: string;
  healthScore: number;
  healthStatus: HealthStatus;
  syncedToSponsor: boolean;
}

export interface HealthScoreBreakdown {
  wateringScore: number;
  pestScore: number;
  growthScore: number;
}

export interface ComputedHealthScore {
  score: number;
  status: HealthStatus;
  breakdown: HealthScoreBreakdown;
}

const WATERING_SCORES: Record<WateringStatus, number> = {
  optimal: 100,
  adequate: 78,
  dry: 45,
  critical: 15,
};

const PEST_SCORES: Record<PestPresence, number> = {
  none: 100,
  mild: 75,
  moderate: 45,
  severe: 15,
};

export function getHealthStatus(score: number): HealthStatus {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

/**
 * Computes a 0-100 tree health score from a field observation.
 * Weights: Watering 40%, Pest presence 40%, Height/Growth vigor 20%.
 */
export function computeHealthScore(
  input: HealthObservationInput,
  previousHeightCm?: number
): ComputedHealthScore {
  const wateringScore = WATERING_SCORES[input.wateringStatus];
  const pestScore = PEST_SCORES[input.pestPresence];

  let growthScore = 75;
  if (input.heightCm <= 0) {
    growthScore = 0;
  } else if (typeof previousHeightCm === 'number' && previousHeightCm > 0) {
    const delta = input.heightCm - previousHeightCm;
    if (delta >= 5) {
      growthScore = 100;
    } else if (delta > 0) {
      growthScore = 88;
    } else if (delta === 0) {
      growthScore = 72;
    } else {
      growthScore = 45;
    }
  } else if (input.heightCm >= 120) {
    growthScore = 95;
  } else if (input.heightCm >= 60) {
    growthScore = 85;
  } else {
    growthScore = 75;
  }

  const rawScore = wateringScore * 0.4 + pestScore * 0.4 + growthScore * 0.2;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    score,
    status: getHealthStatus(score),
    breakdown: {
      wateringScore,
      pestScore,
      growthScore,
    },
  };
}
