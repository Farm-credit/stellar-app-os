import { BadgeCheck } from 'lucide-react';

/**
 * Shown on certified partner profiles and the projects they run. (#1691)
 */
export function PartnerCertificationBadge({
  expiresAt,
  className = '',
}: {
  expiresAt?: string | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-stellar-green/40 bg-stellar-green/10 px-2.5 py-0.5 text-xs font-medium text-stellar-green ${className}`}
      data-testid="partner-certification-badge"
      title={
        expiresAt
          ? `Certified planting partner until ${expiresAt.slice(0, 10)}`
          : 'Certified planting partner'
      }
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      Certified planting partner
    </span>
  );
}
