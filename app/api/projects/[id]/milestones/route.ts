import { NextResponse } from 'next/server';
import { getProjectMilestones } from '@/lib/benefactors/milestones';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id.trim()) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  return NextResponse.json(
    { projectId: id, milestones: getProjectMilestones(id), updatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  );
}
