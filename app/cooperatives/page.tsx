'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createCooperativeRequest, useCooperatives } from '@/hooks/useCooperative';

/**
 * Cooperative directory — Issue #1431
 *
 * Browse existing cooperatives, search by name/region, and form a new one.
 */
export default function CooperativesPage() {
  const [search, setSearch] = useState('');
  const { cooperatives, isLoading, error, refresh } = useCooperatives({
    search: search.trim() || undefined,
  });

  const [form, setForm] = useState({ name: '', region: '', founderId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createCooperativeRequest({
        name: form.name,
        region: form.region.trim() || undefined,
        founderId: form.founderId,
      });
      setForm({ name: '', region: '', founderId: '' });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create cooperative');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Farmer Cooperatives</h1>
        <p className="mt-2 text-gray-600">
          Pool projects with neighbouring farmers to unlock collective bulk pricing and negotiate
          better buyer terms together.
        </p>
      </header>

      <section className="mb-10 rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900">Form a cooperative</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={handleCreate}>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Name
            <input
              required
              minLength={3}
              value={form.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Nairobi Grain Alliance"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Region
            <input
              value={form.region}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, region: event.target.value })}
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Kenya"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Your farmer ID
            <input
              required
              value={form.founderId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, founderId: event.target.value })}
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="farmer-123"
            />
          </label>
          <div className="sm:col-span-3">
            {formError && <p className="mb-2 text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create cooperative'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Cooperatives</h2>
          <input
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            placeholder="Search by name or region"
            className="w-64 rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {isLoading && <p className="text-gray-500">Loading cooperatives…</p>}
        {error && !isLoading && <p className="text-red-600">{error}</p>}
        {!isLoading && !error && cooperatives.length === 0 && (
          <p className="text-gray-500">No cooperatives yet — create the first one above.</p>
        )}

        <ul className="grid gap-4 sm:grid-cols-2">
          {cooperatives.map((cooperative) => (
            <li key={cooperative.id} className="rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/cooperatives/${cooperative.id}`}
                  className="text-lg font-semibold text-green-800 hover:underline"
                >
                  {cooperative.name}
                </Link>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-600">
                  {cooperative.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{cooperative.region}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Members</dt>
                  <dd className="font-medium text-gray-900">
                    {cooperative.memberCount}/{cooperative.minMembersToBargain}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Pooled</dt>
                  <dd className="font-medium text-gray-900">{cooperative.pooledQuantityTons} t</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="font-medium text-gray-900">{cooperative.discountPercent}%</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
