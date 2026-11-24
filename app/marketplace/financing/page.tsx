import type { Metadata } from 'next';
import { Text } from '@/components/atoms/Text';
import { FarmerFinancingForm } from '@/components/organisms/FarmerFinancingForm';

export const metadata: Metadata = {
  title: 'Farmer Financing | Stellar Carbon Marketplace',
  description:
    'Apply for 0% interest land preparation financing. Pay back automatically from your first carbon credit sales.',
};

/**
 * Farmer Financing Page — Issue #1290
 * Next.js Server Component acting as the data and layout container for the financing form.
 */
export default function FarmerFinancingPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 max-w-2xl">
        <Text variant="label" className="text-stellar-green">
          Farmer Support
        </Text>
        <Text variant="h1" as="h1" className="mt-2 mb-4">
          Land Preparation Financing
        </Text>
        <Text variant="body" className="text-muted-foreground text-lg">
          We understand that starting a carbon project requires capital. Access a 0% interest credit
          line to prepare your land, and we will automatically recover the cost from your future
          credit sales.
        </Text>
      </header>

      {/* Render the financing organism */}
      <FarmerFinancingForm />
    </main>
  );
}
