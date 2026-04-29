import { DonationConfirmation } from '@/components/organisms/DonationConfirmation/DonationConfirmation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Donation Confirmed | Stellar Amazon Reforestation',
  description: 'Thank you for your donation to help restore the planet.',
};

export default function ConfirmationPage() {
  return <DonationConfirmation />;
}
