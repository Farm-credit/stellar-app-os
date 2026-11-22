import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Sprout, TreePine } from 'lucide-react';
import { CertificationBadge } from '@/components/organisms/PartnerProfile/CertificationBadge';
import { buildPartnerSponsorUrl, getAllPartnerSlugs, getPartnerBySlug } from '@/lib/partners/data';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return getAllPartnerSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const partner = getPartnerBySlug(slug);
  if (!partner) return { title: 'Partner not found' };
  return { title: `${partner.name} | Planting Partner`, description: partner.summary };
}

/** Public planting partner profile at /partners/{slug} (#1643). */
export default async function PartnerProfilePage({ params }: Props) {
  const { slug } = await params;
  const partner = getPartnerBySlug(slug);
  if (!partner) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:py-14">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/partners" className="hover:underline">
            Partners
          </Link>{' '}
          / {partner.name}
        </nav>
        <h1 className="text-3xl font-bold">{partner.name}</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden /> {partner.region} · Planting since{' '}
          {partner.founded}
        </p>
        <p className="max-w-2xl">{partner.summary}</p>
        <Link
          href={buildPartnerSponsorUrl(partner.slug)}
          className="inline-flex items-center gap-2 rounded-lg bg-stellar-green px-4 py-2 font-semibold text-white hover:bg-stellar-green/90"
        >
          <Sprout className="h-4 w-4" aria-hidden /> Fund trees via {partner.name}
        </Link>
      </header>

      <section aria-labelledby="track-record" className="space-y-3">
        <h2 id="track-record" className="text-xl font-bold">
          Track record
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">Trees planted via platform</dt>
            <dd className="text-2xl font-black">
              {partner.treesPlantedViaPlatform.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">Survival rate</dt>
            <dd className="text-2xl font-black">{Math.round(partner.survivalRate * 100)}%</dd>
          </div>
          <div className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">Projects</dt>
            <dd className="text-2xl font-black">{partner.projects.length}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="certifications" className="space-y-3">
        <h2 id="certifications" className="text-xl font-bold">
          Certifications
        </h2>
        {partner.certifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No certifications on record.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {partner.certifications.map((cert) => (
              <CertificationBadge key={cert.body} cert={cert} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="projects" className="space-y-3">
        <h2 id="projects" className="text-xl font-bold">
          Projects
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {partner.projects.map((project) => (
            <li key={project.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{project.name}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                  {project.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{project.location}</p>
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold">
                <TreePine className="h-4 w-4 text-stellar-green" aria-hidden />
                {project.treesPlanted.toLocaleString()} trees planted
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
