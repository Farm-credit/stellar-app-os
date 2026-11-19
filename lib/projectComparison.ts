// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project comparison domain layer
 * Issue #1354: compare offset projects side-by-side — price, co-benefits,
 * methodology, verifier, risk rating and buyer reviews.
 *
 * This module is framework-free: no JSX, no React import, no browser APIs, so
 * it can be imported from server components (`app/projects/compare/page.tsx`),
 * client components and unit tests alike.  Anything that needs to render (icons,
 * badges) is described here as a small typed descriptor — see
 * `describeCriterionValue` — and rendered by the UI.
 *
 * Data source: the shared carbon catalogue `lib/api/mock/carbonProjects.ts`
 * (the repo's `lib/api/mock/*` convention, also used by the credits comparison
 * tool) merged with the comparison metadata in
 * `lib/api/mock/projectComparisons.ts`.
 */

import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { mockProjectComparisonMetadata } from '@/lib/api/mock/projectComparisons';
import type { CarbonProject } from '@/lib/types/carbon';

// ── Domain types ──────────────────────────────────────────────────────────────

export type RiskRating = 'low' | 'medium' | 'high';

export type ProjectCurrency = 'USD' | 'EUR' | 'GBP';

export type CoBenefitCategory =
  | 'biodiversity'
  | 'community'
  | 'water'
  | 'soil'
  | 'climate_resilience'
  | 'gender_equality';

/** Icon descriptor — the UI maps these to lucide components. */
export type RiskIconName = 'check' | 'alert' | 'cross';
export type CoBenefitIconName = 'leaf' | 'users' | 'droplet' | 'sprout' | 'shield' | 'scale';

export interface ProjectCoBenefit {
  category: CoBenefitCategory;
  description: string;
  verified: boolean;
}

export interface BuyerReview {
  id: string;
  projectId: string;
  buyerName: string;
  buyerCompany?: string;
  /** 1–5 */
  rating: number;
  title: string;
  content: string;
  verified: boolean;
  createdAt: string;
}

/** Extra attributes that only side-by-side review needs. */
export interface ProjectComparisonMetadata {
  country: string;
  currency: ProjectCurrency;
  methodology: string;
  verifier: string;
  certification: string[];
  riskRating: RiskRating;
  totalCredits: number;
  coBenefits: ProjectCoBenefit[];
  buyerReviews: BuyerReview[];
}

/** A carbon project projected into the comparison view. */
export interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  location: string;
  country: string;
  methodology: string;
  verifier: string;
  certification: string[];
  pricePerTon: number;
  currency: ProjectCurrency;
  vintage: string;
  totalCredits: number;
  availableCredits: number;
  isOutOfStock: boolean;
  riskRating: RiskRating;
  coBenefits: ProjectCoBenefit[];
  buyerReviews: BuyerReview[];
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export type ComparisonCriterionId =
  | 'name'
  | 'location'
  | 'projectType'
  | 'methodology'
  | 'verifier'
  | 'certification'
  | 'pricePerTon'
  | 'vintage'
  | 'totalCredits'
  | 'availableCredits'
  | 'riskRating'
  | 'coBenefits'
  | 'buyerReviews';

export type CriterionKind =
  | 'text'
  | 'price'
  | 'risk'
  | 'tags'
  | 'benefits'
  | 'reviews'
  | 'credits';

export interface ComparisonCriteria {
  id: ComparisonCriterionId;
  label: string;
  kind: CriterionKind;
  sortable: boolean;
  defaultVisible: boolean;
}

export interface ProjectComparisonFilters {
  search?: string;
  projectType?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  riskRating?: RiskRating | '';
  verifier?: string;
}

export type SortDirection = 'asc' | 'desc';

/** What a single comparison cell should render. */
export type CriterionCell =
  | { kind: 'text'; text: string }
  | { kind: 'price'; amount: number; currency: ProjectCurrency }
  | { kind: 'risk'; rating: RiskRating }
  | { kind: 'tags'; tags: string[] }
  | { kind: 'benefits'; benefits: ProjectCoBenefit[] }
  | { kind: 'reviews'; average: number; count: number }
  | { kind: 'credits'; available: number; total: number };

// ── Limits & criteria ─────────────────────────────────────────────────────────

export const MIN_COMPARE_PROJECTS = 2;
export const MAX_COMPARE_PROJECTS = 5;

export const COMPARISON_CRITERIA: readonly ComparisonCriteria[] = [
  { id: 'name', label: 'Project Name', kind: 'text', sortable: true, defaultVisible: true },
  { id: 'location', label: 'Location', kind: 'text', sortable: true, defaultVisible: true },
  { id: 'projectType', label: 'Type', kind: 'text', sortable: true, defaultVisible: true },
  { id: 'methodology', label: 'Methodology', kind: 'text', sortable: false, defaultVisible: true },
  { id: 'verifier', label: 'Verifier', kind: 'text', sortable: true, defaultVisible: true },
  { id: 'certification', label: 'Certifications', kind: 'tags', sortable: false, defaultVisible: true },
  { id: 'pricePerTon', label: 'Price / Ton', kind: 'price', sortable: true, defaultVisible: true },
  { id: 'vintage', label: 'Vintage', kind: 'text', sortable: true, defaultVisible: false },
  { id: 'totalCredits', label: 'Total Credits', kind: 'credits', sortable: true, defaultVisible: false },
  { id: 'availableCredits', label: 'Available', kind: 'credits', sortable: true, defaultVisible: true },
  { id: 'riskRating', label: 'Risk Rating', kind: 'risk', sortable: true, defaultVisible: true },
  { id: 'coBenefits', label: 'Co-Benefits', kind: 'benefits', sortable: false, defaultVisible: true },
  { id: 'buyerReviews', label: 'Buyer Reviews', kind: 'reviews', sortable: false, defaultVisible: true },
];

export const COMPARISON_CRITERION_IDS: readonly ComparisonCriterionId[] =
  COMPARISON_CRITERIA.map((criterion) => criterion.id);

/** Columns shown before the user changes anything. */
export const DEFAULT_COMPARISON_CRITERIA: readonly ComparisonCriterionId[] =
  COMPARISON_CRITERIA.filter((criterion) => criterion.defaultVisible).map(
    (criterion) => criterion.id
  );

export function isComparisonCriterionId(value: unknown): value is ComparisonCriterionId {
  return (
    typeof value === 'string' &&
    (COMPARISON_CRITERION_IDS as readonly string[]).includes(value)
  );
}

export function getComparisonCriterion(
  id: ComparisonCriterionId
): ComparisonCriteria | undefined {
  return COMPARISON_CRITERIA.find((criterion) => criterion.id === id);
}

/** Keeps only known criteria, de-duplicated, preserving the canonical order. */
export function normalizeComparisonCriteria(ids: readonly string[]): ComparisonCriterionId[] {
  const wanted = new Set(ids.filter(isComparisonCriterionId));
  return COMPARISON_CRITERION_IDS.filter((id) => wanted.has(id));
}

/** De-duplicates ids, drops blanks and caps the selection at the UI limit. */
export function normalizeProjectIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length === MAX_COMPARE_PROJECTS) break;
  }
  return normalized;
}

// ── Formatting & presentation helpers (no JSX) ────────────────────────────────

export function formatPrice(price: number, currency: ProjectCurrency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function getAverageRating(reviews: readonly BuyerReview[]): number {
  if (reviews.length === 0) return 0;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

export function getRiskColor(rating: RiskRating): string {
  switch (rating) {
    case 'low':
      return 'bg-green-100 text-green-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'high':
      return 'bg-red-100 text-red-800';
  }
}

/** Same palette with a border, for card/badge contexts. */
export function getRiskBadgeColor(rating: RiskRating): string {
  switch (rating) {
    case 'low':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'high':
      return 'bg-red-100 text-red-800 border-red-200';
  }
}

export function getRiskIconName(rating: RiskRating): RiskIconName {
  switch (rating) {
    case 'low':
      return 'check';
    case 'medium':
      return 'alert';
    case 'high':
      return 'cross';
  }
}

const CO_BENEFIT_LABELS: Record<CoBenefitCategory, string> = {
  biodiversity: 'Biodiversity',
  community: 'Community',
  water: 'Water',
  soil: 'Soil',
  climate_resilience: 'Climate resilience',
  gender_equality: 'Gender equality',
};

export function getCoBenefitLabel(category: CoBenefitCategory): string {
  return CO_BENEFIT_LABELS[category];
}

export function getCoBenefitColor(category: CoBenefitCategory): string {
  switch (category) {
    case 'biodiversity':
      return 'bg-green-100 text-green-800';
    case 'community':
      return 'bg-blue-100 text-blue-800';
    case 'water':
      return 'bg-cyan-100 text-cyan-800';
    case 'soil':
      return 'bg-amber-100 text-amber-800';
    case 'climate_resilience':
      return 'bg-purple-100 text-purple-800';
    case 'gender_equality':
      return 'bg-pink-100 text-pink-800';
  }
}

export function getCoBenefitIconName(category: CoBenefitCategory): CoBenefitIconName {
  switch (category) {
    case 'biodiversity':
      return 'leaf';
    case 'community':
      return 'users';
    case 'water':
      return 'droplet';
    case 'soil':
      return 'sprout';
    case 'climate_resilience':
      return 'shield';
    case 'gender_equality':
      return 'scale';
  }
}

/** Free-text co-benefit labels (as stored on `CarbonProject`) → categories. */
export function inferCoBenefitCategory(label: string): CoBenefitCategory {
  const normalized = label.toLowerCase();
  if (normalized.includes('water') || normalized.includes('coastal')) return 'water';
  if (normalized.includes('soil')) return 'soil';
  if (normalized.includes('community') || normalized.includes('income')) return 'community';
  if (
    normalized.includes('job') ||
    normalized.includes('employ') ||
    normalized.includes('livelihood')
  ) {
    return 'community';
  }
  if (normalized.includes('energy') || normalized.includes('climate')) {
    return 'climate_resilience';
  }
  if (normalized.includes('gender') || normalized.includes('education')) return 'gender_equality';
  return 'biodiversity';
}

// ── Catalogue projection ──────────────────────────────────────────────────────

/** Used for catalogue entries that have no comparison metadata yet. */
const FALLBACK_RISK: RiskRating = 'medium';

function fallbackCountry(location: string): string {
  const parts = location.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : location.trim();
}

/** Projects a catalogue entry into the comparison `Project` shape. */
export function toProject(
  source: CarbonProject,
  metadata: ProjectComparisonMetadata | undefined = mockProjectComparisonMetadata[source.id]
): Project {
  const coBenefits: ProjectCoBenefit[] =
    metadata?.coBenefits ??
    source.coBenefits.map((label) => ({
      category: inferCoBenefitCategory(label),
      description: label,
      // The catalogue only lists benefits; it does not assert verification.
      verified: false,
    }));

  return {
    id: source.id,
    name: source.name,
    description: source.description,
    projectType: source.type,
    location: source.location,
    country: metadata?.country ?? fallbackCountry(source.location),
    methodology: metadata?.methodology ?? 'Not specified',
    verifier: metadata?.verifier ?? source.verificationStatus,
    certification: metadata?.certification ?? [source.verificationStatus],
    pricePerTon: source.pricePerTon,
    currency: metadata?.currency ?? 'USD',
    vintage: String(source.vintageYear),
    totalCredits: metadata?.totalCredits ?? 0,
    availableCredits: source.availableSupply,
    isOutOfStock: source.isOutOfStock,
    riskRating: metadata?.riskRating ?? FALLBACK_RISK,
    coBenefits,
    buyerReviews: metadata?.buyerReviews ?? [],
    images: [],
    createdAt: '',
    updatedAt: '',
  };
}

/** Every catalogue project, projected for comparison. */
export function getAllProjects(): Project[] {
  return mockCarbonProjects.map((project) => toProject(project));
}

export function getProjectById(id: string): Project | null {
  const source = mockCarbonProjects.find((project) => project.id === id);
  return source ? toProject(source) : null;
}

// ── Filtering, sorting, selection ─────────────────────────────────────────────

export function applyProjectFilters(
  projects: readonly Project[],
  filters: ProjectComparisonFilters = {}
): Project[] {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const minPrice = Number.isFinite(filters.minPrice) ? (filters.minPrice as number) : undefined;
  const maxPrice = Number.isFinite(filters.maxPrice) ? (filters.maxPrice as number) : undefined;

  return projects.filter((project) => {
    if (search) {
      const haystack = `${project.name} ${project.location} ${project.country} ${project.methodology} ${project.verifier}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.projectType && project.projectType !== filters.projectType) return false;
    if (filters.country && project.country !== filters.country) return false;
    if (filters.verifier && project.verifier !== filters.verifier) return false;
    if (filters.riskRating && project.riskRating !== filters.riskRating) return false;
    if (minPrice !== undefined && project.pricePerTon < minPrice) return false;
    if (maxPrice !== undefined && project.pricePerTon > maxPrice) return false;
    return true;
  });
}

/** Sortable value for a criterion, or `null` when it has no natural order. */
function sortableValue(project: Project, id: ComparisonCriterionId): string | number | null {
  switch (id) {
    case 'name':
      return project.name.toLowerCase();
    case 'location':
      return project.location.toLowerCase();
    case 'projectType':
      return project.projectType.toLowerCase();
    case 'verifier':
      return project.verifier.toLowerCase();
    case 'pricePerTon':
      return project.pricePerTon;
    case 'vintage':
      return project.vintage;
    case 'totalCredits':
      return project.totalCredits;
    case 'availableCredits':
      return project.availableCredits;
    case 'riskRating':
      return project.riskRating;
    default:
      return null;
  }
}

const RISK_ORDER: Record<RiskRating, number> = { low: 0, medium: 1, high: 2 };

export function applyProjectSort(
  projects: readonly Project[],
  id: ComparisonCriterionId,
  direction: SortDirection
): Project[] {
  const sorted = [...projects];

  sorted.sort((a, b) => {
    const left = sortableValue(a, id);
    const right = sortableValue(b, id);
    if (left === null || right === null) return 0;

    let comparison: number;
    if (id === 'riskRating') {
      comparison = RISK_ORDER[left as RiskRating] - RISK_ORDER[right as RiskRating];
    } else if (typeof left === 'number' && typeof right === 'number') {
      comparison = left - right;
    } else {
      comparison = String(left).localeCompare(String(right));
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/** All projects matching the filters, in the requested sort order. */
export function getProjects(
  filters: ProjectComparisonFilters = {},
  sort?: { id: ComparisonCriterionId; direction: SortDirection }
): Project[] {
  const filtered = applyProjectFilters(getAllProjects(), filters);
  return sort ? applyProjectSort(filtered, sort.id, sort.direction) : filtered;
}

/**
 * Resolves a selection of project ids into projects, preserving the order the
 * user picked them and capping the list at `MAX_COMPARE_PROJECTS`.
 */
export function getComparisonProjects(ids: readonly string[]): Project[] {
  const selected = normalizeProjectIds(ids);
  return selected
    .map((id) => getProjectById(id))
    .filter((project): project is Project => project !== null);
}

// ── Cell descriptions (rendered by the UI, serialised by the CSV export) ──────

export function describeCriterionValue(
  project: Project,
  id: ComparisonCriterionId
): CriterionCell {
  switch (id) {
    case 'pricePerTon':
      return { kind: 'price', amount: project.pricePerTon, currency: project.currency };
    case 'riskRating':
      return { kind: 'risk', rating: project.riskRating };
    case 'certification':
      return { kind: 'tags', tags: project.certification };
    case 'coBenefits':
      return { kind: 'benefits', benefits: project.coBenefits };
    case 'buyerReviews':
      return {
        kind: 'reviews',
        average: getAverageRating(project.buyerReviews),
        count: project.buyerReviews.length,
      };
    case 'totalCredits':
      return { kind: 'credits', available: project.totalCredits, total: project.totalCredits };
    case 'availableCredits':
      return {
        kind: 'credits',
        available: project.availableCredits,
        total: project.totalCredits,
      };
    case 'name':
      return { kind: 'text', text: project.name };
    case 'location':
      return { kind: 'text', text: project.location };
    case 'projectType':
      return { kind: 'text', text: project.projectType };
    case 'methodology':
      return { kind: 'text', text: project.methodology };
    case 'verifier':
      return { kind: 'text', text: project.verifier };
    case 'vintage':
      return { kind: 'text', text: project.vintage };
  }
}

/** One-line text form of a cell — used for CSV export and `title` tooltips. */
export function criterionCellToText(cell: CriterionCell): string {
  switch (cell.kind) {
    case 'text':
      return cell.text;
    case 'price':
      return formatPrice(cell.amount, cell.currency);
    case 'risk':
      return cell.rating;
    case 'tags':
      return cell.tags.join('; ');
    case 'benefits':
      return cell.benefits.map((benefit) => getCoBenefitLabel(benefit.category)).join('; ');
    case 'reviews':
      return cell.count === 0 ? 'No reviews' : `${cell.average} (${cell.count})`;
    case 'credits':
      return cell.total > 0
        ? `${formatCredits(cell.available)} / ${formatCredits(cell.total)}`
        : formatCredits(cell.available);
  }
}
