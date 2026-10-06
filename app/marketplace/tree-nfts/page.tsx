import React from 'react';
import { NFTMarketplace } from '@/components/organisms/NFTMarketplace/NFTMarketplace';

export const metadata = {
  title: 'Tree Sponsorship NFT Marketplace | FarmCredit Stellar OS',
  description: 'Trade tree sponsorship NFTs on the OpenSea-style secondary marketplace with on-chain royalties for planters.',
};

export default function TreeNFTMarketplacePage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <NFTMarketplace />
    </main>
  );
}
