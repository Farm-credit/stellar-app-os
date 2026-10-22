import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SPECIES_EDUCATION, getSpeciesPageData, speciesPathForSlug } from '@/lib/species/education';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return SPECIES_EDUCATION.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getSpeciesPageData(slug);
  if (!data) return { title: 'Species not found' };
  return {
    title: `${data.info.name} — species guide`,
    description: data.education.summary,
  };
}

export default async function SpeciesPage({ params }: Props) {
  const { slug } = await params;
  const data = getSpeciesPageData(slug);
  if (!data) notFound();
  const { info, education, isNative } = data;

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl space-y-8">
        <nav className="text-sm">
          <Link href="/species" className="text-stellar-blue hover:underline">
            ← All species
          </Link>
        </nav>

        <header>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{info.name}</h1>
          <p className="mt-1 italic text-muted-foreground">{education.scientificName}</p>
          <p className="mt-4 text-lg text-muted-foreground">{education.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span
              className="rounded-full border border-border px-3 py-1"
              data-testid="conservation-status"
            >
              Conservation status: {education.conservationStatus}
            </span>
            {isNative ? (
              <span className="rounded-full border border-border px-3 py-1">Native species</span>
            ) : null}
            <Link
              href={speciesPathForSlug(slug, true)}
              className="rounded-full bg-stellar-blue px-3 py-1 text-white hover:opacity-90"
            >
              Kid-friendly version
            </Link>
          </div>
        </header>

        <section aria-labelledby="ecology">
          <h2 id="ecology" className="text-2xl font-semibold text-foreground">
            Ecology
          </h2>
          <p className="mt-2 leading-7 text-muted-foreground">{education.ecology}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Reaches maturity in about {info.maturityYears} years and absorbs roughly{' '}
            {info.co2KgPerYear} kg of CO₂ per year.
          </p>
        </section>

        <section aria-labelledby="culture">
          <h2 id="culture" className="text-2xl font-semibold text-foreground">
            Cultural significance
          </h2>
          <p className="mt-2 leading-7 text-muted-foreground">{education.culturalSignificance}</p>
        </section>

        <section aria-labelledby="threats">
          <h2 id="threats" className="text-2xl font-semibold text-foreground">
            Threats
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
            {education.threats.map((threat) => (
              <li key={threat}>{threat}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="conservation">
          <h2 id="conservation" className="text-2xl font-semibold text-foreground">
            Conservation status
          </h2>
          <p className="mt-2 leading-7 text-muted-foreground">
            <strong>{education.conservationStatus}.</strong> {education.conservationNote}
          </p>
        </section>

        <section aria-labelledby="facts">
          <h2 id="facts" className="text-2xl font-semibold text-foreground">
            Fun facts
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
            {education.funFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </section>

        <p>
          <Link
            href="/planting-locations"
            className="font-medium text-stellar-blue hover:underline"
          >
            See where we plant {info.name} →
          </Link>
        </p>
      </article>
    </main>
  );
}
