'use client';

/**
 * CsrReportPanel — Issue #1670
 *
 * Corporate CSR Reporting module for the corporate sponsor dashboard.
 *
 * Provides structured, downloadable exports in GRI Standards and TCFD formats.
 * Each report is signed with Ed25519 and carries a platform-issued timestamp,
 * satisfying the "verified impact data signed and timestamped by platform"
 * acceptance criterion.
 *
 * Acceptance criteria covered:
 *  ✓  Export templates for GRI Standards and TCFD
 *  ✓  Downloadable from corporate dashboard
 *  ✓  Verified impact data signed and timestamped by platform (Ed25519 + ISO 8601 timestamp
 *     embedded in the `integrity` envelope; users can copy the public key for independent
 *     verification via /api/v2/csr-report/verify)
 */

import React, { useState } from 'react';
import { Download, ShieldCheck, AlertCircle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CsrFormat = 'gri' | 'tcfd';

export interface CsrReportPanelProps {
  /** Opaque buyer/company identifier passed to the report API */
  buyerId: string;
  /** Human-readable company name embedded in the report */
  companyName: string;
  /** ISO 8601 start of reporting period (optional; defaults to server-side current period) */
  periodFrom?: string;
  /** ISO 8601 end of reporting period (optional) */
  periodTo?: string;
  /** 'month' | 'quarter' interval hint for the report label */
  interval?: 'month' | 'quarter';
}

interface ExportState {
  status: 'idle' | 'loading' | 'success' | 'error';
  generatedAt?: string;
  reportId?: string;
  publicKey?: string;
  signature?: string;
  error?: string;
}

const INITIAL_STATE: ExportState = { status: 'idle' };

// ─── Standard metadata shown in the UI ────────────────────────────────────────

const STANDARDS = [
  {
    id: 'gri' as CsrFormat,
    label: 'GRI Standards',
    description:
      'Global Reporting Initiative — structured disclosure of carbon offset purchases, co-benefits, and supply chain impact aligned with GRI Climate and Nature topics.',
    badge: 'GRI',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'tcfd' as CsrFormat,
    label: 'TCFD',
    description:
      'Task Force on Climate-related Financial Disclosures — four-pillar template covering Governance, Strategy, Risk Management, and Metrics & Targets. Pillar 4 (Metrics) is pre-populated from platform data; pillars 1–3 include structured guidance stubs.',
    badge: 'TCFD',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildApiUrl(
  format: CsrFormat,
  buyerId: string,
  companyName: string,
  periodFrom?: string,
  periodTo?: string,
  interval?: string
): string {
  const params = new URLSearchParams({
    buyerId,
    companyName,
    dataSource: 'ledger',
    format,
  });
  if (periodFrom) params.set('from', periodFrom);
  if (periodTo) params.set('to', periodTo);
  if (interval) params.set('interval', interval);
  return `/api/v2/buyer-esg-report?${params.toString()}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function truncateKey(hex: string): string {
  return `${hex.slice(0, 12)}…${hex.slice(-8)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function IntegrityBadge({ state }: { state: ExportState }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (state.status !== 'success' || !state.generatedAt) return null;

  const handleCopy = async () => {
    if (!state.publicKey) return;
    await navigator.clipboard.writeText(state.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs space-y-2">
      <div className="flex items-center gap-2 text-emerald-400">
        <ShieldCheck className="h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">Platform-signed &amp; timestamped</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-white/60">
        <span className="font-medium text-white/40">Timestamp</span>
        <span>{formatTimestamp(state.generatedAt)}</span>

        {state.reportId && (
          <>
            <span className="font-medium text-white/40">Report ID</span>
            <span className="font-mono">{state.reportId}</span>
          </>
        )}

        {state.publicKey && (
          <>
            <span className="font-medium text-white/40">Public key</span>
            <span className="flex items-center gap-1 font-mono">
              {truncateKey(state.publicKey)}
              <button
                onClick={handleCopy}
                aria-label="Copy public key"
                className="ml-1 rounded p-0.5 hover:text-white transition-colors"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </span>
          </>
        )}
      </div>

      {state.signature && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Hide signature' : 'Show Ed25519 signature'}
        </button>
      )}

      {expanded && state.signature && (
        <p className="break-all font-mono text-white/40 leading-relaxed">{state.signature}</p>
      )}

      <p className="text-white/30 leading-relaxed">
        Verify this report independently at{' '}
        <code className="text-white/50">/api/v2/csr-report/verify</code> using the public key above.
      </p>
    </div>
  );
}

function ExportCard({
  standard,
  state,
  onExport,
}: {
  standard: (typeof STANDARDS)[number];
  state: ExportState;
  onExport: (format: CsrFormat) => void;
}) {
  const isLoading = state.status === 'loading';
  const hasError = state.status === 'error';

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{standard.label}</span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                standard.badgeColor
              )}
            >
              {standard.badge}
            </span>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{standard.description}</p>
        </div>
      </div>

      {/* Action */}
      <Button
        onClick={() => onExport(standard.id)}
        disabled={isLoading}
        variant="outline"
        className="w-full gap-2 border-white/10 hover:bg-white/5 text-sm"
      >
        <Download className={cn('h-4 w-4', isLoading && 'animate-bounce')} />
        {isLoading
          ? `Generating ${standard.badge} report…`
          : `Download ${standard.badge} export`}
      </Button>

      {/* Error */}
      {hasError && state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Integrity badge */}
      <IntegrityBadge state={state} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CsrReportPanel({
  buyerId,
  companyName,
  periodFrom,
  periodTo,
  interval,
}: CsrReportPanelProps) {
  const [states, setStates] = useState<Record<CsrFormat, ExportState>>({
    gri: INITIAL_STATE,
    tcfd: INITIAL_STATE,
  });

  const setFormatState = (format: CsrFormat, update: Partial<ExportState>) =>
    setStates((prev) => ({ ...prev, [format]: { ...prev[format], ...update } }));

  const handleExport = async (format: CsrFormat) => {
    setFormatState(format, { status: 'loading', error: undefined });

    try {
      const url = buildApiUrl(format, buyerId, companyName, periodFrom, periodTo, interval);
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}: ${res.statusText}`
        );
      }

      // Parse the signed JSON to surface integrity metadata in the UI
      const signed = await res.json() as {
        generatedAt?: string;
        report?: { reportId?: string };
        integrity?: { publicKey?: string; signature?: string };
      };

      const generatedAt = signed.generatedAt ?? new Date().toISOString();
      const reportId = signed.report?.reportId;
      const publicKey = signed.integrity?.publicKey;
      const signature = signed.integrity?.signature;

      // Re-serialize and trigger download
      const blob = new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const periodSlug = periodFrom ? periodFrom.slice(0, 7) : new Date().toISOString().slice(0, 7);
      link.href = objectUrl;
      link.download = `${format}-csr-${companyName.replace(/\s+/g, '-').toLowerCase()}-${periodSlug}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      setFormatState(format, { status: 'success', generatedAt, reportId, publicKey, signature });
    } catch (err) {
      setFormatState(format, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to generate report',
      });
    }
  };

  return (
    <Card className="border-white/5 bg-stellar-navy/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-stellar-blue" />
          CSR Report Exports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-white/50 leading-relaxed">
          Download structured sustainability data exports compatible with GRI Standards and TCFD
          frameworks for use in annual CSR and sustainability reports. Each export is
          cryptographically signed and timestamped by the platform.
        </p>

        <div className="space-y-3">
          {STANDARDS.map((standard) => (
            <ExportCard
              key={standard.id}
              standard={standard}
              state={states[standard.id]}
              onExport={handleExport}
            />
          ))}
        </div>

        <p className="text-[11px] text-white/25 leading-relaxed">
          These exports are structured reporting templates and are not GRI Standards compliance
          assessments or TCFD assurance statements. For regulatory attestation, consult your carbon
          verification partner or auditor.
        </p>
      </CardContent>
    </Card>
  );
}
