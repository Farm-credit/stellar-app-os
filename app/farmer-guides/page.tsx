'use client';

import { useMemo, useState } from 'react';
import { FARMER_GUIDES, searchFarmerGuides } from '@/lib/farmerGuides';

const categories = ['All', ...new Set(FARMER_GUIDES.map((guide) => guide.category))];

export default function FarmerGuidesPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const guides = useMemo(() => searchFarmerGuides(query, category), [query, category]);

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Farmer learning library
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Practical guides for healthier farms
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Clear next steps for improving soil, measuring carbon, finding funding, and preparing
            for certification. Keep your records as you work so progress can be verified and
            rewarded.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Search guides</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search soil, carbon, grants..."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground sm:w-48"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {guides.length} {guides.length === 1 ? 'guide' : 'guides'} available
        </p>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <article
              key={guide.slug}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-stellar-blue/10 px-3 py-1 text-xs font-semibold text-stellar-blue">
                  {guide.category}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {guide.difficulty}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-foreground">{guide.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{guide.summary}</p>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-foreground">
                Steps
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-foreground">
                Useful resources
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {guide.resources.map((resource) => (
                  <li key={resource}>• {resource}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {guides.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No guides match that search. Try a broader term or choose another category.
          </div>
        )}
      </section>
    </main>
  );
}
