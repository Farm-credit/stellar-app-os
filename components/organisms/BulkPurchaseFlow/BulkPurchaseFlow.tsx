'use client';

import React, { useState } from 'react';
import { 
  Trees, 
  ChevronRight, 
  Check, 
  Info, 
  AlertCircle,
  CreditCard,
  Wallet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';

export function BulkPurchaseFlow() {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1000);
  const [paymentMethod, setPaymentMethod] = useState<'stellar' | 'wire' | null>(null);

  const tiers = [
    { amount: 1000, label: 'Bronze Partner', discount: '5%' },
    { amount: 5000, label: 'Silver Guardian', discount: '12%' },
    { amount: 10000, label: 'Gold Restorer', discount: '20%' },
  ];

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors",
              step >= s ? "bg-stellar-blue text-white" : "bg-white/10 text-white/40"
            )}>
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={cn("h-0.5 w-12 transition-colors", step > s ? "bg-stellar-blue" : "bg-white/10")} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="border-white/5 bg-stellar-navy/40">
          <CardHeader>
            <CardTitle>Select Quantity</CardTitle>
            <CardDescription>Corporate accounts start at 1,000 trees for bulk pricing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <button
                  key={tier.amount}
                  onClick={() => setQuantity(tier.amount)}
                  className={cn(
                    "p-6 rounded-xl border transition-all text-left group",
                    quantity === tier.amount 
                      ? "border-stellar-blue bg-stellar-blue/10 ring-2 ring-stellar-blue/20" 
                      : "border-white/5 bg-white/5 hover:border-white/20"
                  )}
                >
                  <Text className="text-xs font-bold uppercase tracking-widest text-stellar-blue group-hover:text-stellar-cyan transition-colors">
                    {tier.label}
                  </Text>
                  <Text className="text-2xl font-bold mt-1 text-white">{tier.amount.toLocaleString()} Trees</Text>
                  <Text className="text-sm text-white/50 mt-2">{tier.discount} Volume Discount</Text>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium text-white/80">Custom Quantity</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1000"
                  max="50000"
                  step="500"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-stellar-blue"
                />
                <div className="w-24 p-2 rounded-lg bg-black/20 border border-white/5 text-center font-bold text-white">
                  {quantity.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-stellar-blue/5 border border-stellar-blue/20 p-4 flex gap-3">
              <Info className="h-5 w-5 text-stellar-blue flex-shrink-0" />
              <Text variant="small" className="text-white/70">
                Bulk purchases include a dedicated impact manager and quarterly ESG documentation.
              </Text>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleNext} className="w-full bg-stellar-blue hover:bg-stellar-blue/90 font-bold">
              Continue to Payment
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-white/5 bg-stellar-navy/40">
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Select how you would like to settle the transaction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              onClick={() => setPaymentMethod('stellar')}
              className={cn(
                "w-full p-6 rounded-xl border transition-all text-left flex items-center gap-4",
                paymentMethod === 'stellar' ? "border-stellar-blue bg-stellar-blue/10" : "border-white/5 bg-white/5"
              )}
            >
              <div className="p-3 rounded-full bg-stellar-blue/20">
                <Wallet className="h-6 w-6 text-stellar-blue" />
              </div>
              <div className="flex-1">
                <Text className="font-bold text-white">Stellar Network (USDC)</Text>
                <Text className="text-sm text-white/50">Instant settlement via Freighter or Albedo</Text>
              </div>
              {paymentMethod === 'stellar' && <Check className="h-5 w-5 text-stellar-blue" />}
            </button>

            <button
              onClick={() => setPaymentMethod('wire')}
              className={cn(
                "w-full p-6 rounded-xl border transition-all text-left flex items-center gap-4",
                paymentMethod === 'wire' ? "border-stellar-purple bg-stellar-purple/10" : "border-white/5 bg-white/5"
              )}
            >
              <div className="p-3 rounded-full bg-stellar-purple/20">
                <CreditCard className="h-6 w-6 text-stellar-purple" />
              </div>
              <div className="flex-1">
                <Text className="font-bold text-white">Corporate Wire Transfer</Text>
                <Text className="text-sm text-white/50">Settlement in 1-3 business days (USD/EUR/GBP)</Text>
              </div>
              {paymentMethod === 'wire' && <Check className="h-5 w-5 text-stellar-purple" />}
            </button>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button variant="outline" onClick={handleBack} className="flex-1 border-white/10">Back</Button>
            <Button onClick={handleNext} disabled={!paymentMethod} className="flex-[2] bg-stellar-blue hover:bg-stellar-blue/90 font-bold">
              Review Order
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-white/5 bg-stellar-navy/40 overflow-hidden">
          <div className="h-2 bg-stellar-green w-full" />
          <CardHeader>
            <CardTitle>Order Confirmation</CardTitle>
            <CardDescription>Please review your bulk purchase details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Quantity:</span>
                <span className="text-white font-bold">{quantity.toLocaleString()} Trees</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Unit Price:</span>
                <span className="text-white">$10.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Volume Discount:</span>
                <span className="text-stellar-green font-bold">-$1,500.00</span>
              </div>
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between text-lg">
                <span className="text-white font-bold">Total Amount:</span>
                <span className="text-stellar-blue font-bold">${(quantity * 10 - 1500).toLocaleString()}</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
              <Text variant="small" className="text-yellow-200/80">
                You will be redirected to complete the payment via {paymentMethod === 'stellar' ? 'Stellar' : 'secure wire portal'}.
              </Text>
            </div>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button variant="outline" onClick={handleBack} className="flex-1 border-white/10">Back</Button>
            <Button className="flex-[2] bg-stellar-green hover:bg-stellar-green/90 font-bold text-stellar-navy">
              Confirm & Pay
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
