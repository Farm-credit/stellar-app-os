import { notFound } from 'next/navigation';
import { getPlanterProfile } from '@/lib/api/planters';

export default async function PlanterProfilePage({
  params,
}: {
  params: Promise<{ planterId: string }>;
}) {
  const { planterId } = await params;
  const profile = getPlanterProfile(planterId);

  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 p-8 md:grid-cols-[220px_1fr] md:items-center">
          <img
            src={profile.photo}
            alt={profile.name}
            className="h-56 w-full rounded-2xl object-cover"
          />
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Planter profile
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">{profile.name}</h1>
              <p className="mt-2 text-lg text-slate-600">{profile.region}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Reputation</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {profile.reputationScore}/100
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Trees planted</p>
                <p className="text-2xl font-semibold text-slate-900">{profile.totalTreesPlanted}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Completed jobs</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {profile.completedJobs.length}
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">{profile.about}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Completed jobs</h2>
          <p className="text-sm text-slate-500">Recent restoration milestones</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {profile.completedJobs.map((job) => (
            <article
              key={job.id}
              className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            >
              <img src={job.image} alt={job.title} className="h-48 w-full object-cover" />
              <div className="p-5">
                <p className="text-sm font-medium text-emerald-600">{job.location}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{job.title}</h3>
                <p className="mt-2 text-sm text-slate-500">Completed {job.completedAt}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
