// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Credit Listing Service — Issues #1382, #1258
 *
 * Allow farmers and land managers to list carbon credits from verified projects:
 * Specify credit type, quantity, price per ton, verification method.
 */

import { getVerifiedProject } from '@/lib/data/verified-carbon-projects';
import {
  publishListingSchema,
  type PublishedListing,
  type PublishListingRequest,
} from '@/lib/types/carbon-listing-publish';

const PUBLISHED_LISTINGS: PublishedListing[] = [];

/** Raised for input the caller can fix; the route maps it to HTTP 400. */
export class ListingValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? 'Invalid listing request.');
    this.name = 'ListingValidationError';
    this.issues = issues;
  }
}

/** Tonnes of a project already committed to published listings. */
export function listedTonnesForProject(projectId: string): number {
  return PUBLISHED_LISTINGS.filter((l) => l.projectId === projectId).reduce(
    (sum, l) => sum + l.quantityTonnes,
    0
  );
}

/** Clears the in-memory store; for tests. */
export function resetPublishedListings(): void {
  PUBLISHED_LISTINGS.length = 0;
}

/**
 * Validate a request against the listing schema and the verified-project
 * registry, returning the parsed request.
 */
export function validateListingRequest(input: unknown): PublishListingRequest {
  const parsed = publishListingSchema.safeParse(input);
  if (!parsed.success) {
    throw new ListingValidationError(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`)
    );
  }
  const request = parsed.data;

  const project = getVerifiedProject(request.projectId);
  if (!project) {
    throw new ListingValidationError([
      `projectId: ${request.projectId} is not a verified carbon project.`,
    ]);
  }
  if (request.verificationMethod !== project.verificationMethod) {
    throw new ListingValidationError([
      `verificationMethod: project ${project.id} is verified under ${project.verificationMethod}.`,
    ]);
  }
  const remaining = project.availableTonnes - listedTonnesForProject(project.id);
  if (request.quantityTonnes > remaining) {
    throw new ListingValidationError([
      `quantityTonnes: only ${remaining} verified tonnes remain unlisted for ${project.id}.`,
    ]);
  }
  return request;
}

/**
 * Create and publish a carbon credit listing from a verified project
 */
export function createAndPublishListing(input: unknown): Promise<PublishedListing> {
  let request: PublishListingRequest;
  try {
    request = validateListingRequest(input);
  } catch (error) {
    return Promise.reject(error);
  }

  const id = `LIST-V2-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const txHash = `TX${Math.random().toString(36).substring(2, 10).toUpperCase()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const publishedListing: PublishedListing = {
    id,
    projectId: request.projectId,
    projectName: request.projectName,
    sellerAddress: request.sellerAddress,
    landManagerName: request.landManagerName,
    creditType: request.creditType,
    quantityTonnes: request.quantityTonnes,
    availableTonnes: request.quantityTonnes,
    pricePerTon: request.pricePerTon,
    currency: request.currency,
    verificationMethod: request.verificationMethod,
    registryReferenceId:
      request.registryReferenceId ||
      `${request.verificationMethod.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${request.projectId}`,
    vintageYear: request.vintageYear,
    description: request.description,
    status: 'published',
    publishedAt: new Date().toISOString(),
    transactionHash: txHash,
  };

  PUBLISHED_LISTINGS.unshift(publishedListing);
  return Promise.resolve(publishedListing);
}

/**
 * Get all published listings
 */
export function getPublishedListings(): Promise<PublishedListing[]> {
  return Promise.resolve(PUBLISHED_LISTINGS);
}
