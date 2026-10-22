import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LESSON_PLANS,
  SCHOOL_SPONSORSHIP_TIERS,
  STANDARD_TREE_PRICE_USD,
  getSchoolTreePrice,
} from '@/lib/schoolProgramme';

export const metadata: Metadata = {
  title: 'Schools programme',
  description:
    'Subsidised tree sponsorship for primary and secondary schools, with a classroom dashboard and curriculum-linked lesson plans.',
};

export default function SchoolsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
          Schools programme
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Grow trees with your classroom
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
          Affordable, subsidised sponsorship for primary and secondary schools. Track your
          class&apos;s trees on a teacher dashboard and teach with free lesson plans linked to each
          species.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {SCHOOL_SPONSORSHIP_TIERS.map((tier) => (
            <article key={tier.level} className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-2xl font-semibold text-foreground">{tier.name}</h2>
              <p className="mt-2 text-muted-foreground">{tier.description}</p>
              <p className="mt-4 text-3xl font-bold text-foreground">
                ${getSchoolTreePrice(tier.level).toFixed(2)}
                <span className="text-base font-normal text-muted-foreground"> / tree</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {tier.subsidyPct}% off the standard ${STANDARD_TREE_PRICE_USD.toFixed(2)} price
              </p>
            </article>
          ))}
        </div>

        <p className="mt-10 text-muted-foreground">
          Every species has a kid-friendly guide for the classroom.{' '}
          <Link href="/species" className="font-medium text-stellar-blue hover:underline">
            Browse the species guides
          </Link>
          .
        </p>

        <h2 className="mt-14 text-2xl font-semibold text-foreground">Lesson plans by species</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {LESSON_PLANS.map((plan) => (
            <li key={plan.species} className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">{plan.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.curriculum.join(' · ')}</p>
              <a
                href={`/api/school-lesson-plans/${plan.species}`}
                download
                className="mt-3 inline-block text-sm font-medium text-stellar-blue underline"
              >
                Download lesson plan
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
