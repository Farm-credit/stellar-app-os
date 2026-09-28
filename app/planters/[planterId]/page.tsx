import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Award, Camera, CheckCircle2, Clock3, MapPin, MessageCircle } from 'lucide-react';
import { getPlanterProfile } from '@/lib/api/planters';
import ReferralLinkCard from '@/components/ReferralLinkCard';
import { getPlanterReferralUrl } from '@/lib/referrals';

const PlanterEvidenceMap = dynamic(
  () => import('@/components/organisms/PlanterEvidenceMap').then((module) => module.PlanterEvidenceMap),
  { ssr: false }
);

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

  const jobs = profile.completedJobs;
  const totalCo2Kg = jobs.reduce((total, job) => total + job.co2Kg, 0);
  const photoCount = jobs.reduce((total, job) => total + job.photos.length, 0);
  const milestones = [
    { label: '1 tonne captured', threshold: 1000, icon: '1T' },
    { label: '2 tonnes captured', threshold: 2000, icon: '2T' },
    { label: '3 tonnes captured', threshold: 3000, icon: '3T' },
  ];
  const timeline = jobs
    .flatMap((job) => job.statusHistory.map((event) => ({ ...event, jobTitle: job.title })))
    .sort((a, b) => b.date.localeCompare(a.date));

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
            <a
              href={`mailto:${profile.id}@example.com?subject=Custom Deal Inquiry`}
              className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              Contact for Custom Deal
            </a>
            <ReferralLinkCard referralLink={getPlanterReferralUrl(profile.id)} />
            <p className="text-sm font-medium text-emerald-700">
              Earn 5 XLM when a new sponsor uses your link.
            </p>
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

      <section className="space-y-5" aria-labelledby="field-evidence-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Field evidence
            </p>
            <h2 id="field-evidence-heading" className="mt-1 text-2xl font-semibold text-slate-900">
              Every update, in one place
            </h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Camera className="h-4 w-4" aria-hidden /> {photoCount} planter-uploaded photos
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Planting locations</h3>
                  <p className="mt-1 text-sm text-slate-500">GPS captured with each field update</p>
                </div>
                <MapPin className="h-5 w-5 text-emerald-600" aria-hidden />
              </div>
            </div>
            <PlanterEvidenceMap jobs={jobs} />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{job.title}</p>
                  <p className="mt-1 text-slate-500">{job.location}</p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {job.coordinates.latitude.toFixed(5)}, {job.coordinates.longitude.toFixed(5)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h3 className="font-semibold text-slate-900">Status history</h3>
              <p className="mt-1 text-sm text-slate-500">A verified trail for every completed job</p>
            </div>
            <ol className="space-y-0 p-5">
              {timeline.map((event, index) => (
                <li key={`${event.date}-${event.jobTitle}-${event.status}`} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < timeline.length - 1 && <span className="absolute left-[9px] top-6 h-full w-px bg-emerald-100" aria-hidden />}
                  <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    {event.status === 'Verified' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Clock3 className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-medium text-slate-900">{event.status}</p>
                      <time className="text-xs text-slate-400">{event.date}</time>
                    </div>
                    <p className="text-xs font-medium text-emerald-700">{event.jobTitle}</p>
                    <p className="mt-1 text-sm text-slate-500">{event.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h3 className="font-semibold text-slate-900">Planter photo journal</h3>
              <p className="mt-1 text-sm text-slate-500">{totalCo2Kg.toLocaleString()} kg estimated CO2 captured across these jobs</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="CO2 milestone badges">
              {milestones.map((milestone) => {
                const earned = totalCo2Kg >= milestone.threshold;
                return (
                  <span key={milestone.label} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${earned ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                    <Award className="h-3.5 w-3.5" aria-hidden /> {milestone.icon} {earned ? milestone.label : `${milestone.threshold.toLocaleString()} kg goal`}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {jobs.flatMap((job) => job.photos.map((photo, index) => ({ photo, job, index }))).map(({ photo, job, index }) => (
              <figure key={`${job.id}-${photo}`} className="group overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                <img src={photo} alt={`${job.title} field update ${index + 1}`} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105" />
                <figcaption className="p-3">
                  <p className="truncate text-sm font-medium text-slate-800">{job.title}</p>
                  <p className="mt-1 text-xs text-slate-500">Uploaded {job.completedAt}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
