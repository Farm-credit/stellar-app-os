/**
 * Forest coverage tracker (per project area).
 *
 * Answers: "what percentage of this project's area has reached canopy
 * coverage, and how does that compare with the project's target?"
 *
 * Coverage snapshots are produced quarterly from satellite or drone imagery.
 * This module is deliberately pure (no I/O): it turns a project's raw
 * snapshots + target threshold into the numbers the project page renders.
 *
 * Closes #1653
 */

import { coveragePercent, type CanopyDataSource } from '@/lib/canopy/analytics';

/** Quarterly coverage readings come from satellite or drone imagery only. */
export type CoverageDataSource = Extract<CanopyDataSource, 'satellite' | 'drone'>;

export interface CoverageSnapshot {
  /** ISO date (YYYY-MM-DD) the imagery was captured. */
  date: string;
  source: CoverageDataSource;
  /** Total project area in hectares. */
  projectAreaHa: number;
  /** Area of the project covered by canopy, in hectares. */
  canopyAreaHa: number;
}

export interface ProjectCoverageRecord {
  projectId: string;
  /** Target canopy coverage threshold for this project, percent of area (0 < n <= 100). */
  targetCoveragePercent: number;
  snapshots: CoverageSnapshot[];
}

export interface CoverageTrendPoint {
  date: string;
  /** Sortable quarter key, e.g. `2026-Q3`. */
  quarter: string;
  /** Human label, e.g. `Q3 2026`. */
  quarterLabel: string;
  source: CoverageDataSource;
  /** Percent of project area with canopy (0-100). */
  coveragePercent: number;
  canopyAreaHa: number;
}

export interface ProjectCoverageSummary {
  projectId: string;
  targetCoveragePercent: number;
  /** False when the project has no usable snapshots yet. */
  hasData: boolean;
  /** Most recent quarterly reading, or null when there is no data. */
  latest: CoverageTrendPoint | null;
  /** One point per quarter, oldest first. */
  trend: CoverageTrendPoint[];
  /** True when the latest reading has reached the target. */
  targetMet: boolean;
  /** Percentage points still needed to reach the target (0 once met). */
  gapPercentagePoints: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** A target must be a percentage greater than 0 and at most 100. */
export function isValidCoverageTarget(target: number): boolean {
  return Number.isFinite(target) && target > 0 && target <= 100;
}

/**
 * Calendar quarter for an ISO date. Parsed from the string (not `Date`) so the
 * result never shifts with the viewer's timezone. Returns null for bad dates.
 */
export function quarterOf(isoDate: string): { key: string; label: string } | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const q = Math.ceil(month / 3);
  return { key: `${year}-Q${q}`, label: `Q${q} ${year}` };
}

function toTrendPoint(snapshot: CoverageSnapshot): CoverageTrendPoint | null {
  if (!(snapshot.projectAreaHa > 0) || !(snapshot.canopyAreaHa >= 0)) return null;
  const quarter = quarterOf(snapshot.date);
  if (!quarter) return null;
  return {
    date: snapshot.date,
    quarter: quarter.key,
    quarterLabel: quarter.label,
    source: snapshot.source,
    // Canopy can't exceed the project area; clamp so bad survey data can't show >100%.
    coveragePercent: Math.min(100, coveragePercent(snapshot)),
    canopyAreaHa: snapshot.canopyAreaHa,
  };
}

/**
 * Build the figures shown on the project page.
 *
 * - Invalid snapshots (non-positive area, bad date) are ignored.
 * - If a quarter has more than one snapshot, the most recent one wins, so the
 *   trend has exactly one point per quarter.
 * - Throws `RangeError` when the project's target is not in (0, 100]: a wrong
 *   target would silently mislabel a project as met / not met.
 */
export function buildProjectCoverageSummary(record: ProjectCoverageRecord): ProjectCoverageSummary {
  const target = record.targetCoveragePercent;
  if (!isValidCoverageTarget(target)) {
    throw new RangeError(
      `Invalid target coverage for project ${record.projectId}: ${target} (expected 0 < n <= 100)`
    );
  }

  const byQuarter = new Map<string, CoverageTrendPoint>();
  for (const snapshot of record.snapshots) {
    const point = toTrendPoint(snapshot);
    if (!point) continue;
    const existing = byQuarter.get(point.quarter);
    if (!existing || point.date > existing.date) byQuarter.set(point.quarter, point);
  }

  const trend = [...byQuarter.values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = trend.length > 0 ? trend[trend.length - 1] : null;
  const targetMet = latest !== null && latest.coveragePercent >= target;

  return {
    projectId: record.projectId,
    targetCoveragePercent: target,
    hasData: latest !== null,
    latest,
    trend,
    targetMet,
    gapPercentagePoints:
      latest === null ? target : targetMet ? 0 : round(target - latest.coveragePercent),
  };
}

/** `54.6` -> "54.6", `70` -> "70" (at most one decimal place). */
export function formatCoveragePercent(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}
