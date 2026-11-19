import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CAMPAIGNS, getProgressPercent } from '@/lib/campaigns/data';

export const metadata: Metadata = { title: 'Ecosystem Campaigns' };

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Ecosystem Campaigns</h1>
      <p className="text-muted-foreground">
        Time-limited campaigns to save endangered forests, boosted by corporate matching.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {CAMPAIGNS.map((c) => (
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
    </div>
  );
}
