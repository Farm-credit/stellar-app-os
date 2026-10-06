// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Farmer Profile & Project Portfolio Types (v2) — Issue #1387
 *
 * Farmer profile showing all listed projects:
 * - total acres
 * - total credits available
 * - average price
 * - buyer reviews
 * - certification status
 */

export interface BuyerReview {
  id: string;
  projectId: string;
  projectName?: string;
  buyerName: string;
  buyerCompany?: string;
  buyerAddress?: string;
  rating: number; // 1-5
  title: string;
  comment: string;
  verified: boolean;
  createdAt: string;
}

export type CertificationStandard =
  | 'Verra (VCS)'
  | 'Gold Standard'
  | 'Climate Action Reserve'
  | 'Plan Vivo'
  | 'Regenerative Organic Certified'
  | 'USDA Organic'
  | 'Pending Verification';

export interface ListedProject {
  id: string;
  farmerAddress: string;
  name: string;
  description: string;
  projectType: string;
  location: string;
  country: string;
  acres: number;
  totalCredits: number;
  creditsAvailable: number;
  pricePerTon: number;
  currency: string;
  vintageYear: number;
  certificationStatus: CertificationStandard;
  certifications: string[];
  averageRating: number;
  reviewCount: number;
  reviews: BuyerReview[];
  status: 'active' | 'completed' | 'draft';
  createdAt: string;
  updatedAt: string;
}

export interface FarmerProfile {
  address: string;
  name: string;
  organization?: string;
  bio: string;
  avatarUrl?: string;
  location: string;
  country: string;
  joinedAt: string;
  verified: boolean;
  kycTier: number;
}

export interface FarmerPortfolioSummary {
  totalProjects: number;
  totalAcres: number;
  totalCreditsAvailable: number;
  totalCreditsIssued: number;
  averagePrice: number;
  overallRating: number;
  totalReviews: number;
  certificationStatuses: string[];
}

export interface FarmerPortfolioResponse {
  farmer: FarmerProfile;
  summary: FarmerPortfolioSummary;
  projects: ListedProject[];
  buyerReviews: BuyerReview[];
}
