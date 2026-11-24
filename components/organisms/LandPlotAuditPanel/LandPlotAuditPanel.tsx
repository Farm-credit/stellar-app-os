'use client';

// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * LandPlotAuditPanel
 *
 * Submits a ground planting claim to POST /api/satellite/audit and renders the
 * Sentinel/Copernicus NDVI cross-check result: verdict, satellite NDVI
 * evidence, confidence, and the reasoning trail.
 *
 * Accessible user-facing notifications are surfaced inline via `aria-live` /
 * `role="alert"` regions (consistent with SatelliteVerificationPanel), and the
 * backend emits informative `console.warn`/`console.error` when Copernicus
 * credentials are missing or the lookup fails.
 */

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── Types (mirror backend/src/services/landPlotAudit LandPlotAuditResult) ────

interface SatelliteNdviEvidence {
  meanNdvi: number;
  stdevNdvi?: number | null;
  minNdvi?: number | null;
  maxNdvi?: number | null;
  sampleCount: number;
  imageDate: string | null;
  source: string;
  cloudCoveragePercent?: number;
}

type AuditVerdict = 'confirmed' | 'disputed' | 'insufficient_data';

interface LandPlotAuditResult {
  plotId: string;
  verdict: AuditVerdict;
  evidence: SatelliteNdviEvidence;
  expectedNdviRange: { min: number; max: number };
  confidenceScore: number;
  reasoning: string[];
  auditDate: string;
  dataSource: string;
}

export interface LandPlotAuditPanelProps {
  /** Initial JSON to pre-populate the claim textarea (optional). */
  initialRequestJson?: string;
  /** Called when an audit completes successfully. */
  onResult?: (result: LandPlotAuditResult) => void;
  /** Additional CSS classes for the panel root. */
  className?: string;
}

type PanelStatus = 'idle' | 'loading' | 'success' | 'error';

// ── Display config ────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<
  AuditVerdict,
  { label: string; bg: string; border: string; textColor: string; icon: string }
> = {
  confirmed: {
    label: 'Claim Confirmed',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-700',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    icon: '✓',
  },
  disputed: {
    label: 'Claim Disputed',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-700',
    textColor: 'text-red-700 dark:text-red-300',
    icon: '✗',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    textColor: 'text-slate-600 dark:text-slate-400',
    icon: '?',
  },
};

// ── Primitive sub-components ──────────────────────────────────────────────────

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-4 font-mono text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor = pct >= 70 ? 'bg-stellar-green' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Audit confidence score: ${score} out of 100`}
    >
      <div
        className={cn('h-2 rounded-full transition-[width] duration-500', barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: LandPlotAuditResult }) {
  const vc = VERDICT_CONFIG[result.verdict];
  const evidence = result.evidence;

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <div className={cn('rounded-xl border p-4', vc.bg, vc.border)}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold" aria-hidden="true">
              {vc.icon}
            </span>
            <div>
              <p className={cn('text-sm font-bold', vc.textColor)}>{vc.label}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[14rem]">
                Plot: {result.plotId}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {result.confidenceScore}
            </p>
            <p className="text-xs text-muted-foreground">confidence</p>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <section aria-label="Audit confidence">
        <SectionHeading>Confidence</SectionHeading>
        <ConfidenceBar score={result.confidenceScore} />
      </section>

      {/* Satellite evidence */}
      <section aria-label="Satellite NDVI evidence">
        <SectionHeading>Satellite NDVI Evidence</SectionHeading>
        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <StatRow label="Mean NDVI" value={evidence.meanNdvi.toFixed(4)} />
          {evidence.stdevNdvi !== null && evidence.stdevNdvi !== undefined && (
            <StatRow label="NDVI Std. Dev." value={evidence.stdevNdvi.toFixed(4)} />
          )}
          {evidence.minNdvi !== null && evidence.minNdvi !== undefined && (
            <StatRow label="NDVI Min" value={evidence.minNdvi.toFixed(4)} />
          )}
          {evidence.maxNdvi !== null && evidence.maxNdvi !== undefined && (
            <StatRow label="NDVI Max" value={evidence.maxNdvi.toFixed(4)} />
          )}
          <StatRow label="Valid Pixels" value={evidence.sampleCount.toLocaleString()} />
          {evidence.cloudCoveragePercent !== undefined && (
            <StatRow
              label="Cloud Cover"
              value={`${evidence.cloudCoveragePercent.toFixed(0)}%`}
            />
          )}
          <StatRow label="Source" value={evidence.source} />
          <StatRow
            label="Image Date"
            value={evidence.imageDate ?? 'unknown'}
          />
          <StatRow
            label="Expected NDVI"
            value={`${result.expectedNdviRange.min} → ${result.expectedNdviRange.max}`}
          />
        </div>
      </section>

      {/* Reasoning */}
      <section aria-label="Audit reasoning">
        <SectionHeading>Reasoning ({result.reasoning.length})</SectionHeading>
        <ol className="space-y-2">
          {result.reasoning.map((line, idx) => (
            <li
              key={idx}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ol>
      </section>

      <p className="text-right text-xs text-muted-foreground">
        Audited at {new Date(result.auditDate).toLocaleString()}
      </p>
    </div>
  );
}

// ── Default demo claim ───────────────────────────────────────────────────────

const DEFAULT_JSON = JSON.stringify(
  {
    plotId: 'demo-plot-001',
    plotAreaHectares: 2.5,
    bounds: { north: 7.4, south: 7.3, east: 5.2, west: 5.1 },
    claimedStatus: 'planted',
    claimedAt: '2025-01-15',
    claimedTreeCount: 1100,
    speciesSlug: 'teak',
  },
  null,
  2
);

// ── Main component ────────────────────────────────────────────────────────────

export function LandPlotAuditPanel({
  initialRequestJson,
  onResult,
  className,
}: LandPlotAuditPanelProps) {
  const [requestJson, setRequestJson] = useState<string>(initialRequestJson ?? DEFAULT_JSON);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [result, setResult] = useState<LandPlotAuditResult | null>(null);
  const [errorMsg, setError] = useState<string>('');

  const handleAudit = async () => {
    setStatus('loading');
    setError('');
    setResult(null);

    let body: unknown;
    try {
      body = JSON.parse(requestJson);
    } catch {
      setStatus('error');
      setError('Invalid JSON — please check the claim body format.');
      console.warn('[LandPlotAuditPanel] Claim JSON could not be parsed.');
      return;
    }

    try {
      const res = await fetch('/api/satellite/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      type ApiResponse = {
        success: boolean;
        data?: LandPlotAuditResult;
        error?: string;
        validationErrors?: Array<{ field: string; message: string }>;
      };

      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.success) {
        const msg = json.validationErrors
          ? json.validationErrors.map((e) => `${e.field}: ${e.message}`).join('; ')
          : (json.error ?? `HTTP ${res.status}`);
        setStatus('error');
        setError(msg);
        console.warn('[LandPlotAuditPanel] Audit request rejected:', msg);
        return;
      }

      if (json.data) {
        setResult(json.data);
        setStatus('success');
        onResult?.(json.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error.';
      setStatus('error');
      setError(msg);
      console.error('[LandPlotAuditPanel] Audit request failed:', err);
    }
  };

  return (
    <section
      className={cn(
        'space-y-6 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl',
        'dark:border-slate-800 dark:bg-slate-950/80',
        className
      )}
      aria-label="Land plot audit against satellite NDVI"
    >
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <svg
            className="h-4 w-4 text-stellar-green"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          Land Plot Audit
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cross-check a ground planting claim against Sentinel/Copernicus NDVI vegetation density.
        </p>
      </div>

      {/* Claim input */}
      <div className="space-y-2">
        <label htmlFor="lpap-json-input" className="text-xs font-medium text-foreground">
          Ground Planting Claim (JSON)
        </label>
        <textarea
          id="lpap-json-input"
          value={requestJson}
          onChange={(e) => setRequestJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className={cn(
            'w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs text-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-green focus-visible:ring-offset-2',
            status === 'error' ? 'border-red-400' : 'border-border'
          )}
          aria-describedby="lpap-json-hint"
        />
        <p id="lpap-json-hint" className="text-xs text-muted-foreground">
          Provide the plot bounds (or centroid coordinates), claimed vegetation status, and the
          claim date. Verdicts: confirmed, disputed, or insufficient_data.
        </p>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleAudit}
        disabled={status === 'loading'}
        className={cn(
          'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-green focus-visible:ring-offset-2',
          status === 'loading'
            ? 'cursor-not-allowed bg-stellar-green/60'
            : 'bg-stellar-green hover:bg-stellar-green/90 active:bg-stellar-green/80'
        )}
      >
        {status === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Auditing…
          </span>
        ) : (
          'Run Land Plot Audit'
        )}
      </button>

      {/* Loading status */}
      {status === 'loading' && (
        <p className="sr-only" role="status">
          Auditing plot against satellite NDVI…
        </p>
      )}

      {/* Error */}
      {status === 'error' && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950/30"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-xs font-semibold text-red-700 dark:text-red-300">Audit Error</p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Result */}
      {status === 'success' && result && (
        <div aria-live="polite" aria-label="Land plot audit result">
          <ResultPanel result={result} />
        </div>
      )}
    </section>
  );
}

LandPlotAuditPanel.displayName = 'LandPlotAuditPanel';
