// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Comparison export & share helpers
 * Issue #1354: compare offset projects side-by-side (v1).
 *
 * Pure functions for the two things a reviewer needs beyond the table itself —
 * a permalink that reopens the same comparison, and a CSV of it.  The parsing
 * and serialisation live here (not in the component) so they can be tested
 * without a DOM, and so the URL format stays the single contract shared with
 * `GET /api/comparison/export` (`?ids=…&cols=…`).
 *
 * `downloadFile` is the only browser-touching helper and no-ops outside the
 * browser.
 */

import {
  COMPARISON_CRITERION_IDS,
  DEFAULT_COMPARISON_CRITERIA,
  describeCriterionValue,
  criterionCellToText,
  getComparisonCriterion,
  normalizeComparisonCriteria,
  normalizeProjectIds,
  type ComparisonCriterionId,
  type Project,
} from '@/lib/projectComparison';

export interface ComparisonSelection {
  ids: string[];
  criteria: ComparisonCriterionId[];
}

/** Query parameters used by the comparison page and its share links. */
export const COMPARISON_IDS_PARAM = 'ids';
export const COMPARISON_COLUMNS_PARAM = 'cols';

/** Default route the share links point at. */
export const COMPARISON_PATH = '/projects/compare';

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search;
}

/**
 * Reads a selection out of a query string.  Unknown/invalid entries are
 * dropped rather than trusted: ids are capped at the comparison limit and
 * columns must be known criteria, falling back to the default columns.
 */
export function parseComparisonParams(search: string | URLSearchParams): ComparisonSelection {
  const params = toSearchParams(search);
  const ids = normalizeProjectIds(splitList(params.get(COMPARISON_IDS_PARAM)));
  const criteria = normalizeComparisonCriteria(splitList(params.get(COMPARISON_COLUMNS_PARAM)));

  return {
    ids,
    criteria: criteria.length > 0 ? criteria : [...DEFAULT_COMPARISON_CRITERIA],
  };
}

/** Serialises a selection into a query string (no leading `?`). */
export function buildComparisonSearch(selection: Partial<ComparisonSelection>): string {
  const params = new URLSearchParams();
  const ids = normalizeProjectIds(selection.ids ?? []);
  const criteria = normalizeComparisonCriteria((selection.criteria ?? []).map(String));

  if (ids.length > 0) params.set(COMPARISON_IDS_PARAM, ids.join(','));
  if (criteria.length > 0) params.set(COMPARISON_COLUMNS_PARAM, criteria.join(','));

  return params.toString();
}

/**
 * Absolute shareable URL for a selection.  `origin` defaults to the current
 * window origin and is passed explicitly by tests/server code.
 */
export function buildComparisonUrl(
  selection: Partial<ComparisonSelection>,
  origin?: string,
  path: string = COMPARISON_PATH
): string {
  const resolvedOrigin =
    origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const query = buildComparisonSearch(selection);

  return `${resolvedOrigin}${path}${query ? `?${query}` : ''}`;
}

/** RFC 4180 escaping. */
function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * CSV of the selected projects, one row per comparison column, using the same
 * cell descriptions as the on-screen table.
 */
export function toComparisonCsv(
  projects: readonly Project[],
  criteriaIds: readonly ComparisonCriterionId[] = DEFAULT_COMPARISON_CRITERIA
): string {
  const criteria = normalizeComparisonCriteria(criteriaIds.map(String));
  const columns = criteria.length > 0 ? criteria : [...DEFAULT_COMPARISON_CRITERIA];

  const header = ['criteria', ...projects.map((project) => project.name)].map(csvEscape);
  if (projects.length === 0) return header.join(',');

  const rows: string[] = [header.join(',')];

  for (const id of columns) {
    const label = getComparisonCriterion(id)?.label ?? id;
    const cells = projects.map((project) =>
      csvEscape(criterionCellToText(describeCriterionValue(project, id)))
    );
    rows.push([csvEscape(label), ...cells].join(','));
  }

  return rows.join('\r\n');
}

/** Filename for a comparison export, e.g. `comparison-proj-001-proj-004-2026-09-27.csv`. */
export function comparisonFileName(
  projectIds: readonly string[],
  exportedAt: Date = new Date()
): string {
  const ids = normalizeProjectIds(projectIds);
  const date = exportedAt.toISOString().slice(0, 10);
  return `comparison-${ids.length > 0 ? ids.join('-') : 'empty'}-${date}.csv`;
}

/** Triggers a client-side file download; no-op when there is no DOM. */
export function downloadFile(content: string, filename: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Every criterion id, exported for callers that build a column picker. */
export const ALL_COMPARISON_CRITERION_IDS = COMPARISON_CRITERION_IDS;
