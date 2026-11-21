// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Backend Farmer Portfolio Service — Issue #1387
 *
 * Exposes farmer profile and project portfolio methods for backend microservices.
 */

export * from '@/lib/types/farmer-portfolio';
export {
  getFarmerPortfolio,
  calculatePortfolioSummary,
  buildFarmerProjects,
  isStellarAddress,
} from '@/lib/api/farmer-portfolio';
