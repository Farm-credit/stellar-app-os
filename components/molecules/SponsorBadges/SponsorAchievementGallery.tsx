import { Award, Download, Lock, Share2 } from 'lucide-react';
import { achievementImagePath } from '@/lib/api/sponsor-achievements';
import {
  shareTextForAchievement,
  type SponsorAchievement,
} from '@/lib/gamification/sponsor-achievements';

interface SponsorAchievementGalleryProps {
  achievements: SponsorAchievement[];
  sponsorAddress: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Public badge gallery: earned badges with share links, locked ones with progress. */
export function SponsorAchievementGallery({
  achievements,
  sponsorAddress,
}: SponsorAchievementGalleryProps) {
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <section aria-labelledby="achievement-gallery-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id="achievement-gallery-heading"
            className="text-2xl font-semibold text-slate-900 dark:text-white"
          >
            Badge gallery
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Awarded automatically as milestones are reached
          </p>
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {earnedCount}/{achievements.length} earned
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map((badge) => (
          <li
            key={badge.id}
            aria-label={`${badge.name}: ${badge.earned ? 'earned' : 'not yet earned'}`}
            className={`rounded-2xl border p-4 ${
              badge.earned
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-800 dark:text-amber-200'
                : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <Award className="h-7 w-7" aria-hidden="true" />
              {badge.earned ? (
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Earned {badge.earnedAt ? formatDate(badge.earnedAt) : ''}
                </span>
              ) : (
                <Lock className="h-4 w-4" aria-label="Locked" />
              )}
            </div>
            <p className="mt-4 font-semibold">{badge.name}</p>
            <p className="mt-1 text-sm opacity-80">{badge.description}</p>
            {badge.earned ? (
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
                <a
                  href={achievementImagePath(sponsorAddress, badge.id)}
                  download={`${badge.id}.png`}
                  className="inline-flex items-center gap-1 underline"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Share image
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    shareTextForAchievement(badge)
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  Post
                </a>
              </div>
            ) : (
              <p className="mt-3 text-xs">
                {badge.current}/{badge.target} {badge.unit}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
