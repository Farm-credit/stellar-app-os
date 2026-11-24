// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Compare Selection
 * Issue #1658: let sponsors compare up to three reforestation projects from the
 * project cards, in a modal, with a shareable URL.
 *
 * Pure helpers (selection cap, URL round trip, metric definitions) so they can be
 * tested without a DOM. The offering data itself comes from
 * `@/lib/treeSponsorshipComparison`; nothing here duplicates it.
 */

import {
  formatSponsorshipMetric,
  getTreeSponsorshipOfferingById,
  type TreeSponsorshipOffering,
} from '@/lib/treeSponsorshipComparison';

/** Sponsors can compare at most three projects at once. */
export const MAX_COMPARE_MODAL_PROJECTS = 3;
/** A comparison needs at least two projects to be meaningful. */
export const MIN_COMPARE_MODAL_PROJECTS = 2;

/** Query parameters used by the share link. */
export const COMPARE_IDS_PARAM = 'compare';
export const COMPARE_OPEN_PARAM = 'compareOpen';

/** Page the share link points at (the project cards live here). */
export const COMPARE_PATH = '/projects';

export type CompareMetricId = 'survivalRate' | 'costPerTree' | 'speciesDiversity' | 'co2PerTree';

export interface CompareMetric {
  id: CompareMetricId;
  label: string;
  description: string;
  /** Which direction is better, used to highlight the best project per row. */
  better: 'higher' | 'lower';
  value: (offering: TreeSponsorshipOffering) => number;
  format: (offering: TreeSponsorshipOffering) => string;
}

export interface CompareSelection {
  ids: string[];
  open: boolean;
}

/** Number of distinct tree species in a project's mix (primary + secondary). */
export function getSpeciesDiversity(offering: TreeSponsorshipOffering): number {
  const species = [offering.species, ...(offering.secondarySpecies ?? [])]
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return new Set(species).size;
}

export const COMPARE_METRICS: readonly CompareMetric[] = [
  {
    id: 'survivalRate',
    label: 'Survival rate',
    description: '6-month oracle-verified tree survival',
    better: 'higher',
    value: (offering) => offering.survivalRate,
    format: (offering) => formatSponsorshipMetric(offering, 'survivalRate'),
  },
  {
    id: 'costPerTree',
    label: 'Cost per tree',
    description: 'Sponsorship contribution per tree',
    better: 'lower',
    value: (offering) => offering.cost,
    format: (offering) => formatSponsorshipMetric(offering, 'cost'),
  },
  {
    id: 'speciesDiversity',
    label: 'Species diversity',
    description: 'Distinct tree species in the planting mix',
    better: 'higher',
    value: (offering) => getSpeciesDiversity(offering),
    format: (offering) => `${getSpeciesDiversity(offering)} species`,
  },
  {
    id: 'co2PerTree',
    label: 'CO₂ per tree',
    description: 'Estimated carbon absorbed per tree per year',
    better: 'higher',
    value: (offering) => offering.co2,
    format: (offering) => formatSponsorshipMetric(offering, 'co2'),
  },
] as const;

/**
 * Cleans a list of project ids: trims, drops blanks and duplicates, drops ids that
 * have no comparable offering, and caps the list at MAX_COMPARE_MODAL_PROJECTS.
 */
export function normalizeCompareIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of ids) {
    const offering = getTreeSponsorshipOfferingById(raw);
    if (!offering || seen.has(offering.id)) continue;
    seen.add(offering.id);
    normalized.push(offering.id);
    if (normalized.length === MAX_COMPARE_MODAL_PROJECTS) break;
  }

  return normalized;
}

/** True when the project has comparable data (so the card can show a Compare button). */
export function isComparable(projectId: string): boolean {
  return getTreeSponsorshipOfferingById(projectId) !== undefined;
}

/**
 * Adds the id when there is room, removes it when already selected, and leaves the
 * selection unchanged when the cap is reached.
 */
export function toggleCompareId(current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.filter((existing) => existing !== id);
  if (current.length >= MAX_COMPARE_MODAL_PROJECTS) return [...current];
  return [...current, id];
}

/** Resolves ids to offerings, preserving selection order and skipping unknown ids. */
export function resolveCompareOfferings(ids: readonly string[]): TreeSponsorshipOffering[] {
  return normalizeCompareIds(ids)
    .map((id) => getTreeSponsorshipOfferingById(id))
    .filter((offering): offering is TreeSponsorshipOffering => offering !== undefined);
}

/**
 * Ids of the project(s) with the best value for a metric. Returns an empty list when
 * there is nothing to compare or every project ties.
 */
export function getBestProjectIds(
  offerings: readonly TreeSponsorshipOffering[],
  metric: CompareMetric
): string[] {
  if (offerings.length < MIN_COMPARE_MODAL_PROJECTS) return [];

  const values = offerings.map((offering) => metric.value(offering));
  const best = metric.better === 'higher' ? Math.max(...values) : Math.min(...values);
  if (values.every((value) => value === best)) return [];

  return offerings.filter((offering) => metric.value(offering) === best).map((o) => o.id);
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search;
}

/**
 * Reads a shared comparison out of a query string. Unknown or excess ids are dropped,
 * and the modal only reopens when there are enough projects to compare.
 */
export function parseCompareParams(search: string | URLSearchParams): CompareSelection {
  const params = toSearchParams(search);
  const rawIds = (params.get(COMPARE_IDS_PARAM) ?? '').split(',');
  const ids = normalizeCompareIds(rawIds);

  return {
    ids,
    open: params.get(COMPARE_OPEN_PARAM) === '1' && ids.length >= MIN_COMPARE_MODAL_PROJECTS,
  };
}

/**
 * Absolute shareable URL for a selection. `origin` defaults to the current window
 * origin and is passed explicitly by tests and server code.
 */
export function buildCompareUrl(
  ids: readonly string[],
  origin?: string,
  path: string = COMPARE_PATH
): string {
  const resolvedOrigin = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const normalized = normalizeCompareIds(ids);
  if (normalized.length === 0) return `${resolvedOrigin}${path}`;

  const params = new URLSearchParams();
  params.set(COMPARE_IDS_PARAM, normalized.join(','));
  params.set(COMPARE_OPEN_PARAM, '1');

  return `${resolvedOrigin}${path}?${params.toString()}`;
}
