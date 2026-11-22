import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { PLANTING_PARTNERS } from '@/lib/partners/data';

export const metadata: Metadata = {
  title: 'Planting Partners | Stellar Farm Credit',
  description: 'Meet the certified organisations planting the trees you sponsor.',
};

export default function PartnersDirectoryPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold">Planting partners</h1>
      <p className="mb-8 mt-2 max-w-2xl text-muted-foreground">
        Every tree is planted by a partner organisation. Review their certifications and track
        record, then choose who you want to fund.
      </p>
      <ul className="grid gap-5 sm:grid-cols-2">
        {PLANTING_PARTNERS.map((p) => (
          <li key={p.slug} className="rounded-2xl border p-5">
            <h2 className="text-lg font-bold">
              <Link href={`/partners/${p.slug}`} className="hover:underline">
                {p.name}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">{p.region}</p>
            <p className="mt-2 text-sm font-semibold">
              {p.treesPlantedViaPlatform.toLocaleString()} trees planted via platform
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {p.certifications.map((c) => (
                <li
                  key={c.body}
                  className="inline-flex items-center gap-1 rounded-full bg-stellar-green/10 px-2 py-0.5 text-xs font-semibold text-stellar-green"
                >
                  <BadgeCheck className="h-3 w-3" aria-hidden /> {c.body}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
