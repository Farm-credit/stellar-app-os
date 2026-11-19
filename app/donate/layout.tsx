import { DonationProvider } from '@/contexts/DonationContext';

export default function DonateLayout({ children }: { children: React.ReactNode }) {
  return <DonationProvider>{children}</DonationProvider>;
}
