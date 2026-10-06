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
 * - description (optional narrative / project notes)
 * - registry reference ID (registry-issued unique identifier)
 */

import { z } from 'zod';

export type CreditTypeCategory =
  | 'Soil Carbon'
  | 'Reforestation & Afforestation'
  | 'Blue Carbon (Mangroves)'
  | 'Agroforestry & Silvopasture'
  | 'Renewable Energy & Biochar';

export const CREDIT_TYPE_OPTIONS: CreditTypeCategory[] = [
  'Soil Carbon',
  'Reforestation & Afforestation',
  'Blue Carbon (Mangroves)',
  'Agroforestry & Silvopasture',
  'Renewable Energy & Biochar',
];

export type VerificationMethod =
  | 'Verra (VCS)'
  | 'Gold Standard'
  | 'Climate Action Reserve'
  | 'Plan Vivo'
  | 'Regenerative Organic Certified';

export const VERIFICATION_METHOD_OPTIONS: VerificationMethod[] = [
  'Verra (VCS)',
  'Gold Standard',
  'Climate Action Reserve',
  'Plan Vivo',
  'Regenerative Organic Certified',
];

// ── Zod validation schema ─────────────────────────────────────────────────────

export const publishListingSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required').max(64),
  projectName: z.string().min(2, 'Project name must be at least 2 characters').max(255),
  sellerAddress: z
    .string()
    .min(40, 'Stellar address must be at least 40 characters')
    .max(80, 'Stellar address is too long')
    .regex(/^G[A-Z2-7]{55}$/, 'Must be a valid Stellar public key starting with G'),
  landManagerName: z.string().min(2, 'Land manager name is required').max(200),
  creditType: z.enum(CREDIT_TYPE_OPTIONS as [CreditTypeCategory, ...CreditTypeCategory[]]),
  quantityTonnes: z
    .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0')
    .max(10_000_000, 'Quantity cannot exceed 10,000,000 metric tons'),
  pricePerTon: z
    .number({ required_error: 'Price per ton is required', invalid_type_error: 'Price must be a number' })
    .positive('Price must be greater than 0')
    .max(10_000, 'Price per ton cannot exceed $10,000'),
  currency: z.string().min(3).max(10).default('USD'),
  verificationMethod: z.enum(
    VERIFICATION_METHOD_OPTIONS as [VerificationMethod, ...VerificationMethod[]]
  ),
  /**
   * Registry-issued reference ID for the credit batch (e.g. "VCS-12345", "GS-GCP-001").
   * Optional but strongly recommended for verified listings.
   */
  registryReferenceId: z
    .string()
    .max(100, 'Registry reference ID cannot exceed 100 characters')
    .optional(),
  vintageYear: z
    .number({ invalid_type_error: 'Vintage year must be a number' })
    .int()
    .min(2000, 'Vintage year must be 2000 or later')
    .max(new Date().getFullYear(), `Vintage year cannot be in the future`),
  /**
   * Narrative description / methodology notes about the project.
   * Displayed in the marketplace listing detail page.
   */
  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional(),
  evidenceDocumentUrls: z.array(z.string().url()).max(10).optional(),
});

/** The inferred TypeScript type from the Zod schema — use this as the canonical type */
export type PublishListingFormData = z.infer<typeof publishListingSchema>;

/** Alias kept for backward compatibility with the API route and service layer */
export interface PublishListingRequest extends PublishListingFormData {}

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
  description?: string;
  status: 'published' | 'active' | 'pending_signature';
  publishedAt: string;
  transactionHash?: string;
}
