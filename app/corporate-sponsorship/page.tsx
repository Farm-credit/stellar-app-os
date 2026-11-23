import React from 'react';
import { CorporateSponsorshipPortal } from '@/components/corporate-sponsorship/CorporateSponsorshipPortal';
import { listCorporateOrders } from '@/lib/corporate-sponsorship/store';

export const metadata = {
  title: 'Corporate Bulk Tree Sponsorship | Harvesta',
  description:
    'Sponsor bulk tree packages (10, 50, 100, 500 trees) with volume discounts, a branded corporate impact dashboard, and co-branded employee PDF certificates.',
};

export default function CorporateSponsorshipPage() {
  const initialOrders = listCorporateOrders();
  return <CorporateSponsorshipPortal initialOrders={initialOrders} />;
}
