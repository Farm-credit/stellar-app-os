'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { generateEsgExcel, generateEsgReport } from '@/lib/corporate';
import type { BuyerAnalyticsSummary } from '@/lib/api/buyer-analytics';
import {
  buildEsgInputFromAnalytics,
  createEsgDisclosure,
  defaultEsgDisclosure,
  parseEsgShareParams,
  type EsgDisclosureInput,
} from '@/lib/esg-disclosure';

function EsgDisclosureTool() {
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => (searchParams.toString() ? parseEsgShareParams(searchParams) : defaultEsgDisclosure()),
    [searchParams]
  );
  const [form, setForm] = useState<EsgDisclosureInput>(initial);
  const [shareNote, setShareNote] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadMessage, setLoadMessage] = useState('');
  const report = useMemo(() => createEsgDisclosure(form), [form]);

  const update = (patch: Partial<EsgDisclosureInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setShareNote('');
  };

  const handleLoadOffsets = async () => {
    const id = buyerId.trim();
    if (!id) {
      setLoadState('error');
      setLoadMessage('Enter your buyer ID to load your carbon offset data.');
      return;
    }
    setLoadState('loading');
    setLoadMessage('');
    try {
      const response = await fetch(`/api/v2/buyer-analytics?buyerId=${encodeURIComponent(id)}`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Could not load offset data.';
        throw new Error(message);
      }
      const summary = body as BuyerAnalyticsSummary;
      setForm((current) =>
        buildEsgInputFromAnalytics(summary, {
          companyName: current.companyName,
          period: current.period,
        })
      );
      setShareNote('');
      setLoadState('idle');
      setLoadMessage(
        summary.supplyChain.length
          ? `Loaded ${summary.supplyChain.length} project(s) from your offset purchases.`
          : 'No offset purchases found for this buyer ID.'
      );
    } catch (error) {
      setLoadState('error');
      setLoadMessage(error instanceof Error ? error.message : 'Could not load offset data.');
    }
  };

  const reportPayload = () => ({
    companyName: report.companyName,
    totalTrees: report.totalTrees,
    totalCo2Offset: report.totalCo2Offset,
    projectsSupported: report.projectsSupported,
    period: report.period,
    reportId: report.reportId,
    offsets: report.offsets,
    coBenefits: report.coBenefits,
    supplyChain: report.supplyChain,
  });

  const handleExport = () => {
    generateEsgReport(reportPayload());
  };

  const handleExportExcel = () => {
    generateEsgExcel(reportPayload());
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${report.sharePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Share link copied for investors and stakeholders.');
    } catch {
      setShareNote(url);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Buyer CSR
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            ESG disclosure report
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Create a disclosure from your carbon offset purchases and share it with investors and
            stakeholders. Figures can be exported as a PDF or sent as a link.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <form className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Buyer ID</span>
                <input
                  value={buyerId}
                  onChange={(event) => setBuyerId(event.target.value)}
                  placeholder="Your buyer ID"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
              <button
                type="button"
                onClick={handleLoadOffsets}
                disabled={loadState === 'loading'}
                className="mt-3 rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loadState === 'loading' ? 'Loading…' : 'Load my offset data'}
              </button>
              {loadMessage && (
                <p
                  role={loadState === 'error' ? 'alert' : 'status'}
                  className={`mt-2 text-sm ${loadState === 'error' ? 'text-red-600' : 'text-stellar-blue'}`}
                >
                  {loadMessage}
                </p>
              )}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Company name</span>
              <input
                value={form.companyName}
                onChange={(event) => update({ companyName: event.target.value })}
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Reporting period</span>
              <input
                value={form.period}
                onChange={(event) => update({ period: event.target.value })}
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Trees supported</span>
                <input
                  type="number"
                  min={0}
                  value={form.totalTrees}
                  onChange={(event) => update({ totalTrees: Number(event.target.value) || 0 })}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">tCO2e offset</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.totalCo2Offset}
                  onChange={(event) => update({ totalCo2Offset: Number(event.target.value) || 0 })}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Projects (one per line)</span>
              <textarea
                rows={5}
                value={form.projectsSupported.join('\n')}
                onChange={(event) =>
                  update({
                    projectsSupported: event.target.value.split('\n').map((line) => line.trim()),
                  })
                }
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-lg bg-stellar-blue px-4 py-3 text-sm font-semibold text-white"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="rounded-lg bg-stellar-blue px-4 py-3 text-sm font-semibold text-white"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-foreground"
              >
                Copy share link
              </button>
            </div>
            {shareNote && <p className="text-sm text-stellar-blue">{shareNote}</p>}
          </form>

          <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {report.reportId}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{report.companyName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{report.period}</p>
            <dl className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-muted/40 p-4">
                <dt className="text-xs uppercase text-muted-foreground">Trees</dt>
                <dd className="mt-1 text-2xl font-bold text-foreground">
                  {report.totalTrees.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <dt className="text-xs uppercase text-muted-foreground">Offset</dt>
                <dd className="mt-1 text-2xl font-bold text-foreground">
                  {report.totalCo2Offset.toLocaleString()} tCO2e
                </dd>
              </div>
            </dl>
            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-foreground">
              Carbon offset line items
            </h3>
            {report.offsets?.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                No carbon offset line items yet. Load your offset data to include them.
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {(report.offsets ?? []).map((line) => (
                <li
                  key={line.projectName}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{line.projectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.creditType} · {line.verification}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-stellar-blue">{line.tonnesCo2e} tCO2e</p>
                </li>
              ))}
            </ul>

            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-foreground">
              Co-benefits achieved
            </h3>
            {(report.coBenefits?.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No co-benefit data yet. Load your offset data to include it.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(report.coBenefits ?? []).map((benefit) => (
                  <li
                    key={benefit.name}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
                  >
                    <p className="font-medium text-foreground">{benefit.name}</p>
                    <p className="text-sm font-semibold text-stellar-blue">
                      {benefit.tonnes} tCO2e · {benefit.sharePercentage}%
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-foreground">
              Supply chain impact
            </h3>
            {(report.supplyChain?.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No supply chain data yet. Load your offset data to include it.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(report.supplyChain ?? []).map((project) => (
                  <li
                    key={`${project.projectName}-${project.location}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-foreground">{project.projectName}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.location} · {project.stageSummary}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-stellar-blue">
                      {project.tonnesCo2e} tCO2e
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

export default function EsgDisclosurePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-12">
          <p className="text-muted-foreground">Loading ESG disclosure tool…</p>
        </main>
      }
    >
      <EsgDisclosureTool />
    </Suspense>
  );
}
