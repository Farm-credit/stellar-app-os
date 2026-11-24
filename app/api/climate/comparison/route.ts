import { NextResponse } from 'next/server';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  getAllProjectsClimateComparisons,
  getProjectClimateComparison,
  METEOROLOGICAL_API_SOURCE,
} from '@/lib/climate/climateComparisonService';
import type { ClimateComparisonApiResponse } from '@/lib/climate/climateComparisonTypes';

export const runtime = 'nodejs';

/**
 * GET /api/climate/comparison
 *
 * Sourced from open meteorological APIs (Open-Meteo & NASA POWER).
 * Returns annual rainfall and temperature data comparing historical 30-year normals
 * against the current year to help sponsors and ecologists assess planting conditions.
 *
 * Query Params:
 *  - projectId: optional filter for a specific project
 *  - year: optional target year (default: 2026)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId')?.trim();
  const yearParam = searchParams.get('year');
  const targetYear = yearParam ? Number(yearParam) : 2026;

  if (projectId) {
    const project = mockCarbonProjects.find((p) => p.id === projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const comparison = getProjectClimateComparison(project, targetYear);
    const response: ClimateComparisonApiResponse = {
      source: METEOROLOGICAL_API_SOURCE,
      timestamp: new Date().toISOString(),
      projects: [comparison],
    };
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  }

  const comparisons = getAllProjectsClimateComparisons(mockCarbonProjects, targetYear);
  const response: ClimateComparisonApiResponse = {
    source: METEOROLOGICAL_API_SOURCE,
    timestamp: new Date().toISOString(),
    projects: comparisons,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
