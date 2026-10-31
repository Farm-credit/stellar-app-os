'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const ISSUE_OPTIONS = [
  { code: 'pest_damage', label: 'Pest damage' },
  { code: 'drought_stress', label: 'Drought stress' },
  { code: 'disease', label: 'Disease' },
] as const;
type Review = {
  id: number;
  tree_ref: string;
  photo_ref: string;
  predicted_issues: { code: string; label: string; confidence: number }[];
  confidence: number;
  model_version: string;
  created_at: string;
};
type Data = {
  reviews: Review[];
  accuracy: {
    reviewedCount: number;
    exactMatchAccuracy: number | null;
    latestModel: {
      version: string;
      accuracy: number | null;
      sampleCount: number;
      evaluatedCount: number;
      trainedAt: string;
    } | null;
  };
};

export function TreeHealthReviewClient() {
  const [data, setData] = useState<Data | null>(null);
  const [corrections, setCorrections] = useState<Record<number, string[]>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<number | 'retrain' | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/tree-health', { cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        response.status === 401 ? 'Admin access is required.' : 'Could not load reviews.'
      );
    setData((await response.json()) as Data);
  }, []);

  useEffect(() => {
    load().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : 'Could not load reviews.')
    );
  }, [load]);

  function toggle(id: number, code: string) {
    setCorrections((current) => {
      const initial =
        data?.reviews
          .find((review) => review.id === id)
          ?.predicted_issues.map((issue) => issue.code) ?? [];
      const selected = new Set(current[id] ?? initial);
      if (selected.has(code)) selected.delete(code);
      else selected.add(code);
      return { ...current, [id]: Array.from(selected) };
    });
  }

  async function submitCorrection(id: number) {
    setBusy(id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/tree-health', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: id, correctedIssues: corrections[id] ?? [] }),
      });
      if (!response.ok) throw new Error('Could not save field-team correction.');
      await load();
      setCorrections((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setMessage('Correction saved and added to the next quarterly training set.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save correction.');
    } finally {
      setBusy(null);
    }
  }

  async function retrain() {
    setBusy('retrain');
    setMessage('');
    try {
      const response = await fetch('/api/admin/tree-health', { method: 'POST' });
      const result = (await response.json()) as {
        error?: string;
        version?: string;
        accuracy?: number | null;
      };
      if (!response.ok) throw new Error(result.error ?? 'Quarterly retraining failed.');
      await load();
      setMessage(`Model ${result.version} trained from reviewed field photos.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Quarterly retraining failed.');
    } finally {
      setBusy(null);
    }
  }

  const accuracy = data?.accuracy;
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Field operations
          </p>
          <h1 className="mt-1 text-3xl font-bold">Tree health photo review</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Confirm or correct model flags. Your reviewed labels improve the image classifier and
            are included in the quarterly training run.
          </p>
        </div>
        <button
          type="button"
          onClick={retrain}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${busy === 'retrain' ? 'animate-spin' : ''}`}
            aria-hidden
          />
          Retrain quarterly model
        </button>
      </header>

      {message ? (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {message}
        </p>
      ) : null}
      <section aria-label="Model accuracy" className="grid gap-4 sm:grid-cols-3">
        <Metric label="Reviewed photos" value={accuracy?.reviewedCount ?? '—'} />
        <Metric
          label="Agreement with field team"
          value={
            accuracy?.exactMatchAccuracy == null
              ? 'Not measured yet'
              : `${(accuracy.exactMatchAccuracy * 100).toFixed(1)}%`
          }
        />
        <Metric
          label="Active model"
          value={
            accuracy?.latestModel
              ? `${accuracy.latestModel.version} · ${accuracy.latestModel.sampleCount} photos`
              : 'Baseline vision labels'
          }
        />
      </section>
      {accuracy?.latestModel?.accuracy != null ? (
        <p className="text-sm text-muted-foreground">
          Held-out quarterly model accuracy: {(accuracy.latestModel.accuracy * 100).toFixed(1)}%
          across {accuracy.latestModel.evaluatedCount} holdout photos from a training set of{' '}
          {accuracy.latestModel.sampleCount} reviewed photos.
        </p>
      ) : null}

      <section aria-labelledby="pending-review-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pending-review-heading" className="text-xl font-semibold">
            Pending review
          </h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm">
            {data?.reviews.length ?? '—'} photos
          </span>
        </div>
        {data?.reviews.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-muted-foreground">
            All uploaded photos have been reviewed.
          </p>
        ) : null}
        {data?.reviews.map((review) => {
          const selected = new Set(
            corrections[review.id] ?? review.predicted_issues.map((issue) => issue.code)
          );
          return (
            <article key={review.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Tree {review.tree_ref}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Photo reference: {review.photo_ref} · Model: {review.model_version} ·{' '}
                    {new Date(review.created_at).toLocaleString()}
                  </p>
                </div>
                <p className="inline-flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Suggested flags:{' '}
                  {review.predicted_issues.length || 'none'}
                </p>
              </div>
              <Image
                src={`/api/admin/tree-health/${review.id}/photo`}
                alt={`Uploaded field photo for tree ${review.tree_ref}`}
                width={960}
                height={640}
                unoptimized
                className="mt-4 max-h-96 w-full rounded-lg bg-muted object-contain"
              />
              <fieldset className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                <legend className="mb-2 text-sm font-medium">
                  Select confirmed issues (leave all unchecked if healthy)
                </legend>
                {ISSUE_OPTIONS.map((option) => (
                  <label key={option.code} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(option.code)}
                      onChange={() => toggle(review.id, option.code)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                onClick={() => submitCorrection(review.id)}
                disabled={busy !== null}
                className="mt-4 min-h-10 rounded-lg border border-border px-4 font-medium hover:bg-muted disabled:opacity-60"
              >
                {busy === review.id ? 'Saving…' : 'Save field correction'}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}
