'use client';

import React, { useState } from 'react';
import { Award, LayoutDashboard, PackageCheck } from 'lucide-react';
import type { CorporateOrder } from '@/lib/corporate-sponsorship/packages';
import { BulkCertificateDownloader } from './BulkCertificateDownloader';
import { BulkOrderFlow } from './BulkOrderFlow';
import { CorporateImpactDashboard } from './CorporateImpactDashboard';

type TabKey = 'order' | 'dashboard' | 'certificates';

interface CorporateSponsorshipPortalProps {
  initialOrders: CorporateOrder[];
}

export function CorporateSponsorshipPortal({ initialOrders }: CorporateSponsorshipPortalProps) {
  const [orders, setOrders] = useState<CorporateOrder[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<TabKey>('order');

  function handleOrderCreated(newOrder: CorporateOrder) {
    setOrders((prev) => [newOrder, ...prev]);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
          Corporate ESG &amp; Reforestation
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Corporate Bulk Tree Sponsorship
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          Sponsor 10, 50, 100, or 500 trees with volume discounts, track every planted tree in your
          branded corporate impact dashboard, and download co-branded PDF certificates for your
          employees.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div
        className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800"
        role="tablist"
        aria-label="Corporate sponsorship sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'order'}
          onClick={() => setActiveTab('order')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'order'
              ? 'bg-emerald-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          <PackageCheck className="h-4 w-4" />
          Bulk Packages
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'dashboard'
              ? 'bg-emerald-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Impact Dashboard ({orders.reduce((sum, o) => sum + o.trees.length, 0)} trees)
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'certificates'}
          onClick={() => setActiveTab('certificates')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'certificates'
              ? 'bg-emerald-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          <Award className="h-4 w-4" />
          Co-Branded Certificates
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'order' && <BulkOrderFlow onOrderCreated={handleOrderCreated} />}
        {activeTab === 'dashboard' && <CorporateImpactDashboard orders={orders} />}
        {activeTab === 'certificates' && <BulkCertificateDownloader orders={orders} />}
      </div>
    </div>
  );
}
