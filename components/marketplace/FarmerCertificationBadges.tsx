'use client';
import { Badge } from '@/components/atoms/Badge';
import { CERTIFICATION_LABELS, credentialsForListing } from '@/lib/services/farmer-credentials';
export function FarmerCertificationBadges({ farmerId }: { farmerId: string }) {
  const farmer = credentialsForListing(farmerId)[0];
  if (!farmer) return null;
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
    </div>
  );
}
