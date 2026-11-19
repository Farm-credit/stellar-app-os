'use client';

/**
 * PooledSponsorshipPanel
 *
 * Lets multiple sponsors pool funds to co-fund a single large tree.
 * Shows live pool fill progress, per-sponsor shares, and the proportional
 * carbon-credit split each contributor will receive.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, TreePine, Leaf, Plus, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { showToast } from '@/lib/toast';
import type { PooledSponsorship, PoolStatus } from '@/lib/types/pooled-sponsorship';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: PoolStatus) {
  switch (status) {
    case 'open': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    case 'funded': return 'bg-stellar-green/10 text-stellar-green border-stellar-green/20';
    case 'planting': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    case 'completed': return 'bg-emerald-600/10 text-emerald-700 border-emerald-600/20';
    case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
  }
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Pool card ─────────────────────────────────────────────────────────────────

interface PoolCardProps {
  pool: PooledSponsorship;
  sponsorAddress: string;
  onJoin: (poolId: string, amount: number) => Promise<void>;
}

function PoolCard({ pool, sponsorAddress, onJoin }: PoolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState('');
  const [joining, setJoining] = useState(false);

  const maxContrib = pool.remainingUsdc;
  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxContrib;

  const handleJoin = async () => {
    if (!isValid) return;
    setJoining(true);
    try {
      await onJoin(pool.poolId, parsedAmount);
      setAmount('');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stellar-green/10">
            <TreePine className="h-5 w-5 text-stellar-green" aria-hidden />
          </div>
          <div>
            <Text className="font-bold text-sm">{pool.treeRef}</Text>
            <Text variant="muted" className="text-xs">{pool.species} · {pool.region}</Text>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColor(pool.status)}`}>
          {pool.status}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <Text variant="muted">{pool.totalFundedUsdc.toFixed(2)} USDC raised</Text>
          <Text variant="muted">Target: {pool.targetUsdc.toFixed(2)} USDC</Text>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-stellar-green transition-all duration-500"
            style={{ width: `${Math.min(100, pool.fillPercent)}%` }}
            role="progressbar"
            aria-valuenow={pool.fillPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pool.fillPercent}% funded`}
          />
        </div>
        <Text variant="muted" className="text-xs mt-1">
          {pool.fillPercent.toFixed(1)}% funded · {pool.sponsors.length} sponsor{pool.sponsors.length !== 1 ? 's' : ''}
        </Text>
      </div>

      {/* Expand sponsors */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <Users className="h-3.5 w-3.5" />
        Sponsors
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          {pool.sponsors.map((s) => (
            <div
              key={s.sponsorAddress}
              className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-stellar-blue/20 flex items-center justify-center text-[10px] font-bold text-stellar-blue">
                  {(s.sponsorName ?? s.sponsorAddress).slice(0, 2).toUpperCase()}
                </div>
                <span className="font-mono text-[11px]">
                  {s.sponsorName ?? shortAddress(s.sponsorAddress)}
                </span>
                {s.sponsorAddress === sponsorAddress && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">you</Badge>
                )}
              </div>
              <div className="text-right">
                <span className="font-semibold">{s.sharePercent.toFixed(2)}%</span>
                <span className="text-muted-foreground ml-2">{s.contributionUsdc.toFixed(2)} USDC</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credit split preview */}
      {pool.status !== 'open' && pool.sponsors.length > 0 && (
        <div className="rounded-lg bg-stellar-green/5 border border-stellar-green/20 p-3 space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Leaf className="h-3.5 w-3.5 text-stellar-green" aria-hidden />
            <Text variant="small" className="text-xs font-semibold text-stellar-green">Carbon Credit Split</Text>
          </div>
          {pool.sponsors.map((s) => (
            <div key={s.sponsorAddress} className="flex justify-between text-xs">
              <span className="font-mono text-muted-foreground">
                {s.sponsorName ?? shortAddress(s.sponsorAddress)}
              </span>
              <span className="font-semibold">
                {s.creditsAllocated.toFixed(2)} TREE ({s.sharePercent.toFixed(2)}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Join form */}
      {pool.status === 'open' && sponsorAddress && (
        <div className="border-t border-border pt-4 space-y-3">
          <Text variant="small" className="text-xs font-medium">
            Contribute to this pool (max {maxContrib.toFixed(2)} USDC)
          </Text>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.01"
              max={maxContrib}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="USDC amount"
              aria-label="Contribution amount in USDC"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stellar-blue/50"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleJoin}
              disabled={!isValid || joining}
              aria-label="Join pool"
            >
              {joining ? <LoadingSpinner size="xs" /> : <><Plus className="h-3.5 w-3.5 mr-1" />Join</>}
            </Button>
          </div>
          {amount && !isNaN(parsedAmount) && parsedAmount > maxContrib && (
            <Text variant="small" className="text-destructive text-xs" role="alert">
              Maximum contribution is {maxContrib.toFixed(2)} USDC
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create pool form ──────────────────────────────────────────────────────────

interface CreatePoolFormProps {
  onCreate: (fields: {
    treeRef: string;
    species: string;
    region: string;
    targetUsdc: number;
    contributionUsdc: number;
    sponsorName?: string;
  }) => Promise<void>;
}

const SPECIES_OPTIONS = ['Teak', 'Moringa', 'Eucalyptus', 'Mangrove', 'Acacia', 'Neem'];

function CreatePoolForm({ onCreate }: CreatePoolFormProps) {
  const [treeRef, setTreeRef] = useState('');
  const [species, setSpecies] = useState('');
  const [region, setRegion] = useState('');
  const [targetUsdc, setTargetUsdc] = useState('');
  const [contribution, setContribution] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [creating, setCreating] = useState(false);

  const parsedTarget = parseFloat(targetUsdc);
  const parsedContrib = contribution === '' ? 0 : parseFloat(contribution);
  const valid =
    treeRef.trim() !== '' &&
    species !== '' &&
    region.trim() !== '' &&
    !isNaN(parsedTarget) &&
    parsedTarget > 0 &&
    !isNaN(parsedContrib) &&
    parsedContrib >= 0 &&
    parsedContrib <= parsedTarget;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setCreating(true);
    try {
      await onCreate({
        treeRef: treeRef.trim(),
        species,
        region: region.trim(),
        targetUsdc: parsedTarget,
        contributionUsdc: parsedContrib,
        sponsorName: sponsorName.trim() || undefined,
      });
      setTreeRef(''); setSpecies(''); setRegion('');
      setTargetUsdc(''); setContribution(''); setSponsorName('');
    } finally {
      setCreating(false);
    }
  };

  const fieldCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stellar-blue/50';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-dashed border-stellar-blue/30 bg-stellar-blue/5 p-5">
      <Text variant="small" className="font-semibold text-stellar-blue">Create a new pool</Text>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="treeRef" className="text-xs font-medium block mb-1">Tree Ref / ID</label>
          <input id="treeRef" className={fieldCls} value={treeRef} onChange={(e) => setTreeRef(e.target.value)} placeholder="e.g. TREE-0042" required />
        </div>
        <div>
          <label htmlFor="species" className="text-xs font-medium block mb-1">Species</label>
          <select id="species" className={fieldCls} value={species} onChange={(e) => setSpecies(e.target.value)} required>
            <option value="">Select species</option>
            {SPECIES_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="region" className="text-xs font-medium block mb-1">Region</label>
          <input id="region" className={fieldCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Kano, Nigeria" required />
        </div>
        <div>
          <label htmlFor="targetUsdc" className="text-xs font-medium block mb-1">Funding target (USDC)</label>
          <input id="targetUsdc" type="number" min="1" step="0.01" className={fieldCls} value={targetUsdc} onChange={(e) => setTargetUsdc(e.target.value)} placeholder="e.g. 50" required />
        </div>
        <div>
          <label htmlFor="contribution" className="text-xs font-medium block mb-1">Your initial contribution (USDC)</label>
          <input id="contribution" type="number" min="0" step="0.01" className={fieldCls} value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label htmlFor="sponsorName" className="text-xs font-medium block mb-1">Display name (optional)</label>
          <input id="sponsorName" className={fieldCls} value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Your name or org" />
        </div>
      </div>

      <Button type="submit" size="sm" disabled={!valid || creating} className="w-full">
        {creating
          ? <span className="flex items-center gap-2"><LoadingSpinner size="xs" />Creating…</span>
          : <><Plus className="h-3.5 w-3.5 mr-1" />Create Pool</>}
      </Button>
    </form>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface PooledSponsorshipPanelProps {
  /** Connected sponsor's Stellar public key */
  sponsorAddress?: string;
}

export function PooledSponsorshipPanel({ sponsorAddress = '' }: PooledSponsorshipPanelProps) {
  const [pools, setPools] = useState<PooledSponsorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch('/api/pools?status=all');
      if (!res.ok) throw new Error('Failed to load pools');
      const data = (await res.json()) as { pools: PooledSponsorship[] };
      setPools(data.pools);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load pools';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPools(); }, [fetchPools]);

  const handleCreate = useCallback(async (fields: Parameters<CreatePoolFormProps['onCreate']>[0]) => {
    const res = await fetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, sponsorAddress }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error: string };
      throw new Error(err.error ?? 'Failed to create pool');
    }
    showToast('Pool created!', 'success');
    setShowCreate(false);
    await fetchPools();
  }, [sponsorAddress, fetchPools]);

  const handleJoin = useCallback(async (poolId: string, amount: number) => {
    if (!sponsorAddress) {
      showToast('Connect your wallet to join a pool', 'error');
      return;
    }
    const res = await fetch(`/api/pools/${poolId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorAddress, contributionUsdc: amount }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error: string };
      throw new Error(err.error ?? 'Failed to join pool');
    }
    showToast('Contribution added!', 'success');
    await fetchPools();
  }, [sponsorAddress, fetchPools]);

  const openPools = pools.filter((p) => p.status === 'open');
  const closedPools = pools.filter((p) => p.status !== 'open');

  return (
    <section aria-labelledby="pooled-sponsorship-heading" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stellar-green/10">
            <Users className="h-5 w-5 text-stellar-green" aria-hidden />
          </div>
          <div>
            <Text id="pooled-sponsorship-heading" variant="h2" className="text-xl font-bold">
              Pooled Sponsorship
            </Text>
            <Text variant="muted" className="text-xs">
              Co-fund trees with other sponsors — credits split proportionally
            </Text>
          </div>
        </div>
        {sponsorAddress && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Pool
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && sponsorAddress && (
        <CreatePoolForm onCreate={handleCreate} />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : pools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <TreePine className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden />
          <Text variant="muted" className="text-sm">No pools yet. Be the first to create one.</Text>
        </div>
      ) : (
        <div className="space-y-6">
          {openPools.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Text variant="small" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Open Pools
                </Text>
                <Badge variant="outline" className="text-[10px]">{openPools.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {openPools.map((pool) => (
                  <PoolCard key={pool.poolId} pool={pool} sponsorAddress={sponsorAddress} onJoin={handleJoin} />
                ))}
              </div>
            </div>
          )}

          {closedPools.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-stellar-green" aria-hidden />
                <Text variant="small" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Funded / Completed
                </Text>
                <Badge variant="outline" className="text-[10px]">{closedPools.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {closedPools.map((pool) => (
                  <PoolCard key={pool.poolId} pool={pool} sponsorAddress={sponsorAddress} onJoin={handleJoin} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
