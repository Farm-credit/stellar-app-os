'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  type Campaign,
  getMatchedAmount,
  getProgressPercent,
  getTimeRemaining,
  getTotalFunding,
} from '@/lib/campaigns/data';

const POLL_INTERVAL_MS = 15000;

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

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

  const units: Array<[string, number | undefined]> = [
    ['Days', remaining?.days],
    ['Hours', remaining?.hours],
    ['Minutes', remaining?.minutes],
    ['Seconds', remaining?.seconds],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <Badge variant="secondary">{campaign.ecosystem}</Badge>
        <h1 className="text-3xl font-bold md:text-4xl">{campaign.title}</h1>
        <p className="text-muted-foreground">{campaign.location}</p>
        <p>{campaign.description}</p>
      </header>

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

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <Badge>{campaign.matchMultiplier}x match</Badge>
          <h2 className="text-lg font-semibold">Corporate matching</h2>
        </div>
        <p>
          Every $1 you donate becomes ${campaign.matchMultiplier} for this ecosystem, up to{' '}
          {usd(campaign.matchCapUsd)} in matched funds.
        </p>
        <p className="text-sm text-muted-foreground">
          Sponsored by {campaign.sponsors.map((s) => s.name).join(', ')}
        </p>
      </Card>

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
