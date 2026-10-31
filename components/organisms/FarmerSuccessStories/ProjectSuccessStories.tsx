import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Leaf, TreePine } from 'lucide-react';
import { farmerSuccessStories } from '@/lib/api/mock/farmerSuccessStories';

export function ProjectSuccessStories({ projectId }: { projectId: string }) {
  const stories = farmerSuccessStories
    .filter(
      (story) =>
        story.projectId === projectId &&
        (story.editorialState === undefined || story.editorialState === 'published')
    )
    .slice(0, 2);

  return (
    <section aria-labelledby="project-success-stories-heading" className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-stellar-green">
          People & impact
        </p>
        <h2 id="project-success-stories-heading" className="mt-1 text-2xl font-bold">
          Project success stories
        </h2>
      </header>
      {stories.length ? (
        <div className="grid gap-4">
          {stories.map((story) => (
            <article key={story.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {story.curatedQuarter
                      ? `Editorial pick · ${story.curatedQuarter}`
                      : 'Field story'}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{story.headline}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {story.farmerName} · {story.region}, {story.country}
                  </p>
                </div>
                {story.sponsorPhotoUrl ? (
                  <Image
                    src={story.sponsorPhotoUrl}
                    alt={story.sponsorPhotoAlt ?? `${story.sponsorName ?? 'Sponsor'} profile`}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : null}
              </div>
              {story.sponsorQuote ? (
                <blockquote className="mt-4 border-l-2 border-stellar-blue pl-3 text-sm italic text-muted-foreground">
                  “{story.sponsorQuote}”
                  {story.sponsorName ? (
                    <footer className="mt-1 not-italic">— {story.sponsorName}</footer>
                  ) : null}
                </blockquote>
              ) : null}
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric
                  icon={<TreePine className="h-4 w-4" aria-hidden />}
                  label="Trees planted"
                  value={story.landTransformation.treesPlanted.toLocaleString('en-US')}
                />
                <Metric
                  icon={<Leaf className="h-4 w-4" aria-hidden />}
                  label="CO₂ sequestered"
                  value={`${story.environmentalImpact.co2SequesteredTonnes.toLocaleString('en-US')} t`}
                />
                <Metric
                  label="Survival rate"
                  value={`${story.landTransformation.survivalRatePercent}%`}
                />
              </dl>
              <Link
                href={`/success-stories/${story.slug}`}
                aria-label={`Read sponsor spotlight for ${story.farmerName}`}
                className="mt-4 inline-flex min-h-10 items-center gap-2 font-semibold text-stellar-blue hover:underline"
              >
                Read the sponsor spotlight <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          This project’s community stories are being prepared for the next editorial review.
        </p>
      )}
      <Link
        href="/success-stories"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
      >
        Explore all curated stories <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
