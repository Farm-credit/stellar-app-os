import { DonationConfirmationWithTx } from '@/components/organisms/DonationConfirmation/DonationConfirmationWithTx';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Donation Confirmed | FarmCredit',
  description: 'Thank you for your donation to help restore the planet.',
};

interface PageProps {
  params: Promise<{ txHash: string }>;
}

export default async function ConfirmationWithTxPage({ params }: PageProps) {
  const { txHash } = await params;
  return <DonationConfirmationWithTx txHash={txHash} />;
}
