import type { Metadata } from 'next';
import { FarmerGuidesLibrary } from '@/components/organisms/FarmerGuidesLibrary';

export const metadata: Metadata = {
  title: 'Farmer guides',
  description:
    'Best-practice guides for farmers: regenerative agriculture, soil testing, carbon measurement, grant applications and the certification process.',
};

export default function FarmerGuidesPage() {
  return <FarmerGuidesLibrary />;
}
