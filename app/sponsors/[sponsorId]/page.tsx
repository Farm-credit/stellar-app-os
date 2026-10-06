import { notFound } from 'next/navigation';
import { SponsorBadges } from '@/components/molecules/SponsorBadges/SponsorBadges';
import { getSponsorProfile } from '@/lib/api/sponsors';
import { getSponsorPortfolio } from '@/lib/api/sponsor-portfolio';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import { Badge } from '@/components/atoms/Badge';
import type { SponsorTreeEntry } from '@/lib/types/sponsor-portfolio';
import { BadgeCheck, Folder, Globe2, MapPin, Sprout } from 'lucide-react';

function formatAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadgeVariant(status: SponsorTreeEntry['status']) {
  switch (status) {
    case 'completed':
    case 'verified':
      return 'success' as const;
    case 'failed':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default async function SponsorProfilePage({
  params,
}: {
  params: Promise<{ sponsorId: string }>;
}) {
  const { sponsorId } = await params;
  const profile = getSponsorProfile(decodeURIComponent(sponsorId));

  if (!profile) notFound();

  const { forest, plantingHistory } = getSponsorPortfolio(profile.address, {
    totalTrees: profile.totalTrees,
    totalCo2OffsetTonnes: profile.co2Offset,
  });

  const verifiedCount = forest.statusBreakdown
    .filter((entry) => entry.status === 'verified' || entry.status === 'completed')
    .reduce((sum, entry) => sum + entry.count, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-8 p-8 md:grid-cols-[160px_1fr] md:items-center">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name ?? formatAddress(profile.address)}
              className="h-40 w-40 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-emerald-100 text-4xl font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {profile.name?.charAt(0) ?? 'S'}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Sponsor profile
              </p>
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                {profile.name ?? formatAddress(profile.address)}
              </h1>
              <p className="mt-2 break-all font-mono text-sm text-slate-500 dark:text-slate-400">
                {profile.address}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-sm text-slate-500">Trees sponsored</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {profile.totalTrees.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-sm text-slate-500">CO2 offset</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {profile.co2Offset.toFixed(1)} t
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Impact overview ───────────────────────────────────────────── */}
      <section aria-labelledby="sponsor-impact-heading">
        <h2
          id="sponsor-impact-heading"
          className="text-2xl font-semibold text-slate-900 dark:text-white"
        >
          Impact overview
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ImpactStatCard
            label="Trees verified"
            value={verifiedCount.toLocaleString()}
            icon={<BadgeCheck className="h-5 w-5" />}
          />
          <ImpactStatCard
            label="Species planted"
            value={forest.totalSpecies.toLocaleString()}
            icon={<Sprout className="h-5 w-5" />}
          />
          <ImpactStatCard
            label="Regions active"
            value={forest.totalRegions.toLocaleString()}
            icon={<Globe2 className="h-5 w-5" />}
          />
          <ImpactStatCard
            label="Projects supported"
            value={forest.totalProjects.toLocaleString()}
            icon={<Folder className="h-5 w-5" />}
          />
        </div>
      </section>

      <SponsorBadges totalTrees={profile.totalTrees} />

      {/* ── Forest statistics ─────────────────────────────────────────── */}
      <section aria-labelledby="forest-stats-heading">
        <h2
          id="forest-stats-heading"
          className="text-2xl font-semibold text-slate-900 dark:text-white"
        >
          Forest statistics
        </h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Sprout className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Species breakdown
            </h3>
            <ul className="space-y-3">
              {forest.speciesBreakdown.map((entry) => (
                <li key={entry.species} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {entry.species}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.round((entry.count / forest.totalTrees) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {entry.count}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <MapPin className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Region breakdown
            </h3>
            <ul className="space-y-3">
              {forest.regionBreakdown.map((entry) => (
                <li key={entry.region} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{entry.region}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${Math.round((entry.count / forest.totalTrees) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {entry.count}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Planting history ──────────────────────────────────────────── */}
      {plantingHistory.length > 0 && (
        <section aria-labelledby="planting-history-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2
              id="planting-history-heading"
              className="text-2xl font-semibold text-slate-900 dark:text-white"
            >
              Planting history
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {forest.totalTrees.toLocaleString()} trees on record
            </p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    Tree ID
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    Species
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    Region
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    Planted
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400"
                  >
                    CO₂ / yr
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {plantingHistory.slice(0, 50).map((tree) => (
                  <tr key={tree.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {tree.treeId}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{tree.species}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{tree.region}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(tree.status)}>{tree.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {formatDate(tree.plantedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {tree.co2OffsetKgPerYear.toFixed(1)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {forest.totalTrees > 50 && (
              <div className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Showing 50 of {forest.totalTrees.toLocaleString()} trees
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
