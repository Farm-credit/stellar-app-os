/**
 * A yearly water assessment supplied by a project's hydrology or MRV source.
 * Values are reported in litres by the source; the UI does not derive them
 * from unrelated impact metrics.
 */
export interface WaterImpactAssessment {
  year: number;
  watershedProtectionLitres: number | null;
  estimatedGroundwaterRechargeLitres: number | null;
  protectedLitresPerYear: number | null;
  assessedAt: string;
  source: string;
}

export interface WaterImpactResponse {
  projectId: string;
  projectName: string;
  assessments: WaterImpactAssessment[];
  hasData: boolean;
}
