import type { JSX } from 'react';
import Link from 'next/link';
import { ImpactAnalyticsDashboard } from '@/components/organisms/AnalyticsDashboard/ImpactAnalyticsDashboard';

export default function ImpactPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="container mx-auto px-4 pt-8">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
            3D project impact model
          </h2>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Explore forest growth over time, soil sequestration depth, and emissions
            reduction rate in an interactive 3D view.
          </p>
          <Link
            href="/impact/3d"
            className="mt-3 inline-flex text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-900 dark:text-emerald-300"
          >
            Open 3D visualization
          </Link>
        </div>
      </div>
      <ImpactAnalyticsDashboard />
    </div>
  );
}
