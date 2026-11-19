import { NextResponse } from 'next/server';
import { computeCollectiveBargainingTerms, getCooperative } from '@/lib/api/cooperatives';
import { cooperativeErrorResponse } from '@/lib/api/cooperatives-http';

export const runtime = 'nodejs';

/**
 * GET /api/cooperatives/:id
 *
 * Full cooperative detail (members, pooled projects, bargaining rounds) plus
 * the current collective bargaining position.
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
      cooperative,
      terms: computeCollectiveBargainingTerms(id),
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}
