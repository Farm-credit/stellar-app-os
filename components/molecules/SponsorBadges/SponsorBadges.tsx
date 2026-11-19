import { Award, Lock } from 'lucide-react';
import { getSponsorBadges, SPONSOR_BADGES } from '@/lib/gamification/sponsor-badges';
import type { SponsorBadgeTier } from '@/lib/types/sponsor-badge';

const TIER_STYLES: Record<SponsorBadgeTier, string> = {
  bronze: 'border-orange-700/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  silver: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-200',
  gold: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300',
  platinum: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300',
};

interface SponsorBadgesProps {
  totalTrees: number;
}

export function SponsorBadges({ totalTrees }: SponsorBadgesProps) {
  const earnedIds = new Set(getSponsorBadges(totalTrees).map((badge) => badge.id));

  return (
    <section aria-labelledby="sponsor-badges-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="sponsor-badges-heading" className="text-2xl font-semibold text-slate-900 dark:text-white">
            Sponsor badges
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Milestones earned from trees sponsored
          </p>
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {earnedIds.size}/{SPONSOR_BADGES.length} earned
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SPONSOR_BADGES.map((badge) => {
          const earned = earnedIds.has(badge.id);
          return (
            <div
              key={badge.id}
              className={`rounded-2xl border p-4 ${
                earned ? TIER_STYLES[badge.id] : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500'
              }`}
              aria-label={`${badge.name}: ${earned ? 'earned' : 'not yet earned'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Award className="h-7 w-7" aria-hidden="true" />
                {earned ? (
                  <span className="text-xs font-semibold uppercase tracking-wide">Earned</span>
                ) : (
                  <Lock className="h-4 w-4" aria-label="Locked" />
                )}
              </div>
              <p className="mt-4 font-semibold">{badge.name}</p>
              <p className="mt-1 text-sm opacity-80">{badge.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
