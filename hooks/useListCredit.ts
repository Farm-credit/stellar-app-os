import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createListing } from "@/lib/stellar/listing";
import { useWalletContext } from "@/contexts/WalletContext";
import type { Credit, ListingResult } from "@/lib/types/listing";

interface ListCreditParams {
  credit: Credit;
  pricePerCredit: number;
  quantity: number;
}

export function useListCredit() {
  const queryClient = useQueryClient();
  const { wallet } = useWalletContext();

  return useMutation({
    mutationFn: async (params: ListCreditParams): Promise<ListingResult> => {
      if (!wallet?.publicKey) {
        throw new Error("Wallet not connected");
      }
      return createListing(wallet, params);
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["user-credits"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-listings"] });
    },
  });
}