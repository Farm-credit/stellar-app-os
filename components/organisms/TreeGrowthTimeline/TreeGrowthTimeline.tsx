'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CalendarDays,
  Flag,
  Leaf,
  MapPin,
  Ruler,
  Sprout,
  Trees,
  Wind,
} from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type {
  GrowthPhoto,
  TreeGrowthTimeline as TreeGrowthTimelineData,
} from '@/lib/types/tree-growth';
import { cn } from '@/lib/utils';

interface TreeGrowthTimelineProps {
  timeline: TreeGrowthTimelineData;
  /** Where the "back" link points. */
  backHref?: string;
}

const MILESTONE_ICONS = {
  planted: Sprout,
  'first-photo': Camera,
  'knee-high': Ruler,
  'waist-high': Ruler,
  'first-anniversary': CalendarDays,
  'canopy-closed': Trees,
  verified: Leaf,
  'awaiting-planting': Sprout,
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet planted';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Leaf;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="mb-2 h-5 w-5 text-stellar-green" aria-hidden />
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function MilestoneBadge({ photo }: { photo: GrowthPhoto }) {
  const milestone = photo.milestone;
  if (!milestone) return null;

  const Icon = MILESTONE_ICONS[milestone.type] ?? Flag;

  return (
    <div className="mt-3 rounded-lg border border-stellar-green/40 bg-stellar-green/10 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-stellar-green">
        <Icon className="h-4 w-4" aria-hidden />
        {milestone.label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{milestone.description}</p>
    </div>
  );
}

function PhotoCard({ photo, isLatest }: { photo: GrowthPhoto; isLatest: boolean }) {
  return (
    <li className="relative pl-10 sm:pl-14">
      {/* Timeline rail dot */}
      <span
        aria-hidden
        className={cn(
          'absolute left-2.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 sm:left-4',
          photo.milestone
            ? 'border-stellar-green bg-stellar-green'
            : 'border-muted-foreground/40 bg-background'
        )}
      />

      <Card>
        <div className="overflow-hidden rounded-t-xl border-b border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.imageUrl}
            alt={`Growth photo for month ${photo.monthIndex + 1} of tree ${photo.caption}`}
            loading="lazy"
            className="h-48 w-full object-cover sm:h-64"
          />
        </div>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              <time dateTime={photo.capturedAt}>{photo.caption}</time>
            </CardTitle>
            {isLatest ? (
              <span className="rounded-full bg-stellar-green/15 px-2 py-0.5 text-xs font-semibold text-stellar-green">
                Latest
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Height</dt>
              <dd className="text-sm font-semibold">{photo.heightCm} cm</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Canopy</dt>
              <dd className="text-sm font-semibold">{photo.canopyCm} cm</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">CO₂ total</dt>
              <dd className="text-sm font-semibold">{photo.cumulativeCo2Kg} kg</dd>
            </div>
          </dl>
          <MilestoneBadge photo={photo} />
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * Immersive sponsor growth story: month-by-month photos, milestones and
 * impact metrics for a single sponsored tree (Issue #1102).
 */
export function TreeGrowthTimeline({ timeline, backHref = '/impact' }: TreeGrowthTimelineProps) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

  const visiblePhotos = useMemo(
    () =>
      selectedYear === 'all'
        ? timeline.photos
        : timeline.photos.filter((photo) => photo.year === selectedYear),
    [timeline.photos, selectedYear]
  );

  const { impact } = timeline;

  if (timeline.awaitingPlanting) {
    return (
      <section
        data-testid="tree-growth-timeline"
        aria-labelledby="growth-story-heading"
        className="mx-auto max-w-3xl px-4 py-6 sm:py-10"
      >
        <Card>
          <CardHeader>
            <CardTitle id="growth-story-heading" className="flex items-center gap-2">
              <Sprout className="h-5 w-5 text-stellar-green" aria-hidden />
              Your tree&apos;s story
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Text variant="muted">{timeline.milestones[0]?.description}</Text>
            <Text variant="muted" className="text-xs">
              {timeline.treeId} · {timeline.species} · {timeline.region}
            </Text>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section
      data-testid="tree-growth-timeline"
      aria-labelledby="growth-story-heading"
      className="mx-auto max-w-3xl px-4 py-6 sm:py-10"
    >
      <Link
        href={backHref}
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to tree
      </Link>

      <header className="mb-6 space-y-3">
        <Text variant="label" as="p">
          Sponsor story
        </Text>
        <Text variant="h2" as="h1" id="growth-story-heading" className="text-2xl sm:text-3xl">
          {timeline.species} · {timeline.treeId}
        </Text>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden />
            {timeline.region}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Planted {formatDate(timeline.plantedAt)}
          </span>
        </div>
        <Text variant="muted" as="p">
          {timeline.photos.length} monthly photos across {impact.yearsCovered}{' '}
          {impact.yearsCovered === 1 ? 'year' : 'years'} · {timeline.projectName}
        </Text>
      </header>

      <div data-testid="growth-impact" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Wind}
          label="CO₂ absorbed"
          value={`${impact.cumulativeCo2Kg} kg`}
          detail={`${impact.cumulativeCo2Tonnes} t total`}
        />
        <StatCard icon={Ruler} label="Height now" value={`${impact.heightCm} cm`} />
        <StatCard icon={Trees} label="Canopy width" value={`${impact.canopyCm} cm`} />
        <StatCard
          icon={Flag}
          label="Milestones"
          value={`${impact.milestonesReached}`}
          detail={`${impact.monthsDocumented} photos`}
        />
      </div>

      <div role="group" aria-label="Filter photos by year" className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={selectedYear === 'all'}
          onClick={() => setSelectedYear('all')}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            selectedYear === 'all'
              ? 'border-stellar-green bg-stellar-green text-white'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          All years
        </button>
        {timeline.years.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={selectedYear === year}
            onClick={() => setSelectedYear(year)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              selectedYear === year
                ? 'border-stellar-green bg-stellar-green text-white'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {year === 0 ? 'First year' : `Year ${year}`}
          </button>
        ))}
      </div>

      <ol
        aria-label="Growth photo timeline"
        className="relative space-y-6 border-l border-border pl-0 sm:ml-4"
        style={{ listStyle: 'none' }}
      >
        {[...visiblePhotos].reverse().map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            isLatest={photo.monthIndex === timeline.photos[timeline.photos.length - 1]?.monthIndex}
          />
        ))}
      </ol>

      {visiblePhotos.length === 0 ? (
        <Text variant="muted" as="p">
          No photos were captured in that year.
        </Text>
      ) : null}
    </section>
  );
}
