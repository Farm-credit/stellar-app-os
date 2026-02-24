"use client"

import Link from "next/link";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Counter } from "@/components/atoms/Counter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/molecules/Card";
import { OnboardingTour } from "@/components/organisms/OnboardingTour/OnboardingTour";
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Counter } from '@/components/atoms/Counter';
import { OnboardingTour } from '@/components/organisms/OnboardingTour';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/molecules/Card';

import { useToast } from "@/components/ui/toast/hooks";
import { TransactionHistoryModal } from "../components/ui/TransactionHistoryModal";
import { useState } from "react";


export default function Home() {

  const [showTx, setShowTx] = useState(false);


 const { addToast } = useToast();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div data-tour-id="hero-section" className="flex flex-col items-center gap-4 text-center">
        <Badge variant="default">Powered by Stellar</Badge>
        <Text variant="h1">FarmCredit</Text>
        <Text variant="muted" className="max-w-md">
          Decentralized agricultural credit platform built on the Stellar network.
        </Text>
      </div>

<CardContent className="flex flex-col gap-3">
<Button
      onClick={() =>
        addToast({ message: "Profile saved!", variant: "success" })
      }
      variant="default" size="lg" className="w-full"
    >
      Show Toast
    </Button>
    </CardContent>

      <CardContent className="flex flex-col gap-3">
  <Button
        onClick={() => setShowTx(true)}
        variant="default" size="lg" className="w-full"
      >
        Transactions
      </Button>
      </CardContent>

      <TransactionHistoryModal
        open={showTx}
        onClose={() => setShowTx(false)}
      />

      {/* Platform Stats */}
      <div
        data-tour-id="stats-grid"
        className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl"
      >
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
      </div>

      <Card data-tour-id="get-started-card" className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Get Started</CardTitle>
          <CardDescription>Connect your wallet to access farm credit services.</CardDescription>
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
            <Link href="/blog">Read our Blog</Link>
          </Button>
          <Button
            data-tour-id="purchase-credits-button"
            asChild
            variant="outline"
            size="lg"
            className="w-full"
          >
            <Link href="/credits/purchase">Purchase Carbon Credits</Link>
          </Button>
          <Button asChild variant="default" size="lg" className="w-full bg-green-500 hover:bg-green-600">
            <Link href="/donate">Make a Donation</Link>
          </Button>
        </CardContent>
      </Card>
      <OnboardingTour />
    </div>
  );
}
