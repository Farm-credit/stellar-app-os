'use client';

import React, { useMemo, useState } from 'react';
import { Globe2, Leaf, Search, Sprout, Trees, TrendingDown } from 'lucide-react';
import {
  computeCorporateImpactSummary,
  type CorporateOrder,
  type SponsoredTreeStatus,
} from '@/lib/corporate-sponsorship/packages';

interface CorporateImpactDashboardProps {
  orders: CorporateOrder[];
}

const STATUS_BADGE_STYLES: Record<SponsoredTreeStatus, string> = {
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  growing: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  planted: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
};

export function CorporateImpactDashboard({ orders }: CorporateImpactDashboardProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const activeOrder = useMemo(() => {
    if (selectedOrderId === 'all') return orders[0];
    return orders.find((o) => o.id === selectedOrderId) ?? orders[0];
  }, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    if (selectedOrderId === 'all') return orders;
    return orders.filter((o) => o.id === selectedOrderId);
  }, [orders, selectedOrderId]);

  const summary = useMemo(() => computeCorporateImpactSummary(filteredOrders), [filteredOrders]);

  const visibleTrees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filteredOrders
      .flatMap((o) => o.trees)
      .filter((tree) => {
        if (statusFilter !== 'all' && tree.status !== statusFilter) return false;
        if (!q) return true;
        return (
          tree.treeCode.toLowerCase().includes(q) ||
          tree.species.toLowerCase().includes(q) ||
          tree.region.toLowerCase().includes(q) ||
          (tree.assignedEmployee?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [filteredOrders, statusFilter, searchQuery]);

  const primaryColor = activeOrder?.branding.primaryColor ?? '#166534';
  const secondaryColor = activeOrder?.branding.secondaryColor ?? '#0f766e';
  const companyName = activeOrder?.branding.companyName ?? 'Corporate Partner';
  const tagline = activeOrder?.branding.tagline ?? 'Verified Corporate Reforestation Impact';

  return (
    <div className="space-y-6">
      {/* Co-Branded Corporate Header */}
      <div
        className="rounded-2xl p-6 text-white shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        }}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold tracking-wider text-white/80 uppercase">
              Harvesta × Branded Corporate Impact Dashboard
            </p>
            <h2 className="mt-1 text-2xl font-bold">{companyName}</h2>
            <p className="mt-1 text-sm text-white/90">{tagline}</p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dashboard-order-filter" className="text-xs font-medium text-white/80">
              View:
            </label>
            <select
              id="dashboard-order-filter"
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:outline-none"
            >
              <option value="all" className="text-gray-900">
                All Corporate Orders ({orders.length})
              </option>
              {orders.map((order) => (
                <option key={order.id} value={order.id} className="text-gray-900">
                  {order.branding.companyName} — {order.orderNumber} ({order.quote.quantity} trees)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Sponsored Trees</span>
            <Trees className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {summary.totalTrees.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Across {summary.totalOrders} bulk {summary.totalOrders === 1 ? 'order' : 'orders'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Annual CO₂ Offset</span>
            <Leaf className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {(summary.annualCo2OffsetKg / 1000).toFixed(2)}t
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {summary.annualCo2OffsetKg.toLocaleString('en-US')} kg CO₂ / year
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Biodiversity Footprint</span>
            <Globe2 className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {summary.uniqueSpecies} species
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Planted in {summary.uniqueRegions} active regions
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>Volume Discount Saved</span>
            <TrendingDown className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
            ${summary.totalSavingsUsd.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Total spend: ${summary.totalSpendUsd.toLocaleString('en-US')}
          </p>
        </div>
      </div>

      {/* Sponsored Trees Registry Table */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col justify-between gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-emerald-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Sponsored Trees Registry ({visibleTrees.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tree ID, species, region, employee..."
                aria-label="Search sponsored trees"
                className="w-64 rounded-lg border border-gray-300 bg-white py-1.5 pr-3 pl-8 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter trees by status"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            >
              <option value="all">All Statuses</option>
              <option value="verified">Verified</option>
              <option value="growing">Growing</option>
              <option value="planted">Planted</option>
            </select>
          </div>
        </div>

        <div className="max-h-96 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
            <thead className="sticky top-0 bg-gray-50 text-xs font-semibold text-gray-600 uppercase dark:bg-gray-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Tree ID</th>
                <th className="px-4 py-3">Species</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Assigned Employee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">CO₂ / yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {visibleTrees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No sponsored trees match your current filter.
                  </td>
                </tr>
              ) : (
                visibleTrees.slice(0, 100).map((tree) => (
                  <tr key={tree.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                      {tree.treeCode}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{tree.species}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{tree.region}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                      {tree.assignedEmployee || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE_STYLES[tree.status]}`}
                      >
                        {tree.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {tree.co2OffsetKgPerYear} kg
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {visibleTrees.length > 100 && (
          <div className="border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800">
            Showing first 100 of {visibleTrees.length} sponsored trees. Use search or filters to
            narrow results.
          </div>
        )}
      </div>
    </div>
  );
}
