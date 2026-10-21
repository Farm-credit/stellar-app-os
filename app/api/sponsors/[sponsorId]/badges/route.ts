/**
 * GET /api/sponsors/:sponsorId/badges — Issue #1687
 * Achievement badges for a sponsor, with share image links for earned ones.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { achievementImagePath, getAchievementsForSponsor } from '@/lib/api/sponsor-achievements';
import { shareTextForAchievement } from '@/lib/gamification/sponsor-achievements';

interface RouteParams {
  params: Promise<{ sponsorId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { sponsorId } = await params;
  const address = decodeURIComponent(sponsorId);
  const achievements = getAchievementsForSponsor(address);
  if (!achievements) {
    return NextResponse.json({ success: false, error: 'Sponsor not found' }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    earnedCount: achievements.filter((a) => a.earned).length,
    badges: achievements.map((a) => ({
      ...a,
      shareText: a.earned ? shareTextForAchievement(a) : null,
      imageUrl: a.earned ? achievementImagePath(address, a.id) : null,
    })),
  });
}
