import type { JSX } from 'react';
import { TreePine, Wind, Users, Globe } from 'lucide-react';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import { ImpactMapClient } from '@/components/organisms/ImpactMap/ImpactMapClient';
import type { ImpactData } from '@/app/api/impact/route';

async function getImpactData(): Promise<ImpactData> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}/api/impact`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Failed to fetch impact data');
  return res.json() as Promise<ImpactData>;
}

export default async function ImpactPage(): Promise<JSX.Element> {
  const { stats, regions } = await getImpactData();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Our Impact</h1>
        <p className="mt-2 text-muted-foreground">
          Real-time planting activity across FarmCredit-supported regions.
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ImpactStatCard
          label="Trees Planted"
          value={stats.treesPlanted.toLocaleString()}
          icon={<TreePine className="h-5 w-5 text-[#00B36B]" aria-hidden />}
        />
        <ImpactStatCard
          label="CO₂ Offset (tonnes)"
          value={stats.co2OffsetTonnes.toLocaleString()}
          icon={<Wind className="h-5 w-5 text-[#14B6E7]" aria-hidden />}
        />
        <ImpactStatCard
          label="Farmers Supported"
          value={stats.farmersSupported.toLocaleString()}
          icon={<Users className="h-5 w-5 text-[#3E1BDB]" aria-hidden />}
        />
        <ImpactStatCard
          label="Countries Reached"
          value={stats.countriesReached.toString()}
          icon={<Globe className="h-5 w-5 text-[#00C2FF]" aria-hidden />}
        />
      </div>

      {/* Map */}
      <div className="overflow-hidden rounded-xl border shadow-sm" style={{ height: '480px' }}>
        <ImpactMapClient regions={regions} />
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Circles show aggregated region-level activity. Exact GPS coordinates are never displayed.
      </p>
    </main>
  );
}
