// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Farmer Profile - Project Portfolio Service (v2) — Issue #1387
 *
 * Implements farmer profile retrieval showing all listed projects:
 * - total acres
 * - total credits available
 * - average price
 * - buyer reviews
 * - certification status
 */

import type {
  BuyerReview,
  CertificationStandard,
  FarmerPortfolioResponse,
  FarmerPortfolioSummary,
  FarmerProfile,
  ListedProject,
} from '@/lib/types/farmer-portfolio';
import { isStellarAddress } from '@/lib/api/farmer-verification';

export { isStellarAddress };

/**
 * Deterministic hash from address to seed sample farmer attributes
 */
function hashString(str: string): number {
  return [...str].reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

const SAMPLE_PROJECT_TEMPLATES = [
  {
    name: 'Kilimanjaro Agroforestry & Regenerative Soil Project',
    description: 'Community regenerative agroforestry and soil organic carbon enhancement initiative.',
    projectType: 'Regenerative Agriculture',
    location: 'Moshi Rural, Kilimanjaro',
    country: 'Tanzania',
    acres: 450,
    totalCredits: 12500,
    creditsAvailable: 4200,
    pricePerTon: 24.5,
    certificationStatus: 'Verra (VCS)' as CertificationStandard,
    certifications: ['Verra (VCS)', 'Regenerative Organic Certified'],
    vintageYear: 2024,
    reviews: [
      {
        id: 'rev-001',
        buyerName: 'EcoCorp Global',
        buyerCompany: 'EcoCorp Sustainability Inc.',
        rating: 5,
        title: 'Exceptional transparency and soil sequestration data',
        comment: 'High quality credits with verified third-party audit trail and measurable soil improvement.',
        verified: true,
        createdAt: '2025-01-15T10:30:00Z',
      },
      {
        id: 'rev-002',
        buyerName: 'Nordic Clean Capital',
        buyerCompany: 'Nordic Carbon Fund',
        rating: 4.8,
        title: 'Reliable delivery and strong community impact',
        comment: 'Full MRV compliance, timely retirement proof, and strong local farmer benefits.',
        verified: true,
        createdAt: '2025-02-02T14:15:00Z',
      },
    ],
  },
  {
    name: 'Serengeti Buffer Silvopasture & Carbon Sink',
    description: 'Silvopasture restoration combining rotational grazing, native tree planting, and cover cropping.',
    projectType: 'Silvopasture & Grassland',
    location: 'Mara Region',
    country: 'Tanzania',
    acres: 820,
    totalCredits: 26000,
    creditsAvailable: 9800,
    pricePerTon: 28.0,
    certificationStatus: 'Gold Standard' as CertificationStandard,
    certifications: ['Gold Standard', 'Plan Vivo'],
    vintageYear: 2024,
    reviews: [
      {
        id: 'rev-003',
        buyerName: 'AeroGreen Airlines',
        buyerCompany: 'AeroGreen Aviation Group',
        rating: 5,
        title: 'Top tier Gold Standard credits',
        comment: 'Verified against Gold Standard Registry with instant retirement certificate.',
        verified: true,
        createdAt: '2025-02-18T09:45:00Z',
      },
    ],
  },
  {
    name: 'Usambara Highlands Organic Cover Crop & Carbon Project',
    description: 'High-altitude organic farming with multi-species cover cropping and reduced tillage.',
    projectType: 'Soil Carbon Enhancement',
    location: 'Lushoto, Tanga',
    country: 'Tanzania',
    acres: 310,
    totalCredits: 8900,
    creditsAvailable: 3150,
    pricePerTon: 21.0,
    certificationStatus: 'Regenerative Organic Certified' as CertificationStandard,
    certifications: ['Regenerative Organic Certified', 'USDA Organic'],
    vintageYear: 2025,
    reviews: [
      {
        id: 'rev-004',
        buyerName: 'BioFoods Logistics',
        buyerCompany: 'BioFoods Enterprise',
        rating: 4.9,
        title: 'High soil carbon sequestration benchmarks',
        comment: 'Outstanding soil health improvement score and transparent MRV audit documentation.',
        verified: true,
        createdAt: '2025-03-01T16:20:00Z',
      },
    ],
  },
];

/**
 * Builds the project list for a farmer address
 */
export function buildFarmerProjects(farmerAddress: string): ListedProject[] {
  const hash = hashString(farmerAddress);
  const count = 1 + (hash % 3); // 1 to 3 projects
  const projects: ListedProject[] = [];

  for (let i = 0; i < count; i++) {
    const templateIndex = (hash + i) % SAMPLE_PROJECT_TEMPLATES.length;
    const template = SAMPLE_PROJECT_TEMPLATES[templateIndex];
    const projectId = `proj-${farmerAddress.slice(0, 6)}-${i + 1}`;

    const reviews: BuyerReview[] = template.reviews.map((r, rIdx) => ({
      ...r,
      id: `${projectId}-${rIdx + 1}`,
      projectId,
      projectName: template.name,
    }));

    const avgRating =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length) * 10
          ) / 10
        : 5.0;

    projects.push({
      id: projectId,
      farmerAddress,
      name: template.name,
      description: template.description,
      projectType: template.projectType,
      location: template.location,
      country: template.country,
      acres: template.acres,
      totalCredits: template.totalCredits,
      creditsAvailable: template.creditsAvailable,
      pricePerTon: template.pricePerTon,
      currency: 'USD',
      vintageYear: template.vintageYear,
      certificationStatus: template.certificationStatus,
      certifications: template.certifications,
      averageRating: avgRating,
      reviewCount: reviews.length,
      reviews,
      status: 'active',
      createdAt: '2024-01-10T08:00:00Z',
      updatedAt: '2025-02-20T11:00:00Z',
    });
  }

  return projects;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Aggregates portfolio summary across all listed projects:
 * - total acres
 * - total credits available
 * - average price
 * - buyer reviews
 * - certification status
 */
export function calculatePortfolioSummary(projects: ListedProject[]): FarmerPortfolioSummary {
  if (projects.length === 0) {
    return {
      totalProjects: 0,
      totalAcres: 0,
      totalCreditsAvailable: 0,
      totalCreditsIssued: 0,
      averagePrice: 0,
      overallRating: 0,
      totalReviews: 0,
      certificationStatuses: [],
    };
  }

  const totalAcres = projects.reduce((sum, p) => sum + p.acres, 0);
  const totalCreditsAvailable = projects.reduce((sum, p) => sum + p.creditsAvailable, 0);
  const totalCreditsIssued = projects.reduce((sum, p) => sum + p.totalCredits, 0);

  // Average price is weighted by credits available, so a large low-priced
  // listing counts for more than a small high-priced one. When nothing is
  // available to weight by, fall back to the plain mean across projects.
  const averagePrice =
    totalCreditsAvailable > 0
      ? round(
          projects.reduce((sum, p) => sum + p.pricePerTon * p.creditsAvailable, 0) /
            totalCreditsAvailable,
          2
        )
      : round(projects.reduce((sum, p) => sum + p.pricePerTon, 0) / projects.length, 2);

  const allReviews = projects.flatMap((p) => p.reviews);
  const totalReviews = allReviews.length;
  // No reviews means no rating (0), not a perfect one.
  const overallRating =
    totalReviews > 0 ? round(allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews, 1) : 0;

  const uniqueCertifications = Array.from(
    new Set(projects.flatMap((p) => [p.certificationStatus, ...p.certifications]))
  ).filter(Boolean);

  return {
    totalProjects: projects.length,
    totalAcres,
    totalCreditsAvailable,
    totalCreditsIssued,
    averagePrice,
    overallRating,
    totalReviews,
    certificationStatuses: uniqueCertifications,
  };
}

/** Thrown when no portfolio exists for the requested farmer address. */
export class FarmerNotFoundError extends Error {
  constructor(public readonly farmerAddress: string) {
    super(`Farmer not found: ${farmerAddress}`);
    this.name = 'FarmerNotFoundError';
  }
}

/**
 * Where a farmer's profile and listed projects come from. Return `null` when
 * the farmer is unknown. Swap the default source for a database-backed one
 * once projects, reviews and certifications are persisted.
 */
export interface FarmerPortfolioSource {
  load(farmerAddress: string): Promise<{ farmer: FarmerProfile; projects: ListedProject[] } | null>;
}

const FARMER_NAMES = [
  'Amani Mwangi',
  'Baraka Osei',
  'Chioma Adeleke',
  'Daudi Kimaro',
  'Eshe Mrema',
];
const ORGANIZATIONS = [
  'Kilimanjaro Regenerative Cooperative',
  'East Africa Agroforestry Alliance',
  'Rift Valley Soil Stewards',
  'Mara Highlands Ecological Farmers',
];

/** Default source: deterministic sample data (no persistence layer exists yet). */
export const sampleFarmerPortfolioSource: FarmerPortfolioSource = {
  async load(farmerAddress) {
    const hash = hashString(farmerAddress);
    return {
      farmer: {
        address: farmerAddress,
        name: FARMER_NAMES[hash % FARMER_NAMES.length],
        organization: ORGANIZATIONS[hash % ORGANIZATIONS.length],
        bio: 'Regenerative agriculture pioneer managing verified carbon offset projects. Focused on soil organic carbon accumulation, biodiversity enhancement, and community agroforestry.',
        location: 'Arusha Region',
        country: 'Tanzania',
        joinedAt: '2023-08-15T00:00:00Z',
        verified: true,
        kycTier: 2,
      },
      projects: buildFarmerProjects(farmerAddress),
    };
  },
};

/**
 * Get farmer profile and full project portfolio.
 * @throws FarmerNotFoundError when the source has no record for the address.
 */
export async function getFarmerPortfolio(
  farmerAddress: string,
  source: FarmerPortfolioSource = sampleFarmerPortfolioSource
): Promise<FarmerPortfolioResponse> {
  const record = await source.load(farmerAddress);
  if (!record) throw new FarmerNotFoundError(farmerAddress);

  return {
    farmer: record.farmer,
    summary: calculatePortfolioSummary(record.projects),
    projects: record.projects,
    buyerReviews: record.projects.flatMap((p) => p.reviews),
  };
}
