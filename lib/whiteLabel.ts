// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * White-Label Tree Sponsorship Domain Layer (#1713)
 *
 * Feature: A white-label version of the tree sponsorship platform that
 * partner organisations can embed or host under their own brand.
 *
 * Acceptance Criteria:
 * - Configurable colour scheme, logo, and domain
 * - All impact data feeds back to partner's admin panel
 * - Platform fee and partner margin configurable
 */

import { getMockProjectImpactRecords } from '@/lib/api/mock/projectImpactRecords';
import {
  buildProjectImpactSnapshotFromRecords,
  PROJECT_IMPACT_DIMENSIONS,
  type ImpactMetric,
  type ProjectImpactDimension,
  type ProjectImpactSnapshot,
} from '@/lib/impact/project-impact';

export interface WhiteLabelBranding {
  /** Display name shown instead of FarmCredit. */
  partnerName: string;
  /** Logo image URL rendered in the header and share previews. */
  logoUrl: string;
  /** Hex colours applied as CSS variables across the embedded experience. */
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  /** Custom domain the partner hosts or embeds under, e.g. "trees.acme.org". */
  customDomain: string;
}

export interface WhiteLabelFees {
  /** FarmCredit's cut of every sponsorship, percent of the tree price. */
  platformFeePercent: number;
  /** The partner organisation's margin, percent of the tree price. */
  partnerMarginPercent: number;
}

export interface WhiteLabelConfig {
  partnerId: string;
  enabled: boolean;
  branding: WhiteLabelBranding;
  fees: WhiteLabelFees;
  /** Projects the partner is allowed to surface under their brand. */
  projectIds: string[];
}

export const MAX_TOTAL_MARGIN_PERCENT = 60;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const mockWhiteLabelPartners: WhiteLabelConfig[] = [
  {
    partnerId: 'partner-acme',
    enabled: true,
    branding: {
      partnerName: 'Acme Foundation',
      logoUrl: 'https://images.unsplash.com/photo-1611262588736-2c127417217c?w=200',
      primaryColor: '#1d4ed8',
      accentColor: '#65a30d',
      backgroundColor: '#f8fafc',
      customDomain: 'trees.acme-foundation.org',
    },
    fees: { platformFeePercent: 8, partnerMarginPercent: 12 },
    projectIds: ['proj-001', 'proj-004'],
  },
  {
    partnerId: 'partner-greenbank',
    enabled: true,
    branding: {
      partnerName: 'GreenBank Rewards',
      logoUrl: 'https://images.unsplash.com/photo-1611262588736-2c127417217c?w=200',
      primaryColor: '#047857',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      customDomain: 'plant.greenbank.example',
    },
    fees: { platformFeePercent: 10, partnerMarginPercent: 5 },
    projectIds: ['proj-001', 'proj-006', 'proj-009'],
  },
];

export function getWhiteLabelConfig(partnerId: string): WhiteLabelConfig | undefined {
  return mockWhiteLabelPartners.find((config) => config.partnerId === partnerId);
}

/** Resolves a partner config from the incoming hostname (domain routing). */
export function resolveConfigByDomain(
  hostname: string,
  configs: readonly WhiteLabelConfig[] = mockWhiteLabelPartners
): WhiteLabelConfig | undefined {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  return configs.find(
    (config) => config.enabled && config.branding.customDomain.toLowerCase() === normalized
  );
}

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR.test(color);
}

/**
 * CSS custom properties a themed container sets so embedded pages inherit the
 * partner palette. Keys are consumed by the white-label frame component.
 */
export function buildThemeVariables(config: WhiteLabelConfig): Record<string, string> {
  return {
    '--wl-primary': config.branding.primaryColor,
    '--wl-accent': config.branding.accentColor,
    '--wl-background': config.branding.backgroundColor,
    '--wl-logo-url': `url("${config.branding.logoUrl}")`,
    '--wl-partner-name': `"${config.branding.partnerName}"`,
  };
}

export function validateFees(fees: WhiteLabelFees): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(fees.platformFeePercent) || fees.platformFeePercent < 0) {
    errors.push('platformFeePercent must be a non-negative number');
  }
  if (!Number.isFinite(fees.partnerMarginPercent) || fees.partnerMarginPercent < 0) {
    errors.push('partnerMarginPercent must be a non-negative number');
  }
  const total = fees.platformFeePercent + fees.partnerMarginPercent;
  if (total > MAX_TOTAL_MARGIN_PERCENT) {
    errors.push(`Combined fees and margin (${total}%) exceed the ${MAX_TOTAL_MARGIN_PERCENT}% cap`);
  }
  return errors;
}

export interface PriceBreakdown {
  totalUsd: number;
  platformFeeUsd: number;
  partnerMarginUsd: number;
  growerShareUsd: number;
}

/** Splits a sponsorship price into platform fee, partner margin, grower share. */
export function splitSponsorshipPrice(totalUsd: number, fees: WhiteLabelFees): PriceBreakdown {
  if (totalUsd < 0) {
    throw new Error('totalUsd must be non-negative');
  }
  const errors = validateFees(fees);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  const cents = Math.round(totalUsd * 100);
  const platformFeeCents = Math.round((cents * fees.platformFeePercent) / 100);
  const partnerMarginCents = Math.round((cents * fees.partnerMarginPercent) / 100);
  const growerCents = cents - platformFeeCents - partnerMarginCents;
  return {
    totalUsd: cents / 100,
    platformFeeUsd: platformFeeCents / 100,
    partnerMarginUsd: partnerMarginCents / 100,
    growerShareUsd: growerCents / 100,
  };
}

export interface PartnerProjectImpact {
  projectId: string;
  snapshot: ProjectImpactSnapshot;
}

export type PartnerImpactFeed = {
  partnerId: string;
  asOf: string;
  projects: PartnerProjectImpact[];
  totals: Record<ProjectImpactDimension, ImpactMetric>;
};

/**
 * Aggregates impact data for every project in the partner's portfolio so the
 * partner admin panel receives one consolidated feed.
 */
export function buildPartnerImpactFeed(
  config: WhiteLabelConfig,
  asOf: string = new Date().toISOString()
): PartnerImpactFeed {
  const projects = config.projectIds.map((projectId) => ({
    projectId,
    snapshot: buildProjectImpactSnapshotFromRecords(
      projectId,
      getMockProjectImpactRecords(projectId),
      asOf
    ),
  }));

  const totals = {} as Record<ProjectImpactDimension, ImpactMetric>;
  for (const meta of PROJECT_IMPACT_DIMENSIONS) {
    const values = projects.map((project) => project.snapshot[meta.dimension]);
    const value = values.reduce((sum, metric) => sum + metric.value, 0);
    const change = values.reduce((sum, metric) => sum + metric.change, 0) / (values.length || 1);
    totals[meta.dimension] = {
      value: Math.round(value * 100) / 100,
      unit: meta.unit,
      change: Math.round(change * 10) / 10,
    };
  }

  return { partnerId: config.partnerId, asOf, projects, totals };
}
