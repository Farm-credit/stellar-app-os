'use client';
import { useEffect, useState } from 'react';
import type { FarmerCertification, FarmerCredential } from '@/lib/types/farmer-certification';
const labels: Record<FarmerCertification, string> = {
  organic: 'Organic',
  regenerative: 'Regenerative',
  'fair-trade': 'Fair Trade',
  'b-corp': 'B-Corp',
};
export default function MarketplaceCertificationsPage() {
  const [selected, setSelected] = useState<FarmerCertification[]>([]);
  const [credentials, setCredentials] = useState<FarmerCredential[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/farmer-certifications?certifications=${selected.join(',')}`)
      .then((response) => response.json())
      .then((data) => setCredentials(data.credentials ?? []))
      .finally(() => setLoading(false));
  }, [selected]);
  const toggle = (value: FarmerCertification) =>
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-stellar-blue">
          Buyer trust signals
        </p>
        <h1 className="mt-2 text-3xl font-bold">Farmer certifications</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Filter verified farmers by the credentials your procurement policy requires.
        </p>
      </header>
      <section className="mb-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Desired certifications</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(labels) as FarmerCertification[]).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggle(value)}
              />
              {labels[value]}
            </label>
          ))}
        </div>
      </section>
      {loading ? (
        <p className="text-muted-foreground">Loading credentials…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {credentials.map((credential) => (
            <article key={credential.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{credential.farmerName}</h2>
                  <p className="text-sm text-muted-foreground">{credential.region}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                  Verified
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {credential.certifications.map((value) => (
                  <span
                    key={value}
                    className="rounded-full bg-stellar-blue/10 px-2.5 py-1 text-xs font-medium text-stellar-blue"
                  >
                    {labels[value]}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Verified by {credential.verifier} · Valid through{' '}
                {credential.expiresAt ?? 'ongoing'}
              </p>
            </article>
          ))}
          {credentials.length === 0 && (
            <p className="text-muted-foreground">No farmers match every selected certification.</p>
          )}
        </div>
      )}
    </main>
  );
}
