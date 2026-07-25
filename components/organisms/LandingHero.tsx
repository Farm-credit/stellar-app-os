'use client';

import Link from 'next/link';

import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Counter } from '@/components/atoms/Counter';
import { Text } from '@/components/atoms/Text';

export function LandingHero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center py-16">
      <Badge variant="default">🌱 Harvesta</Badge>

      <Text variant="h1">
        Plant Trees.
        <br />
        Track Impact.
        <br />
        Offset Carbon.
      </Text>

      <Text variant="muted" className="max-w-2xl">
        Sponsor verified tree planting projects and help restore ecosystems while tracking your
        carbon impact.
      </Text>

      <Counter end={1250000} suffix="+" />

      <Text variant="muted">Trees Planted Globally</Text>

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/donate">Sponsor a Tree</Link>
        </Button>

        <Button variant="outline" asChild>
          <Link href="/planter/register">Register as Planter</Link>
        </Button>
      </div>
    </section>
  );
}
