'use client';

import React, { useState, useMemo } from 'react';
import {
  MOCK_TREE_NFT_LISTINGS,
  calculateRoyaltyBreakdown,
  getTreeNFTListings,
} from '@/lib/nft/nft-marketplace';
import type { TreeNFTListing, NFTRarity, RoyaltyBreakdown } from '@/lib/types/nft-marketplace';

export function NFTMarketplace() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<NFTRarity | 'All'>('All');
  const [selectedSort, setSelectedSort] = useState<'date-newest' | 'price-asc' | 'price-desc' | 'rarity'>('date-newest');
  
  const [activeModalListing, setActiveModalListing] = useState<TreeNFTListing | null>(null);
  const [modalMode, setModalMode] = useState<'buy' | 'offer' | null>(null);
  const [offerPriceInput, setOfferPriceInput] = useState<number>(0);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);

  const filteredListings = useMemo(() => {
    return getTreeNFTListings({
      searchQuery,
      rarity: selectedRarity === 'All' ? undefined : selectedRarity,
      sortBy: selectedSort,
    });
  }, [searchQuery, selectedRarity, selectedSort]);

  const activeRoyaltyBreakdown: RoyaltyBreakdown | null = useMemo(() => {
    if (!activeModalListing) return null;
    return calculateRoyaltyBreakdown(
      activeModalListing.priceXlm,
      activeModalListing.priceUsd,
      activeModalListing.royaltyConfig.platformRoyaltyPercent,
      activeModalListing.royaltyConfig.creatorRoyaltyPercent
    );
  }, [activeModalListing]);

  const handleOpenBuyModal = (listing: TreeNFTListing) => {
    setActiveModalListing(listing);
    setModalMode('buy');
    setPurchaseStatus(null);
  };

  const handleOpenOfferModal = (listing: TreeNFTListing) => {
    setActiveModalListing(listing);
    setOfferPriceInput(Math.round(listing.priceXlm * 0.9));
    setModalMode('offer');
    setPurchaseStatus(null);
  };

  const handleConfirmPurchase = () => {
    setPurchaseStatus('Processing Stellar transaction & executing smart contract royalties...');
    setTimeout(() => {
      setPurchaseStatus('Transaction confirmed! Tree Sponsorship NFT transferred.');
      setTimeout(() => {
        setModalMode(null);
        setActiveModalListing(null);
        setPurchaseStatus(null);
      }, 1500);
    }, 1200);
  };

  const handleConfirmOffer = () => {
    setPurchaseStatus('Submitting offer to Stellar orderbook...');
    setTimeout(() => {
      setPurchaseStatus('Offer placed successfully!');
      setTimeout(() => {
        setModalMode(null);
        setActiveModalListing(null);
        setPurchaseStatus(null);
      }, 1500);
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-green-900 p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 bg-emerald-500/20 border border-emerald-400/40 rounded-full text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-3">
              OpenSea-Style Secondary Market
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tree Sponsorship NFT Marketplace
            </h1>
            <p className="mt-2 text-emerald-100 text-sm md:text-base">
              Trade verified tree sponsorship NFTs. Built-in platform royalties (2.5%) and planter royalties (5.0%) fund continuous ecosystem maintenance.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 min-w-[200px] text-center">
            <div className="text-xs text-emerald-200 uppercase font-medium">Platform Royalties</div>
            <div className="text-2xl font-bold text-white mt-1">2.5% / 5.0%</div>
            <div className="text-[11px] text-emerald-300 mt-1">Automated On-Chain Split</div>
          </div>
        </div>
      </div>

      {/* Controls / Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-background p-4 rounded-2xl border border-border">
        {/* Search */}
        <div className="md:col-span-2">
          <input
            type="text"
            placeholder="Search by species, tree ID, or region..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Rarity Filter */}
        <div>
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="All">All Rarities</option>
            <option value="Common">Common</option>
            <option value="Rare">Rare</option>
            <option value="Epic">Epic</option>
            <option value="Legendary">Legendary</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <select
            value={selectedSort}
            onChange={(e) => setSelectedSort(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="date-newest">Newest Listed</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rarity">Rarity Rank</option>
          </select>
        </div>
      </div>

      {/* NFT Listing Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredListings.map((listing) => (
          <div
            key={listing.id}
            className="group rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
          >
            {/* Image & Badges */}
            <div className="relative aspect-square overflow-hidden bg-muted">
              <img
                src={listing.nft.imageUrl}
                alt={listing.nft.species}
                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 flex gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-md ${
                    listing.nft.rarity === 'Legendary'
                      ? 'bg-amber-500'
                      : listing.nft.rarity === 'Epic'
                      ? 'bg-purple-600'
                      : listing.nft.rarity === 'Rare'
                      ? 'bg-blue-500'
                      : 'bg-slate-600'
                  }`}
                >
                  {listing.nft.rarity}
                </span>
              </div>
              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-semibold text-white">
                {listing.nft.co2OffsetKgPerYear} kg CO₂ / yr
              </div>
            </div>

            {/* Content Body */}
            <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs text-muted-foreground font-mono">{listing.nft.tokenId}</div>
                <h3 className="font-bold text-base text-foreground mt-0.5 group-hover:text-emerald-600 transition-colors">
                  {listing.nft.species}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <span>📍</span> {listing.nft.location}
                </p>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase font-medium">Price</div>
                  <div className="text-lg font-extrabold text-foreground flex items-baseline gap-1">
                    <span>{listing.priceXlm} XLM</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      (~${listing.priceUsd})
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-emerald-600 font-semibold">
                    {listing.nft.verifier}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleOpenBuyModal(listing)}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-colors"
                >
                  Buy Now
                </button>
                <button
                  onClick={() => handleOpenOfferModal(listing)}
                  className="w-full py-2 px-3 border border-border hover:bg-muted font-semibold rounded-xl text-xs transition-colors"
                >
                  Make Offer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Buy / Offer Modal */}
      {modalMode && activeModalListing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-xl font-bold text-foreground">
                {modalMode === 'buy' ? 'Buy Tree Sponsorship NFT' : 'Make an Offer'}
              </h3>
              <button
                onClick={() => {
                  setModalMode(null);
                  setActiveModalListing(null);
                }}
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>

            {/* Item Quick Summary */}
            <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-2xl border border-border">
              <img
                src={activeModalListing.nft.imageUrl}
                alt={activeModalListing.nft.species}
                className="w-16 h-16 rounded-xl object-cover"
              />
              <div>
                <div className="text-xs text-muted-foreground font-mono">
                  {activeModalListing.nft.tokenId}
                </div>
                <div className="font-bold text-sm text-foreground">
                  {activeModalListing.nft.species}
                </div>
                <div className="text-xs text-emerald-600 font-medium">
                  Seller: {activeModalListing.sellerName}
                </div>
              </div>
            </div>

            {/* Royalty Breakdown (OpenSea style) */}
            {activeRoyaltyBreakdown && (
              <div className="space-y-3 bg-card p-4 rounded-2xl border border-border">
                <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">
                  Stellar Smart Contract Royalty Split
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Listing Price:</span>
                  <span className="font-semibold">{activeRoyaltyBreakdown.listingPriceXlm} XLM (${activeRoyaltyBreakdown.listingPriceUsd})</span>
                </div>

                <div className="flex justify-between text-sm text-amber-600">
                  <span>Platform Fee (2.5%):</span>
                  <span>- {activeRoyaltyBreakdown.platformFeeXlm} XLM (${activeRoyaltyBreakdown.platformFeeUsd})</span>
                </div>

                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Planter Project Royalty (5.0%):</span>
                  <span>- {activeRoyaltyBreakdown.creatorRoyaltyXlm} XLM (${activeRoyaltyBreakdown.creatorRoyaltyUsd})</span>
                </div>

                <div className="pt-2 border-t border-border flex justify-between text-base font-bold">
                  <span>Seller Net Proceeds:</span>
                  <span className="text-foreground">{activeRoyaltyBreakdown.sellerNetProceedsXlm} XLM (${activeRoyaltyBreakdown.sellerNetProceedsUsd})</span>
                </div>
              </div>
            )}

            {/* Offer Price Input */}
            {modalMode === 'offer' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Your Offer Price (XLM)</label>
                <input
                  type="number"
                  value={offerPriceInput}
                  onChange={(e) => setOfferPriceInput(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-background font-mono font-bold text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Approx. ${(offerPriceInput * 0.12).toFixed(2)} USD
                </p>
              </div>
            )}

            {/* Status Feedback */}
            {purchaseStatus && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-600 text-center animate-pulse">
                {purchaseStatus}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setModalMode(null);
                  setActiveModalListing(null);
                }}
                className="w-1/2 py-3 rounded-xl border border-border hover:bg-muted font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={modalMode === 'buy' ? handleConfirmPurchase : handleConfirmOffer}
                disabled={!!purchaseStatus}
                className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors shadow-lg disabled:opacity-50"
              >
                {modalMode === 'buy' ? 'Confirm Purchase' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
