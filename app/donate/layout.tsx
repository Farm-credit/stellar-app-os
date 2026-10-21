import { DonationProvider } from '@/contexts/DonationContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';

export default function DonateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <DonationProvider>{children}</DonationProvider>
    </CurrencyProvider>
  );
}
