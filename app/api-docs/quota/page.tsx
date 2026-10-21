'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRateLimit } from '@/hooks/useRateLimit';
import RateLimitBanner from '@/components/RateLimitBanner';

interface QuotaTier {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  burstLimit: number;
  description: string;
}

interface RecentRequestCount {
  window: string;
  count: number;
  limit: number;
  resetAt: string;
}

const QUOTA_TIERS: QuotaTier[] = [
  {
    name: 'Free',
    requestsPerMinute: 30,
    requestsPerDay: 5000,
    burstLimit: 60,
    description: 'For evaluation and small integrations.',
  },
  {
    name: 'Developer',
    requestsPerMinute: 120,
    requestsPerDay: 50000,
    burstLimit: 240,
    description: 'For production integrations with moderate traffic.',
  },
  {
    name: 'Partner',
    requestsPerMinute: 600,
    requestsPerDay: 500000,
    burstLimit: 1200,
    description: 'For high-volume third-party platforms.',
  },
  {
    name: 'Enterprise',
    requestsPerMinute: 3000,
    requestsPerDay: 5000000,
    burstLimit: 6000,
    description: 'Custom limits negotiated per contract.',
  },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatResetTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCountdown(iso: string, now: number): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return '—';
  }
  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export default function ApiQuotaPage() {
  const { rateLimit, isLoading, error, refetch } = useRateLimit();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const recentRequests = useMemo<RecentRequestCount[]>(() => {
    if (!rateLimit) {
      return [];
    }
    return [
      {
        window: 'Per minute',
        count: rateLimit.remaining !== undefined
          ? Math.max(0, rateLimit.limit - rateLimit.remaining)
          : 0,
        limit: rateLimit.limit ?? 0,
        resetAt: rateLimit.resetAt ?? '',
      },
      {
        window: 'Per day',
        count: rateLimit.dailyCount ?? 0,
        limit: rateLimit.dailyLimit ?? 0,
        resetAt: rateLimit.dailyResetAt ?? '',
      },
    ];
  }, [rateLimit]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link href="/api-docs" className="hover:text-gray-700 hover:underline">
          API Docs
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">Quota Dashboard</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">API Quota Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Monitor your current rate-limit usage, review configured quota tiers, and
          track recent request counts and reset times for your authenticated client.
        </p>
      </header>

      <section className="mb-8" aria-label="Current rate limit">
        <RateLimitBanner />
      </section>

      <section className="mb-8" aria-label="Current usage">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Current Usage</h2>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {isLoading && (
          <p className="text-sm text-gray-500">Loading current usage…</p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            Unable to load rate-limit usage: {error.message ?? 'Unknown error'}.
          </div>
        )}

        {!isLoading && !error && rateLimit && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <dt className="text-sm font-medium text-gray-500">Limit</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {formatNumber(rateLimit.limit ?? 0)}
              </dd>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <dt className="text-sm font-medium text-gray-500">Remaining</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {formatNumber(rateLimit.remaining ?? 0)}
              </dd>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <dt className="text-sm font-medium text-gray-500">Resets in</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {rateLimit.resetAt ? formatCountdown(rateLimit.resetAt, now) : '—'}
              </dd>
            </div>
          </dl>
        )}

        {!isLoading && !error && !rateLimit && (
          <p className="text-sm text-gray-500">
            No rate-limit information available for this client.
          </p>
        )}
      </section>

      <section className="mb-8" aria-label="Recent request counts">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Recent Request Counts
        </h2>
        {recentRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No recent request data available.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Window
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Requests
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Limit
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Resets At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {recentRequests.map((row) => (
                  <tr key={row.window}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {row.window}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatNumber(row.count)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatNumber(row.limit)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {row.resetAt ? formatResetTime(row.resetAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Quota tiers">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Quota Tiers</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUOTA_TIERS.map((tier) => (
            <div
              key={tier.name}
              className="rounded-lg border border-gray-200 bg-white p-5"
            >
              <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{tier.description}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Requests / minute</dt>
                  <dd className="font-medium text-gray-900">
                    {formatNumber(tier.requestsPerMinute)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Requests / day</dt>
                  <dd className="font-medium text-gray-900">
                    {formatNumber(tier.requestsPerDay)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Burst limit</dt>
                  <dd className="font-medium text-gray-900">
                    {formatNumber(tier.burstLimit)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-500">
        <p>
          Need higher limits?{' '}
          <Link href="/api-docs" className="text-blue-600 hover:underline">
            Review the API documentation
          </Link>{' '}
          or contact support to discuss a Partner or Enterprise tier.
        </p>
      </footer>
    </main>
  );
}