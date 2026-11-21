/**
 * Tree Census Types — Issue #1695
 * Annual tree census data submission workflow for field teams.
 */

export type TreeHealthCause = 'pest_damage' | 'drought_stress' | 'disease' | 'other';
export type TreeSurvivalStatus = 'alive' | 'dead';

export interface TreeCensusRow {
  treeId: string;
  species: string;
  status: TreeSurvivalStatus;
  heightCm: number;
  /** Health score 0-100 (0 for dead trees). */
  healthScore: number;
  cause?: TreeHealthCause | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface TreeCensusSubmission {
  id: string;
  projectId: string;
  projectName: string;
  censusYear: number;
  surveyorName: string;
  surveyorAgentId: string;
  submittedAt: string;
  totalTreesCounted: number;
  aliveCount: number;
  deadCount: number;
  /** Percentage of trees surviving: (aliveCount / totalTreesCounted) * 100 */
  survivalRate: number;
  averageHeightCm: number;
  averageHealthScore: number;
  healthDistribution: {
    thriving: number; // 80-100
    moderate: number; // 50-79
    critical: number; // 1-49
    dead: number;     // 0
  };
  speciesBreakdown: Array<{
    species: string;
    total: number;
    alive: number;
    dead: number;
    survivalRate: number;
    avgHeightCm: number;
    avgHealthScore: number;
  }>;
  records: TreeCensusRow[];
}

export interface ProjectCensusStats {
  projectId: string;
  projectName: string;
  latestCensusYear: number;
  totalCensusSubmissions: number;
  currentSurvivalRate: number;
  historicalSurvivalRates: Array<{
    year: number;
    survivalRate: number;
    totalTreesCounted: number;
  }>;
  averageHealthScore: number;
  averageHeightCm: number;
  lastUpdated: string;
}

export interface CensusValidationResult {
  valid: boolean;
  totalParsed: number;
  errors: Array<{ row: number; field: string; message: string }>;
  previewRows: TreeCensusRow[];
}
