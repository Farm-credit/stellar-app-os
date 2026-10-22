import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { PartnerCertificationReviewPanel } from '@/components/organisms/PartnerCertificationReviewPanel/PartnerCertificationReviewPanel';

export default function AdminPartnerCertificationsPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Partner certification
        </Text>
        <Text as="p" variant="muted">
          Review partner planting organisations against the species selection, survival monitoring
          and reporting standards.
        </Text>
      </div>
      <PartnerCertificationReviewPanel />
    </div>
  );
}
