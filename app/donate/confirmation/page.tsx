import { DonationConfirmation } from '@/components/organisms/DonationConfirmation/DonationConfirmation';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Donation Confirmed | Stellar Amazon Reforestation',
    description: 'Thank you for your donation to help restore the planet.',
};

export default function ConfirmationPage() {
    return <DonationConfirmation />;
}
