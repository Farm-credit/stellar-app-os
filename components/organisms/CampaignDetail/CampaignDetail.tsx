'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Trees, BookOpen, Building2 } from 'lucide-react';
import {
  type Campaign,
  getMatchedAmount,
  getProgressPercent,
  getRemainingMatchBalance,
  getTimeRemaining,
  getTreesRemaining,
  getTotalFunding,
} from '@/lib/campaigns/data';

const POLL_INTERVAL_MS = 15000;

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export function CampaignDetail({ initialCampaign }: { initialCampaign: Campaign }) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Real-time progress: poll the campaign endpoint.
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/campaigns/${initialCampaign.slug}`, { cache: 'no-store' });
        if (res.ok) setCampaign((await res.json()) as Campaign);
      } catch {
        // keep last known data
      }
    };
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [initialCampaign.slug]);

  const percent = getProgressPercent(campaign);
  const remaining = now === null ? null : getTimeRemaining(campaign.endsAt, now);
  const remainingMatchBalance = getRemainingMatchBalance(campaign);
  const treesRemaining = getTreesRemaining(campaign);

  const units: Array<[string, number | undefined]> = [
    ['Days', remaining?.days],
    ['Hours', remaining?.hours],
    ['Minutes', remaining?.minutes],
    ['Seconds', remaining?.seconds],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{campaign.ecosystem}</Badge>
          {campaign.isEndangeredBiome && (
            <Badge variant="destructive">Endangered Biome</Badge>
          )}
          {campaign.quarter && (
            <Badge variant="outline">{campaign.quarter}</Badge>
          )}
        </div>
        <h1 className="text-3xl font-bold md:text-4xl">{campaign.title}</h1>
        <p className="text-muted-foreground">{campaign.location}</p>
        <p>{campaign.description}</p>
      </header>

      {/* ── Biome Education Content (issue #1706) ── */}
      {campaign.isEndangeredBiome && campaign.biomeEducation && campaign.biomeEducation.length > 0 && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" aria-hidden />
            <h2 className="text-lg font-semibold">About this Endangered Biome</h2>
          </div>
          <ul className="space-y-3">
            {campaign.biomeEducation.map((paragraph, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <p className="text-muted-foreground">{paragraph}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Urgent Funding Counter (issue #1706) ── */}
      {campaign.isEndangeredBiome && (
        <Card className="border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
            <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-400">
              Urgent Funding Needed
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {remaining?.ended ? '0' : (remaining?.days ?? '--')}
              </p>
              <p className="text-xs text-muted-foreground">Days left</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {remaining?.ended ? '0' : (remaining?.hours ?? '--')}
              </p>
              <p className="text-xs text-muted-foreground">Hours left</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {treesRemaining.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Trees remaining</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {campaign.treesPlanted.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Trees planted</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Trees className="h-4 w-4 text-emerald-600" aria-hidden />
            <span className="text-muted-foreground">
              Target:{' '}
              <strong className="text-foreground">{campaign.treeTarget.toLocaleString()}</strong>{' '}
              trees ·{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {Math.round((campaign.treesPlanted / campaign.treeTarget) * 100)}%
              </strong>{' '}
              achieved
            </span>
          </div>
        </Card>
      )}

      {/* ── Countdown timer ── */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold">
          {remaining?.ended ? 'Campaign ended' : 'Campaign ends in'}
        </h2>
        <div
          className="grid grid-cols-4 gap-3 text-center"
          role="timer"
          aria-label="Campaign countdown"
        >
          {units.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-2xl font-bold tabular-nums">
                {value === undefined ? '--' : String(value).padStart(2, '0')}
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Funding progress ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-3xl font-bold">{usd(getTotalFunding(campaign))}</div>
          <div className="text-muted-foreground">of {usd(campaign.goalUsd)} goal</div>
        </div>
        <Progress value={percent} className="h-4" />
        <p className="text-sm text-muted-foreground">{percent}% funded</p>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Donated by supporters</dt>
            <dd className="font-semibold">{usd(campaign.raisedUsd)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Matched by sponsors</dt>
            <dd className="font-semibold">{usd(getMatchedAmount(campaign))}</dd>
          </div>
        </dl>
      </Card>

      {/* ── Corporate match fund with remaining balance (issue #1706) ── */}
      <Card className="p-6">
        <div className="mb-3 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-stellar-blue" aria-hidden />
          <Badge>{campaign.matchMultiplier}x match</Badge>
          <h2 className="text-lg font-semibold">Corporate Matching Fund</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Every $1 you donate becomes ${campaign.matchMultiplier} for this ecosystem, up to{' '}
          {usd(campaign.matchCapUsd)} in matched funds.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sponsored by {campaign.sponsors.map((s) => s.name).join(', ')}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-muted p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total match fund</p>
            <p className="font-semibold">{usd(campaign.matchFund ?? campaign.matchCapUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Match consumed</p>
            <p className="font-semibold">{usd(campaign.matchUsed ?? getMatchedAmount(campaign))}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Match remaining
            </p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {usd(remainingMatchBalance)}
            </p>
          </div>
        </div>
        {remainingMatchBalance === 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠ Corporate match fund fully consumed. Donations still support this campaign.
          </p>
        )}
      </Card>

      {/* ── Ecosystem facts ── */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold">About the ecosystem</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <strong>Area:</strong> {campaign.areaHectares.toLocaleString()} hectares
          </li>
          <li>
            <strong>Endangered species:</strong> {campaign.endangeredSpecies.join(', ')}
          </li>
          <li>
            <strong>Threats:</strong> {campaign.threats.join(', ')}
          </li>
        </ul>
      </Card>
    </div>
  );
}
