'use client';
import { useEffect, useState } from 'react';
import type { CommunityOffsetPool } from '@/lib/types/community-offset-pool';
export default function OffsetPoolsPage() {
  const [pools, setPools] = useState<CommunityOffsetPool[]>([]);
  const [wallet, setWallet] = useState('');
  const [selected, setSelected] = useState<CommunityOffsetPool | null>(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const load = () =>
    fetch('/api/community-offset-pools?status=open')
      .then((res) => res.json())
      .then((data) => setPools(data.pools ?? []));
  useEffect(() => {
    void load();
  }, []);
  async function join() {
    if (!selected) return;
    const response = await fetch('/api/community-offset-pools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'join', poolId: selected.id, wallet, amount: Number(amount) }),
    });
    const data = await response.json();
    setMessage(data.error ?? 'Contribution recorded');
    if (!data.error) {
      setSelected(null);
      setWallet('');
      setAmount('');
      void load();
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-stellar-purple">
          Collective purchasing
        </p>
        <h1 className="mt-2 text-3xl font-bold">Community offset pools</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Join other buyers to reach bulk credit targets, reduce the per-person cost, and receive a
          proportional share of the purchased offsets.
        </p>
      </header>
      {message && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {pools.map((pool) => (
          <article key={pool.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="font-semibold">{pool.name}</h2>
                <p className="text-sm text-muted-foreground">{pool.creditProject}</p>
              </div>
              <span className="text-sm font-medium text-stellar-green">
                {pool.estimatedCredits} credits
              </span>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span>${pool.totalContributed.toFixed(2)} raised</span>
                <span>${pool.targetAmount.toFixed(2)} target</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-stellar-green"
                  style={{
                    width: `${Math.min(100, (pool.totalContributed / pool.targetAmount) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              ${pool.pricePerCredit.toFixed(2)} per credit · {pool.members.length} contributors
            </p>
            <button
              className="mt-5 rounded-lg bg-stellar-blue px-4 py-2 text-sm font-medium text-white"
              onClick={() => setSelected(pool)}
            >
              Join pool
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-6">
            <h2 className="text-xl font-semibold">Join {selected.name}</h2>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg border border-border px-3 py-2"
                placeholder="Stellar wallet address"
                value={wallet}
                onChange={(event) => setWallet(event.target.value)}
              />
              <input
                className="w-full rounded-lg border border-border px-3 py-2"
                type="number"
                min="0.01"
                placeholder="Contribution amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="rounded-lg border border-border px-4 py-2"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button className="rounded-lg bg-stellar-blue px-4 py-2 text-white" onClick={join}>
                Contribute
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
