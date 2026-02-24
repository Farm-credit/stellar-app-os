'use client';

import type { ReactNode } from 'react';
import { AnalyticsWidget } from '@/components/organisms/AnalyticsWidget/AnalyticsWidget';

export default function AdminAnalyticsPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <AnalyticsWidget
        title="Platform Analytics"
        description="Real-time platform metrics including users, transactions, revenue, and project status."
      />
    </div>
  );
}
