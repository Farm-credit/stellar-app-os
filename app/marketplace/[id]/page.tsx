'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { getMockMarketplaceListings } from '@/lib/api/mock/marketplaceListings';
import { ArrowLeft, User, MapPin, Calendar, Shield, Package } from 'lucide-react';

/**
 * Formats a number as USD currency
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Formats a date string to readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MarketplaceDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Marketplace listing detail page
 *
 * Displays full details of a single marketplace listing including:
 * - Project information
 * - Seller details
 * - Pricing breakdown
 * - Verification status
 * - Purchase action
 *
 * Requirements: Issue #23 - Marketplace Listings
 */
export default function MarketplaceDetailPage({ params }: MarketplaceDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);

  // Fetch all listings and find the specific one
  // In a real app, this would be a dedicated API endpoint
  const allListings = getMockMarketplaceListings({}).listings;
  const listing = allListings.find((l) => l.id === id);

  if (!listing) {
    return (
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-12">
          <Text variant="h2" as="h1" className="mb-4">
            Listing Not Found
          </Text>
          <Text variant="muted" as="p" className="mb-6">
            The marketplace listing you&apos;re looking for doesn&apos;t exist or has been removed.
          </Text>
          <Button onClick={() => router.push('/marketplace')} stellar="primary">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Marketplace
          </Button>
        </div>
      </main>
    );
  }

  const handlePurchase = () => {
    // TODO: Implement purchase flow
    alert('Purchase flow not yet implemented');
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back button */}
      <div className="mb-6">
        <Button onClick={() => router.push('/marketplace')} variant="ghost" className="pl-0">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Marketplace
        </Button>
      </div>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <Text variant="h2" as="h1" className="mb-2">
              {listing.projectName}
            </Text>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{listing.projectType}</Badge>
              <Badge variant="success">{listing.verificationStatus}</Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Seller information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-stellar-blue" />
                Seller Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-stellar-blue/10 flex items-center justify-center">
                  <Text variant="h4" as="span" className="font-semibold text-stellar-blue">
                    {listing.sellerName.charAt(0).toUpperCase()}
                  </Text>
                </div>
                <div>
                  <Text variant="body" as="p" className="font-semibold">
                    {listing.sellerName}
                  </Text>
                  <Text variant="muted" as="p" className="text-sm">
                    Seller ID: {listing.sellerId}
                  </Text>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Project details */}
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <Text variant="small" as="p" className="text-muted-foreground mb-1">
                      Location
                    </Text>
                    <Text variant="body" as="p">
                      {listing.location}
                    </Text>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <Text variant="small" as="p" className="text-muted-foreground mb-1">
                      Vintage Year
                    </Text>
                    <Text variant="body" as="p">
                      {listing.vintageYear}
                    </Text>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <Text variant="small" as="p" className="text-muted-foreground mb-1">
                      Verification
                    </Text>
                    <Text variant="body" as="p">
                      {listing.verificationStatus}
                    </Text>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <Text variant="small" as="p" className="text-muted-foreground mb-1">
                      Available Quantity
                    </Text>
                    <Text variant="body" as="p">
                      {listing.quantity.toFixed(2)} tons CO₂
                    </Text>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Text variant="small" as="p" className="text-muted-foreground mb-1">
                  Listed On
                </Text>
                <Text variant="body" as="p">
                  {formatDate(listing.listedAt)}
                </Text>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Pricing and purchase */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="text-muted-foreground">
                    Price per ton
                  </Text>
                  <Text variant="body" as="span" className="font-semibold">
                    {formatPrice(listing.pricePerTon)}
                  </Text>
                </div>

                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="text-muted-foreground">
                    Quantity
                  </Text>
                  <Text variant="body" as="span" className="font-semibold">
                    {listing.quantity.toFixed(2)} tons
                  </Text>
                </div>

                <div className="pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <Text variant="h4" as="span" className="font-semibold">
                      Total Price
                    </Text>
                    <Text variant="h3" as="span" className="font-bold text-stellar-blue">
                      {formatPrice(listing.totalPrice)}
                    </Text>
                  </div>
                  <Text variant="muted" as="p" className="text-xs">
                    {listing.quantity.toFixed(2)} tons × {formatPrice(listing.pricePerTon)} per ton
                  </Text>
                </div>
              </div>

              <Button
                onClick={handlePurchase}
                stellar="primary"
                width="full"
                size="lg"
                className="mt-6"
                aria-label={`Purchase ${listing.quantity} tons of carbon credits for ${formatPrice(listing.totalPrice)}`}
              >
                Purchase Credits
              </Button>

              <Text variant="muted" as="p" className="text-xs text-center">
                Secure transaction via Stellar blockchain
              </Text>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
