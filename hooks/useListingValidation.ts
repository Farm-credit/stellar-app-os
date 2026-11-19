import { useState, useCallback } from 'react';
import { validateCreditOwnership, checkExistingListings } from '@/lib/stellar/listing';
import { useWalletContext } from '@/contexts/WalletContext';
import type { Credit, ListingFormData } from '@/lib/types/listing';

export interface AuctionBidValidationData {
  /** Amount the bidder is offering (in the auction's pricing unit) */
  bidAmount: number;
  /** Quantity of credits the bidder wants to purchase */
  quantity: number;
  /** Current highest bid on the auction, or null if no bids yet */
  currentHighestBid: number | null;
  /** Minimum increment required above the current highest bid */
  minimumIncrement: number;
  /** Auction start time (ISO string or Date) */
  startTime: string | Date;
  /** Auction end time (ISO string or Date) */
  endTime: string | Date;
  /** Public key of the seller who created the auction */
  sellerPublicKey: string;
  /** Quantity of credits still available in the auction */
  availableQuantity: number;
  /** Optional explicit status of the auction */
  status?: 'active' | 'ended' | 'cancelled' | 'pending';
}

export function useListingValidation(selectedCredit: Credit | null) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const { wallet } = useWalletContext();

  const validateListing = useCallback(
    async (data: ListingFormData): Promise<boolean> => {
      setValidationError(null);

      if (!selectedCredit || !wallet?.publicKey) {
        setValidationError('Invalid credit or wallet not connected');
        return false;
      }

      try {
        // Check ownership
        const hasOwnership = await validateCreditOwnership(
          wallet.publicKey,
          selectedCredit.id,
          data.quantity
        );

        if (!hasOwnership) {
          setValidationError('Insufficient credit balance');
          return false;
        }

        // Check for existing listings
        const hasExistingListing = await checkExistingListings(wallet.publicKey, selectedCredit.id);

        if (hasExistingListing) {
          setValidationError('You already have an active listing for this credit');
          return false;
        }

        return true;
      } catch {
        setValidationError('Validation failed. Please try again.');
        return false;
      }
    },
    [selectedCredit, wallet?.publicKey]
  );

  const validateAuctionBid = useCallback(
    (data: AuctionBidValidationData): boolean => {
      setValidationError(null);

      if (!wallet?.publicKey) {
        setValidationError('Wallet not connected');
        return false;
      }

      const now = Date.now();
      const start = new Date(data.startTime).getTime();
      const end = new Date(data.endTime).getTime();

      if (Number.isNaN(start) || Number.isNaN(end)) {
        setValidationError('Invalid auction timing');
        return false;
      }

      // Auction must be active and not expired
      if (data.status && data.status !== 'active') {
        setValidationError(
          data.status === 'cancelled'
            ? 'This auction has been cancelled'
            : data.status === 'ended'
              ? 'This auction has already ended'
              : 'This auction is not active yet'
        );
        return false;
      }

      if (now < start) {
        setValidationError('This auction has not started yet');
        return false;
      }

      if (now >= end) {
        setValidationError('This auction has expired');
        return false;
      }

      // Bidder cannot be the seller
      if (data.sellerPublicKey === wallet.publicKey) {
        setValidationError('You cannot bid on your own auction');
        return false;
      }

      // Quantity must be positive and not exceed available
      if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
        setValidationError('Bid quantity must be greater than zero');
        return false;
      }

      if (data.quantity > data.availableQuantity) {
        setValidationError(
          `Bid quantity exceeds available credits (${data.availableQuantity} available)`
        );
        return false;
      }

      // Bid amount must be positive
      if (!Number.isFinite(data.bidAmount) || data.bidAmount <= 0) {
        setValidationError('Bid amount must be greater than zero');
        return false;
      }

      // Bid must exceed current highest bid plus minimum increment
      if (data.currentHighestBid !== null) {
        const minimumRequired = data.currentHighestBid + data.minimumIncrement;
        if (data.bidAmount < minimumRequired) {
          setValidationError(
            `Bid must be at least ${minimumRequired} (current highest bid ${data.currentHighestBid} + minimum increment ${data.minimumIncrement})`
          );
          return false;
        }
      }

      return true;
    },
    [wallet?.publicKey]
  );

  return { validateListing, validateAuctionBid, validationError };
}
