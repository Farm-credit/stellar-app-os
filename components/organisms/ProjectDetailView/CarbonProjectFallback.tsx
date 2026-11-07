import Link from 'next/link';
import { ArrowLeft, ArrowRight, BadgeCheck, MapPin } from 'lucide-react';
import type { CarbonProject } from '@/lib/types/carbon';
import { ProjectSuccessStories } from '@/components/organisms/FarmerSuccessStories/ProjectSuccessStories';

export function CarbonProjectFallback({ project }: { project: CarbonProject }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <Link
          href="/projects"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to projects
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 p-8 text-white sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">
            {project.type}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold sm:text-5xl">{project.name}</h1>
          <p className="mt-4 max-w-3xl text-white/80">{project.description}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/85">
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" aria-hidden />
              {project.location}
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" aria-hidden />
              {project.verificationStatus}
            </span>
            <span>{project.vintageYear} vintage</span>
          </div>
        </header>
        <section
          aria-labelledby="project-overview-heading"
          className="grid gap-8 lg:grid-cols-[2fr_1fr]"
        >
          <div>
            <h2 id="project-overview-heading" className="text-2xl font-bold">
              About this project
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">{project.description}</p>
            <h3 className="mt-6 font-semibold">Community and environmental benefits</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {project.coBenefits.map((benefit) => (
                <li
                  key={benefit}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                >
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <aside className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Available supply</p>
            <p className="mt-1 text-2xl font-bold">
              {project.availableSupply.toLocaleString('en-US')} t
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Price per tonne</p>
            <p className="mt-1 text-2xl font-bold">${project.pricePerTon.toFixed(2)}</p>
            <Link
              href="/marketplace"
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800"
            >
              Explore the marketplace <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </aside>
        </section>
        <ProjectSuccessStories projectId={project.id} />
      </div>
    </main>
  );
}
