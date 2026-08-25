'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import type { AirdropPreview, AirdropResult } from '@/lib/types/carbon';

const DEFAULT_LAUNCH_DATE = '2022-01-01';

export default function RetroactiveAirdropPage(): ReactNode {
  const [projectId, setProjectId] = useState('');
  const [creditsPerSponsor, setCreditsPerSponsor] = useState(50);
  const [launchDate, setLaunchDate] = useState(DEFAULT_LAUNCH_DATE);
  const [preview, setPreview] = useState<AirdropPreview | null>(null);
  const [result, setResult] = useState<AirdropResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetPreviewAndResult() {
    setPreview(null);
    setResult(null);
  }

  async function handlePreview() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        platformLaunchDate: launchDate,
        creditsPerSponsor: String(creditsPerSponsor),
      });
      const res = await fetch(`/api/admin/credits/airdrop?${params.toString()}`);
      const data = (await res.json()) as AirdropPreview & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Preview failed');
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/credits/airdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditsPerSponsor, projectId, platformLaunchDate: launchDate }),
      });
      const data = (await res.json()) as AirdropResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Airdrop failed');
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Retroactive carbon credit airdrop
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Allocate credits to all sponsors (with at least one donation or credit purchase) who
          joined within the first 6 months of the platform launch date.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Airdrop configuration</CardTitle>
          <CardDescription>
            Set the platform launch date to compute the 6-month eligibility window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="launch-date" className="text-sm font-medium text-foreground">
                Platform launch date
              </label>
              <input
                id="launch-date"
                type="date"
                value={launchDate}
                onChange={(e) => {
                  setLaunchDate(e.target.value);
                  resetPreviewAndResult();
                }}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="credits-per-sponsor" className="text-sm font-medium text-foreground">
                Credits per sponsor
              </label>
              <input
                id="credits-per-sponsor"
                type="number"
                min={1}
                value={creditsPerSponsor}
                onChange={(e) => {
                  setCreditsPerSponsor(Number(e.target.value));
                  resetPreviewAndResult();
                }}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="project-id" className="text-sm font-medium text-foreground">
                Project ID
              </label>
              <input
                id="project-id"
                type="text"
                placeholder="e.g. CARBON-PROJ-001"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  resetPreviewAndResult();
                }}
                className={inputClass}
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={handlePreview}
            disabled={loading || !projectId || creditsPerSponsor <= 0}
          >
            {loading && !preview ? 'Loading\u2026' : 'Preview eligible sponsors'}
          </Button>
        </CardContent>
      </Card>

      {preview ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Sponsors who joined on or before{' '}
              <span className="font-medium text-foreground">
                {new Date(preview.cutoffDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold text-foreground">{preview.recipients.length}</span>{' '}
                <span className="text-muted-foreground">eligible sponsors</span>
              </span>
              <span>
                <span className="font-semibold text-foreground">
                  {preview.totalCredits.toLocaleString()}
                </span>{' '}
                <span className="text-muted-foreground">total credits</span>
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Wallet
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.recipients.map((r) => (
                    <tr key={r.userId} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground">{r.email}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {r.walletAddress.slice(0, 6)}&hellip;{r.walletAddress.slice(-4)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(r.joinedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <Button type="button" onClick={handleConfirm} disabled={loading}>
                {loading
                  ? 'Processing\u2026'
                  : `Confirm airdrop to ${preview.recipients.length} sponsors`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreview(null)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Airdrop queued</CardTitle>
            <CardDescription>
              {result.totalQueued} sponsor{result.totalQueued !== 1 ? 's' : ''} added to the
              allocation queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Wallet
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.recipients.map((r) => (
                    <tr key={r.walletAddress} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {r.walletAddress.slice(0, 6)}&hellip;{r.walletAddress.slice(-4)}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
