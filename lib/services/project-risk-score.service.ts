/**
 * Project Risk Score Service
 * Issue #1294: Database access layer for risk score persistence
 *
 * Handles fetching project data, calculating scores, and persisting results.
 */

import { db } from '@/lib/db/client';
import {
  calculateAllSubScores,
  combineSubScoresIntoOverallScore,
  determineRiskRating,
  identifyDataGaps,
  getWeights,
} from '@/lib/scoring/buyer-risk-scoring';
import type {
  ProjectRiskScoreResponse,
  SubScores,
  RiskRating,
} from '@/lib/schemas/project-risk-score.schema';
import type {
  CarbonProjectForScoring,
  FarmerProfileForScoring,
  CarbonMethodologyForScoring,
  PlantingLocationForScoring,
} from '@/lib/schemas/project-risk-score.schema';

/**
 * Fetch a carbon project by ID
 */
async function fetchProjectForScoring(projectId: string): Promise<CarbonProjectForScoring | null> {
  try {
    const result = await db.query<{
      id: string;
      name: string;
      verification_status: string;
      location: string | null;
    }>(
      `
      SELECT id, name, verification_status, location
      FROM carbon_projects
      WHERE id = $1
      LIMIT 1
      `,
      [projectId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      verificationStatus: row.verification_status,
      location: row.location || undefined,
    };
  } catch (error) {
    console.error('Failed to fetch project for scoring:', error);
    return null;
  }
}

/**
 * Fetch the methodology for a project
 */
async function fetchMethodologyForProject(
  projectId: string
): Promise<CarbonMethodologyForScoring | null> {
  try {
    // This query assumes projects reference methodologies; adjust based on actual schema
    const result = await db.query<{
      slug: string;
      name: string;
      standard: string;
      metadata_verified: boolean;
      formula: string;
      parameters: unknown[];
    }>(
      `
      SELECT m.slug, m.name, m.standard, m.metadata_verified, m.formula, m.parameters
      FROM carbon_methodologies m
      -- Assuming projects have a methodology_slug foreign key
      WHERE m.slug = (SELECT methodology_slug FROM carbon_projects WHERE id = $1 LIMIT 1)
      LIMIT 1
      `,
      [projectId]
    );

    if (result.rows.length === 0) {
      // Return a default methodology if not found
      return {
        slug: 'unknown',
        name: 'Unknown Methodology',
        standard: 'Unverified',
        metadataVerified: false,
        formula: '',
        parameters: [],
      };
    }

    const row = result.rows[0];
    return {
      slug: row.slug,
      name: row.name,
      standard: row.standard,
      metadataVerified: row.metadata_verified,
      formula: row.formula,
      parameters: row.parameters,
    };
  } catch (error) {
    console.error('Failed to fetch methodology for project:', error);
    return {
      slug: 'unknown',
      name: 'Unknown Methodology',
      standard: 'Unverified',
      metadataVerified: false,
      formula: '',
      parameters: [],
    };
  }
}

/**
 * Fetch the farmer profile for a project
 */
async function fetchFarmerForProject(projectId: string): Promise<FarmerProfileForScoring | null> {
  try {
    // This query assumes projects have a farmer_address reference
    const result = await db.query<{
      address: string;
      verified: boolean;
      kyc_tier: number;
      average_rating: number | null;
      review_count: number;
      joined_at: string | null;
    }>(
      `
      SELECT 
        fp.address, 
        fp.verified, 
        fp.kyc_tier, 
        fp.average_rating,
        fp.review_count,
        fp.joined_at
      FROM farmer_profiles fp
      WHERE fp.address = (SELECT farmer_address FROM carbon_projects WHERE id = $1 LIMIT 1)
      LIMIT 1
      `,
      [projectId]
    );

    if (result.rows.length === 0) {
      // Return a default farmer profile if not found
      return {
        address: 'unknown',
        verified: false,
        kycTier: 0,
        averageRating: undefined,
        reviewCount: 0,
      };
    }

    const row = result.rows[0];
    return {
      address: row.address,
      verified: row.verified,
      kycTier: row.kyc_tier,
      averageRating: row.average_rating || undefined,
      reviewCount: row.review_count || 0,
      joinedAt: row.joined_at || undefined,
    };
  } catch (error) {
    console.error('Failed to fetch farmer for project:', error);
    return {
      address: 'unknown',
      verified: false,
      kycTier: 0,
      averageRating: undefined,
      reviewCount: 0,
    };
  }
}

/**
 * Fetch the planting location (region) for a project
 */
async function fetchRegionForProject(
  projectId: string
): Promise<PlantingLocationForScoring | null> {
  try {
    const result = await db.query<{
      region: string | null;
      country: string | null;
      climate: string | null;
    }>(
      `
      SELECT pl.region, pl.country, pl.climate
      FROM planting_locations pl
      WHERE pl.id = (SELECT location_id FROM carbon_projects WHERE id = $1 LIMIT 1)
      LIMIT 1
      `,
      [projectId]
    );

    if (result.rows.length === 0) {
      return {
        region: 'Other',
        country: undefined,
        climate: undefined,
      };
    }

    const row = result.rows[0];
    return {
      region: row.region || 'Other',
      country: row.country || undefined,
      climate: row.climate || undefined,
    };
  } catch (error) {
    console.error('Failed to fetch region for project:', error);
    return {
      region: 'Other',
      country: undefined,
      climate: undefined,
    };
  }
}

/**
 * Calculate risk score for a project
 *
 * Fetches all required data, calculates sub-scores, combines into overall score,
 * and persists the result.
 */
export async function calculateAndStoreProjectRiskScore(
  projectId: string
): Promise<ProjectRiskScoreResponse | null> {
  try {
    // Fetch all required data
    const [project, methodology, farmer, region] = await Promise.all([
      fetchProjectForScoring(projectId),
      fetchMethodologyForProject(projectId),
      fetchFarmerForProject(projectId),
      fetchRegionForProject(projectId),
    ]);

    if (!project) {
      return null;
    }

    // Ensure all data is available (use defaults if not)
    const safeMethodology = methodology || {
      slug: 'unknown',
      name: 'Unknown',
      standard: 'Unverified',
      metadataVerified: false,
      formula: '',
      parameters: [],
    };

    const safeFarmer = farmer || {
      address: 'unknown',
      verified: false,
      kycTier: 0,
      averageRating: undefined,
      reviewCount: 0,
    };

    const safeRegion = region || {
      region: 'Other',
      country: undefined,
      climate: undefined,
    };

    // Calculate all sub-scores
    const subScores = calculateAllSubScores(
      project,
      safeMethodology,
      safeRegion,
      safeFarmer
    );

    // Combine into overall score
    const overallScore = combineSubScoresIntoOverallScore(subScores);

    // Determine risk rating
    const riskRating = determineRiskRating(overallScore);

    // Get data gaps documentation
    const dataGaps = identifyDataGaps();

    // Persist to database
    await persistProjectRiskScore({
      projectId,
      overallScore,
      riskRating,
      subScores,
      dataGaps,
    });

    // Return response
    return {
      projectId,
      projectName: project.name,
      overallScore,
      riskRating,
      subScores,
      weights: getWeights(),
      calculatedAt: new Date().toISOString(),
      dataGaps,
    };
  } catch (error) {
    console.error('Failed to calculate risk score for project:', error);
    return null;
  }
}

/**
 * Persist a calculated risk score to the database
 */
async function persistProjectRiskScore(data: {
  projectId: string;
  overallScore: number;
  riskRating: RiskRating;
  subScores: SubScores;
  dataGaps: string[];
}): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO project_risk_scores (
        project_id,
        overall_score,
        risk_rating,
        verifier_reputation_score,
        methodology_strength_score,
        regional_stability_score,
        farmer_track_record_score,
        data_gaps,
        calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (project_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        risk_rating = EXCLUDED.risk_rating,
        verifier_reputation_score = EXCLUDED.verifier_reputation_score,
        methodology_strength_score = EXCLUDED.methodology_strength_score,
        regional_stability_score = EXCLUDED.regional_stability_score,
        farmer_track_record_score = EXCLUDED.farmer_track_record_score,
        data_gaps = EXCLUDED.data_gaps,
        calculated_at = NOW(),
        updated_at = NOW()
      `,
      [
        data.projectId,
        data.overallScore,
        data.riskRating,
        data.subScores.verifierReputation,
        data.subScores.methodologyStrength,
        data.subScores.regionalStability,
        data.subScores.farmerTrackRecord,
        JSON.stringify(data.dataGaps),
      ]
    );
  } catch (error) {
    console.error('Failed to persist risk score:', error);
    // Non-blocking: scoring calculation succeeded, but persistence failed
    // Log the error and continue
  }
}

/**
 * Fetch a cached risk score for a project
 *
 * Returns null if not found or if cache is stale (older than 24 hours).
 */
export async function fetchCachedProjectRiskScore(
  projectId: string,
  maxAgeHours = 24
): Promise<ProjectRiskScoreResponse | null> {
  try {
    const result = await db.query<{
      overall_score: number;
      risk_rating: string;
      verifier_reputation_score: number;
      methodology_strength_score: number;
      regional_stability_score: number;
      farmer_track_record_score: number;
      data_gaps: string[];
      calculated_at: string;
    }>(
      `
      SELECT 
        overall_score,
        risk_rating,
        verifier_reputation_score,
        methodology_strength_score,
        regional_stability_score,
        farmer_track_record_score,
        data_gaps,
        calculated_at
      FROM project_risk_scores
      WHERE project_id = $1
        AND calculated_at > NOW() - INTERVAL '1 hour' * $2
      LIMIT 1
      `,
      [projectId, maxAgeHours]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Also fetch project name for the response
    const projectResult = await db.query<{ name: string }>(
      'SELECT name FROM carbon_projects WHERE id = $1 LIMIT 1',
      [projectId]
    );
    const projectName = projectResult.rows[0]?.name || undefined;

    return {
      projectId,
      projectName,
      overallScore: row.overall_score,
      riskRating: row.risk_rating as RiskRating,
      subScores: {
        verifierReputation: row.verifier_reputation_score,
        methodologyStrength: row.methodology_strength_score,
        regionalStability: row.regional_stability_score,
        farmerTrackRecord: row.farmer_track_record_score,
      },
      weights: getWeights(),
      calculatedAt: row.calculated_at,
      dataGaps: row.data_gaps || [],
    };
  } catch (error) {
    console.error('Failed to fetch cached risk score:', error);
    return null;
  }
}

/**
 * List projects by risk score
 */
export async function listProjectRiskScores(options: {
  rating?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}): Promise<{ scores: ProjectRiskScoreResponse[]; total: number }> {
  try {
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;
    const sortBy = options.sortBy === 'rating' ? 'risk_rating' : 'overall_score';
    const sortOrder = options.sortOrder === 'desc' ? 'DESC' : 'ASC';

    let query = `SELECT COUNT(*) as count FROM project_risk_scores`;
    let queryArgs: unknown[] = [];

    if (options.rating) {
      query += ` WHERE risk_rating = $1`;
      queryArgs = [options.rating];
    }

    const countResult = await db.query<{ count: number }>(query, queryArgs);
    const total = parseInt(countResult.rows[0]?.count.toString() || '0', 10);

    query = `
      SELECT 
        prs.project_id,
        cp.name as project_name,
        prs.overall_score,
        prs.risk_rating,
        prs.verifier_reputation_score,
        prs.methodology_strength_score,
        prs.regional_stability_score,
        prs.farmer_track_record_score,
        prs.data_gaps,
        prs.calculated_at
      FROM project_risk_scores prs
      LEFT JOIN carbon_projects cp ON cp.id = prs.project_id
    `;

    if (options.rating) {
      query += ` WHERE prs.risk_rating = $1`;
    }

    query += ` ORDER BY prs.${sortBy} ${sortOrder}`;
    query += ` LIMIT $${queryArgs.length + 1} OFFSET $${queryArgs.length + 2}`;

    queryArgs.push(limit, offset);

    const result = await db.query<{
      project_id: string;
      project_name: string;
      overall_score: number;
      risk_rating: string;
      verifier_reputation_score: number;
      methodology_strength_score: number;
      regional_stability_score: number;
      farmer_track_record_score: number;
      data_gaps: string[];
      calculated_at: string;
    }>(query, queryArgs);

    const scores: ProjectRiskScoreResponse[] = result.rows.map((row) => ({
      projectId: row.project_id,
      projectName: row.project_name || undefined,
      overallScore: row.overall_score,
      riskRating: row.risk_rating as RiskRating,
      subScores: {
        verifierReputation: row.verifier_reputation_score,
        methodologyStrength: row.methodology_strength_score,
        regionalStability: row.regional_stability_score,
        farmerTrackRecord: row.farmer_track_record_score,
      },
      weights: getWeights(),
      calculatedAt: row.calculated_at,
      dataGaps: row.data_gaps || [],
    }));

    return { scores, total };
  } catch (error) {
    console.error('Failed to list risk scores:', error);
    return { scores: [], total: 0 };
  }
}
