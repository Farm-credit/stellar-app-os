'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Building2,
  Check,
  Copy,
  Leaf,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import {
  formatStellarAddress,
  rankBenefactors,
  SEED_BENEFACTORS,
  type BenefactorFilterType,
  type BenefactorLeaderboardResult,
  type BenefactorPeriod,
  type BenefactorSortBy,
  type RankedBenefactorEntry,
} from '@/lib/benefactors/leaderboard';

interface BenefactorLeaderboardProps {
  initialData?: BenefactorLeaderboardResult;
}

type AreaUnit = 'hectares' | 'acres';

const TYPE_OPTIONS: Array<{ value: BenefactorFilterType; label: string }> = [
  { value: 'all', label: 'All Benefactors' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'individual', label: 'Individual' },
];

const PERIOD_OPTIONS: Array<{ value: BenefactorPeriod; label: string }> = [
  { value: 'all-time', label: 'All-Time' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' },
];

const SORT_OPTIONS: Array<{ value: BenefactorSortBy; label: string }> = [
  { value: 'hectares', label: 'Hectares Restored' },
  { value: 'impactScore', label: 'Community Impact' },
  { value: 'stewardsSupported', label: 'Stewards Supported' },
  { value: 'creditsFunded', label: 'Credits Funded' },
];

function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatArea(entry: RankedBenefactorEntry, unit: AreaUnit): string {
  if (unit === 'acres') {
    return `${formatNumber(entry.acresRestored, 1)} ac`;
  }
  return `${formatNumber(entry.hectaresRestored, 1)} ha`;
}

export function BenefactorLeaderboard({ initialData }: BenefactorLeaderboardProps) {
  const [type, setType] = useState<BenefactorFilterType>(
    initialData?.meta.type ?? 'all'
  );
  const [period, setPeriod] = useState<BenefactorPeriod>(
    initialData?.meta.period ?? 'all-time'
  );
  const [sortBy, setSortBy] = useState<BenefactorSortBy>(
    initialData?.meta.sortBy ?? 'hectares'
  );
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState<AreaUnit>('hectares');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const data = useMemo(() => {
    const isDefaultQuery =
      type === (initialData?.meta.type ?? 'all') &&
      period === (initialData?.meta.period ?? 'all-time') &&
      sortBy === (initialData?.meta.sortBy ?? 'hectares') &&
      search.trim() === '';

    if (initialData && isDefaultQuery) {
      return initialData;
    }

    return rankBenefactors(SEED_BENEFACTORS, {
      type,
      period,
      sortBy,
      search,
    });
  }, [initialData, type, period, sortBy, search]);

  const topThree = data.entries.slice(0, 3);

  const announce = (message: string) => {
    setNotification(message);
  };

  const handleCopyAddress = async (entry: RankedBenefactorEntry) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(entry.stellarAddress);
        setCopiedId(entry.id);
        announce(`Copied Stellar address for ${entry.name} to clipboard.`);
        setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 2500);
      } else {
        console.warn('[BenefactorLeaderboard] Clipboard API is unavailable in this environment.');
        announce(`Clipboard unavailable. Address: ${entry.stellarAddress}`);
      }
    } catch (error) {
      console.warn('[BenefactorLeaderboard] Failed to copy Stellar address:', error);
      announce(`Unable to copy address for ${entry.name}.`);
    }
  };

  const handleResetFilters = () => {
    setType('all');
    setPeriod('all-time');
    setSortBy('hectares');
    setSearch('');
    announce('Leaderboard filters reset to all benefactors.');
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Public Benefactor &amp; Sponsor Leaderboard
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Top Ecological Benefactors by Acreage
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base dark:text-slate-300">
            Recognizing corporate sponsors and individual donors funding verified ecological
            impact credits for farmers, urban planters, community schools, and field verifiers.
          </p>
        </div>

        {/* Unit Toggle */}
        <div
          className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          role="group"
          aria-label="Area measurement unit"
        >
          <button
            type="button"
            onClick={() => {
              setUnit('hectares');
              announce('Displaying restored area in hectares.');
            }}
            aria-pressed={unit === 'hectares'}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              unit === 'hectares'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Hectares (ha)
          </button>
          <button
            type="button"
            onClick={() => {
              setUnit('acres');
              announce('Displaying restored area in acres.');
            }}
            aria-pressed={unit === 'acres'}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              unit === 'acres'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Acres (ac)
          </button>
        </div>
      </header>

      {/* Accessible Live Notification Banner */}
      <div
        role="status"
        aria-live="polite"
        className={
          notification
            ? 'mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
            : 'sr-only'
        }
      >
        <span>{notification ?? ''}</span>
        {notification && (
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-4 text-xs font-semibold underline hover:no-underline"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <section aria-label="Leaderboard summary metrics" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Total Area Restored</span>
            <Leaf className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {unit === 'hectares'
              ? `${formatNumber(data.summary.totalHectaresRestored, 1)} ha`
              : `${formatNumber(data.summary.totalAcresRestored, 1)} ac`}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {unit === 'hectares'
              ? `${formatNumber(data.summary.totalAcresRestored, 1)} acres equivalent`
              : `${formatNumber(data.summary.totalHectaresRestored, 1)} hectares equivalent`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Stewards Supported</span>
            <Users className="h-4 w-4 text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(data.summary.totalStewardsSupported)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(data.summary.stewardBreakdown.farmers)} farmers &middot;{' '}
            {formatNumber(
              data.summary.stewardBreakdown.urbanPlanters +
                data.summary.stewardBreakdown.communitySchools +
                data.summary.stewardBreakdown.verifiers
            )}{' '}
            community stewards
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Ecological Credits Funded</span>
            <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(data.summary.totalEcologicalCreditsFunded)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Settled on Stellar Soroban
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Active Benefactors</span>
            <Building2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(data.summary.totalBenefactors)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {data.summary.corporateCount} corporate &middot; {data.summary.individualCount} individual
          </p>
        </div>
      </section>

      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <section aria-label="Top three benefactors" className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Leading Restoration Champions
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {topThree.map((entry) => (
              <article
                key={entry.id}
                className={`rounded-xl border p-5 shadow-sm transition ${
                  entry.rank === 1
                    ? 'border-amber-300 bg-gradient-to-b from-amber-50/70 to-white dark:border-amber-700/60 dark:from-amber-950/30 dark:to-slate-900'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      entry.rank === 1
                        ? 'bg-amber-400 text-amber-950'
                        : entry.rank === 2
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-orange-200 text-orange-900'
                    }`}
                  >
                    #{entry.rank}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {entry.type === 'corporate' ? (
                      <Building2 className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <User className="h-3 w-3" aria-hidden="true" />
                    )}
                    {entry.type}
                  </span>
                </div>
                <h3 className="mt-3 flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-white">
                  <span>{entry.name}</span>
                  {entry.verified && (
                    <ShieldCheck
                      className="h-4 w-4 text-emerald-600"
                      aria-label="Verified benefactor"
                    />
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{entry.region}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Area Restored</p>
                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatArea(entry, unit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Impact Score</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      {entry.communityImpactScore}/100
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Filter & Search Bar */}
      <section
        aria-label="Filter and sort benefactors"
        className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Benefactor type filter">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={type === option.value}
              onClick={() => {
                setType(option.value);
                announce(`Filtered leaderboard to ${option.label.toLowerCase()}.`);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                type === option.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, region, or address..."
              aria-label="Search benefactors"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-64 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <select
            aria-label="Time period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as BenefactorPeriod)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort benefactors by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as BenefactorSortBy)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Leaderboard Table */}
      <section aria-label="Benefactor rankings table">
        {data.entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-medium text-slate-900 dark:text-white">
              No benefactors match your current filters.
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Try adjusting your search query or switching benefactor categories.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Benefactor
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Area Restored
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Community Stewards Supported
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Impact Score
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Credits Funded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>#{entry.rank}</span>
                        {entry.rankChange === 'up' && (
                          <TrendingUp
                            className="h-3.5 w-3.5 text-emerald-600"
                            aria-label="Rank moved up"
                          />
                        )}
                        {entry.rankChange === 'down' && (
                          <TrendingDown
                            className="h-3.5 w-3.5 text-rose-500"
                            aria-label="Rank moved down"
                          />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {entry.name}
                          </span>
                          {entry.verified && (
                            <ShieldCheck
                              className="h-4 w-4 text-emerald-600"
                              aria-label="Verified benefactor"
                            />
                          )}
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              entry.type === 'corporate'
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                : 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                            }`}
                          >
                            {entry.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{entry.region}</span>
                          <span aria-hidden="true">&middot;</span>
                          <code className="font-mono">
                            {formatStellarAddress(entry.stellarAddress)}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(entry)}
                            aria-label={`Copy Stellar address for ${entry.name}`}
                            className="inline-flex items-center rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            {copiedId === entry.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <div className="font-bold text-emerald-700 dark:text-emerald-400">
                        {formatArea(entry, unit)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {unit === 'hectares'
                          ? `${formatNumber(entry.acresRestored, 1)} ac`
                          : `${formatNumber(entry.hectaresRestored, 1)} ha`}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {formatNumber(entry.totalStewardsSupported)} stewards
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{entry.stewards.farmers} farmers</span>
                        <span>&middot; {entry.stewards.urbanPlanters} urban planters</span>
                        <span>&middot; {entry.stewards.communitySchools} schools</span>
                        <span>&middot; {entry.stewards.verifiers} verifiers</span>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {entry.communityImpactScore}/100
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-900 dark:text-white">
                      {formatNumber(entry.ecologicalCreditsFunded)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
