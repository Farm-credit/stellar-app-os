'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TreePine, Trophy } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card, CardContent } from '@/components/molecules/Card';
import type {
  LeaderboardPeriod,
  SponsorType,
  TreeSponsorSnapshot,
} from '@/lib/leaderboard/treeSponsorsSchema';

export function TreeSponsorLeaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly');
  const [sponsorType, setSponsorType] = useState<SponsorType>('individual');
  return (
    <section
      aria-label="Tree sponsorship rankings"
      className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6"
    >
      <header className="space-y-4">
        <Link href="/leaderboard" className="text-sm text-stellar-blue underline">
          All leaderboards
        </Link>
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 shrink-0 text-stellar-green" aria-hidden="true" />
          <h1 className="text-3xl font-bold sm:text-4xl">Tree sponsorship leaderboard</h1>
        </div>
        <p className="max-w-2xl text-muted-foreground">
          Celebrating the people and organisations growing our forests. Rankings count sponsored
          trees from sponsors who choose to appear publicly.
        </p>
        <Link href="/settings" className="inline-block text-stellar-blue underline">
          Manage your visibility in Settings / Leaderboard
        </Link>
      </header>
      <div className="flex flex-wrap gap-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Time period</legend>
          <div className="flex gap-2">
            {(['monthly', 'all-time'] as const).map((value) => (
              <Button
                key={value}
                variant={period === value ? 'default' : 'outline'}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value === 'monthly' ? 'This month' : 'All time'}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sponsor category</legend>
          <div className="flex gap-2">
            {(['individual', 'corporate'] as const).map((value) => (
              <Button
                key={value}
                variant={sponsorType === value ? 'default' : 'outline'}
                aria-pressed={sponsorType === value}
                onClick={() => setSponsorType(value)}
              >
                {value === 'individual' ? 'Individuals' : 'Corporates'}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>
      <Rankings key={`${period}:${sponsorType}`} period={period} sponsorType={sponsorType} />
      <p className="text-sm text-muted-foreground">
        Top 100 sponsors. Equal totals share a rank. Monthly totals start on the first day of the
        current month at 00:00 UTC. Corporate categories are self-declared.
      </p>
    </section>
  );
}

function Rankings({
  period,
  sponsorType,
}: {
  period: LeaderboardPeriod;
  sponsorType: SponsorType;
}) {
  const [snapshot, setSnapshot] = useState<TreeSponsorSnapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const load = async () => {
      if (!active) return;
      clearTimeout(timer);
      const requestGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/leaderboard/tree-sponsors?period=${period}&type=${sponsorType}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const data = (await response.json()) as TreeSponsorSnapshot;
        if (active && requestGeneration === generation) {
          setSnapshot(data);
          setError(false);
        }
      } catch (err) {
        if (
          active &&
          requestGeneration === generation &&
          !(err instanceof Error && err.name === 'AbortError')
        ) {
          setSnapshot(null);
          setError(true);
        }
      } finally {
        if (active && requestGeneration === generation)
          timer = setTimeout(() => {
            if (!document.hidden) void load();
          }, 5000);
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
      else {
        ++generation;
        controller?.abort();
      }
    };
    void load();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [period, sponsorType]);
  if (error)
    return (
      <div role="alert" className="rounded-lg border p-6">
        The leaderboard is temporarily unavailable. Retrying automatically...
      </div>
    );
  if (!snapshot) return <p role="status">Loading sponsors...</p>;
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <p role="status" className="mb-5 text-sm text-muted-foreground">
          Updates every 5 seconds / Last updated {new Date(snapshot.updatedAt).toLocaleTimeString()}
        </p>
        {snapshot.entries.length === 0 ? (
          <div className="py-12 text-center">
            <TreePine className="mx-auto mb-3 h-10 w-10 text-stellar-green" aria-hidden="true" />
            <h2 className="text-xl font-semibold">Be among the first</h2>
            <p className="mt-2 text-muted-foreground">
              No opted-in {sponsorType === 'individual' ? 'individuals' : 'corporates'} have
              sponsored trees in this period yet.
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <caption className="sr-only">
              {period === 'monthly' ? 'Monthly' : 'All-time'} {sponsorType} tree sponsorship
              rankings
            </caption>
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th scope="col" className="py-3 pr-3">
                  Rank
                </th>
                <th scope="col" className="py-3">
                  Sponsor
                </th>
                <th scope="col" className="py-3 pl-3 text-right">
                  Trees sponsored
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.entries.map((entry, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="py-4 pr-3 font-semibold">{entry.rank}</td>
                  <th scope="row" className="max-w-48 break-words py-4 font-medium">
                    {entry.displayName}
                  </th>
                  <td className="py-4 pl-3 text-right font-semibold tabular-nums text-stellar-green">
                    {entry.trees.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
