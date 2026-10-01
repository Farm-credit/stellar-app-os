import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { CertificationRegistryPanel } from '@/components/organisms/CertificationRegistryPanel/CertificationRegistryPanel';
import { ComplianceReportingPanel } from '@/components/organisms/ComplianceReportingPanel/ComplianceReportingPanel';

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

      <div className="mt-12 mb-8">
        <Text as="h2" variant="h2" className="mb-2">
          Buyer compliance reporting
        </Text>
        <Text as="p" variant="muted">
          Generate SEC, EPA, and carbon tax compliance reports with automatic
          offset-vs-emissions calculations for regulatory filings.
        </Text>
      </div>

      <ComplianceReportingPanel />
    </div>
  );
}
