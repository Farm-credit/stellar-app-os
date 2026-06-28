'use client';

import { type JSX, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Counter } from '@/components/atoms/Counter';
import { OnboardingTour } from '@/components/organisms/OnboardingTour/OnboardingTour';
import SocialShareButtons from '@/components/SocialShareButtons';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/molecules/Card';
import { useToast } from '@/hooks/useToast';
import { TransactionHistoryModal } from '@/components/ui/TransactionHistoryModal';
import { useAppTranslation } from '@/hooks/useTranslation';
import { LandingHero } from '@/components/organisms/LandingHero';

export default function Home(): JSX.Element {
  const [showTx, setShowTx] = useState(false);
  const { addToast } = useToast();
  const { t } = useAppTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <header className="flex w-full max-w-6xl items-center justify-between">
        <Text variant="h4" className="font-semibold">
          FarmCredit
        </Text>
        <Button asChild variant="default" size="sm">
          <Link href="/api-docs">API Docs</Link>
        </Button>
      </header>

      <div data-tour-id="hero-section">
        <LandingHero />
      </div>

      <CardContent className="flex flex-col gap-3">
        <Button
          onClick={() => addToast(t('home.profileSaved'), 'success')}
          variant="default"
          size="lg"
          className="w-full"
        >
          {t('home.showToast')}
        </Button>
      </CardContent>

      <CardContent className="flex flex-col gap-3">
        <Button onClick={() => setShowTx(true)} variant="default" size="lg" className="w-full">
          {t('home.transactions')}
        </Button>
      </CardContent>

      <TransactionHistoryModal open={showTx} onClose={() => setShowTx(false)} />

      {/* Platform Stats */}
      <div
        data-tour-id="stats-grid"
        className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl"
      >
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={1234567} prefix="$" className="text-center" />
          <Text variant="muted" className="text-sm">
            {t('home.totalCreditIssued')}
          </Text>
        </div>
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={5420} className="text-center" />
          <Text variant="muted" className="text-sm">
            {t('home.activeFarmers')}
          </Text>
        </div>
        <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-muted/50">
          <Counter end={98} suffix="%" className="text-center" />
          <Text variant="muted" className="text-sm">
            {t('home.repaymentRate')}
          </Text>
        </div>
      </div>

      <Card data-tour-id="get-started-card" className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('home.getStarted')}</CardTitle>
          <CardDescription>{t('home.getStartedDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            data-tour-id="connect-wallet-button"
            variant="default"
            size="lg"
            className="w-full"
          >
            Connect Wallet
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/blog">{t('home.readBlog')}</Link>
          </Button>
          <Button
            data-tour-id="purchase-credits-button"
            asChild
            variant="outline"
            size="lg"
            className="w-full"
          >
            <Link href="/credits/purchase">{t('home.purchaseCarbon')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/api-docs">Explore API Documentation</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/leaderboard">View Leaderboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/planter/register">Register as Planter</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md">
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

      <OnboardingTour />
    </div>
  );
}
