import type { Metadata } from 'next';
import Link from 'next/link';
import { TREE_SPECIES } from '@/lib/constants/species';
import { SPECIES_EDUCATION, speciesPathForSlug } from '@/lib/species/education';

export const metadata: Metadata = {
  title: 'Tree species guide',
  description:
    'Learn about the ecology, cultural significance, threats and conservation status of every tree species we plant.',
};

export default function SpeciesIndexPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
          Species guide
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Meet the trees we plant
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
          Every species has its own story. Explore its ecology, place in local culture, the threats
          it faces and how it is doing in the wild.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPECIES_EDUCATION.map((entry) => {
            const name = TREE_SPECIES.find((s) => s.slug === entry.slug)?.name ?? entry.slug;
            return (
              <li key={entry.slug} className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">
                  <Link href={speciesPathForSlug(entry.slug)} className="hover:underline">
                    {name}
                  </Link>
                </h2>
                <p className="text-sm italic text-muted-foreground">{entry.scientificName}</p>
                <p className="mt-2 text-sm text-muted-foreground">{entry.summary}</p>
                <p className="mt-3 flex gap-4 text-sm">
                  <Link
                    href={speciesPathForSlug(entry.slug)}
                    className="font-medium text-stellar-blue hover:underline"
                  >
                    Read more
                  </Link>
                  <Link
                    href={speciesPathForSlug(entry.slug, true)}
                    className="font-medium text-stellar-blue hover:underline"
                  >
                    Kids version
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
