// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Credit Listing Publish Types — Issue #1382
 *
 * Allow farmers and land managers to list carbon credits from verified projects.
 * Specify:
 * - credit type
 * - quantity (tons)
 * - price per ton
 * - verification method
 */

export type CreditTypeCategory =
  | 'Soil Carbon'
  | 'Reforestation & Afforestation'
  | 'Blue Carbon (Mangroves)'
  | 'Agroforestry & Silvopasture'
  | 'Renewable Energy & Biochar';

export type VerificationMethod =
  | 'Verra (VCS)'
  | 'Gold Standard'
  | 'Climate Action Reserve'
  | 'Plan Vivo'
  | 'Regenerative Organic Certified';

export interface PublishListingRequest {
  projectId: string;
  projectName: string;
  sellerAddress: string;
  landManagerName: string;
  creditType: CreditTypeCategory;
  quantityTonnes: number;
  pricePerTon: number;
  currency: string;
  verificationMethod: VerificationMethod;
  registryReferenceId?: string;
  vintageYear: number;
  description?: string;
  evidenceDocumentUrls?: string[];
}

export interface PublishedListing {
  id: string;
  projectId: string;
  projectName: string;
  sellerAddress: string;
  landManagerName: string;
  creditType: CreditTypeCategory;
  quantityTonnes: number;
  availableTonnes: number;
  pricePerTon: number;
  currency: string;
  verificationMethod: VerificationMethod;
  registryReferenceId: string;
  vintageYear: number;
  status: 'published' | 'active' | 'pending_signature';
  publishedAt: string;
  transactionHash?: string;
}
