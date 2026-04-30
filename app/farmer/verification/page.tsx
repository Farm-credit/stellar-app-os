import type { Metadata } from 'next';
import { FarmerVerificationPortal } from '@/components/organisms/FarmerVerificationPortal/FarmerVerificationPortal';

export const metadata: Metadata = {
  title: 'Planting Verification | FarmCredit',
  description: 'Submit encrypted GPS-tagged planting photos for ZK proof generation.',
};

export default function FarmerVerificationPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <FarmerVerificationPortal />
      </div>
    </main>
  );
}
