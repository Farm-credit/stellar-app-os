import { NextRequest, NextResponse } from 'next/server';
import { getAchievementBadgeProgress } from '@/lib/gamification/achievement-badges';
import type { SponsorshipMilestones } from '@/lib/types/sponsor-badge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const trees = Number(searchParams.get('trees') || 105);
    const co2 = Number(searchParams.get('co2') || 1250000);
    const regions = Number(searchParams.get('regions') || 6);

    const userMilestones: SponsorshipMilestones = {
      totalTreesSponsored: trees,
      totalCO2OffsetKg: co2,
      uniqueRegionsSponsored: regions,
      userJoinDate: '2025-01-15T10:00:00Z',
    };

    const badgeProgress = getAchievementBadgeProgress(userMilestones);
    const unlockedCount = badgeProgress.filter((b) => b.isUnlocked).length;

    return NextResponse.json({
      success: true,
      milestones: userMilestones,
      unlockedCount,
      totalBadges: badgeProgress.length,
      badges: badgeProgress,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch achievement badges' },
      { status: 500 }
    );
  }
}
