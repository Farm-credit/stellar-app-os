'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Building2, Trees } from 'lucide-react';
import { type Campaign, getProgressPercent, getRemainingMatchBalance } from '@/lib/campaigns/data';

const POLL_INTERVAL_MS = 15000;

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

function getTimeRemaining(deadline: string, now: number) {
  const end = new Date(deadline).getTime();
  const diff = Number.isNaN(end) ? 0 : Math.max(0, end - now);
  const day = 1000 * 60 * 60 * 24;
  const hour = 1000 * 60 * 60;
  const minute = 1000 * 60;

  return {
    ended: diff === 0,
    days: Math.floor(diff / day),
    hours: Math.floor((diff % day) / hour),
    minutes: Math.floor((diff % hour) / minute),
    seconds: Math.floor((diff % minute) / 1000),
  };
}

export function CampaignDetail({ initialCampaign }: { initialCampaign: Campaign }) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/campaigns/${initialCampaign.slug}`, { cache: 'no-store' });
        if (res.ok) setCampaign((await res.json()) as Campaign);
      } catch {
        return;
      }
    };
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [initialCampaign.slug]);

  const progress = getProgressPercent(campaign);
  const planted = Math.max(0, campaign.treesTarget - campaign.treesRemaining);
  const matchTarget = campaign.corporateMatches.reduce((sum, match) => sum + match.matchTarget, 0);
  const remainingMatch = getRemainingMatchBalance(campaign);
  const usedMatch = Math.max(0, matchTarget - remainingMatch);
  const remaining = now === null ? null : getTimeRemaining(campaign.deadline, now);
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
          {campaign.isEndangeredBiome && <Badge variant="destructive">Endangered Biome</Badge>}
          <Badge variant="outline">{campaign.quarter}</Badge>
        </div>
        <h1 className="text-3xl font-bold md:text-4xl">{campaign.title}</h1>
        <p className="text-muted-foreground">{campaign.location}</p>
        {campaign.coBrandedTitle && <p className="text-lg">{campaign.coBrandedTitle}</p>}
      </header>

      {campaign.isEndangeredBiome && (
        <Card className="border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {remaining?.ended ? 0 : (remaining?.days ?? '--')}
              </p>
              <p className="text-xs text-muted-foreground">Days left</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {campaign.treesRemaining.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Trees remaining</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {planted.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Trees planted</p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 text-center dark:bg-black/20">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {progress}%
              </p>
              <p className="text-xs text-muted-foreground">Progress</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Trees className="h-4 w-4 text-emerald-600" aria-hidden />
            Target:{' '}
            <strong className="text-foreground">
              {campaign.treesTarget.toLocaleString()}
            </strong>{' '}
            trees
          </p>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold">
          {remaining?.ended ? 'Campaign ended' : 'Campaign ends in'}
        </h2>
        <div
          className="mt-4 grid grid-cols-4 gap-3 text-center"
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

      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-3xl font-bold">{planted.toLocaleString()} trees</div>
          <div className="text-muted-foreground">
            of {campaign.treesTarget.toLocaleString()} target
          </div>
        </div>
        <Progress value={progress} className="mt-4 h-4" />
        <p className="mt-2 text-sm text-muted-foreground">{progress}% planted</p>
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-stellar-blue" aria-hidden />
          <h2 className="text-lg font-semibold">Corporate Matching Fund</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {usd(usedMatch)} matched of {usd(matchTarget)} available, with {usd(remainingMatch)}{' '}
          remaining.
        </p>
        <ul className="mt-4 space-y-3">
          {campaign.corporateMatches.map((match) => (
            <li key={match.corporateName} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{match.corporateName}</p>
                <Badge variant="outline">{match.multiplier}x match</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {usd(match.matchTarget)} target · {usd(match.matchRemaining)} remaining
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {campaign.educationContent.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">About this biome</h2>
          <div className="mt-4 space-y-4">
            {campaign.educationContent.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {campaign.charityName && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Partner</p>
            <p className="mt-1 text-sm font-semibold">{campaign.charityName}</p>
          </div>
          <Link
            href={`/api/charity/impact-report?campaign=${encodeURIComponent(campaign.slug)}`}
            className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Download impact report
          </Link>
        </Card>
      )}
    </div>
  );
}
