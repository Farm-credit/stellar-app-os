import Link from 'next/link';
import {
  ArrowLeft,
  Coins,
  Droplets,
  Leaf,
  MapPin,
  Minus,
  Sprout,
  TreePine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';
import {
  computeIncomeGrowthPercent,
  formatHectares,
  formatTonnes,
  formatUsdcAmount,
} from '@/lib/utils/farmerSuccessStoryStats';
import { cn } from '@/lib/utils';

export interface FarmerStoryDetailProps {
  story: FarmerSuccessStory;
  /** Optional related case studies rendered at the foot of the page. */
  relatedStories?: FarmerSuccessStory[];
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function IncomeGrowth({ percent }: { percent: number }) {
  if (percent > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-stellar-green">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />+{percent}% vs previous season
      </span>
    );
  }

  if (percent < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
        <TrendingDown className="h-4 w-4" aria-hidden="true" />
        {percent}% vs previous season
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
      <Minus className="h-4 w-4" aria-hidden="true" />
      No change vs previous season
    </span>
  );
}

/**
 * Full-page view of a single farmer success story. Covers the three axes the
 * issue asks for — income earned, land transformation and environmental impact —
 * plus the case-study narrative (land before / land today) and the farmer quote.
 */
export function FarmerStoryDetail({
  story,
  relatedStories = [],
  className,
}: FarmerStoryDetailProps) {
  const { incomeEarned, landTransformation, environmentalImpact } = story;
  const growthPercent = computeIncomeGrowthPercent(story);
  const publishedDate = new Date(story.storyDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });

  return (
    <article
      aria-labelledby="farmer-story-detail-title"
      className={cn('mx-auto w-full max-w-3xl', className)}
      data-testid="farmer-story-detail"
    >
      <Link
        href="/success-stories"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stellar-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All success stories
      </Link>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{story.projectType}</Badge>
          {story.status === 'verified' ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="outline">Verification pending</Badge>
          )}
          {story.featured && <Badge variant="default">Featured</Badge>}
        </div>

        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-stellar-green/10 text-lg font-bold text-stellar-green"
          >
            {getInitials(story.farmerName)}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">{story.farmerName}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {story.region}, {story.country}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {story.projectName} · published{' '}
              <time dateTime={story.storyDate}>{publishedDate}</time>
            </p>
          </div>
        </div>

        <h1
          id="farmer-story-detail-title"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {story.headline}
        </h1>
        <p className="text-lg leading-8 text-muted-foreground">{story.summary}</p>
      </header>

      {story.quote && (
        <blockquote className="mt-8 rounded-2xl border-l-4 border-stellar-green bg-stellar-green/5 p-5 text-base italic text-foreground">
          “{story.quote}”
          <footer className="mt-2 text-sm not-italic text-muted-foreground">
            — {story.farmerName}
          </footer>
        </blockquote>
      )}

      <section aria-labelledby="farmer-story-outcomes" className="mt-10">
        <h2 id="farmer-story-outcomes" className="text-xl font-semibold">
          Outcomes achieved
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <dl className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              Income earned
            </dt>
            <dd className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {formatUsdcAmount(incomeEarned.totalUsdc)}
            </dd>
            <dd className="mt-1">
              <IncomeGrowth percent={growthPercent} />
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">{incomeEarned.periodLabel}</dd>
          </dl>

          <dl className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
              Land restoration
            </dt>
            <dd className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {formatHectares(landTransformation.restoredHectares)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {landTransformation.treesPlanted.toLocaleString('en-US')} trees planted
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {landTransformation.survivalRatePercent}% survived first verification
            </dd>
          </dl>

          <dl className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              Environmental impact
            </dt>
            <dd className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {formatTonnes(environmentalImpact.co2SequesteredTonnes)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {environmentalImpact.nativeSpeciesCount} native species
            </dd>
            {typeof environmentalImpact.waterRetainedMegalitres === 'number' && (
              <dd className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                {environmentalImpact.waterRetainedMegalitres} ML water retained
              </dd>
            )}
            {typeof environmentalImpact.soilHealthImprovementPercent === 'number' && (
              <dd className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Sprout className="h-3.5 w-3.5" aria-hidden="true" />+
                {environmentalImpact.soilHealthImprovementPercent}% soil health
              </dd>
            )}
          </dl>
        </div>
      </section>

      <section aria-labelledby="farmer-story-transformation" className="mt-10">
        <h2 id="farmer-story-transformation" className="text-xl font-semibold">
          Land transformation
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-dashed p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Land before
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {landTransformation.beforeSummary}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatHectares(landTransformation.degradedHectaresBefore)} degraded
            </p>
          </div>
          <div className="rounded-xl border border-stellar-green/40 bg-stellar-green/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-stellar-green">
              Land today
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {landTransformation.afterSummary}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatHectares(landTransformation.restoredHectares)} under restoration
            </p>
          </div>
        </div>
      </section>

      {relatedStories.length > 0 && (
        <section aria-labelledby="farmer-story-related" className="mt-12 border-t pt-8">
          <h2 id="farmer-story-related" className="text-xl font-semibold">
            More case studies
          </h2>
          <ul className="mt-4 grid list-none gap-3 p-0">
            {relatedStories.map((related) => (
              <li key={related.id}>
                <Link
                  href={`/success-stories/${related.slug}`}
                  className="block rounded-xl border bg-card p-4 transition-colors hover:border-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-foreground">{related.farmerName}</span>
                  <span className="mx-2 text-muted-foreground" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-sm text-muted-foreground">{related.headline}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
