import { NextResponse } from 'next/server';
import { FARMER_GUIDES, searchFarmerGuides } from '@/lib/farmerGuides';

export const runtime = 'nodejs';

/**
 * GET /api/farmer-guides
 *
 * Returns the farmer best-practice library. `q` searches titles, summaries,
 * categories, and steps; `category` narrows the result to one guide category.
 */
export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const category = url.searchParams.get('category') ?? 'All';
  const guides = searchFarmerGuides(query, category);

  return NextResponse.json(
    {
      guides,
      total: guides.length,
      categories: ['All', ...new Set(FARMER_GUIDES.map((guide) => guide.category))],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
