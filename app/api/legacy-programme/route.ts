import { NextResponse } from 'next/server';
import { getMockTrees } from '@/lib/api/mock/trees';
import { buildLegacyGroveReport, getLegacyStatus } from '@/lib/legacy-programme';

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const sponsorName = url.searchParams.get('sponsorName')?.trim();
  const commitmentYears = Number(url.searchParams.get('commitmentYears') ?? 0);
  if (!sponsorName || !Number.isFinite(commitmentYears) || commitmentYears < 0) {
    return NextResponse.json(
      { error: 'sponsorName and a non-negative commitmentYears are required' },
      { status: 400 }
    );
  }
  const trees = getMockTrees().filter((tree) => tree.sponsorName === sponsorName);
  const status = getLegacyStatus(
    sponsorName,
    commitmentYears,
    url.searchParams.get('groveName') ?? undefined
  );
  return NextResponse.json({
    status,
    report: status.eligible
      ? buildLegacyGroveReport(sponsorName, trees, commitmentYears, status.groveName ?? undefined)
      : null,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      sponsorName?: string;
      commitmentYears?: number;
      groveName?: string;
    };
    const sponsorName = body.sponsorName?.trim();
    const commitmentYears = Number(body.commitmentYears);
    if (!sponsorName || !Number.isFinite(commitmentYears) || commitmentYears < 10) {
      return NextResponse.json(
        { error: 'Legacy programme requires a 10+ year commitment' },
        { status: 400 }
      );
    }
    const trees = getMockTrees().filter((tree) => tree.sponsorName === sponsorName);
    return NextResponse.json(
      { report: buildLegacyGroveReport(sponsorName, trees, commitmentYears, body.groveName) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 }
    );
  }
}
