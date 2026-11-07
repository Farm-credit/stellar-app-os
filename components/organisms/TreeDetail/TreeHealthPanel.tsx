'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Leaf } from 'lucide-react';

type HealthPrediction = {
  id: number;
  predicted_issues: { code: string; label: string; confidence: number }[];
  confidence: number;
  provider: string;
  model_version: string;
  review_status: 'pending' | 'corrected';
  created_at: string;
};

export function TreeHealthPanel({ treeId }: { treeId: string }) {
  const [predictions, setPredictions] = useState<HealthPrediction[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    fetch(`/api/trees/${encodeURIComponent(treeId)}/health`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Health history unavailable');
        return (await response.json()) as { predictions: HealthPrediction[] };
      })
      .then((data) => {
        if (!active) return;
        setPredictions(data.predictions ?? []);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, [treeId]);

  const latest = predictions[0];
  const issues = latest?.predicted_issues ?? [];
  return (
    <section
      aria-labelledby="tree-health-heading"
      className="rounded-xl border border-border bg-card p-5 sm:col-span-2"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
          <Leaf className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="tree-health-heading" className="font-semibold">
            Image health screening
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Photo-based alerts are screening suggestions, not a diagnosis; field-team review is
            required.
          </p>
        </div>
      </div>
      {status === 'loading' ? (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          Loading image review…
        </p>
      ) : status === 'unavailable' ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Health screening history is temporarily unavailable.
        </p>
      ) : !latest ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No field-photo health screening has been recorded for this tree yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {issues.length ? (
            <div className="space-y-2">
              {issues.map((issue) => (
                <div
                  key={issue.code}
                  className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <span className="flex-1">{issue.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(issue.confidence * 100)}% signal
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              No health issue was flagged in the latest photo screening.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              {latest.review_status === 'corrected'
                ? 'Reviewed by the field team'
                : 'Awaiting field-team review'}
            </span>
            <span>{new Date(latest.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </section>
  );
}
