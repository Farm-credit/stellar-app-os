import { useQuery } from "@tanstack/react-query";
import { fetchUserCredits } from "@/lib/stellar/listing";
import type { Credit } from "@/lib/types/listing";

export function useUserCredits(publicKey: string | null) {
  return useQuery({
    queryKey: ["user-credits", publicKey],
    queryFn: async (): Promise<Credit[]> => {
      if (!publicKey) return [];
      return fetchUserCredits(publicKey);
    },
    enabled: !!publicKey,
    staleTime: 30000, // 30 seconds
    retry: 2,
  });
}