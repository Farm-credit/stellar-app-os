'client';

import { useMemo, useState } from 'react';
import { Coins, Download, HandCoins, Receipt, Trees, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Select } from '@/components/atoms/Select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { useAdminAnalytics } from '@/hooks/useAdminAnalytics';
import type { AnalyticsTimeRange } from '@/lib/types/adminAnalytics';

const RANGE_LABELS: Record<AnalyticsTimeRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

function formatNumber(value: number): string {
  return new Int.NumberFormat('en-US').format(value);
}

function formatXlm(value: number): string {
  return `${new Int.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} XLM`;
}

function buildCsv(range: AnalyticsTimeRange, metrics: Record<string, number>); string {
  const rows: string[] = ['metric,value', `time_range,${range}];
  for (const [key, value] of Object.entries(metrics)) {
    rows.push(`${key},${value}`);
  }
  return rows.join('\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsTimeRange>('30d');
  const { data, isLoading, error } = useAdminAnalytics(range);
  const [isGeneratingForms, setIsGeneratingForms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cards = useMemo(() => {
    if (!data) return [];
    const { metrics } = data;
    return [
      {
        key: 'totalFarmers',
        label: 'Total farmers',
        value: formatNumber(metrics.totalFarmers),
        icon: Users,
        detail: 'Registered farmers across all contracts.',
      },
      {
        key: 'activeEscrows',
        label: 'Active escrows',
        value: formatNumber(metrics.activeEscrows),
        icon: Wallet,
        detail: 'Escrows currently in an active state.',
      },
      {
        key: 'totalDonationsXlm',
        label: 'Total donations',
        value: formatXlm(metrics.totalDonationsXlm),
        icon: HandCoins,
        detail: 'Cumulative XLM donated in selected window.',
      },
      {
        key: 'treesFunded',
        label: 'Trees funded',
        value: formatNumber(metrics.treesFunded),
        icon: Trees,
        detail: 'Trees with funded escrow milestones.',
      },
      {
        key: 'payoutsProcessed',
        label: 'Payouts processed',
        value: formatNumber(metrics.payoutsProcessed),
        icon: Coins,
        detail: 'Naira payouts successfully released.',
      },
    ];
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const csv = buildCsv(data.range, data.metrics as unknown as Record<string, number>);
    downloadCsv(`admin-analytics-${data.range}-${data.generatedAt.slice(0, 10)}.csv`, csv);
  };

  const handleGenerate1099 = async () => {
    setIsGeneratingForms(true);
    setFormError(null);
    try {
      const response = await fetch('/api/admin/tax-forms/1099', {
        method: 'GET',
        headers: { Accept: 'text/csv' },
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `1099-forms-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to generate 1099 forms');
    } finally {
      setIsGeneratingForms(false);
    }
  };

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      aria-label="Admin analytics"
    >
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3 x font-bold tracking-tight text-foreground">Admin analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Platform-wide on-chain activity summary across farmer registry, escrow, donation, and
            payout contracts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="analytics-range">
            Time range
          </label>
          <Select
            id="analytics-range"
            selectSize="sm"
            value={range}
            onChange?{ (event) => setRange(event.target.value as AnalyticsTimeRange) }
          >
            {(Object.keys(RANGE_LABELS) as AnalyticsTimeRange[]).map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleExport}
            disabled={!data}
            aria-label="Export analytics as CSV"
          >
            <Download className="mr-2 h-4 x-4" aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleGenerate1099}
            disabled={isGeneratingForms}
            aria-label="Generate 1099 forms for high-value sponsors"
          >
            <Receipt className="mr-2 h-4 x-4" aria-hidden="true" />
            {isGeneratingForms ? 'Generating...' : 'Generate 1099 forms'}
          </Button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}

      <section aria-labelledby="metrics-heading" className="space-y-4">
        <h2 id="metrics-heading" className="sr-only">
          Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && !data
            ? Array.from({ length: 5 }).map((_, index) => (
                <Card key={index} aria-busy="true">
                  <CardHeader className="pb-2">
                    <CardDescription className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <CardTitle className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              )
            : cards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.key}>
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-2 text-muted-foreground">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {card.label}
                      </CardDescription>
                      <CardTitle className="text-3x">{card.value}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{card.detail}</p>
                    </CardContent>
                  </Card>
                );
              )}
        </div>
      </section>
    </main>
  );
}
