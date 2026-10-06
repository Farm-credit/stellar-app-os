// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Comparison metadata for the shared carbon project catalogue
 * (`lib/api/mock/carbonProjects.ts`, issue #1354 / #1416).
 *
 * `CarbonProject` intentionally stays small: it models what the purchase flow
 * needs (price, supply, vintage, verification standard).  Side-by-side review
 * needs more — methodology, verifier, risk rating, certifications and buyer
 * reviews — so that metadata lives here, keyed by project id, instead of
 * widening the purchase-facing type.
 *
 * `lib/projectComparison.ts` merges the two into the `Project` shape the
 * comparison UI consumes, and degrades gracefully (deriving what it can) for
 * any catalogue entry that has no metadata yet.
 */

import type { ProjectComparisonMetadata } from '@/lib/projectComparison';

export const mockProjectComparisonMetadata: Record<string, ProjectComparisonMetadata> = {
  'proj-001': {
    country: 'Brazil',
    currency: 'USD',
    methodology: 'VM0007 REDD+ Methodology Framework',
    verifier: 'Verra',
    certification: ['VCS', 'CCB'],
    riskRating: 'low',
    totalCredits: 250_000,
    coBenefits: [
      {
        category: 'biodiversity',
        description: 'Protects habitat for endangered Amazonian species',
        verified: true,
      },
      {
        category: 'water',
        description: 'Safeguards watersheds feeding the Rio Negro basin',
        verified: true,
      },
      {
        category: 'community',
        description: 'Employs and pays 180 local forest stewards',
        verified: true,
      },
    ],
    buyerReviews: [
      {
        id: 'rev-001-1',
        projectId: 'proj-001',
        buyerName: 'Helena Duarte',
        buyerCompany: 'Verdant Retail Group',
        rating: 5,
        title: 'Audit-ready documentation',
        content:
          'Geotagged monitoring reports arrived quarterly and matched our auditor expectations without follow-up.',
        verified: true,
        createdAt: '2024-08-14T09:20:00Z',
      },
      {
        id: 'rev-001-2',
        projectId: 'proj-001',
        buyerName: 'Marcus Lindqvist',
        rating: 4,
        title: 'Strong co-benefit evidence',
        content: 'Community agreements are well documented; issuance timing slipped once.',
        verified: true,
        createdAt: '2024-10-02T15:05:00Z',
      },
    ],
  },
  'proj-002': {
    country: 'United States',
    currency: 'USD',
    methodology: 'ACM0002 Grid-Connected Electricity Generation from Renewables',
    verifier: 'Verra',
    certification: ['VCS'],
    riskRating: 'low',
    totalCredits: 180_000,
    coBenefits: [
      {
        category: 'climate_resilience',
        description: 'Displaces ~410,000 tCO2e of grid generation per year',
        verified: true,
      },
      {
        category: 'community',
        description: 'Supports 60 permanent operations roles in West Texas',
        verified: false,
      },
    ],
    buyerReviews: [
      {
        id: 'rev-002-1',
        projectId: 'proj-002',
        buyerName: 'Priya Raghavan',
        buyerCompany: 'Northwind Logistics',
        rating: 5,
        title: 'Clean retirement trail',
        content: 'Retirements were on the public registry the same week we settled.',
        verified: true,
        createdAt: '2024-07-21T11:40:00Z',
      },
    ],
  },
  'proj-003': {
    country: 'India',
    currency: 'USD',
    methodology: 'ACM0002 Grid-Connected Electricity Generation from Renewables',
    verifier: 'Climate Action Reserve',
    certification: ['CAR'],
    riskRating: 'medium',
    totalCredits: 90_000,
    coBenefits: [
      {
        category: 'community',
        description: 'Brings reliable power to 42 off-grid villages',
        verified: true,
      },
      {
        category: 'gender_equality',
        description: 'Trains women-led cooperatives to maintain installations',
        verified: true,
      },
    ],
    buyerReviews: [
      {
        id: 'rev-003-1',
        projectId: 'proj-003',
        buyerName: 'Ana Ferreira',
        rating: 3,
        title: 'Good co-benefits, limited supply',
        content: 'Impact reporting is solid but availability is intermittent, which complicates planning.',
        verified: true,
        createdAt: '2024-09-30T08:15:00Z',
      },
    ],
  },
  'proj-004': {
    country: 'Indonesia',
    currency: 'USD',
    methodology: 'Plan Vivo PV Climate methodology for mangrove restoration',
    verifier: 'Plan Vivo',
    certification: ['Plan Vivo', 'SD VISta'],
    riskRating: 'medium',
    totalCredits: 300_000,
    coBenefits: [
      {
        category: 'biodiversity',
        description: 'Restores nursery habitat for coastal fisheries',
        verified: true,
      },
      {
        category: 'climate_resilience',
        description: 'Buffers coastal villages against storm surge',
        verified: true,
      },
      {
        category: 'community',
        description: 'Pays 24 village crews through a community benefit share',
        verified: true,
      },
    ],
    buyerReviews: [
      {
        id: 'rev-004-1',
        projectId: 'proj-004',
        buyerName: 'Tomas Berg',
        buyerCompany: 'Baltic Freight AS',
        rating: 4,
        title: 'Measurable coastal protection',
        content: 'Survival-rate surveys are published openly; a small share of plots underperformed.',
        verified: true,
        createdAt: '2024-06-18T13:00:00Z',
      },
      {
        id: 'rev-004-2',
        projectId: 'proj-004',
        buyerName: 'Chloe Nakamura',
        rating: 4,
        title: 'Responsive project team',
        content: 'Answered our methodology questions quickly and shared raw plot data.',
        verified: false,
        createdAt: '2024-11-04T10:25:00Z',
      },
    ],
  },
  'proj-005': {
    country: 'Kenya',
    currency: 'USD',
    methodology: 'Gold Standard Soil Organic Carbon Activity Module',
    verifier: 'Gold Standard',
    certification: ['Gold Standard'],
    riskRating: 'high',
    totalCredits: 60_000,
    coBenefits: [
      {
        category: 'soil',
        description: 'Builds soil organic carbon across 9,400 smallholder hectares',
        verified: true,
      },
      {
        category: 'community',
        description: 'Increases farmer income through aggregated sales',
        verified: true,
      },
    ],
    buyerReviews: [
      {
        id: 'rev-005-1',
        projectId: 'proj-005',
        buyerName: 'Ruth Wanjiru',
        buyerCompany: 'Savannah Foods',
        rating: 3,
        title: 'High impact, higher delivery risk',
        content: 'Farmer recruitment outpaced verification last season, so issuance lagged.',
        verified: true,
        createdAt: '2024-05-09T07:45:00Z',
      },
    ],
  },
};
