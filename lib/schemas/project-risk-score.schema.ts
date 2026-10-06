/**
 * Zod schemas for project risk scoring
 * Issue #1294: Buyer risk scoring for project sustainability
 *
 * These schemas validate:
 * 1. Input request parameters for risk score calculation
 * 2. Output response shape (sub-scores, overall score, risk rating)
 * 3. Database persistence model
 */

import { z } from 'zod';

/**
 * Sub-score calculation outputs (0-100 scale, higher = less risk)
 */
export const subScoresSchema = z.object({
  verifierReputation: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Verifier reputation score (0-100)'),
  methodologyStrength: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Methodology strength score (0-100)'),
  regionalStability: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Regional stability score (0-100)'),
  farmerTrackRecord: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Farmer track record score (0-100)'),
});

/**
 * Weighting configuration for combining sub-scores
 */
export const weightsSchema = z.object({
  verifierReputation: z.number().min(0).max(1),
  methodologyStrength: z.number().min(0).max(1),
  regionalStability: z.number().min(0).max(1),
  farmerTrackRecord: z.number().min(0).max(1),
});

/**
 * Risk rating enum
 */
export const riskRatingSchema = z.enum(['Low', 'Medium', 'High']);

/**
 * Overall risk score response
 */
export const projectRiskScoreResponseSchema = z.object({
  projectId: z.string().describe('Project ID'),
  projectName: z.string().optional().describe('Project name'),
  overallScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Overall risk score (0-100, lower = less risk)'),
  riskRating: riskRatingSchema.describe('Risk rating category'),
  subScores: subScoresSchema,
  weights: weightsSchema,
  calculatedAt: z.string().datetime().describe('When the score was calculated'),
  dataGaps: z
    .array(z.string())
    .describe('List of data limitations affecting this score'),
});

/**
 * GET /api/v2/projects/:projectId/risk-score — query parameters
 */
export const getRiskScoreParamsSchema = z.object({
  projectId: z.string().min(1).max(100).describe('Project ID'),
  useCache: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false')
    .default('true')
    .describe('Whether to use cached score if available'),
});

export type GetRiskScoreParams = z.infer<typeof getRiskScoreParamsSchema>;

/**
 * POST /api/v2/projects/risk-scores/recalculate — request body
 * Triggers a refresh of the risk score for a given project
 */
export const recalculateRiskScoreBodySchema = z.object({
  projectId: z.string().min(1).max(100).describe('Project ID to recalculate'),
  force: z.boolean().optional().default(false).describe('Force recalculation even if cached'),
});

export type RecalculateRiskScoreBody = z.infer<typeof recalculateRiskScoreBodySchema>;

/**
 * GET /api/v2/projects/risk-scores — query parameters for listing
 */
export const listRiskScoresParamsSchema = z.object({
  rating: riskRatingSchema
    .optional()
    .describe('Filter by risk rating (Low, Medium, High)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Number of results to return'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe('Number of results to skip'),
  sortBy: z
    .enum(['score', 'rating', 'calculatedAt'])
    .optional()
    .default('score')
    .describe('Field to sort by'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order'),
});

export type ListRiskScoresParams = z.infer<typeof listRiskScoresParamsSchema>;

/**
 * Response for listing risk scores
 */
export const listRiskScoresResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(projectRiskScoreResponseSchema),
  total: z.number().int().min(0).describe('Total count of projects'),
  limit: z.number().int(),
  offset: z.number().int(),
});

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  error: z.string().describe('Error message'),
  details: z
    .array(z.string())
    .optional()
    .describe('Detailed error information'),
});

/**
 * Success response wrapper for single risk score
 */
export const riskScoreSuccessResponseSchema = z.object({
  success: z.literal(true),
  riskScore: projectRiskScoreResponseSchema,
});

/**
 * Type exports for use in API routes
 */
export type SubScores = z.infer<typeof subScoresSchema>;
export type Weights = z.infer<typeof weightsSchema>;
export type RiskRating = z.infer<typeof riskRatingSchema>;
export type ProjectRiskScoreResponse = z.infer<typeof projectRiskScoreResponseSchema>;
export type RiskScoreSuccessResponse = z.infer<typeof riskScoreSuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ListRiskScoresResponse = z.infer<typeof listRiskScoresResponseSchema>;

/**
 * Internal calculation schemas (not exposed in API, used for domain logic)
 */

/**
 * Farmer profile data needed for track record scoring
 */
export const farmerProfileForScoringSchema = z.object({
  address: z.string(),
  verified: z.boolean(),
  kycTier: z.number().int().min(0),
  averageRating: z.number().min(1).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  joinedAt: z.string().datetime().optional(),
});

export type FarmerProfileForScoring = z.infer<typeof farmerProfileForScoringSchema>;

/**
 * Carbon project data needed for scoring
 */
export const carbonProjectForScoringSchema = z.object({
  id: z.string(),
  name: z.string(),
  verificationStatus: z.enum([
    'Gold Standard',
    'Verra (VCS)',
    'Climate Action Reserve',
    'Plan Vivo',
    'Pending',
  ]),
  location: z.string().optional(),
});

export type CarbonProjectForScoring = z.infer<typeof carbonProjectForScoringSchema>;

/**
 * Carbon methodology data needed for scoring
 */
export const carbonMethodologyForScoringSchema = z.object({
  slug: z.string(),
  name: z.string(),
  standard: z.string(),
  metadataVerified: z.boolean(),
  formula: z.string(),
  parameters: z.array(z.unknown()).optional(),
});

export type CarbonMethodologyForScoring = z.infer<typeof carbonMethodologyForScoringSchema>;

/**
 * Planting location (region) data needed for scoring
 */
export const plantingLocationForScoringSchema = z.object({
  region: z.string().optional(),
  country: z.string().optional(),
  climate: z.string().optional(),
});

export type PlantingLocationForScoring = z.infer<typeof plantingLocationForScoringSchema>;
