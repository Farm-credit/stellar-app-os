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
    title: `${data.education.kids.headline} — kids guide`,
    description: data.education.kids.intro,
  };
}

/** Kid-friendly species page for school programmes. (#1681) */
export default async function KidsSpeciesPage({ params }: Props) {
  const { slug } = await params;
  const data = getSpeciesPageData(slug);
  if (!data) notFound();
  const { info, education } = data;
  const { kids } = education;

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-2xl space-y-8">
        <nav className="text-sm">
          <Link href="/schools" className="text-stellar-blue hover:underline">
            ← Schools programme
          </Link>
        </nav>

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Kids guide · {info.name}
          </p>
          <h1 className="mt-2 text-4xl font-bold text-foreground">{kids.headline}</h1>
          <p className="mt-4 text-xl leading-9 text-foreground">{kids.intro}</p>
        </header>

        <section
          aria-labelledby="kid-facts"
          className="rounded-2xl border border-border bg-card p-6"
        >
          <h2 id="kid-facts" className="text-2xl font-semibold text-foreground">
            Fun facts
          </h2>
          <ul className="mt-3 space-y-2 text-lg text-foreground">
            {kids.funFacts.map((fact) => (
              <li key={fact}>🌳 {fact}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="kid-activity">
          <h2 id="kid-activity" className="text-2xl font-semibold text-foreground">
            Try it!
          </h2>
          <p className="mt-2 text-lg text-foreground">{kids.activity}</p>
        </section>

        <p>
          <Link
            href={speciesPathForSlug(slug)}
            className="font-medium text-stellar-blue hover:underline"
          >
            Read the full guide →
          </Link>
        </p>
      </article>
    </main>
  );
}
