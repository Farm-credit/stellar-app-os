// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Credit Listing Service — Issue #1382
 *
 * Allow farmers and land managers to list carbon credits from verified projects:
 * Specify credit type, quantity, price per ton, verification method.
 */

import type {
  PublishedListing,
  PublishListingRequest,
} from '@/lib/types/carbon-listing-publish';

const PUBLISHED_LISTINGS: PublishedListing[] = [];

/**
 * Create and publish a carbon credit listing from a verified project
 */
export async function createAndPublishListing(
  request: PublishListingRequest
): Promise<PublishedListing> {
  if (!request.projectId) {
    throw new Error('Project ID is required.');
  }
  if (!request.sellerAddress) {
    throw new Error('Seller address is required.');
  }
  if (!request.quantityTonnes || request.quantityTonnes <= 0) {
    throw new Error('Quantity must be greater than 0 tons.');
  }
  if (!request.pricePerTon || request.pricePerTon <= 0) {
    throw new Error('Price per ton must be greater than 0.');
  }
  if (!request.creditType) {
    throw new Error('Credit type must be specified.');
  }
  if (!request.verificationMethod) {
    throw new Error('Verification method must be specified.');
  }

  const id = `LIST-V2-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const txHash = `TX${Math.random().toString(36).substring(2, 10).toUpperCase()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const publishedListing: PublishedListing = {
    id,
    projectId: request.projectId,
    projectName: request.projectName || `Verified Project ${request.projectId}`,
    sellerAddress: request.sellerAddress,
    landManagerName: request.landManagerName || 'Land Manager',
    creditType: request.creditType,
    quantityTonnes: request.quantityTonnes,
    availableTonnes: request.quantityTonnes,
    pricePerTon: request.pricePerTon,
    currency: request.currency || 'USD',
    verificationMethod: request.verificationMethod,
    registryReferenceId:
      request.registryReferenceId || `${request.verificationMethod.replace(/[^A-Z0-9]/g, '')}-${request.projectId}`,
    vintageYear: request.vintageYear || new Date().getFullYear(),
    status: 'published',
    publishedAt: new Date().toISOString(),
    transactionHash: txHash,
  };

  PUBLISHED_LISTINGS.unshift(publishedListing);
  return publishedListing;
}

/**
 * Get all published listings
 */
export async function getPublishedListings(): Promise<PublishedListing[]> {
  return PUBLISHED_LISTINGS;
}
