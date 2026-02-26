'use client';

import React, { useState, useCallback } from 'react';
import { Listing } from '@/lib/types/marketplace';
import { checkAvailability } from '@/lib/api/marketplace';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { ShoppingCart, Leaf, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

const PriceHistoryChart = dynamic(() => import('./PriceHistoryChart'), {
  loading: () => (
    <div className="flex h-48 w-full animate-pulse items-center justify-center rounded-xl bg-white/5">
      <Text variant="body" className="text-white/40">Loading chart...</Text>
    </div>
  ),
  ssr: false,
});

interface ListingDetailProps {
  listing: Listing;
}

export function ListingDetail({ listing }: ListingDetailProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleQuantityChange = (newQty: number) => {
    if (newQty < 1) newQty = 1;
    if (newQty > listing.availableQuantity) newQty = listing.availableQuantity;
    setQuantity(newQty);
    setError(null);
  };

  const handleBuyNow = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    try {
      const isAvailable = await checkAvailability(listing.id, quantity);
      if (isAvailable) {
        // Proceed to purchase flow (simulated)
        alert(`Successfully initiated purchase of ${quantity} credits!`);
      } else {
        setError('Requested quantity is no longer available.');
      }
    } catch (err) {
      setError('An error occurred while checking availability. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, [listing.id, quantity]);

  const totalPrice = quantity * listing.pricePerCredit;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Left Column: Project Details & Chart */}
      <div className="flex flex-col space-y-8 lg:col-span-2">
        <div className="flex flex-col space-y-6 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md sm:p-8">
          <div className="flex items-center justify-between">
            <Badge variant="success" className="bg-stellar-green/20 text-stellar-green border-stellar-green/30">
              Verified Project
            </Badge>
            <div className="flex items-center space-x-2 text-white/60">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-medium">Seller: {formatAddress(listing.sellerAddress)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Text variant="h2" className="text-white">{listing.project.name}</Text>
            <Text variant="body" className="text-white/70">
              Support this verified environmental project by purchasing carbon credits.
            </Text>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center space-x-3 rounded-lg bg-white/5 p-4 mix-blend-screen">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stellar-blue/20 text-stellar-blue">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <Text variant="small" className="text-white/50">Project Type</Text>
                <Text variant="body" className="font-medium text-white">{listing.project.type}</Text>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 rounded-lg bg-white/5 p-4 mix-blend-screen">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stellar-purple/20 text-stellar-purple">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <Text variant="small" className="text-white/50">Vintage Year</Text>
                <Text variant="body" className="font-medium text-white">{listing.project.vintage}</Text>
              </div>
            </div>
          </div>
        </div>

        {/* Price History Chart (Lazy Loaded) */}
        {listing.priceHistory && listing.priceHistory.length > 0 && (
          <PriceHistoryChart data={listing.priceHistory} />
        )}
      </div>

      {/* Right Column: Checkout Card */}
      <div className="lg:col-span-1">
        <div className="sticky top-24 flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 backdrop-blur-md">
          <div className="mb-6 flex flex-col space-y-1">
            <Text variant="h3" className="text-white">${listing.pricePerCredit.toFixed(2)}</Text>
            <Text variant="small" className="text-white/50">Price per credit</Text>
          </div>

          <div className="mb-6 h-[1px] w-full bg-white/10" />

          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <Text variant="body" className="text-white/80">Available</Text>
              <Text variant="body" className="font-semibold text-white">{listing.availableQuantity} units</Text>
            </div>

            <div className="space-y-2">
              <Text variant="small" className="text-white/70">Quantity</Text>
              <div className="flex w-full items-center justify-between rounded-lg border border-white/20 bg-black/50 p-1">
                <button
                  onClick={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="w-16 text-center font-medium text-white">{quantity}</span>
                <button
                  onClick={() => handleQuantityChange(quantity + 1)}
                  disabled={quantity >= listing.availableQuantity}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6 h-[1px] w-full bg-white/10" />

          <div className="mb-6 flex items-center justify-between">
            <Text variant="body" className="font-medium text-white">Total Price</Text>
            <Text variant="h3" className="text-stellar-blue">${totalPrice.toFixed(2)}</Text>
          </div>

          {error && (
            <div className="mb-4 flex items-start space-x-2 rounded-lg bg-red-500/10 p-3 text-red-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <Button
            stellar="primary"
            onClick={handleBuyNow}
            disabled={isChecking || listing.availableQuantity === 0}
            className="w-full py-6 text-lg"
          >
            {isChecking ? (
              <span className="flex items-center space-x-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <span>Checking...</span>
              </span>
            ) : listing.availableQuantity === 0 ? (
              'Sold Out'
            ) : (
              <span className="flex items-center space-x-2">
                <ShoppingCart className="h-5 w-5" />
                <span>Buy Now</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
