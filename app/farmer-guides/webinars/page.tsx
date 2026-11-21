import type { Metadata } from 'next';
import { WebinarSeries } from '@/components/organisms/WebinarSeries';

export const metadata: Metadata = {
  title: 'Farmer training webinars',
  description:
    'Monthly farmer training webinars on carbon accounting, soil testing, sustainable practices, market trends and compliance requirements.',
};

export default function WebinarSeriesPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <WebinarSeries />

      <div className="mx-auto mt-12 max-w-6xl">
        <a
          href="/farmer-guides"
          className="text-sm font-semibold text-stellar-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
        >
          ← Back to the farmer guide library
        </a>
      </div>
    </main>
  );
}
