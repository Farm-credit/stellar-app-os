/**
 * Annual Tree Census Service — Issue #1695
 *
 * Core domain service for field teams to submit annual census data,
 * parse CSV batches up to 10,000 trees, and automatically update
 * project-level survival rates and health stats on the platform.
 */

import type {
  CensusValidationResult,
  ProjectCensusStats,
  TreeCensusRow,
  TreeCensusSubmission,
  TreeHealthCause,
  TreeSurvivalStatus,
} from './types';

export const MAX_CENSUS_BATCH_SIZE = 10000;

// In-memory persistent stores for census data and project aggregated statistics
const submissions: TreeCensusSubmission[] = [];
const projectStatsMap = new Map<string, ProjectCensusStats>();

/**
 * Seed initial baseline project stats for known projects
 */
function getOrCreateProjectStats(projectId: string, projectName: string): ProjectCensusStats {
  let stats = projectStatsMap.get(projectId);
  if (!stats) {
    stats = {
      projectId,
      projectName,
      latestCensusYear: new Date().getFullYear(),
      totalCensusSubmissions: 0,
      currentSurvivalRate: 85.0,
      historicalSurvivalRates: [],
      averageHealthScore: 78.5,
      averageHeightCm: 145.0,
      lastUpdated: new Date().toISOString(),
    };
    projectStatsMap.set(projectId, stats);
  }
  return stats;
}

/**
 * Parses and validates CSV string for up to 10,000 trees.
 * Supports headers like: tree_id, species, status, height_cm, health_score, cause, notes
 */
export function parseCensusCsv(csvContent: string): CensusValidationResult {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return {
      valid: false,
      totalParsed: 0,
      errors: [{ row: 1, field: 'csv', message: 'CSV file must contain a header row and at least one data row.' }],
      previewRows: [],
    };
  }

  // Parse header
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));

  const treeIdIdx = headers.findIndex((h) => h === 'tree_id' || h === 'treeid' || h === 'id');
  const speciesIdx = headers.findIndex((h) => h === 'species');
  const statusIdx = headers.findIndex((h) => h === 'status' || h === 'survival' || h === 'survival_status');
  const heightIdx = headers.findIndex((h) => h === 'height_cm' || h === 'height' || h === 'heightcm');
  const healthIdx = headers.findIndex((h) => h === 'health_score' || h === 'health' || h === 'healthscore');
  const causeIdx = headers.findIndex((h) => h === 'cause' || h === 'health_cause');
  const notesIdx = headers.findIndex((h) => h === 'notes' || h === 'note' || h === 'remediation');

  if (treeIdIdx === -1) {
    return {
      valid: false,
      totalParsed: 0,
      errors: [{ row: 1, field: 'tree_id', message: 'Missing required header column: tree_id' }],
      previewRows: [],
    };
  }

  const dataRows = lines.slice(1);
  if (dataRows.length > MAX_CENSUS_BATCH_SIZE) {
    return {
      valid: false,
      totalParsed: dataRows.length,
      errors: [
        {
          row: 0,
          field: 'batch_size',
          message: `Submission exceeds maximum allowed batch limit of ${MAX_CENSUS_BATCH_SIZE} trees (received ${dataRows.length}).`,
        },
      ],
      previewRows: [],
    };
  }

  const errors: Array<{ row: number; field: string; message: string }> = [];
  const parsedRows: TreeCensusRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2;
    const line = dataRows[i].trim();
    if (!line) continue;

    // Handle standard CSV split
    const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const rawTreeId = cols[treeIdIdx] ?? '';
    if (!rawTreeId) {
      errors.push({ row: rowNum, field: 'tree_id', message: 'Tree ID is required' });
      continue;
    }

    const rawSpecies = speciesIdx !== -1 && cols[speciesIdx] ? cols[speciesIdx] : 'Mixed Native';

    const rawStatus = statusIdx !== -1 && cols[statusIdx] ? cols[statusIdx].toLowerCase() : 'alive';
    let status: TreeSurvivalStatus = 'alive';
    if (rawStatus === 'dead' || rawStatus === '0' || rawStatus === 'false') {
      status = 'dead';
    }

    let heightCm = 0;
    if (heightIdx !== -1 && cols[heightIdx]) {
      const parsedH = Number.parseFloat(cols[heightIdx]);
      if (Number.isNaN(parsedH) || parsedH < 0) {
        errors.push({ row: rowNum, field: 'height_cm', message: 'Height must be a non-negative number' });
      } else {
        heightCm = parsedH;
      }
    }

    let healthScore = status === 'dead' ? 0 : 80;
    if (healthIdx !== -1 && cols[healthIdx]) {
      const parsedS = Number.parseFloat(cols[healthIdx]);
      if (Number.isNaN(parsedS) || parsedS < 0 || parsedS > 100) {
        errors.push({ row: rowNum, field: 'health_score', message: 'Health score must be between 0 and 100' });
      } else {
        healthScore = status === 'dead' ? 0 : parsedS;
      }
    }

    let cause: TreeHealthCause | null = null;
    if (causeIdx !== -1 && cols[causeIdx]) {
      const c = cols[causeIdx].toLowerCase().replace(/\s+/g, '_');
      if (['pest_damage', 'drought_stress', 'disease', 'other'].includes(c)) {
        cause = c as TreeHealthCause;
      }
    }

    const notes = notesIdx !== -1 && cols[notesIdx] ? cols[notesIdx] : null;

    parsedRows.push({
      treeId: rawTreeId,
      species: rawSpecies,
      status,
      heightCm,
      healthScore,
      cause,
      notes,
    });
  }

  return {
    valid: errors.length === 0,
    totalParsed: parsedRows.length,
    errors,
    previewRows: parsedRows,
  };
}

/**
 * Computes aggregates, updates platform state, and records the census submission.
 */
export async function submitCensusData(params: {
  projectId: string;
  projectName: string;
  censusYear: number;
  surveyorName: string;
  surveyorAgentId: string;
  records: TreeCensusRow[];
}): Promise<TreeCensusSubmission> {
  if (params.records.length === 0) {
    throw new Error('Census submission must include at least one tree record.');
  }

  if (params.records.length > MAX_CENSUS_BATCH_SIZE) {
    throw new Error(`Census submission exceeds maximum limit of ${MAX_CENSUS_BATCH_SIZE} trees.`);
  }

  const total = params.records.length;
  let aliveCount = 0;
  let totalHeight = 0;
  let totalHealth = 0;

  const distribution = {
    thriving: 0,
    moderate: 0,
    critical: 0,
    dead: 0,
  };

  const speciesMap = new Map<
    string,
    { total: number; alive: number; dead: number; heightSum: number; healthSum: number }
  >();

  for (const row of params.records) {
    const isAlive = row.status === 'alive';
    if (isAlive) {
      aliveCount++;
    } else {
      row.healthScore = 0;
    }

    totalHeight += row.heightCm;
    totalHealth += row.healthScore;

    // Distribution
    if (row.healthScore >= 80) {
      distribution.thriving++;
    } else if (row.healthScore >= 50) {
      distribution.moderate++;
    } else if (row.healthScore > 0) {
      distribution.critical++;
    } else {
      distribution.dead++;
    }

    // Species breakdown
    const sp = speciesMap.get(row.species) ?? { total: 0, alive: 0, dead: 0, heightSum: 0, healthSum: 0 };
    sp.total++;
    if (isAlive) sp.alive++;
    else sp.dead++;
    sp.heightSum += row.heightCm;
    sp.healthSum += row.healthScore;
    speciesMap.set(row.species, sp);

  }

  const deadCount = total - aliveCount;
  const survivalRate = Math.round((aliveCount / total) * 1000) / 10;
  const averageHeightCm = Math.round((totalHeight / total) * 10) / 10;
  const averageHealthScore = Math.round((totalHealth / total) * 10) / 10;

  const speciesBreakdown = Array.from(speciesMap.entries()).map(([species, sp]) => ({
    species,
    total: sp.total,
    alive: sp.alive,
    dead: sp.dead,
    survivalRate: sp.total > 0 ? Math.round((sp.alive / sp.total) * 1000) / 10 : 0,
    avgHeightCm: sp.total > 0 ? Math.round((sp.heightSum / sp.total) * 10) / 10 : 0,
    avgHealthScore: sp.total > 0 ? Math.round((sp.healthSum / sp.total) * 10) / 10 : 0,
  }));

  const submission: TreeCensusSubmission = {
    id: `census-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: params.projectId,
    projectName: params.projectName,
    censusYear: params.censusYear,
    surveyorName: params.surveyorName,
    surveyorAgentId: params.surveyorAgentId,
    submittedAt: new Date().toISOString(),
    totalTreesCounted: total,
    aliveCount,
    deadCount,
    survivalRate,
    averageHeightCm,
    averageHealthScore,
    healthDistribution: distribution,
    speciesBreakdown,
    records: params.records,
  };

  submissions.unshift(submission);

  // Auto-update project-level stats on platform
  const stats = getOrCreateProjectStats(params.projectId, params.projectName);
  stats.latestCensusYear = params.censusYear;
  stats.totalCensusSubmissions++;
  stats.currentSurvivalRate = survivalRate;
  stats.averageHealthScore = averageHealthScore;
  stats.averageHeightCm = averageHeightCm;
  stats.lastUpdated = new Date().toISOString();

  // Add to historical survival rates
  stats.historicalSurvivalRates.push({
    year: params.censusYear,
    survivalRate,
    totalTreesCounted: total,
  });

  return submission;
}

/**
 * Retrieves the updated project census stats and survival rates.
 */
export function getProjectCensusStats(projectId: string): ProjectCensusStats {
  return getOrCreateProjectStats(projectId, `Project ${projectId}`);
}

/**
 * Lists all census submissions.
 */
export function listCensusSubmissions(projectId?: string): TreeCensusSubmission[] {
  if (projectId) {
    return submissions.filter((s) => s.projectId === projectId);
  }
  return submissions;
}

/**
 * Clears in-memory submissions (for test isolation).
 */
export function resetCensusStore(): void {
  submissions.length = 0;
  projectStatsMap.clear();
}
