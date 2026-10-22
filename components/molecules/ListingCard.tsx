'use client';

import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardFooter } from '@/components/molecules/Card';
import type { ListingCardProps } from '@/lib/types/marketplace';
import { cn } from '@/lib/utils';
import { FarmerCertificationBadges } from '@/components/marketplace/FarmerCertificationBadges';
import { useEffect, useState } from 'react';

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
 * Formats a date string to relative time (e.g., "2 days ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Formats a countdown to an auction end time (e.g., "2d 4h left", "Ended")
 */
function formatCountdown(endTime: string, now: number): string {
  const diffInSeconds = Math.floor((new Date(endTime).getTime() - now) / 1000);

  if (diffInSeconds <= 0) return 'Ended';

  const days = Math.floor(diffInSeconds / 86400);
  const hours = Math.floor((diffInSeconds % 86400) / 3600);
  const minutes = Math.floor((diffInSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/**
 * ListingCard molecule component
 *
 * Displays a marketplace listing card with project details, pricing, and seller info.
 * Features:
 * - Project name and type
 * - Seller information
 * - Quantity and pricing
 * - Vintage year and verification status
 * - Listed date
 * - Visual indicator for own listings
 * - Responsive layout
 * - Accessible with ARIA labels
 * - Distinct auction rendering (highest bid, bid count, countdown, reserve status)
 *
 * Requirements: Issue #23 - Marketplace Listings, Issue #1280 - Auction mechanism
 */
export function ListingCard({ listing, isOwnListing = false }: ListingCardProps) {
  const {
    id,
    projectName,
    projectType,
    sellerName,
    quantity,
    pricePerTon,
    totalPrice,
    vintageYear,
    verificationStatus,
    fundingStatus,
    listedAt,
    closingAt,
    location,
  } = listing;

  const isAuction = listing.listingKind === 'auction';
  const auction = isAuction ? listing.auction : undefined;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isAuction || !auction) return;
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [isAuction, auction]);

  const formatClosingDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card
      className={cn(
        'flex flex-col h-full transition-all duration-200 hover:shadow-lg',
        isOwnListing && 'border-stellar-blue border-2'
      )}
    >
      <CardContent className="flex-1 p-6 space-y-4">
        {/* Header: Project name and type */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Text variant="h4" as="h3" className="line-clamp-2 flex-1">
              {projectName}
            </Text>
            {isOwnListing && (
              <Badge variant="success" className="shrink-0">
                Your Listing
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{projectType}</Badge>
            {isAuction && (
              <Badge variant="warning" className="shrink-0">
                Auction
              </Badge>
            )}
          </div>
        </div>

        {/* Seller info */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-stellar-blue/10 flex items-center justify-center">
            <Text variant="small" as="span" className="font-semibold text-stellar-blue">
              {sellerName.charAt(0).toUpperCase()}
            </Text>
          </div>
          <div className="flex-1 min-w-0">
            <Text variant="small" as="p" className="font-medium truncate">
              {sellerName}
            </Text>
            <Text variant="muted" as="p" className="text-xs truncate">
              {location}
            </Text>
            <FarmerCertificationBadges farmerId={listing.sellerId} />
          </div>
        </div>

        {/* Quantity and pricing */}
        <div className="space-y-2 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <Text variant="small" as="span" className="text-muted-foreground">
              Quantity
            </Text>
            <Text variant="small" as="span" className="font-semibold">
              {quantity.toFixed(2)} tons CO₂
            </Text>
          </div>
          {isAuction && auction ? (
            <>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Current highest bid
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  {auction.highestBid != null ? formatPrice(auction.highestBid) : 'No bids yet'}
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Bids
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  {auction.bidCount}
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Reserve
                </Text>
                <Badge variant={auction.reserveMet ? 'success' : 'outline'}>
                  {auction.reserveMet ? 'Reserve met' : 'Reserve not met'}
                </Badge>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="font-semibold">
                    Ends in
                  </Text>
                  <Text variant="small" as="span" className="font-semibold text-stellar-blue">
                    {formatCountdown(auction.endTime, now)}
                  </Text>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Price per ton
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  {formatPrice(pricePerTon)}
                </Text>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="font-semibold">
                    Total Price
                  </Text>
                  <Text variant="h4" as="span" className="font-bold text-stellar-blue">
                    {formatPrice(totalPrice)}
                  </Text>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span>Vintage {vintageYear}</span>
            <span>•</span>
            <span>{verificationStatus}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>{fundingStatus}</span>
            <span>•</span>
            <span>Closes {formatClosingDate(closingAt)}</span>
          </div>
        </div>

        {/* Listed date */}
        <Text variant="muted" as="p" className="text-xs">
          Listed {formatRelativeTime(listedAt)}
        </Text>
      </CardContent>

      <CardFooter className="p-6 pt-0">
        {isAuction ? (
          <Button
            asChild
            stellar="primary"
            width="full"
            aria-label={`Place a bid on ${projectName}`}
          >
            <Link href={`/marketplace/auctions/${id}`}>Place Bid</Link>
          </Button>
        ) : (
          <Button
            asChild
            stellar="primary"
            width="full"
            aria-label={`View details for ${projectName}`}
          >
            <Link href={`/marketplace/${id}`}>View Details</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
