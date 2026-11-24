// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Buyer recommendation engine — project suggestions (Issue #1430)
 *
 * Recommends offset projects to a corporate buyer from five signals: company
 * industry, company size, past purchases, co-benefit preferences and budget.
 *
 * The model is an explainable weighted scorer rather than a black box: every
 * signal produces a 0–1 sub-score, the weighted sum becomes a 0–100 match
 * score, and each recommendation carries the human-readable reasons behind it.
 * That keeps suggestions auditable (a buyer can see *why* a project was
 * picked) and lets the weights be tuned from purchase-conversion data later
 * without changing the API.
 *
 * The module is pure — no I/O, no React — so the API route, the UI and the
 * unit tests all share exactly the same rules.
 */

import type { CarbonProject, ProjectType } from '@/lib/types/carbon';

// ── Buyer profile ─────────────────────────────────────────────────────────────

export const INDUSTRIES = [
  'technology',
  'finance',
  'manufacturing',
  'energy',
  'agriculture_food',
  'retail_consumer',
  'transport_logistics',
  'other',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const COMPANY_SIZES = ['startup', 'sme', 'enterprise'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const CO_BENEFITS = [
  'biodiversity',
  'water',
  'community',
  'soil',
  'food_security',
  'clean_energy',
  'coastal_resilience',
  'health_education',
] as const;
export type CoBenefit = (typeof CO_BENEFITS)[number];

export interface PastPurchase {
  projectId: string;
  tonnes: number;
}

export interface BuyerProfile {
  industry: Industry;
  companySize: CompanySize;
  /** Budget for the next purchase, in USD. */
  budgetUsd: number;
  pastPurchases?: PastPurchase[];
  coBenefitPreferences?: CoBenefit[];
}

// ── Model parameters ──────────────────────────────────────────────────────────

/** Relative importance of each signal. Sums to 1. */
export const SIGNAL_WEIGHTS = {
  industry: 0.25,
  coBenefits: 0.25,
  budget: 0.2,
  size: 0.15,
  history: 0.15,
} as const;
export type Signal = keyof typeof SIGNAL_WEIGHTS;

/**
 * How well each project type fits a buyer's industry narrative (0–1): value
 * chain "insetting" first (a food company offsetting in agriculture), then the
 * project types their stakeholders most often expect.
 */
const INDUSTRY_AFFINITY: Record<Industry, Partial<Record<ProjectType, number>>> = {
  technology: {
    'Renewable Energy': 1,
    Reforestation: 0.8,
    'Mangrove Restoration': 0.7,
    'Sustainable Agriculture': 0.5,
  },
  finance: {
    Reforestation: 0.9,
    'Mangrove Restoration': 0.9,
    'Renewable Energy': 0.7,
    'Sustainable Agriculture': 0.6,
  },
  manufacturing: {
    'Renewable Energy': 1,
    Reforestation: 0.7,
    'Sustainable Agriculture': 0.6,
    'Mangrove Restoration': 0.5,
  },
  energy: {
    'Renewable Energy': 1,
    Reforestation: 0.8,
    'Mangrove Restoration': 0.6,
    'Sustainable Agriculture': 0.5,
  },
  agriculture_food: {
    'Sustainable Agriculture': 1,
    Reforestation: 0.8,
    'Mangrove Restoration': 0.6,
    'Renewable Energy': 0.5,
  },
  retail_consumer: {
    Reforestation: 0.9,
    'Sustainable Agriculture': 0.9,
    'Mangrove Restoration': 0.8,
    'Renewable Energy': 0.6,
  },
  transport_logistics: {
    'Renewable Energy': 0.9,
    Reforestation: 0.9,
    'Mangrove Restoration': 0.7,
    'Sustainable Agriculture': 0.5,
  },
  other: {},
};
const DEFAULT_INDUSTRY_AFFINITY = 0.6;

/** Typical annual offset volume by company size, in tonnes. */
export const TYPICAL_TONNES: Record<CompanySize, number> = {
  startup: 10,
  sme: 100,
  enterprise: 1_000,
};

/** Keywords that map free-text catalogue co-benefits onto preference categories. */
const CO_BENEFIT_KEYWORDS: Record<CoBenefit, string[]> = {
  biodiversity: ['biodiversity', 'habitat', 'wildlife', 'species'],
  water: ['water', 'watershed'],
  community: ['communit', 'indigenous', 'job', 'income', 'livelihood'],
  soil: ['soil'],
  food_security: ['food', 'fisher'],
  clean_energy: ['energy', 'solar', 'wind'],
  coastal_resilience: ['coast', 'mangrove', 'flood'],
  health_education: ['health', 'education'],
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  technology: 'technology',
  finance: 'financial services',
  manufacturing: 'manufacturing',
  energy: 'energy',
  agriculture_food: 'agriculture & food',
  retail_consumer: 'retail & consumer',
  transport_logistics: 'transport & logistics',
  other: 'your industry',
};

// ── Output ────────────────────────────────────────────────────────────────────

export interface ProjectRecommendation {
  project: CarbonProject;
  /** Weighted match score, 0–100. */
  score: number;
  /** Per-signal sub-scores, each 0–1. */
  breakdown: Record<Signal, number>;
  /** Preference categories this project delivers. */
  matchedCoBenefits: CoBenefit[];
  /** Whole tonnes the budget buys, capped by available supply (minimum 1). */
  suggestedTonnes: number;
  /** Cost of `suggestedTonnes`, in USD. */
  estimatedCostUsd: number;
  /** Human-readable explanations, strongest first. */
  reasons: string[];
}

export type ExclusionReason = 'out_of_stock' | 'over_budget';

export interface ExcludedProject {
  projectId: string;
  reason: ExclusionReason;
}

export interface RecommendationResult {
  recommendations: ProjectRecommendation[];
  excluded: ExcludedProject[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Maps a project's free-text co-benefits onto preference categories. */
export function classifyCoBenefits(
  project: Pick<CarbonProject, 'coBenefits' | 'type'>
): CoBenefit[] {
  const text = project.coBenefits.map((benefit) => benefit.toLowerCase());
  if (project.type === 'Mangrove Restoration') text.push('coastal');
  if (project.type === 'Renewable Energy') text.push('energy');
  return CO_BENEFITS.filter((category) =>
    CO_BENEFIT_KEYWORDS[category].some((keyword) =>
      text.some((benefit) => benefit.includes(keyword))
    )
  );
}

function industryScore(industry: Industry, type: ProjectType): number {
  return INDUSTRY_AFFINITY[industry][type] ?? DEFAULT_INDUSTRY_AFFINITY;
}

function coBenefitScore(preferences: readonly CoBenefit[], matched: readonly CoBenefit[]): number {
  if (preferences.length === 0) return 0.5;
  const hits = preferences.filter((preference) => matched.includes(preference)).length;
  return hits / preferences.length;
}

/** How much of the buyer's typical volume the budget covers at this price. */
function budgetScore(budgetUsd: number, pricePerTon: number, size: CompanySize): number {
  return clamp01(budgetUsd / pricePerTon / TYPICAL_TONNES[size]);
}

/**
 * Enterprises need supply depth to cover their volume in one project; startups
 * are most price-sensitive; SMEs sit in between.
 */
function sizeScore(
  size: CompanySize,
  project: CarbonProject,
  priceRange: { min: number; max: number }
): number {
  const supplyFit = clamp01(project.availableSupply / TYPICAL_TONNES[size]);
  const spread = priceRange.max - priceRange.min;
  const cheapness = spread > 0 ? 1 - (project.pricePerTon - priceRange.min) / spread : 1;
  if (size === 'enterprise') return supplyFit;
  if (size === 'startup') return cheapness;
  return (supplyFit + cheapness) / 2;
}

/**
 * Buyers tend to stay with project types they already trust, but a portfolio
 * shouldn't be one project: repeat purchases of the exact same project score
 * slightly lower than new projects of the same type.
 */
function historyScore(
  project: CarbonProject,
  purchases: readonly PastPurchase[],
  catalogue: ReadonlyMap<string, CarbonProject>
): number {
  let total = 0;
  let sameType = 0;
  let sameProject = false;
  for (const purchase of purchases) {
    const tonnes = Number.isFinite(purchase.tonnes) ? Math.max(0, purchase.tonnes) : 0;
    const bought = catalogue.get(purchase.projectId);
    if (!bought || tonnes === 0) continue;
    total += tonnes;
    if (bought.type === project.type) sameType += tonnes;
    if (bought.id === project.id) sameProject = true;
  }
  if (total === 0) return 0.5;
  const typeShare = sameType / total;
  return clamp01((0.3 + 0.7 * typeShare) * (sameProject ? 0.85 : 1));
}

function buildReasons(
  profile: BuyerProfile,
  project: CarbonProject,
  breakdown: Record<Signal, number>,
  matched: readonly CoBenefit[],
  suggestedTonnes: number,
  hasHistory: boolean
): string[] {
  const reasons: { weight: number; text: string }[] = [];
  const preferences = profile.coBenefitPreferences ?? [];
  const hits = preferences.filter((preference) => matched.includes(preference));

  if (breakdown.industry >= 0.8) {
    reasons.push({
      weight: breakdown.industry * SIGNAL_WEIGHTS.industry,
      text: `${project.type} is a strong fit for ${INDUSTRY_LABELS[profile.industry]} buyers`,
    });
  }
  if (hits.length > 0) {
    reasons.push({
      weight: breakdown.coBenefits * SIGNAL_WEIGHTS.coBenefits,
      text: `Delivers ${hits.length} of your ${preferences.length} preferred co-benefits (${hits
        .map((hit) => hit.replace('_', ' '))
        .join(', ')})`,
    });
  }
  if (breakdown.budget >= 1) {
    reasons.push({
      weight: SIGNAL_WEIGHTS.budget,
      text: `Budget covers ${suggestedTonnes.toLocaleString('en-US')}t at $${project.pricePerTon.toFixed(2)}/t`,
    });
  }
  if (profile.companySize === 'enterprise' && breakdown.size >= 1) {
    reasons.push({
      weight: SIGNAL_WEIGHTS.size,
      text: 'Enough supply for enterprise-scale volume',
    });
  } else if (profile.companySize === 'startup' && breakdown.size >= 0.7) {
    reasons.push({
      weight: breakdown.size * SIGNAL_WEIGHTS.size,
      text: 'Among the most affordable options',
    });
  }
  if (hasHistory && breakdown.history >= 0.7) {
    reasons.push({
      weight: breakdown.history * SIGNAL_WEIGHTS.history,
      text: `Matches the ${project.type.toLowerCase()} projects you already buy`,
    });
  }
  if (project.verificationStatus === 'Gold Standard') {
    reasons.push({ weight: 0, text: 'Gold Standard verified' });
  }
  return reasons.sort((a, b) => b.weight - a.weight).map((reason) => reason.text);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scores every catalogue project against the buyer profile and returns the
 * best matches first. Projects that are out of stock, or where the budget
 * cannot buy even one tonne (the retail minimum), are returned in `excluded`.
 */
export function recommendProjects(
  profile: BuyerProfile,
  catalogue: readonly CarbonProject[],
  limit = catalogue.length
): RecommendationResult {
  const budgetUsd = Number.isFinite(profile.budgetUsd) ? Math.max(0, profile.budgetUsd) : 0;
  const purchases = profile.pastPurchases ?? [];
  const byId = new Map(catalogue.map((project) => [project.id, project]));
  const excluded: ExcludedProject[] = [];

  const candidates = catalogue.filter((project) => {
    if (project.isOutOfStock || project.availableSupply < 1) {
      excluded.push({ projectId: project.id, reason: 'out_of_stock' });
      return false;
    }
    if (budgetUsd < project.pricePerTon) {
      excluded.push({ projectId: project.id, reason: 'over_budget' });
      return false;
    }
    return true;
  });

  const prices = candidates.map((project) => project.pricePerTon);
  const priceRange = { min: Math.min(...prices), max: Math.max(...prices) };

  const recommendations = candidates.map((project): ProjectRecommendation => {
    const matchedCoBenefits = classifyCoBenefits(project);
    const breakdown: Record<Signal, number> = {
      industry: industryScore(profile.industry, project.type),
      coBenefits: coBenefitScore(profile.coBenefitPreferences ?? [], matchedCoBenefits),
      budget: budgetScore(budgetUsd, project.pricePerTon, profile.companySize),
      size: sizeScore(profile.companySize, project, priceRange),
      history: historyScore(project, purchases, byId),
    };
    const weighted = (Object.keys(SIGNAL_WEIGHTS) as Signal[]).reduce(
      (sum, signal) => sum + breakdown[signal] * SIGNAL_WEIGHTS[signal],
      0
    );
    const suggestedTonnes = Math.max(
      1,
      Math.min(Math.floor(budgetUsd / project.pricePerTon), Math.floor(project.availableSupply))
    );

    return {
      project,
      score: Math.round(weighted * 100),
      breakdown: Object.fromEntries(
        Object.entries(breakdown).map(([signal, value]) => [signal, round(value, 3)])
      ) as Record<Signal, number>,
      matchedCoBenefits,
      suggestedTonnes,
      estimatedCostUsd: round(suggestedTonnes * project.pricePerTon, 2),
      reasons: buildReasons(
        profile,
        project,
        breakdown,
        matchedCoBenefits,
        suggestedTonnes,
        purchases.length > 0
      ),
    };
  });

  recommendations.sort(
    (a, b) =>
      b.score - a.score ||
      a.project.pricePerTon - b.project.pricePerTon ||
      a.project.id.localeCompare(b.project.id)
  );

  return { recommendations: recommendations.slice(0, Math.max(0, limit)), excluded };
}

export type ProfileValidation =
  { ok: true; profile: BuyerProfile } | { ok: false; errors: string[] };

/** Validates untrusted input (e.g. a request body) into a `BuyerProfile`. */
export function parseBuyerProfile(input: unknown): ProfileValidation {
  const errors: string[] = [];
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  if (!INDUSTRIES.includes(body.industry as Industry)) {
    errors.push(`industry must be one of: ${INDUSTRIES.join(', ')}`);
  }
  if (!COMPANY_SIZES.includes(body.companySize as CompanySize)) {
    errors.push(`companySize must be one of: ${COMPANY_SIZES.join(', ')}`);
  }
  const budgetUsd = Number(body.budgetUsd);
  if (body.budgetUsd === undefined || !Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    errors.push('budgetUsd must be a positive number');
  }

  const rawPreferences = body.coBenefitPreferences ?? [];
  if (
    !Array.isArray(rawPreferences) ||
    rawPreferences.some((preference) => !CO_BENEFITS.includes(preference as CoBenefit))
  ) {
    errors.push(`coBenefitPreferences must only contain: ${CO_BENEFITS.join(', ')}`);
  }

  const rawPurchases = body.pastPurchases ?? [];
  if (
    !Array.isArray(rawPurchases) ||
    rawPurchases.some(
      (purchase) =>
        typeof purchase !== 'object' ||
        purchase === null ||
        typeof (purchase as PastPurchase).projectId !== 'string' ||
        !Number.isFinite(Number((purchase as PastPurchase).tonnes)) ||
        Number((purchase as PastPurchase).tonnes) < 0
    )
  ) {
    errors.push('pastPurchases must be a list of { projectId: string, tonnes: number >= 0 }');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      industry: body.industry as Industry,
      companySize: body.companySize as CompanySize,
      budgetUsd,
      coBenefitPreferences: [...new Set(rawPreferences as CoBenefit[])],
      pastPurchases: (rawPurchases as PastPurchase[]).map((purchase) => ({
        projectId: purchase.projectId,
        tonnes: Number(purchase.tonnes),
      })),
    },
  };
}
