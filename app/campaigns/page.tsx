import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  CAMPAIGNS,
  getProgressPercent,
  getRemainingMatchBalance,
  getTreesRemaining,
} from '@/lib/campaigns/data';

export const metadata: Metadata = { title: 'Ecosystem Campaigns' };

function getDaysRemaining(deadline: string | Date): number {
  const end = new Date(deadline).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

export default function CampaignsPage() {
  const endangeredCampaigns = CAMPAIGNS.filter((c) => c.isEndangeredBiome ?? false);
  const otherCampaigns = CAMPAIGNS.filter((c) => !(c.isEndangeredBiome ?? false));

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Ecosystem Campaigns</h1>
      <p className="text-muted-foreground">
        Time-limited campaigns to save endangered forests, boosted by corporate matching.
      </p>

      {endangeredCampaigns.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold">Endangered Biome Campaigns</h2>
            <Badge variant="destructive">Quarterly</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Critically threatened ecosystems with corporate matching pledges.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {endangeredCampaigns.map((c) => {
              const daysRemaining = getDaysRemaining(c.deadline);
              const treesRemaining = getTreesRemaining(c);
              const remainingMatch = getRemainingMatchBalance(c);
              return (
                <Link key={c.slug} href={`/campaigns/${c.slug}`}>
                  <Card className="h-full space-y-2 p-6 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{c.ecosystem}</Badge>
                      <Badge variant="destructive">Endangered</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{c.quarter}</Badge>
                      <Badge>{c.matchMultiplier}x match</Badge>
                    </div>
                    <h3 className="text-xl font-semibold">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.location}</p>
                    <Progress value={getProgressPercent(c)} />
                    <p className="text-sm">{getProgressPercent(c)}% funded</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Match remaining</span>
                      <span className="font-medium">${remainingMatch.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{daysRemaining} days left</span>
                      <span className="font-medium">
                        {treesRemaining.toLocaleString()} trees to go
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {otherCampaigns.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">All Campaigns</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {otherCampaigns.map((c) => (
              <Link key={c.slug} href={`/campaigns/${c.slug}`}>
                <Card className="h-full p-6 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{c.ecosystem}</Badge>
                    <Badge>{c.matchMultiplier}x match</Badge>
                  </div>
                  <h2 className="text-xl font-semibold">{c.title}</h2>
                  <p className="text-sm text-muted-foreground">{c.location}</p>
                  <Progress value={getProgressPercent(c)} />
                  <p className="text-sm">{getProgressPercent(c)}% funded</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}