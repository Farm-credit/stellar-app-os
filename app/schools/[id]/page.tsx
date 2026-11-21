'use client';

import { use, useEffect, useState } from 'react';
import { LESSON_PLANS } from '@/lib/schoolProgramme';
import type { SchoolPartnershipDetail } from '@/lib/types/school-partnership';

export default function ClassroomDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [school, setSchool] = useState<SchoolPartnershipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/school-partnerships/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'School not found' : 'Failed to load');
        return (await res.json()) as SchoolPartnershipDetail;
      })
      .then((data) => !cancelled && setSchool(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="px-4 py-12">
        <p role="alert" className="mx-auto max-w-4xl text-destructive">
          {error}
        </p>
      </main>
    );
  }
  if (!school) {
    return (
      <main className="px-4 py-12">
        <p className="mx-auto max-w-4xl text-muted-foreground">Loading classroom dashboard…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
          Classroom dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">{school.school_name}</h1>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Trees funded</dt>
            <dd className="text-2xl font-bold">{school.total_trees_funded}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Students enrolled</dt>
            <dd className="text-2xl font-bold">{school.members.length}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Active projects</dt>
            <dd className="text-2xl font-bold">{school.active_batches}</dd>
          </div>
        </dl>

        <h2 className="mt-10 text-xl font-semibold">Sponsorship projects</h2>
        <ul className="mt-4 space-y-3">
          {school.batches.map((batch) => (
            <li key={batch.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex justify-between">
                <span className="font-medium">{batch.project_name}</span>
                <span className="text-sm text-muted-foreground">{batch.status}</span>
              </div>
              <progress
                className="mt-2 w-full"
                value={batch.progress_pct}
                max={100}
                aria-label={`${batch.project_name} progress`}
              />
              <p className="text-sm text-muted-foreground">
                {batch.trees_funded} / {batch.target_trees} trees
              </p>
            </li>
          ))}
          {school.batches.length === 0 && (
            <li className="text-muted-foreground">No sponsorship projects yet.</li>
          )}
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Lesson plans</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {LESSON_PLANS.map((plan) => (
            <li key={plan.species} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium">{plan.title}</p>
              <a
                href={`/api/school-lesson-plans/${plan.species}`}
                download
                className="text-sm text-stellar-blue underline"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
