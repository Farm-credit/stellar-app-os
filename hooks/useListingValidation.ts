import { useState, useCallback } from "react";
import { validateCreditOwnership, checkExistingListings } from "@/lib/stellar/listing";
import { useWalletContext } from "@/contexts/WalletContext";
import type { Credit, ListingFormData } from "@/lib/types/listing";

export function useListingValidation(selectedCredit: Credit | null) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const { wallet } = useWalletContext();

  const validateListing = useCallback(async (data: ListingFormData): Promise<boolean> => {
    setValidationError(null);

    if (!selectedCredit || !wallet?.publicKey) {
      setValidationError("Invalid credit or wallet not connected");
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
        setValidationError("Insufficient credit balance");
        return false;
      }

      // Check for existing listings
      const hasExistingListing = await checkExistingListings(
        wallet.publicKey,
        selectedCredit.id
      );

      if (hasExistingListing) {
        setValidationError("You already have an active listing for this credit");
        return false;
      }

      return true;
    } catch (error) {
      setValidationError("Validation failed. Please try again.");
      return false;
    }
  }, [selectedCredit, wallet?.publicKey]);

  return { validateListing, validationError };
}