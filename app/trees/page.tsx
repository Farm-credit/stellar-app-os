import type { Metadata } from 'next';
import { TreeBrowseCatalog } from '@/components/trees/TreeBrowseCatalog';

export const metadata: Metadata = {
  title: 'Browse Trees for Sponsorship',
  description:
    'Browse and filter available trees for sponsorship by species, native region, growth rate, and CO2 sequestration rate.',
};

export default function TreesBrowsePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">
            Tree Sponsorship Catalog
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Browse available trees for sponsorship
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            Filter native and climate-resilient species by region, growth rate, and annual CO₂
            sequestration rate to find the right trees for your impact goals.
          </p>
        </header>

        <TreeBrowseCatalog />
      </div>
    </main>
  );
}
