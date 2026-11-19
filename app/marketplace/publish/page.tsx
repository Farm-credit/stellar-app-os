import type { Metadata } from 'next';
import { Text } from '@/components/atoms/Text';
import { PublishCarbonListingForm } from '@/components/organisms/PublishCarbonListing/PublishCarbonListingForm';

export const metadata: Metadata = {
  title: 'Publish Carbon Credit Listing | Stellar Farm Credit',
  description:
    'Allow farmers and land managers to list carbon credits from verified projects. Specify: credit type, quantity, price per ton, verification method.',
};

export default function PublishListingPage() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Text variant="h1" as="h1" className="mb-2">
            Publish Verified Carbon Credits
          </Text>
          <Text variant="muted" as="p">
            List credits from verified projects with verified audit standards (Verra, Gold Standard, ROC).
          </Text>
        </div>

        <PublishCarbonListingForm />
      </div>
    </div>
  );
}
