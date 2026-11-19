export type ClimateLayerMetric = 'rainfall' | 'temperature' | 'conditions';

export type ClimateLayerTimeframe = 'comparison' | 'current' | 'historical';

export interface ProjectClimateMetrics {
  annualRainfallMm: number;
  meanTemperatureC: number;
  monthlyRainfallMm?: number[];
  monthlyTemperatureC?: number[];
}

export type PlantingMoistureStatus =
  'optimal' | 'adequate' | 'moderate_deficit' | 'severe_drought' | 'excess_rain';

export type PlantingThermalStatus = 'optimal' | 'mild_stress' | 'heat_stress' | 'frost_risk';

export type PlantingOverallCondition = 'Optimal' | 'Favorable' | 'Moderate Risk' | 'Challenging';

export interface PlantingConditionAssessment {
  overallCondition: PlantingOverallCondition;
  suitabilityScore: number; // 0-100
  moistureStatus: PlantingMoistureStatus;
  moistureDescription: string;
  thermalStatus: PlantingThermalStatus;
  thermalDescription: string;
  ecologicalSummary: string; // Tailored for ecologists
  sponsorSummary: string; // Tailored for sponsors
  recommendedPlantingWindow: string;
}

export interface ProjectClimateComparison {
  projectId: string;
  projectName: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  location: string;
  source: string; // Open meteorological API source
  historicalYearRange: string; // e.g. "1991–2020 (30-yr Normal)"
  currentYear: number; // e.g. 2026
  historical: ProjectClimateMetrics;
  current: ProjectClimateMetrics;
  comparison: {
    rainfallDeltaMm: number;
    rainfallDeltaPercent: number;
    temperatureDeltaC: number;
  };
  plantingConditions: PlantingConditionAssessment;
}

export interface ClimateComparisonApiResponse {
  source: string;
  timestamp: string;
  projects: ProjectClimateComparison[];
}
