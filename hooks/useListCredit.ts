import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createListing } from '@/lib/stellar/listing';
import { useWalletContext } from '@/contexts/WalletContext';
import type { Credit, ListingResult } from '@/lib/types/listing';

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
        throw new Error('Wallet not connected');
      }
      const result = await createListing(wallet, params);
      return result;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Auction types
// ---------------------------------------------------------------------------

export interface AuctionFilters {
  status?: 'open' | 'closed' | 'resolved' | 'cancelled';
  seller?: string;
  creditId?: string;
  search?: string;
}

export interface AuctionBid {
  id: string;
  auctionId: string;
  bidder: string;
  amount: number;
  pricePerCredit: number;
  createdAt: string;
}

export interface Auction {
  id: string;
  creditId: string;
  seller: string;
  quantity: number;
  reservePrice: number;
  highestBid?: AuctionBid | null;
  bids?: AuctionBid[];
  status: 'open' | 'closed' | 'resolved' | 'cancelled';
  endsAt: string;
  createdAt: string;
  winner?: string | null;
}

export interface CreateAuctionParams {
  credit: Credit;
  quantity: number;
  reservePrice: number;
  endsAt: string;
}

export interface PlaceBidParams {
  auctionId: string;
  amount: number;
  pricePerCredit: number;
}

export interface ResolveAuctionParams {
  auctionId: string;
}

// ---------------------------------------------------------------------------
// Auction API helpers
// ---------------------------------------------------------------------------

async function fetchAuctions(filters: AuctionFilters = {}): Promise<Auction[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.seller) params.set('seller', filters.seller);
  if (filters.creditId) params.set('creditId', filters.creditId);
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  const response = await fetch(`/api/auctions${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('Failed to fetch auctions');
  }
  return response.json();
}

async function fetchAuction(id: string): Promise<Auction> {
  const response = await fetch(`/api/auctions/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch auction');
  }
  return response.json();
}

async function createAuction(
  wallet: { publicKey: string },
  params: CreateAuctionParams,
): Promise<Auction> {
  const response = await fetch('/api/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, seller: wallet.publicKey }),
  });
  if (!response.ok) {
    throw new Error('Failed to create auction');
  }
  return response.json();
}

async function placeBid(
  wallet: { publicKey: string },
  params: PlaceBidParams,
): Promise<AuctionBid> {
  const response = await fetch(
    `/api/auctions/${encodeURIComponent(params.auctionId)}/bids`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bidder: wallet.publicKey,
        amount: params.amount,
        pricePerCredit: params.pricePerCredit,
      }),
    },
  );
  if (!response.ok) {
    throw new Error('Failed to place bid');
  }
  return response.json();
}

async function resolveAuction(
  wallet: { publicKey: string },
  params: ResolveAuctionParams,
): Promise<Auction> {
  const response = await fetch(
    `/api/auctions/${encodeURIComponent(params.auctionId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seller: wallet.publicKey }),
    },
  );
  if (!response.ok) {
    throw new Error('Failed to resolve auction');
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Auction hooks
// ---------------------------------------------------------------------------

export function useAuctions(filters: AuctionFilters = {}) {
  return useQuery({
    queryKey: ['auctions', filters],
    queryFn: () => fetchAuctions(filters),
  });
}

export function useAuction(id: string | undefined) {
  return useQuery({
    queryKey: ['auction', id],
    queryFn: () => fetchAuction(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateAuction() {
  const queryClient = useQueryClient();
  const { wallet } = useWalletContext();

  return useMutation({
    mutationFn: async (params: CreateAuctionParams): Promise<Auction> => {
      if (!wallet?.publicKey) {
        throw new Error('Wallet not connected');
      }
      return createAuction(wallet, params);
    },
    onSuccess: (auction) => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['auction', auction.id] });
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}

export function usePlaceBid() {
  const queryClient = useQueryClient();
  const { wallet } = useWalletContext();

  return useMutation({
    mutationFn: async (params: PlaceBidParams): Promise<AuctionBid> => {
      if (!wallet?.publicKey) {
        throw new Error('Wallet not connected');
      }
      return placeBid(wallet, params);
    },
    onSuccess: (_bid, params) => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['auction', params.auctionId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}

export function useResolveAuction() {
  const queryClient = useQueryClient();
  const { wallet } = useWalletContext();

  return useMutation({
    mutationFn: async (params: ResolveAuctionParams): Promise<Auction> => {
      if (!wallet?.publicKey) {
        throw new Error('Wallet not connected');
      }
      return resolveAuction(wallet, params);
    },
    onSuccess: (auction) => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['auction', auction.id] });
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}