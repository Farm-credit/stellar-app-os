import { NextResponse } from 'next/server';
import { getTreeHealthHistory } from '@/lib/tree-health/repository';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id.trim()) {
    return NextResponse.json({ error: 'Tree id is required' }, { status: 400 });
  }
  try {
    const predictions = await getTreeHealthHistory(id.trim());
    const publicPredictions = predictions.map(
      ({ photo_ref: _photoRef, ...prediction }) => prediction
    );
    return NextResponse.json(
      { predictions: publicPredictions },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('[trees/:id/health] GET failed:', error);
    return NextResponse.json({ error: 'Tree-health history is unavailable' }, { status: 503 });
  }
}
