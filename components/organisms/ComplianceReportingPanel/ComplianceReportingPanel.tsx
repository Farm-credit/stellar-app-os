import { Text } from '@/components/atoms/Text';

export function ComplianceReportingPanel() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <Text as="h2" variant="h2" className="mb-2">
        Compliance reporting
      </Text>
      <Text variant="muted">
        Certification and compliance reports will appear here once reporting data is available.
      </Text>
    </section>
  );
}
