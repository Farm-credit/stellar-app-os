'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  LandCoverChange,
  NdviAnalysisResult,
  SatelliteVerificationRequest,
  SatelliteVerificationResult,
  TreeCountResult,
  VerificationFlag,
  VegetationHealthClass,
} from '@/lib/satellite/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SatelliteVerificationPanelProps {
  /** Initial JSON to pre-populate the input textarea (optional). */
  initialRequestJson?: string;
  /** Called when verification completes successfully. */
  onResult?: (result: SatelliteVerificationResult) => void;
  /** Additional CSS classes for the panel root. */
  className?: string;
}

type PanelStatus = 'idle' | 'loading' | 'success' | 'error';

// ── Display config ────────────────────────────────────────────────────────────

const HEALTH_CLASS_CONFIG: Record<
  VegetationHealthClass,
  { label: string; textColor: string; dotColor: string }
> = {
  water_or_cloud:     { label: 'Water / Cloud',       textColor: 'text-blue-500',     dotColor: 'bg-blue-400' },
  bare_soil:          { label: 'Bare Soil',            textColor: 'text-amber-600',    dotColor: 'bg-amber-500' },
  sparse_vegetation:  { label: 'Sparse Vegetation',   textColor: 'text-yellow-500',   dotColor: 'bg-yellow-400' },
  moderate_vegetation:{ label: 'Moderate Vegetation', textColor: 'text-lime-500',     dotColor: 'bg-lime-400' },
  healthy_vegetation: { label: 'Healthy Vegetation',  textColor: 'text-emerald-500',  dotColor: 'bg-emerald-400' },
  dense_canopy:       { label: 'Dense Canopy',        textColor: 'text-stellar-green',dotColor: 'bg-stellar-green' },
};

const VERDICT_CONFIG: Record<
  SatelliteVerificationResult['verdict'],
  { label: string; bg: string; border: string; textColor: string; icon: string }
> = {
  verified:           { label: 'Verified',           bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-700', textColor: 'text-emerald-700 dark:text-emerald-300', icon: '✓' },
  partially_verified: { label: 'Partially Verified', bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-amber-200 dark:border-amber-700',     textColor: 'text-amber-700 dark:text-amber-300',     icon: '⚠' },
  failed:             { label: 'Failed',             bg: 'bg-red-50 dark:bg-red-950/30',         border: 'border-red-200 dark:border-red-700',         textColor: 'text-red-700 dark:text-red-300',         icon: '✗' },
  insufficient_data:  { label: 'Insufficient Data',  bg: 'bg-slate-50 dark:bg-slate-800/50',     border: 'border-slate-200 dark:border-slate-700',     textColor: 'text-slate-600 dark:text-slate-400',     icon: '?' },
};

const FLAG_CONFIG = {
  info:     { bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-700',   text: 'text-blue-800 dark:text-blue-200',   codeText: 'text-blue-600 dark:text-blue-400',   icon: 'ℹ' },
  warning:  { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200', codeText: 'text-amber-600 dark:text-amber-400', icon: '⚠' },
  critical: { bg: 'bg-red-50 dark:bg-red-950/30',     border: 'border-red-200 dark:border-red-700',     text: 'text-red-800 dark:text-red-200',     codeText: 'text-red-600 dark:text-red-400',     icon: '✗' },
};

// ── Primitive sub-components ──────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
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

function HealthBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor = pct >= 70 ? 'bg-stellar-green' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Vegetation health score: ${score} out of 100`}
    >
      <div
        className={cn('h-2 rounded-full transition-[width] duration-500', barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Result section components ─────────────────────────────────────────────────

function VegetationSection({ vegetation }: { vegetation: NdviAnalysisResult }) {
  const cfg = HEALTH_CLASS_CONFIG[vegetation.healthClass];
  return (
    <section aria-label="Vegetation health">
      <SectionHeading>Vegetation Health</SectionHeading>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', cfg.dotColor)} aria-hidden="true" />
          <span className={cn('text-sm font-semibold', cfg.textColor)}>{cfg.label}</span>
          {vegetation.imageDate && (
            <span className="ml-auto text-xs text-muted-foreground">{vegetation.imageDate}</span>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Health Score</span>
            <span className="font-medium">{vegetation.healthScore}/100</span>
          </div>
          <HealthBar score={vegetation.healthScore} />
        </div>

        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <StatRow label="NDVI"  value={vegetation.indices.ndvi.toFixed(4)} />
          <StatRow label="SAVI"  value={vegetation.indices.savi.toFixed(4)} />
          {vegetation.indices.evi  !== null && <StatRow label="EVI"  value={vegetation.indices.evi.toFixed(4)} />}
          {vegetation.indices.ndre !== null && <StatRow label="NDRE" value={vegetation.indices.ndre.toFixed(4)} />}
        </div>
      </div>
    </section>
  );
}

function TreeCountSection({ treeCount }: { treeCount: TreeCountResult }) {
  const statusColors = {
    pass:     'text-emerald-600 dark:text-emerald-400',
    marginal: 'text-amber-600 dark:text-amber-400',
    fail:     'text-red-600 dark:text-red-400',
  };
  const statusLabels = {
    pass:     '✓ Count Verified',
    marginal: '⚠ Marginal Match',
    fail:     '✗ Count Mismatch',
  };

  return (
    <section aria-label="Tree count estimation">
      <SectionHeading>Tree Count Estimation</SectionHeading>
      <div className="space-y-3">
        <div className="py-2 text-center">
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {treeCount.estimatedCount.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            estimated trees
            <span className="ml-1 text-muted-foreground/70">
              (CI: {treeCount.confidenceInterval.low.toLocaleString()}–{treeCount.confidenceInterval.high.toLocaleString()})
            </span>
          </p>
        </div>

        {treeCount.verificationStatus && (
          <div className="flex items-center justify-center gap-1.5">
            <span className={cn('text-xs font-semibold', statusColors[treeCount.verificationStatus])}>
              {statusLabels[treeCount.verificationStatus]}
            </span>
            {treeCount.claimedCount !== undefined && (
              <span className="text-xs text-muted-foreground">
                (claimed: {treeCount.claimedCount.toLocaleString()})
              </span>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <StatRow label="Plot Area"    value={`${treeCount.plotAreaHectares.toFixed(2)} ha`} />
          <StatRow label="Canopy Cover" value={`${(treeCount.canopyCoverFraction * 100).toFixed(1)}%`} />
          <StatRow label="Crown Diam."  value={`${treeCount.crownDiameterUsed} m`} />
        </div>
      </div>
    </section>
  );
}

function LandCoverSection({ change }: { change: LandCoverChange }) {
  const deltaSign = change.forestFractionDelta >= 0 ? '+' : '';
  const changeColor = change.reforestationConfirmed
    ? 'text-stellar-green'
    : change.deforestationDetected
      ? 'text-red-500'
      : 'text-muted-foreground';
  const changeLabel = change.reforestationConfirmed
    ? '✓ Reforestation confirmed'
    : change.deforestationDetected
      ? '⚠ Deforestation detected'
      : 'No significant forest change';

  return (
    <section aria-label="Land cover change">
      <SectionHeading>Land Cover Change</SectionHeading>
      <div className="space-y-3">
        {/* Date range */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{change.fromDate}</span>
          <svg className="h-3.5 w-3.5 mx-2" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-foreground">{change.toDate}</span>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 space-y-0.5">
          <StatRow label="Forest Δ"    value={`${deltaSign}${(change.forestFractionDelta * 100).toFixed(1)}%`} />
          {change.forestAreaChangePercent !== null && (
            <StatRow
              label="Relative Change"
              value={`${change.forestAreaChangePercent > 0 ? '+' : ''}${change.forestAreaChangePercent.toFixed(1)}%`}
            />
          )}
          <StatRow label="Magnitude" value={change.changeMagnitude} />
        </div>

        <p className={cn('text-xs font-semibold', changeColor)}>{changeLabel}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{change.narrative}</p>
      </div>
    </section>
  );
}

function FlagsSection({ flags }: { flags: VerificationFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <section aria-label="Verification flags">
      <SectionHeading>Flags ({flags.length})</SectionHeading>
      <ul className="space-y-2">
        {flags.map((flag) => {
          const cfg = FLAG_CONFIG[flag.severity];
          return (
            <li key={flag.code} className={cn('rounded-lg border p-3', cfg.bg, cfg.border)}>
              <div className="flex items-start gap-2">
                <span className={cn('mt-0.5 flex-shrink-0 text-sm font-bold', cfg.text)} aria-hidden="true">
                  {cfg.icon}
                </span>
                <div>
                  <p className={cn('font-mono text-xs font-semibold', cfg.codeText)}>{flag.code}</p>
                  <p className={cn('mt-0.5 text-xs leading-relaxed', cfg.text)}>{flag.message}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultPanel({ result }: { result: SatelliteVerificationResult }) {
  const vc = VERDICT_CONFIG[result.verdict];
  return (
    <div className="space-y-6">
      {/* Verdict */}
      <div className={cn('rounded-xl border p-4', vc.bg, vc.border)}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold" aria-hidden="true">{vc.icon}</span>
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

      <VegetationSection vegetation={result.vegetation} />
      <TreeCountSection treeCount={result.treeCount} />
      {result.landCoverChange && <LandCoverSection change={result.landCoverChange} />}
      <FlagsSection flags={result.flags} />

      <p className="text-right text-xs text-muted-foreground">
        Verified at {new Date(result.verifiedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ── Default demo payload ──────────────────────────────────────────────────────

const DEFAULT_JSON = JSON.stringify(
  {
    plotId: 'demo-plot-001',
    coordinates: { latitude: 7.35, longitude: 5.1 },
    plotAreaHectares: 2.5,
    currentBands: { red: 0.09, nir: 0.45, blue: 0.04, green: 0.1, swir1: 0.12 },
    baselineBands:  { red: 0.28, nir: 0.15, blue: 0.06, green: 0.14 },
    imageryMetadata: {
      resolutionMetersPerPixel: 10,
      plotAreaHectares: 2.5,
      canopyCoverFraction: 0.55,
      estimatedCrownDiameterMeters: 6,
    },
    imageryDate:  '2025-09-15',
    baselineDate: '2023-03-01',
    claimedTreeCount: 1200,
    speciesSlug: 'teak',
  },
  null,
  2
);

// ── Main component ────────────────────────────────────────────────────────────

/**
 * SatelliteVerificationPanel
 *
 * Organism component that submits spectral band data to POST /api/satellite/verify
 * and renders the full verification result: NDVI health, tree-count estimate,
 * land-cover change, verification flags, and the overall verdict.
 *
 * In production, callers supply pre-extracted band reflectance values from a
 * satellite imagery provider (Sentinel-2, Landsat, Planet).  The built-in
 * JSON textarea is a developer/demo convenience.
 */
export function SatelliteVerificationPanel({
  initialRequestJson,
  onResult,
  className,
}: SatelliteVerificationPanelProps) {
  const [requestJson, setRequestJson] = useState<string>(
    initialRequestJson ?? DEFAULT_JSON
  );
  const [status, setStatus]   = useState<PanelStatus>('idle');
  const [result, setResult]   = useState<SatelliteVerificationResult | null>(null);
  const [errorMsg, setError]  = useState<string>('');

  const handleVerify = async () => {
    setStatus('loading');
    setError('');
    setResult(null);

    let body: unknown;
    try {
      body = JSON.parse(requestJson);
    } catch {
      setStatus('error');
      setError('Invalid JSON — please check the request body format.');
      return;
    }

    try {
      const res = await fetch('/api/satellite/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      type ApiResponse = {
        success: boolean;
        data?: SatelliteVerificationResult;
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
    }
  };

  return (
    <section
      className={cn(
        'space-y-6 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl',
        'dark:border-slate-800 dark:bg-slate-950/80',
        className
      )}
      aria-label="Satellite environmental verification"
    >
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          {/* Satellite icon */}
          <svg className="h-4 w-4 text-stellar-blue" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
          Satellite Verification
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Verify environmental claims — NDVI vegetation health, tree count, and land-cover change.
        </p>
      </div>

      {/* JSON input */}
      <div className="space-y-2">
        <label htmlFor="svp-json-input" className="text-xs font-medium text-foreground">
          Verification Request (JSON)
        </label>
        <textarea
          id="svp-json-input"
          value={requestJson}
          onChange={(e) => setRequestJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className={cn(
            'w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs text-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2',
            status === 'error' ? 'border-red-400' : 'border-border'
          )}
          aria-describedby="svp-json-hint"
        />
        <p id="svp-json-hint" className="text-xs text-muted-foreground">
          Supply spectral band reflectance values (0–1) from Sentinel-2, Landsat 8/9, or Planet imagery.
        </p>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={status === 'loading'}
        className={cn(
          'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2',
          status === 'loading'
            ? 'cursor-not-allowed bg-stellar-blue/60'
            : 'bg-stellar-blue hover:bg-stellar-blue/90 active:bg-stellar-blue/80'
        )}
      >
        {status === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Verifying…
          </span>
        ) : (
          'Run Satellite Verification'
        )}
      </button>

      {/* Error */}
      {status === 'error' && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950/30"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-xs font-semibold text-red-700 dark:text-red-300">Verification Error</p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Result */}
      {status === 'success' && result && (
        <div aria-live="polite" aria-label="Verification result">
          <ResultPanel result={result} />
        </div>
      )}
    </section>
  );
}

SatelliteVerificationPanel.displayName = 'SatelliteVerificationPanel';
