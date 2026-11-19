/**
 * /api/v2/risk-scores — Issue #1418 & #1294
 *
 * Buyer risk scoring for project sustainability. Each project is scored on
 * verifier reputation, methodology strength, regional stability and farmer
 * track record (see `lib/scoring/buyer-risk-scoring.ts`).
 *
 * GET /api/v2/risk-scores
 *   → { success: true, data: ProjectRiskScore[] } ranked lowest risk first
 *   ?rating=Low|Medium|High      optional filter
 *   ?limit=20                    optional limit (default 20, max 100)
 *   ?offset=0                    optional offset for pagination
 *
 * GET /api/v2/risk-scores?projectId=proj-001
 *   → { success: true, riskScore: ProjectRiskScore }, 404 if the project is unknown
 *
 * POST /api/v2/risk-scores
 *   Body: ProjectRiskInput — scores a project from caller-supplied inputs (legacy sample data)
 *   → 200 ProjectRiskScore | 400 { error, details: string[] }
 *
 * Closes #1418 & #1294
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SAMPLE_PROJECT_RISK_INPUTS,
  calculateProjectRiskScore,
  findSampleProjectRiskInput,
  rankProjectsByRisk,
  type ProjectRiskInput,
  type RiskRating,
} from '@/backend/src/services/projectRiskScoring';
import { listProjectRiskScores } from '@/lib/services/project-risk-score.service';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const RATINGS: readonly RiskRating[] = ['Low', 'Medium', 'High'];

const share = z.number().min(0).max(1);
const count = z.number().int().min(0);

const projectRiskInputSchema = z.object({
  projectId: z.string().trim().min(1).max(100),
  projectName: z.string().trim().min(1).max(200),
  verifier: z.object({
    name: z.string().trim().min(1).max(200),
    accreditations: z.array(z.string().trim().min(1).max(100)).max(20),
    yearsActive: z.number().min(0).max(100),
    verificationsCompleted: count,
    reversalRate: share,
    disputesUpheld: count,
  }),
  methodology: z.object({
    standard: z.enum([
      'Verra VCS',
      'Gold Standard',
      'Plan Vivo',
      'Climate Action Reserve',
      'American Carbon Registry',
      'Unverified',
    ]),
    permanenceYears: z.number().min(0).max(1000),
    bufferPoolShare: share,
    hasThirdPartyMonitoring: z.boolean(),
    additionalityTested: z.boolean(),
    leakageAssessed: z.boolean(),
  }),
  region: z.object({
    country: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    politicalStability: z.number().min(-2.5).max(2.5),
    climateHazard: share,
    landTenureSecurity: share,
  }),
  farmer: z.object({
    yearsFarming: z.number().min(0).max(100),
    projectsCompleted: count,
    averageSurvivalRate: share,
    deliveryRatio: z.number().min(0).max(2),
    complianceIncidents: count,
  }),
});

function headers(): Record<string, string> {
  return {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const rating = url.searchParams.get('rating');
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '20', 10) || 20,
    100
  );
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  if (projectId) {
    const input = findSampleProjectRiskInput(projectId);
    if (!input) {
      return NextResponse.json(
        { error: `Unknown project: ${projectId}` },
        { status: 404, headers: headers() }
      );
    }
    return NextResponse.json(
      { success: true, riskScore: calculateProjectRiskScore(input) },
      { headers: headers() }
    );
  }

  if (rating && !RATINGS.includes(rating as RiskRating)) {
    return NextResponse.json(
      { error: 'Invalid rating', details: [`rating must be one of ${RATINGS.join(', ')}`] },
      { status: 400, headers: headers() }
    );
  }

  const ranked = rankProjectsByRisk(SAMPLE_PROJECT_RISK_INPUTS);
  const projects = rating ? ranked.filter((p) => p.rating === rating) : ranked;
  const paginatedProjects = projects.slice(offset, offset + limit);

  return NextResponse.json(
    {
      success: true,
      data: paginatedProjects,
      total: projects.length,
      limit,
      offset,
    },
    { headers: headers() }
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', details: ['Request body must be valid JSON'] },
      { status: 400, headers: apiVersionHeaders('v2') }
    );
  }

  const parsed = projectRiskInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid risk scoring input',
        details: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      },
      { status: 400, headers: apiVersionHeaders('v2') }
    );
  }

  const score = calculateProjectRiskScore(parsed.data as ProjectRiskInput);
  return NextResponse.json(
    { success: true, riskScore: score },
    {
      headers: {
        'Cache-Control': 'no-store',
        ...(apiVersionHeaders('v2') as Record<string, string>),
      },
    }
  );
}
