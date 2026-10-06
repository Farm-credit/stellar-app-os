'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Crown,
  Globe2,
  Leaf,
  Loader2,
  MapPin,
  Minus,
  Sparkles,
  TreePine,
  Users,
} from 'lucide-react';
import { LiveCounter } from '@/components/atoms/LiveCounter';
import { Text } from '@/components/atoms/Text';
import {
  SPONSOR_REGIONS,
  TREE_TYPES,
  type LeaderboardScope,
  type LeaderboardSnapshot,
  type SponsorRanking,
  type SponsorRegion,
  type TreeType,
} from '@/lib/leaderboard/liveRankings';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 5_000;

const SCOPES: { id: LeaderboardScope; label: string; icon: typeof Globe2 }[] = [
  { id: 'global', label: 'Global', icon: Globe2 },
  { id: 'region', label: 'By region', icon: MapPin },
  { id: 'tree-type', label: 'By tree type', icon: TreePine },
];

function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Movement({ ranking }: { ranking: SponsorRanking }) {
  if (ranking.isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
        <Sparkles className="size-3.5" aria-hidden /> New
      </span>
    );
  }
  if (ranking.movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
        <ArrowUp className="size-3.5" aria-hidden />
        {ranking.movement}
        <span className="sr-only"> places up</span>
      </span>
    );
  }
  if (ranking.movement < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-400">
        <ArrowDown className="size-3.5" aria-hidden />
        {Math.abs(ranking.movement)}
        <span className="sr-only"> places down</span>
      </span>
    );
  }
  return (
    <span className="text-slate-500">
      <Minus className="size-3.5" aria-hidden />
      <span className="sr-only">No change</span>
    </span>
  );
}

const PODIUM_STYLES = [
  'from-amber-400/25 border-amber-400/60 md:order-2 md:-translate-y-4',
  'from-slate-300/20 border-slate-300/50 md:order-1',
  'from-orange-500/20 border-orange-500/50 md:order-3',
];

/**
 * Sponsor leaderboard — global live rankings by trees sponsored (Issue #1100)
 */
export default function LiveSponsorLeaderboardPage() {
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [region, setRegion] = useState<SponsorRegion>('Africa');
  const [treeType, setTreeType] = useState<TreeType>('Mangrove');
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const previousTrees = useRef<Map<string, number>>(new Map());

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams({ scope, limit: '25' });
      if (scope === 'region') params.set('region', region);
      if (scope === 'tree-type') params.set('treeType', treeType);

      try {
        const response = await fetch(`/api/leaderboard/sponsors?${params}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as LeaderboardSnapshot;

        // Briefly highlight sponsors whose totals grew since the last poll.
        const grew = new Set(
          next.rankings
            .filter((r) => {
              const before = previousTrees.current.get(r.sponsorId);
              return before !== undefined && r.trees > before;
            })
            .map((r) => r.sponsorId)
        );
        previousTrees.current = new Map(next.rankings.map((r) => [r.sponsorId, r.trees]));
        setFlashing(grew);
        setSnapshot(next);
        setNow(Date.now());
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Live updates paused — retrying…');
      }
    },
    [scope, region, treeType]
  );

  useEffect(() => {
    const controller = new AbortController();
    previousTrees.current = new Map();
    setSnapshot(null);
    void load(controller.signal);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal);
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (flashing.size === 0) return;
    const timeout = setTimeout(() => setFlashing(new Set()), 1500);
    return () => clearTimeout(timeout);
  }, [flashing]);

  const podium = snapshot?.rankings.slice(0, 3) ?? [];
  const scopeLabel =
    scope === 'region' ? region : scope === 'tree-type' ? `${treeType} trees` : 'worldwide';

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-950 text-slate-100 selection:bg-stellar-blue/30"
    >
      <div className="container relative z-10 mx-auto max-w-6xl px-4 py-12">
        <Link
          href="/leaderboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to leaderboard
        </Link>

        <header className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Live
            </p>
            <Text variant="h1" className="font-extrabold tracking-tight text-white">
              Top Sponsors
            </Text>
            <Text variant="muted" as="p" className="mt-1 text-base text-slate-400">
              Real-time rankings by trees sponsored, {scopeLabel}.
            </Text>
          </div>

          <div className="flex flex-col gap-3">
            <div
              role="tablist"
              aria-label="Leaderboard scope"
              className="flex rounded-lg border border-slate-800 p-1"
            >
              {SCOPES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={scope === id}
                  onClick={() => setScope(id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    scope === id
                      ? 'bg-stellar-green text-white shadow'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            {scope === 'region' && (
              <select
                aria-label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value as SponsorRegion)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              >
                {SPONSOR_REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            )}
            {scope === 'tree-type' && (
              <select
                aria-label="Tree type"
                value={treeType}
                onChange={(e) => setTreeType(e.target.value as TreeType)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              >
                {TREE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </header>

        {error && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300"
          >
            {error}
          </p>
        )}

        {!snapshot ? (
          <div className="flex justify-center py-24" role="status">
            <Loader2 className="size-8 animate-spin text-stellar-green" aria-hidden />
            <span className="sr-only">Loading leaderboard…</span>
          </div>
        ) : (
          <>
            <section
              aria-label="Live totals"
              aria-live="polite"
              className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
              {[
                { icon: TreePine, label: 'Trees sponsored', value: snapshot.totals.trees },
                { icon: Users, label: 'Sponsors', value: snapshot.totals.sponsors },
                {
                  icon: Leaf,
                  label: 'Tonnes CO₂ absorbed / year',
                  value: snapshot.totals.co2KgPerYear / 1000,
                  format: (v: number) =>
                    v.toLocaleString('en-US', {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    }),
                },
              ].map(({ icon: Icon, label, value, format }) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <Icon className="mb-2 size-5 text-stellar-green" aria-hidden />
                  <LiveCounter
                    value={value}
                    format={format}
                    className="text-3xl font-bold text-white"
                  />
                  <p className="text-sm text-slate-400">{label}</p>
                </div>
              ))}
            </section>

            {snapshot.rankings.length === 0 ? (
              <p className="py-16 text-center text-slate-400">
                No sponsorships in this category yet.
              </p>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
                <div>
                  <ol aria-label="Top three sponsors" className="mb-8 grid gap-4 md:grid-cols-3">
                    {podium.map((r, i) => (
                      <li
                        key={r.sponsorId}
                        className={cn(
                          'rounded-xl border bg-gradient-to-b to-slate-900/60 p-5 text-center transition-transform',
                          PODIUM_STYLES[i]
                        )}
                      >
                        {r.rank === 1 && (
                          <Crown className="mx-auto mb-1 size-6 text-amber-400" aria-hidden />
                        )}
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          #{r.rank}
                        </p>
                        <p className="mt-1 truncate text-lg font-bold text-white">
                          {r.sponsorName}
                        </p>
                        <p className="text-xs text-slate-400">{r.region}</p>
                        <LiveCounter
                          value={r.trees}
                          className="mt-3 block text-2xl font-extrabold text-stellar-green"
                        />
                        <p className="text-xs text-slate-400">trees</p>
                      </li>
                    ))}
                  </ol>

                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Sponsor rankings {scopeLabel}</caption>
                      <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th scope="col" className="py-3 pl-4">
                            Rank
                          </th>
                          <th scope="col" className="py-3">
                            Sponsor
                          </th>
                          <th scope="col" className="hidden py-3 md:table-cell">
                            Top tree type
                          </th>
                          <th scope="col" className="py-3 text-right">
                            Trees
                          </th>
                          <th scope="col" className="hidden py-3 pr-4 text-right sm:table-cell">
                            CO₂ / yr
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.rankings.map((r) => (
                          <tr
                            key={r.sponsorId}
                            className={cn(
                              'border-t border-slate-900 transition-colors duration-700',
                              flashing.has(r.sponsorId) && 'bg-emerald-500/15'
                            )}
                          >
                            <td className="py-3 pl-4">
                              <div className="flex items-center gap-2">
                                <span className="w-6 font-bold text-slate-300">{r.rank}</span>
                                <Movement ranking={r} />
                              </div>
                            </td>
                            <td className="py-3">
                              <p className="font-medium text-white">{r.sponsorName}</p>
                              <p className="text-xs text-slate-500">
                                {r.region} · active {timeAgo(r.lastSponsoredAt, now)}
                              </p>
                            </td>
                            <td className="hidden py-3 text-slate-300 md:table-cell">
                              {r.topTreeType}
                            </td>
                            <td className="py-3 text-right font-semibold text-stellar-green">
                              <LiveCounter value={r.trees} />
                            </td>
                            <td className="hidden py-3 pr-4 text-right text-slate-300 sm:table-cell">
                              {(r.co2KgPerYear / 1000).toFixed(1)} t
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <aside aria-labelledby="activity-heading">
                  <h2
                    id="activity-heading"
                    className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400"
                  >
                    Latest sponsorships
                  </h2>
                  <ul className="space-y-2">
                    {snapshot.recent.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm"
                      >
                        <p className="text-white">
                          <span className="font-semibold">{e.sponsorName}</span> sponsored{' '}
                          <span className="font-semibold text-stellar-green">
                            {e.trees} {e.treeType.toLowerCase()} {e.trees === 1 ? 'tree' : 'trees'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {e.region} · {timeAgo(e.occurredAt, now)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/donate"
                    className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-stellar-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-stellar-green/90"
                  >
                    <TreePine className="size-4" aria-hidden /> Sponsor trees
                  </Link>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
