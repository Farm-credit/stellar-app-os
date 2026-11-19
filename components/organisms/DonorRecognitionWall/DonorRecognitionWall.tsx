'use client';

import { useEffect, useState } from 'react';
import { Text } from '@/components/atoms/Text';
import { DONOR_TIERS } from '@/lib/donor-wall/tiers';
import type { DonorWall, PublicDonorWallEntry } from '@/lib/donor-wall/service';
import { cn } from '@/lib/utils';

const TIER_STYLES: Record<string, string> = {
  platinum: 'border-slate-400/60 bg-slate-100/60 dark:bg-slate-800/40',
  gold: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20',
  silver: 'border-gray-400/50 bg-gray-50 dark:bg-gray-800/30',
  bronze: 'border-orange-600/40 bg-orange-50 dark:bg-orange-900/20',
};

function DonorCard({ entry }: { entry: PublicDonorWallEntry }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-lg border p-3', TIER_STYLES[entry.tier])}>
      {entry.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- sponsor-supplied remote logo
        <img
          src={entry.logoUrl}
          alt={`${entry.name} logo`}
          width={40}
          height={40}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-10 w-10 shrink-0 rounded-md object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold"
        >
          {entry.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {entry.totalTrees.toLocaleString()} trees funded
        </p>
      </div>
    </li>
  );
}

export function DonorRecognitionWall() {
  const [wall, setWall] = useState<DonorWall | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/donor-wall')
      .then((res) => (res.ok ? (res.json() as Promise<DonorWall>) : null))
      .then((data) => {
        if (!cancelled && data) setWall(data);
      })
      .catch(() => {
        /* The wall is optional content — stay hidden if it can't load. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wall || wall.entries.length === 0) return null;

  return (
    <section aria-labelledby="donor-wall-heading" className="w-full max-w-4xl">
      <div className="mb-6 text-center">
        <Text variant="h2" as="h2" id="donor-wall-heading">
          Donor Recognition Wall
        </Text>
        <Text variant="muted" className="mt-1">
          Celebrating the sponsors funding the most trees.
        </Text>
      </div>

      <div className="flex flex-col gap-6">
        {DONOR_TIERS.map((tier) => {
          const entries = wall.entries.filter((entry) => entry.tier === tier.id);
          if (entries.length === 0) return null;
          return (
            <div key={tier.id} data-testid={`donor-tier-${tier.id}`}>
              <Text variant="h4" as="h3" className="mb-3">
                {tier.label}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({tier.minTrees.toLocaleString()}+ trees)
                </span>
              </Text>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <DonorCard key={`${entry.name}-${entry.totalTrees}`} entry={entry} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
