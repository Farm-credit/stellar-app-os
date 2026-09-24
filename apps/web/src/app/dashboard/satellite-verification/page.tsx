/**
 * Satellite Verification Dashboard Page
 * Issue #1429: Environmental impact verification - satellite imagery
 */

import { SatelliteVerificationDashboard } from '@/components/modules/satellite-verification/SatelliteVerificationDashboard';
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Satellite Verification | Farm-credit',
  description: 'Verify environmental claims using satellite imagery: tree counts, land cover changes, vegetation health',
};

export default async function SatelliteVerificationPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">
            Please sign in to access satellite verification tools
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Satellite Verification</h1>
        <p className="text-muted-foreground mt-2">
          Verify environmental claims using satellite imagery: tree counts, land cover changes, vegetation health indices
        </p>
      </div>
      <SatelliteVerificationDashboard />
    </div>
  );
}