import { notFound } from 'next/navigation';
import { SponsorBadges } from '@/components/molecules/SponsorBadges/SponsorBadges';
import { getSponsorProfile } from '@/lib/api/sponsors';

function formatAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default async function SponsorProfilePage({
  params,
}: {
  params: Promise<{ sponsorId: string }>;
}) {
  const { sponsorId } = await params;
  const profile = getSponsorProfile(decodeURIComponent(sponsorId));

  if (!profile) notFound();

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

      <SponsorBadges totalTrees={profile.totalTrees} />
    </main>
  );
}
