import { NextResponse } from 'next/server';
import { getProjectFireRisk, updateProjectFireRisk } from '@/lib/fire-risk';

export function GET(request: Request): NextResponse {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  return NextResponse.json(getProjectFireRisk(projectId), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      latitude?: number;
      longitude?: number;
      sponsorEmails?: string[];
    };
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!body.projectId || !Number.isFinite(latitude) || !Number.isFinite(longitude))
      return NextResponse.json(
        { error: 'projectId, latitude, and longitude are required' },
        { status: 400 }
      );
    return NextResponse.json(
      await updateProjectFireRisk(body.projectId, latitude, longitude, body.sponsorEmails ?? [])
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fire-risk update failed' },
      { status: 502 }
    );
  }
}
