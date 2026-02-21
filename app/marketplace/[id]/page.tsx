import React from 'react';
import { notFound } from 'next/navigation';
import { getListingById } from '@/lib/api/marketplace';
import { ListingDetail } from '@/components/organisms/ListingDetail';

export const metadata = {
  title: 'Marketplace Listing | Stellar',
  description: 'View full details for marketplace carbon credits.',
};

export default async function MarketplaceListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingById(id);

  if (!listing) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black pt-24 pb-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ListingDetail listing={listing} />
      </div>
    </main>
  );
}
