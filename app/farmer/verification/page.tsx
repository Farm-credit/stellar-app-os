import type { Metadata } from 'next';
import { FarmerVerificationPortal } from '@/components/organisms/FarmerVerificationPortal/FarmerVerificationPortal';

export const metadata: Metadata = {
  title: 'Planting Photo Upload | FarmCredit',
  description: 'Upload a GPS-tagged planting photo to IPFS for your tree planting assignment.',
};

export default function FarmerVerificationPage() {
  return (
    <main className="min-h-screen bg-background px-3 pb-16 pt-20 sm:px-6 lg:px-8">
      <FarmerVerificationPortal />
    </main>
  );
}
