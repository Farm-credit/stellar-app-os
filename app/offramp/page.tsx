import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FUNDABLE_OFFRAMP_URL } from '@/lib/config/fundable';

export const metadata: Metadata = {
  title: 'Off-ramp | FarmCredit',
  description: 'Convert your Stellar USDC to local currency with Fundable.',
};

export default function OffRampPage(): never {
  redirect(FUNDABLE_OFFRAMP_URL);
}
