/**
 * GET /api/v2/projects/:id/risk-score
 *
 * Issue #1294: Buyer risk scoring for project sustainability
 *
 * Calculates and returns a risk score for a given carbon credit project.
 * The score is based on verifier reputation, methodology strength, regional
 * stability, and farmer track record.
 *
 * Cached for 24 hours unless force=true is passed.
 *
 * Response:
 * - 200: { success: true, riskScore: ProjectRiskScoreResponse }
 * - 404: { error: "Project not found" }
 * - 400: { error: "Invalid request", details: string[] }
 * - 500: { error: "Failed to calculate risk score" }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  calculateAndStoreProjectRiskScore,
  fetchCachedProjectRiskScore,
} from '@/lib/services/project-risk-score.service';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  getRiskScoreParamsSchema,
  riskScoreSuccessResponseSchema,
  errorResponseSchema,
  projectRiskScoreResponseSchema,
} from '@/lib/schemas/project-risk-score.schema';

export const runtime = 'nodejs';

function headers(): Record<string, string> {
  return {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: projectId } = await params;
    const url = new URL(request.url);
    const useCache = url.searchParams.get('useCache') !== 'false';
    const force = url.searchParams.get('force') === 'true';

    // Validate project ID
    if (!projectId || projectId.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: ['Project ID is required and must be non-empty'],
        },
        { status: 400, headers: headers() }
      );
    }

    // Try to fetch cached score if not forced
    if (useCache && !force) {
      const cachedScore = await fetchCachedProjectRiskScore(projectId);
      if (cachedScore) {
        return NextResponse.json(
          {
            success: true,
            riskScore: cachedScore,
          },
          {
            status: 200,
            headers: {
              ...headers(),
              'X-Cache': 'HIT',
            },
          }
        );
      }
    }

    // Calculate fresh score
    const riskScore = await calculateAndStoreProjectRiskScore(projectId);

    if (!riskScore) {
      return NextResponse.json(
        {
          error: 'Project not found',
          details: [`Project ID '${projectId}' does not exist`],
        },
        { status: 404, headers: headers() }
      );
    }

    return NextResponse.json(
      {
        success: true,
        riskScore,
      },
      {
        status: 200,
        headers: {
          ...headers(),
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error calculating project risk score:', errorMessage, error);

    return NextResponse.json(
      {
        error: 'Failed to calculate risk score',
        details: [errorMessage],
      },
      { status: 500, headers: headers() }
    );
  }
}
