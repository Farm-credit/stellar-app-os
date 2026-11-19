import { NextResponse } from 'next/server';
import {
  addPooledProject,
  computeCollectiveBargainingTerms,
  getCooperative,
  removePooledProject,
} from '@/lib/api/cooperatives';
import {
  cooperativeErrorResponse,
  invalidJsonResponse,
  readJsonBody,
} from '@/lib/api/cooperatives-http';
import type { AddPooledProjectInput } from '@/lib/types/cooperative';

export const runtime = 'nodejs';

/**
 * GET /api/cooperatives/:id/pool
 *
 * Returns the cooperative's pooled projects and the discount tier reached.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cooperative = getCooperative(id);
    return NextResponse.json({
      success: true,
      pooledProjects: cooperative.pooledProjects,
      pooledQuantityTons: cooperative.pooledProjects.reduce(
        (sum, item) => sum + item.quantityTons,
        0
      ),
      terms: computeCollectiveBargainingTerms(id),
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * POST /api/cooperatives/:id/pool
 *
 * Contributes a marketplace project (or part of it) to the shared pool.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody<AddPooledProjectInput>(request);
    if (!body) return invalidJsonResponse();

    const pooled = addPooledProject(id, body);
    return NextResponse.json(
      {
        success: true,
        pooledProject: pooled,
        terms: computeCollectiveBargainingTerms(id),
      },
      { status: 201 }
    );
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * DELETE /api/cooperatives/:id/pool?pooledProjectId=…&requesterId=…
 *
 * Withdraws a pooled contribution. Only the contributor or a cooperative
 * admin may remove a pooled project.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const pooledProjectId = searchParams.get('pooledProjectId');
    const requesterId = searchParams.get('requesterId') ?? undefined;

    if (!pooledProjectId) {
      return NextResponse.json(
        { success: false, error: 'pooledProjectId is required' },
        { status: 400 }
      );
    }

    const cooperative = removePooledProject(id, pooledProjectId, requesterId);
    return NextResponse.json({
      success: true,
      cooperative,
      terms: computeCollectiveBargainingTerms(id),
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}
