'use client';

import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Counter } from '@/components/atoms/Counter';
import { LandingHero } from '@/components/organisms/LandingHero';
import SocialShareButtons from '@/components/SocialShareButtons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

export default function HomePage() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <section className="flex flex-col items-center gap-4 text-center max-w-4xl">
        <Badge variant="default">Powered by Stellar</Badge>
        <Text variant="h1">FarmCredit</Text>
        <Text variant="muted" className="max-w-md">
          Decentralized agricultural credit platform built on the Stellar network.
        </Text>
        <Button asChild variant="default" size="sm">
          <Link href="/api-docs">API Docs</Link>
        </Button>
      </section>

      <section className="w-full max-w-7xl">
        <LandingHero />
      </section>

      <section data-tour-id="stats-grid" className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl">
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={1234567} prefix="$" className="text-center" />
          <Text variant="muted" className="text-sm">
            Total Credit Issued
          </Text>
        </div>
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={5420} className="text-center" />
          <Text variant="muted" className="text-sm">
            Active Farmers
          </Text>
        </div>
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={98} suffix="%" className="text-center" />
          <Text variant="muted" className="text-sm">
            Repayment Rate
          </Text>
        </div>
      </section>

      <section className="w-full max-w-md">
        <Card data-tour-id="get-started-card">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>Connect your wallet to start planting trees and earning credits.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild variant="default" size="lg" className="w-full">
              <Link href="/farmer/verification">Farmer Verification</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/dashboard/farmer">Farmer Dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/credits/purchase">Purchase Carbon Credits</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/blog">Read Blog</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/api-docs">Explore API Documentation</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Share FarmCredit</CardTitle>
            <CardDescription>Help spread the word about sustainable agriculture.</CardDescription>
          </CardHeader>
          <CardContent>
            <SocialShareButtons
              title="Check out FarmCredit!"
              description="A decentralized agricultural credit platform built on Stellar"
              impact="Supporting sustainable farming and equal access to credit"
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
