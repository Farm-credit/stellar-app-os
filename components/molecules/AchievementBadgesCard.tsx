'use client';

import React from 'react';
import type { AchievementBadgeProgress, SponsorshipMilestones } from '@/lib/types/sponsor-badge';
import { getAchievementBadgeProgress } from '@/lib/gamification/achievement-badges';

interface AchievementBadgesCardProps {
  milestones?: SponsorshipMilestones;
}

export function AchievementBadgesCard({
  milestones = {
    totalTreesSponsored: 105,
    totalCO2OffsetKg: 1250000,
    uniqueRegionsSponsored: 6,
  },
}: AchievementBadgesCardProps) {
  const badgeProgress = getAchievementBadgeProgress(milestones);
  const unlockedCount = badgeProgress.filter((b) => b.isUnlocked).length;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span>🏆</span> Achievement Badges
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Unlock exclusive badges by reaching tree sponsorship and CO₂ offset milestones.
          </p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-2xl text-center self-start sm:self-auto">
          <div className="text-xs font-semibold text-emerald-600 uppercase">Badges Unlocked</div>
          <div className="text-xl font-extrabold text-emerald-600">
            {unlockedCount} / {badgeProgress.length}
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {badgeProgress.map(({ badge, currentValue, threshold, progressPercent, isUnlocked }) => (
          <div
            key={badge.id}
            className={`relative rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between ${
              isUnlocked
                ? 'bg-gradient-to-br from-card via-emerald-950/10 to-card border-emerald-500/40 shadow-md'
                : 'bg-muted/40 border-border opacity-75'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner shrink-0 ${
                  isUnlocked
                    ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-emerald-500/20'
                    : 'bg-muted border border-border text-muted-foreground grayscale'
                }`}
              >
                {badge.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground truncate">{badge.name}</h3>
                  {isUnlocked && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-extrabold text-emerald-600 uppercase">
                      Unlocked
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {badge.description}
                </p>
              </div>
            </div>

            {/* Progress Bar & Numeric Indicator */}
            <div className="mt-4 pt-3 border-t border-border/60 space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Progress</span>
                <span className={isUnlocked ? 'text-emerald-600 font-bold' : 'text-foreground'}>
                  {currentValue.toLocaleString()} / {threshold.toLocaleString()} {badge.metricUnit} ({progressPercent}%)
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden border border-border/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isUnlocked
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-emerald-600/50'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {isUnlocked && (
                <p className="text-[11px] font-medium text-emerald-600 mt-1">
                  ✨ {badge.unlockedMessage}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
