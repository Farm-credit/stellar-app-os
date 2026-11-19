'use client';
import { Badge } from '@/components/atoms/Badge';
import { CERTIFICATION_LABELS, credentialsForListing } from '@/lib/services/farmer-credentials';

type ProviderVerificationStatus = 'verified' | 'pending' | 'renewal_due';

interface ProviderVerification {
  provider: 'verra' | 'gold_standard';
  status: ProviderVerificationStatus;
  lastVerifiedAt?: string | null;
  renewalDueAt?: string | null;
}

const PROVIDER_LABELS: Record<ProviderVerification['provider'], string> = {
  verra: 'Verra',
  gold_standard: 'Gold Standard',
};

const STATUS_LABELS: Record<ProviderVerificationStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  renewal_due: 'Renewal Due',
};

const STATUS_VARIANTS: Record<
  ProviderVerificationStatus,
  'success' | 'warning' | 'danger'
> = {
  verified: 'success',
  pending: 'warning',
  renewal_due: 'danger',
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildTooltip(verification: ProviderVerification): string {
  const parts: string[] = [];
  const lastVerified = formatDate(verification.lastVerifiedAt);
  const renewalDue = formatDate(verification.renewalDueAt);
  if (lastVerified) parts.push(`Last verified: ${lastVerified}`);
  if (renewalDue) parts.push(`Renewal due: ${renewalDue}`);
  return parts.join(' • ');
}

function providerVerificationsFor(farmer: {
  providerVerifications?: ProviderVerification[];
}): ProviderVerification[] {
  return Array.isArray(farmer.providerVerifications)
    ? farmer.providerVerifications
    : [];
}

export function FarmerCertificationBadges({ farmerId }: { farmerId: string }) {
  const farmer = credentialsForListing(farmerId)[0];
  if (!farmer) return null;

  const providerVerifications = providerVerificationsFor(farmer);

  return (
    <div
      className="flex flex-wrap gap-1"
      aria-label={`Sustainability certifications for ${farmer.farmerName}`}
    >
      {farmer.certifications.map((certification) => (
        <Badge key={certification} variant="success" className="text-[11px]">
          {CERTIFICATION_LABELS[certification]}
        </Badge>
      ))}
      {providerVerifications.map((verification) => {
        const tooltip = buildTooltip(verification);
        return (
          <Badge
            key={`${verification.provider}-${verification.status}`}
            variant={STATUS_VARIANTS[verification.status]}
            className="text-[11px]"
            title={tooltip || undefined}
            aria-label={`${PROVIDER_LABELS[verification.provider]} ${STATUS_LABELS[verification.status]}${
              tooltip ? ` — ${tooltip}` : ''
            }`}
          >
            {PROVIDER_LABELS[verification.provider]} {STATUS_LABELS[verification.status]}
          </Badge>
        );
      })}
    </div>
  );
}
</｜｜DSML｜｜ parameter>