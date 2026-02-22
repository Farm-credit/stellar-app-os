// components/organisms/ListCreditForm/ListCreditForm.tsx
"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/molecules/Card";
import { CreditSelector } from "@/components/organisms/CreditSelector/CreditSelector";
import { PriceInput } from "@/components/organisms/PriceInput/PriceInput";
import { QuantityInput } from "@/components/organisms/QuantityInput/QuantityInput";
import { useWalletContext } from "@/contexts/WalletContext";
import type { Credit, ListingFormData, ListingStep } from "@/lib/types/listing";

const listingSchema = z.object({
  creditId: z.string().min(1, "Please select a credit"),
  pricePerCredit: z.number().positive("Price must be greater than 0"),
  quantity: z.number().positive().int("Quantity must be a positive integer"),
});

// Mock data for demonstration
const mockCredits: Credit[] = [
  {
    id: "CARBON_SOLAR_001",
    type: "Solar Carbon Credit",
    amount: 100,
    issuer: "GCXAMPLE1234567890ABCDEF",
    vintage: "2024",
    metadata: {
      projectName: "Solar Farm Project Alpha",
      location: "California, USA",
      methodology: "VCS",
      verificationStandard: "Verified Carbon Standard",
    },
  },
  {
    id: "CARBON_WIND_002", 
    type: "Wind Carbon Credit",
    amount: 75,
    issuer: "GCXAMPLE1234567890ABCDEF",
    vintage: "2024",
    metadata: {
      projectName: "Wind Farm Project Beta",
      location: "Texas, USA", 
      methodology: "CDM",
      verificationStandard: "Clean Development Mechanism",
    },
  },
];

export function ListCreditForm() {
  const [step, setStep] = useState<ListingStep>("form");
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState<{
    hash: string;
    listingId: string;
  } | null>(null);

  const { wallet } = useWalletContext();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
    reset,
  } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    mode: "onChange",
  });

  const watchedValues = watch();

  const handleCreditSelect = useCallback((credit: Credit) => {
    setSelectedCredit(credit);
    setValue("creditId", credit.id);
    setValue("quantity", Math.min(1, credit.amount));
  }, [setValue]);

  const handlePreview = useCallback(async (data: ListingFormData) => {
    if (!selectedCredit) return;
    setStep("preview");
  }, [selectedCredit]);

  const handleConfirmListing = useCallback(async () => {
    if (!selectedCredit || !isValid) return;

    setIsLoading(true);
    setStep("signing");
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = {
        hash: "TXHASH" + Math.random().toString(36).substring(7),
        listingId: "LIST" + Math.random().toString(36).substring(7),
      };

      setTransactionResult(result);
      setStep("success");
    } catch (error) {
      console.error("Failed to create listing:", error);
      setStep("form");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCredit, isValid]);

  const handleCreateAnother = useCallback(() => {
    reset();
    setSelectedCredit(null);
    setTransactionResult(null);
    setStep("form");
  }, [reset]);

  const handlePriceChange = useCallback((value: number) => {
    setValue("pricePerCredit", value);
  }, [setValue]);

  const handleQuantityChange = useCallback((value: number) => {
    setValue("quantity", value);
  }, [setValue]);

  if (!wallet?.isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Your Wallet</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <Text variant="muted" as="p">
            You need to connect your wallet to list credits for sale
          </Text>
          <Button stellar="accent">
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Success Step
  if (step === "success" && transactionResult) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div>
              <Text variant="h2" as="h2" className="mb-2">
                Listing Created Successfully!
              </Text>
              <Text variant="muted" as="p">
                Your credit is now available in the marketplace
              </Text>
            </div>
            
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Listing ID:</dt>
                    <dd className="font-mono text-sm">{transactionResult.listingId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Transaction:</dt>
                    <dd className="font-mono text-sm">
                      {transactionResult.hash.slice(0, 8)}...{transactionResult.hash.slice(-8)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            
            <div className="space-y-3">
              <Button
                stellar="accent"
                className="w-full"
                onClick={() => window.location.href = `/marketplace/listings/${transactionResult.listingId}`}
              >
                View Your Listing
              </Button>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(`https://stellar.expert/explorer/public/tx/${transactionResult.hash}`, '_blank')}
              >
                View on Stellar Explorer
              </Button>
              
              <Button
                variant="ghost"
                onClick={handleCreateAnother}
                className="w-full"
              >
                Create Another Listing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Signing Step
  if (step === "signing") {
    const totalValue = watchedValues.pricePerCredit * watchedValues.quantity;
    
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-stellar-blue/10 dark:bg-stellar-blue/5 rounded-full flex items-center justify-center">
              {isLoading ? (
                <div className="w-8 h-8 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-8 h-8 text-stellar-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
            
            <div>
              <Text variant="h3" as="h2" className="mb-2">
                {isLoading ? 'Creating Listing...' : 'Confirm with Wallet'}
              </Text>
              <Text variant="muted" as="p">
                {isLoading 
                  ? 'Please wait while your listing is being created on the blockchain'
                  : 'Please confirm the transaction in your wallet to create the listing'
                }
              </Text>
            </div>
            
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Credit:</dt>
                    <dd className="font-medium">{selectedCredit?.type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Quantity:</dt>
                    <dd className="font-medium">{watchedValues.quantity} credits</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Price:</dt>
                    <dd className="font-medium">{watchedValues.pricePerCredit?.toFixed(4)} XLM each</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-medium">
                    <dt>Total:</dt>
                    <dd>{totalValue?.toFixed(4)} XLM</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            
            {!isLoading && (
              <Button
                variant="outline"
                onClick={() => setStep("preview")}
                className="w-full"
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview Step
  if (step === "preview" && selectedCredit) {
    const totalValue = watchedValues.pricePerCredit * watchedValues.quantity;
    const platformFee = totalValue * 0.025;
    const netAmount = totalValue - platformFee;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Your Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <Text variant="h4" as="h3" className="mb-4">
                  Credit Details
                </Text>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Credit Type:</dt>
                    <dd className="font-medium">{selectedCredit.type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Issuer:</dt>
                    <dd className="font-medium">{selectedCredit.issuer}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Vintage:</dt>
                    <dd className="font-medium">{selectedCredit.vintage}</dd>
                  </div>
                </dl>
              </div>
              
              <div>
                <Text variant="h4" as="h3" className="mb-4">
                  Listing Terms
                </Text>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Quantity:</dt>
                    <dd className="font-medium">{watchedValues.quantity} credits</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Price per Credit:</dt>
                    <dd className="font-medium">{watchedValues.pricePerCredit?.toFixed(4)} XLM</dd>
                  </div>
                </dl>
              </div>
            </div>
            
            <div className="space-y-6">
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg">Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Gross Amount:</dt>
                      <dd>{totalValue.toFixed(4)} XLM</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Platform Fee (2.5%):</dt>
                      <dd>-{platformFee.toFixed(4)} XLM</dd>
                    </div>
                    <div className="flex justify-between border-t pt-3 font-medium">
                      <dt>Net Amount:</dt>
                      <dd className="text-green-600 dark:text-green-400">{netAmount.toFixed(4)} XLM</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <Text variant="small" as="h4" className="font-medium mb-2">
                  Important Notes
                </Text>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Your listing will be active immediately after confirmation</li>
                  <li>• Credits will be locked until sold or delisted</li>
                  <li>• You can cancel the listing at any time</li>
                  <li>• Platform fees are deducted upon sale completion</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 mt-8 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("form")}
              disabled={isLoading}
              className="flex-1"
            >
              Edit Details
            </Button>
            <Button
              type="button"
              stellar="accent"
              onClick={handleConfirmListing}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Creating Listing...' : 'Confirm & Sign with Wallet'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Form Step
  return (
    <form onSubmit={handleSubmit(handlePreview)} className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <CreditSelector
                credits={mockCredits}
                selectedCredit={selectedCredit}
                onSelect={handleCreditSelect}
                isLoading={false}
                error={errors.creditId?.message}
              />

              <PriceInput
                {...register("pricePerCredit", { valueAsNumber: true })}
                marketPrice={undefined}
                error={errors.pricePerCredit?.message}
                onChange={handlePriceChange}
              />

              <QuantityInput
                {...register("quantity", { valueAsNumber: true })}
                maxQuantity={selectedCredit?.amount || 0}
                error={errors.quantity?.message}
                onChange={handleQuantityChange}
                value={watchedValues.quantity}
              />
            </div>

            <div className="space-y-6">
              {selectedCredit && (
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Credit Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Type:</dt>
                        <dd className="font-medium">{selectedCredit.type}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Available:</dt>
                        <dd className="font-medium">{selectedCredit.amount} credits</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Vintage:</dt>
                        <dd className="font-medium">{selectedCredit.vintage}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Issuer:</dt>
                        <dd className="font-medium">{selectedCredit.issuer}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              )}

              {watchedValues.pricePerCredit && watchedValues.quantity && (
                <Card className="border-stellar-blue/30">
                  <CardHeader>
                    <CardTitle className="text-lg">Listing Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Quantity:</dt>
                        <dd className="font-medium">{watchedValues.quantity} credits</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Price per credit:</dt>
                        <dd className="font-medium">{watchedValues.pricePerCredit} XLM</dd>
                      </div>
                      <div className="flex justify-between font-medium border-t pt-2 mt-2">
                        <dt>Total value:</dt>
                        <dd>{(watchedValues.pricePerCredit * watchedValues.quantity).toFixed(4)} XLM</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              type="submit"
              stellar="accent"
              disabled={!isValid}
              aria-label="Preview listing before confirmation"
            >
              Preview Listing
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}