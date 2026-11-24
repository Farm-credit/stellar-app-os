import { Text } from '@/components/atoms/Text';

export function FarmerKycPanel() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <Text as="h2" variant="h2" className="mb-2">
        Farmer KYC verification
      </Text>
      <Text variant="muted">No pending verification records.</Text>
    </section>
  );
}
