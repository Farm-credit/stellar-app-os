'use client';

import { useState } from 'react';
import { Sprout, Calculator, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';

export function FarmerFinancingForm() {
  const [requestedAmount, setRequestedAmount] = useState<number>(5000);
  const [projectedCredits, setProjectedCredits] = useState<number>(250);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Connect to Stellar smart contract or backend API for financing
    alert(`Application submitted for $${requestedAmount} at 0% interest.`);
  };

  return (
    <div className="grid gap-8 md:grid-cols-3">
      {/* Application Form */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-stellar-blue">
            <Sprout className="size-5" aria-hidden />
            Land Preparation Financing
          </CardTitle>
          <CardDescription>
            Apply for a 0% interest credit line to cover initial land preparation costs. Repayments
            are automatically deducted from your first carbon credit sales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="financing-form" onSubmit={handleApply} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1">
                  Requested Amount (USD)
                </label>
                <input
                  type="number"
                  id="amount"
                  min="500"
                  max="50000"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                />
              </div>

              <div>
                <label htmlFor="credits" className="block text-sm font-medium text-foreground mb-1">
                  Estimated First-Year Carbon Credits (Tonnes)
                </label>
                <input
                  type="number"
                  id="credits"
                  min="10"
                  value={projectedCredits}
                  onChange={(e) => setProjectedCredits(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                />
              </div>

              <div>
                <label htmlFor="purpose" className="block text-sm font-medium text-foreground mb-1">
                  Primary Use of Funds
                </label>
                <select
                  id="purpose"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option>Soil treatment and clearing</option>
                  <option>Sapling purchasing</option>
                  <option>Irrigation setup</option>
                  <option>Labor costs</option>
                </select>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="border-t pt-6 flex justify-end">
          <Button type="submit" form="financing-form" stellar="primary" className="gap-2">
            Submit Application <ArrowRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* Terms Summary Sidebar */}
      <div className="space-y-6">
        <Card className="bg-stellar-blue/5 border-stellar-blue/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-stellar-navy">
              <Calculator className="size-5" /> Repayment Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <Text variant="muted" className="text-sm">
                Principal Amount
              </Text>
              <Text variant="body" className="font-semibold">
                ${requestedAmount.toLocaleString()}
              </Text>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <Text variant="muted" className="text-sm">
                Interest Rate
              </Text>
              <Badge variant="success">0%</Badge>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <Text variant="muted" className="text-sm">
                Total Repayment
              </Text>
              <Text variant="body" className="font-bold text-stellar-blue">
                ${requestedAmount.toLocaleString()}
              </Text>
            </div>
            <div className="pt-2 space-y-2">
              <Text variant="small" className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="size-4 text-stellar-green shrink-0 mt-0.5" />
                No upfront payments required.
              </Text>
              <Text variant="small" className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="size-4 text-stellar-green shrink-0 mt-0.5" />
                Deducted automatically from your first {Math.ceil(requestedAmount / 20)} credit
                sales (assuming $20/credit average).
              </Text>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-8 text-stellar-green" />
              <div>
                <p className="font-medium text-sm">Stellar Smart Contract</p>
                <p className="text-xs text-muted-foreground">
                  Funds are held in escrow and released securely on-chain.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
