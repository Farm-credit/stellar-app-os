import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { CertificationRegistryPanel } from '@/components/organisms/CertificationRegistryPanel/CertificationRegistryPanel';

export default function AdminCertificationsPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Certification registries
        </Text>
        <Text as="p" variant="muted">
          Pull project data from Verra and Gold Standard, verify credits, and manage renewal
          documentation.
        </Text>
      </div>

      <CertificationRegistryPanel />
    </div>
  );
}
