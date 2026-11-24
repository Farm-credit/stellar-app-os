'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import type { TreeMonthlyCheckIn as MonthlyCheckIn } from '@/lib/tree-growth/monthly-checkins';

interface CheckInState {
  checkIns: MonthlyCheckIn[];
  canCheckIn: boolean;
  nextCheckInAt: string;
}

function formatMonth(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function TreeMonthlyCheckIn({ treeId }: { treeId: string }) {
  const [state, setState] = useState<CheckInState | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submittedBy, setSubmittedBy] = useState('');
  const [caption, setCaption] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/trees/${encodeURIComponent(treeId)}/monthly-checkins`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load monthly check-ins.');
        return data as CheckInState;
      })
      .then((data) => {
        if (active) setState(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load check-ins.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [treeId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!photo) {
      setError("Take or select a photo for this month's check-in.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadData = new FormData();
      uploadData.append('photo', photo);
      uploadData.append('treeId', treeId);
      const uploadResponse = await fetch('/api/planters/upload-photo', {
        method: 'POST',
        body: uploadData,
      });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || typeof uploadResult.cid !== 'string') {
        throw new Error(uploadResult.error ?? 'Photo upload failed.');
      }

      const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}/monthly-checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoCid: uploadResult.cid,
          submittedBy,
          caption: caption.trim() || undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save check-in.');

      setState((current) =>
        current
          ? {
              ...current,
              checkIns: [result.checkIn as MonthlyCheckIn, ...current.checkIns],
              canCheckIn: false,
            }
          : current
      );
      setPhoto(null);
      setCaption('');
      setHeightCm('');
      setSuccess('Monthly photo recorded and queued for verifier review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit monthly check-in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="monthly-checkin-heading"
      className="mx-auto max-w-3xl space-y-4 px-4 pb-6"
      data-testid="tree-monthly-checkin"
    >
      <header>
        <h2 id="monthly-checkin-heading" className="text-lg font-semibold">
          Monthly growth check-in
        </h2>
        <p className="text-sm text-muted-foreground">
          Submit one dated growth photo each month as evidence for the next milestone review.
        </p>
      </header>

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading check-in history...
        </p>
      ) : state?.canCheckIn ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border p-4">
          <label className="block space-y-1 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Camera className="h-4 w-4" aria-hidden />
              Growth photo
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              required
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              className="block min-h-11 w-full rounded-md border border-border bg-background p-2 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              <span>Steward name</span>
              <input
                required
                maxLength={100}
                value={submittedBy}
                onChange={(event) => setSubmittedBy(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Height (cm, optional)</span>
              <input
                type="number"
                min={1}
                max={5000}
                step="any"
                inputMode="decimal"
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">
            <span>Field note (optional)</span>
            <textarea
              maxLength={500}
              rows={2}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {success ? <p role="status" className="text-sm text-stellar-green">{success}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-stellar-green px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {submitting ? 'Saving check-in...' : "Submit this month's check-in"}
          </button>
        </form>
      ) : state ? (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          This month's check-in is recorded. You can submit another starting{' '}
          {new Date(state.nextCheckInAt).toLocaleDateString()}.
        </p>
      ) : null}
      {!loading && !state && error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {state?.checkIns.length ? (
        <ol aria-label="Monthly growth check-in history" className="space-y-3">
          {state.checkIns.map((checkIn) => (
            <li
              key={checkIn.id}
              className="flex gap-3 rounded-xl border border-border bg-card p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={checkIn.imageUrl}
                alt={`Tree growth submitted by ${checkIn.submittedBy} for ${formatMonth(checkIn.checkinMonth)}`}
                className="h-20 w-20 rounded-lg object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{formatMonth(checkIn.checkinMonth)}</p>
                <p className="text-xs text-muted-foreground">Submitted by {checkIn.submittedBy}</p>
                {checkIn.caption ? <p className="mt-1 text-sm">{checkIn.caption}</p> : null}
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {checkIn.verificationStatus === 'pending'
                    ? 'Pending verifier review'
                    : checkIn.verificationStatus === 'verified'
                      ? 'Verified for milestone review'
                      : 'Not approved for milestone review'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
