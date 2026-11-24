'use client';

/**
 * BiodiversityImpactReport — Issue #1630
 *
 * Annual biodiversity impact reports for one reforestation project:
 * - one downloadable PDF per calendar year (diversity index, wildlife
 *   sightings, ecosystem recovery indicators)
 * - the annual cadence, so it is clear which year is finalised and which is
 *   still being compiled
 * - the field-survey coverage behind each report
 *
 * Loads from GET /api/projects/[id]/biodiversity-report, which compiles the
 * report from the field team's census submissions and wildlife sighting log.
 */

import { useEffect, useState } from 'react';
import {
  Bird,
  CalendarClock,
  FileDown,
  Info,
  Leaf,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type {
  AnnualBiodiversityReport,
  BiodiversityReportListResponse,
  RecoveryIndicator,
} from '@/lib/types/biodiversity-report';
import { cn } from '@/lib/utils';

interface BiodiversityImpactReportProps {
  projectId: string;
  className?: string;
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function groupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

function TrendIcon({ trend }: { trend: RecoveryIndicator['trend'] }) {
  if (trend === 'increasing') {
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  }
  if (trend === 'decreasing') {
    return <TrendingDown className="h-3.5 w-3.5 text-red-600" aria-hidden />;
  }
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

function indicatorValue(indicator: RecoveryIndicator): string {
  if (indicator.value === null) return 'Not measured';
  if (indicator.unit === 'percent') return `${indicator.value.toFixed(1)}%`;
  if (indicator.unit === 'species') return `${indicator.value}`;
  return indicator.value.toFixed(2);
}

function trendLabel(trend: RecoveryIndicator['trend']): string {
  if (trend === 'increasing') return 'improving';
  if (trend === 'decreasing') return 'declining';
  if (trend === 'stable') return 'stable';
  return 'first year';
}

function ReportCard({ report }: { report: AnnualBiodiversityReport }) {
  const { diversity, wildlife, recovery, coverage } = report;

  return (
    <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-foreground">{report.year} report</h4>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                report.status === 'final'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              )}
            >
              {report.status === 'final' ? 'Finalised' : 'Draft — year in progress'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · compiled from{' '}
            {report.sourceSubmissionCount} field submission
            {report.sourceSubmissionCount === 1 ? '' : 's'}
          </p>
        </div>

        <a
          href={report.pdfUrl}
          download={`biodiversity-report-${report.projectId}-${report.year}.pdf`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
        >
          <FileDown className="h-4 w-4" aria-hidden />
          Download PDF
        </a>
      </div>

      {/* Headline metrics */}
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Shannon H′</dt>
          <dd className="text-xl font-semibold text-foreground">
            {diversity.shannonIndex.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tree species</dt>
          <dd className="text-xl font-semibold text-foreground">{diversity.speciesRichness}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Evenness</dt>
          <dd className="text-xl font-semibold text-foreground">{diversity.evenness.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Wildlife species</dt>
          <dd className="text-xl font-semibold text-foreground">{wildlife.speciesRichness}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tree survival</dt>
          <dd className="text-xl font-semibold text-foreground">
            {recovery.treeSurvivalRate === null ? '—' : `${recovery.treeSurvivalRate.toFixed(1)}%`}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-muted-foreground">{diversity.interpretation}</p>

      {report.baselineComparison && (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
          {report.baselineComparison.summary}
        </p>
      )}

      {/* Wildlife sightings */}
      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Bird className="h-4 w-4 text-stellar-green" aria-hidden />
          Wildlife sightings
        </p>
        {wildlife.totalSightings === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No wildlife sightings recorded in this period.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {wildlife.approvedSightings} approved record
              {wildlife.approvedSightings === 1 ? '' : 's'} ·{' '}
              {wildlife.individualsObserved.toLocaleString('en-US')} individuals observed
              {wildlife.pendingSightings > 0
                ? ` · ${wildlife.pendingSightings} awaiting review`
                : ''}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {wildlife.byGroup.map((group) => (
                <li
                  key={group.taxonomicGroup}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {groupLabel(group.taxonomicGroup)} · {group.speciesCount} sp ·{' '}
                  {group.individualCount} ind
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Recovery indicators */}
      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Leaf className="h-4 w-4 text-stellar-green" aria-hidden />
          Ecosystem recovery indicators
          {recovery.recoveryStatus && (
            <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
              {recovery.recoveryStatus.replace(/-/g, ' ')}
            </span>
          )}
        </p>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {recovery.indicators.map((indicator) => (
            <li
              key={indicator.key}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="text-foreground">{indicator.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">{indicatorValue(indicator)}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendIcon trend={indicator.trend} />
                  {trendLabel(indicator.trend)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Coverage + methodology */}
      <p className="mt-4 text-xs text-muted-foreground">
        {coverage.censusSubmissions} census submission
        {coverage.censusSubmissions === 1 ? '' : 's'} ·{' '}
        {coverage.treesCounted.toLocaleString('en-US')} trees counted ·{' '}
        {coverage.wildlifeSubmissions} wildlife submission
        {coverage.wildlifeSubmissions === 1 ? '' : 's'} · surveyors:{' '}
        {coverage.surveyors.length > 0 ? coverage.surveyors.join(', ') : '—'}
      </p>

      <details className="mt-3">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
          How this report is compiled
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          {report.methodology.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
      </details>
    </article>
  );
}

export function BiodiversityImpactReport({ projectId, className }: BiodiversityImpactReportProps) {
  const [data, setData] = useState<BiodiversityReportListResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/biodiversity-report`
        );
        if (!response.ok) throw new Error(`biodiversity report API ${response.status}`);
        const payload = (await response.json()) as BiodiversityReportListResponse;
        if (!cancelled) {
          setData(payload);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section
      id="biodiversity-report"
      aria-labelledby="biodiversity-report-heading"
      className={cn('space-y-4', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <FileDown className="h-5 w-5 text-stellar-green" aria-hidden />
        <h3 id="biodiversity-report-heading" className="text-xl font-semibold text-foreground">
          Biodiversity Impact Report
        </h3>
        <div className="ml-4 h-px flex-1 bg-stellar-blue/20" />
      </div>

      {error && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Biodiversity reports are unavailable right now. Please try again shortly.
        </p>
      )}

      {!data && !error && (
        <div className="h-40 w-full animate-pulse rounded-2xl border border-border bg-muted" />
      )}

      {data && (
        <>
          <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Reports are compiled annually from field survey submissions.
            {data.cadence.lastFinalYear !== null
              ? ` Latest finalised year: ${data.cadence.lastFinalYear}.`
              : ' No year has been finalised yet.'}{' '}
            {data.cadence.currentReportYear} is still in progress and finalises on{' '}
            {formatDate(data.cadence.finalizationDate)}.
          </p>

          {data.reports.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No annual reports yet. A report appears once the field team submits an annual tree
              census or wildlife sightings for this project.
            </p>
          ) : (
            <div className="space-y-4">
              {data.reports.map((report) => (
                <ReportCard key={report.year} report={report} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
