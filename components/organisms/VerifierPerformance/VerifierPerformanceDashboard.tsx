'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Clock3, ShieldCheck } from 'lucide-react';
import type { VerifierPerformanceReport } from '@/lib/verifier/performance';

function formatPercent(value: number | null): string {
  return value === null ? 'No adjudicated approvals' : `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'No completed audits';
  const hours = seconds / 3600;
  return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`;
}

export function VerifierPerformanceDashboard() {
  const [report, setReport] = useState<VerifierPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/verifier-metrics')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load verifier metrics.');
        return data as VerifierPerformanceReport;
      })
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load metrics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mx-auto max-w-6xl space-y-6 py-2">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Verifier performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approval accuracy is upheld approvals divided by all approvals. Collateral history comes
          from indexed Soroban staking events.
        </p>
      </header>

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading verifier metrics...
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          {error}
        </p>
      ) : null}

      {report ? (
        <>
          {report.verifiers.length === 0 ? (
            <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              No verifier audit records are available yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <caption className="sr-only">Verifier performance metrics</caption>
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Verifier
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Audits
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Approval accuracy
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Dispute rate
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Avg. turnaround
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.verifiers.map((verifier) => (
                    <tr key={verifier.verifierAddress}>
                      <th scope="row" className="max-w-72 break-all px-4 py-3 font-medium">
                        {verifier.verifierAddress}
                      </th>
                      <td className="px-4 py-3">{verifier.totalAudits}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4 text-stellar-green" aria-hidden />
                          {formatPercent(verifier.approvalAccuracyPercent)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {verifier.accurateApprovals}/{verifier.accuracySampleSize} approvals
                          upheld
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatPercent(verifier.disputeRatePercent)}
                        <span className="block text-xs text-muted-foreground">
                          {verifier.disputedAudits} disputed
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {formatDuration(verifier.averageTurnaroundSeconds)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section aria-labelledby="slash-history-heading" className="space-y-3">
            <div>
              <h2 id="slash-history-heading" className="text-lg font-semibold">
                Slashed collateral history
              </h2>
              <p className="text-sm text-muted-foreground">
                Executed slashes, in token base units, from the verifier-staking contract.
              </p>
            </div>
            {!report.slashHistoryConfigured ? (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                Set VERIFIER_STAKING_CONTRACT_ID to display on-chain slash events.
              </p>
            ) : report.slashHistory.length === 0 ? (
              <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                No indexed slash events are available.
              </p>
            ) : (
              <ol className="divide-y divide-border rounded-xl border border-border">
                {report.slashHistory.map((event) => (
                  <li
                    key={event.id}
                    className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
                  >
                    <span className="break-all font-medium">{event.verifierAddress}</span>
                    <span>{event.amount} base units</span>
                    <time className="text-muted-foreground" dateTime={event.occurredAt}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
