import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Coins,
  Droplets,
  Leaf,
  Minus,
  MapPin,
  Sprout,
  TreePine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';
import {
  computeIncomeGrowthPercent,
  formatHectares,
  formatTonnes,
  formatUsdcAmount,
} from '@/lib/utils/farmerSuccessStoryStats';
import { cn } from '@/lib/utils';

export interface FarmerStoryCardProps {
  story: FarmerSuccessStory;
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
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-stellar-green">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />+{percent}% vs previous season
      </span>
    );
  }

  if (percent < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        {percent}% vs previous season
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      No change vs previous season
    </span>
  );
}

/**
 * A single farmer success story card, covering income earned, land
 * transformation and environmental impact. Renders as an accessible article
 * with a disclosure section for the full case study.
 */
export function FarmerStoryCard({ story, className }: FarmerStoryCardProps) {
  const { incomeEarned, landTransformation, environmentalImpact } = story;
  const titleId = `farmer-story-${story.id}-title`;
  const growthPercent = computeIncomeGrowthPercent(story);
  const beforeImageUrl = story.beforeImageUrl ?? story.imagery?.beforeImageUrl;
  const beforeImageAlt =
    story.beforeImageAlt ?? story.imagery?.beforeImageAlt ?? 'Land before restoration';
  const afterImageUrl = story.afterImageUrl ?? story.imagery?.afterImageUrl;
  const afterImageAlt =
    story.afterImageAlt ?? story.imagery?.afterImageAlt ?? 'Land after restoration';

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'flex h-full flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
        story.featured && 'border-stellar-green/40 ring-1 ring-stellar-green/20',
        className
      )}
    >
      <header className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stellar-green/10 text-base font-bold text-stellar-green"
        >
          {getInitials(story.farmerName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="h3" variant="h4" id={titleId} className="font-semibold">
              {story.farmerName}
            </Text>
            {story.featured && <Badge variant="success">Featured</Badge>}
            {story.status === 'pending' && <Badge variant="outline">Verification pending</Badge>}
            {story.curatedQuarter && (
              <Badge variant="outline">Curated {story.curatedQuarter}</Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {story.region}, {story.country}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {story.projectName} · {story.projectType}
          </p>
        </div>
      </header>

      {(beforeImageUrl || afterImageUrl) && (
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Land transformation imagery">
          {beforeImageUrl && (
            <figure className="overflow-hidden rounded-xl border bg-muted/20">
              <div className="relative aspect-[4/3]">
                <Image
                  src={beforeImageUrl}
                  alt={beforeImageAlt}
                  fill
                  sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Before restoration
              </figcaption>
            </figure>
          )}
          {afterImageUrl && (
            <figure className="overflow-hidden rounded-xl border border-stellar-green/30 bg-stellar-green/5">
              <div className="relative aspect-[4/3]">
                <Image
                  src={afterImageUrl}
                  alt={afterImageAlt}
                  fill
                  sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stellar-green">
                After restoration
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <div>
        <p className="text-base font-semibold leading-6 text-foreground">{story.headline}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{story.summary}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <dl className="rounded-xl bg-muted/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
            Income earned
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-foreground">
            {formatUsdcAmount(incomeEarned.totalUsdc)}{' '}
            <span className="text-xs font-medium text-muted-foreground">USDC</span>
          </dd>
          <dd className="mt-1">
            <IncomeGrowth percent={growthPercent} />
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">{incomeEarned.periodLabel}</dd>
        </dl>

        <dl className="rounded-xl bg-muted/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
            Land transformation
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-foreground">
            {formatHectares(landTransformation.restoredHectares)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {landTransformation.treesPlanted.toLocaleString('en-US')} trees planted
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {landTransformation.survivalRatePercent}% survived first verification
          </dd>
        </dl>

        <dl className="rounded-xl bg-muted/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
            Environmental impact
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums text-foreground">
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

      <details className="group rounded-xl border bg-background/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue">
          Read the case study
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Land before</p>
            <p className="text-muted-foreground">{landTransformation.beforeSummary}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Land today</p>
            <p className="text-muted-foreground">{landTransformation.afterSummary}</p>
          </div>
          {story.quote && (
            <blockquote className="border-l-2 border-stellar-green pl-3 italic text-muted-foreground">
              “{story.quote}”
            </blockquote>
          )}
        </div>
      </details>

      {(story.sponsorName || story.sponsorQuote) && (
        <aside className="rounded-xl border border-stellar-blue/20 bg-stellar-blue/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stellar-blue">
            Sponsor perspective
          </p>
          <div className="mt-3 flex items-start gap-3">
            {story.sponsorPhotoUrl ? (
              <Image
                src={story.sponsorPhotoUrl}
                alt={story.sponsorPhotoAlt ?? `${story.sponsorName ?? 'Sponsor'} profile`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stellar-blue/10 text-sm font-bold text-stellar-blue"
              >
                {getInitials(story.sponsorName ?? 'Sponsor')}
              </span>
            )}
            <div className="min-w-0">
              {story.sponsorQuote && (
                <blockquote className="text-sm leading-6 text-foreground">
                  “{story.sponsorQuote}”
                </blockquote>
              )}
              {story.sponsorName && (
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {story.sponsorName}
                </p>
              )}
            </div>
          </div>
        </aside>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href={`/success-stories/${story.slug}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-stellar-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2"
        >
          View full case study
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {story.projectId && (
          <Link
            href={`/projects/${story.projectId}`}
            className="text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2"
          >
            View project
          </Link>
        )}
      </div>
    </article>
  );
}
