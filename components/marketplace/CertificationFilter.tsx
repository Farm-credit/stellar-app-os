'use client';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import { CERTIFICATION_LABELS } from '@/lib/services/farmer-credentials';
import {
  SUSTAINABILITY_CERTIFICATIONS,
  type SustainabilityCertification,
} from '@/lib/types/issue-1374-1377';
export function CertificationFilter({
  value,
  onChange,
}: {
  value: SustainabilityCertification | null;
  onChange: (value: SustainabilityCertification | null) => void;
}) {
  return (
    <div>
      <Text
        variant="label"
        as="p"
        className="mb-2 text-xs uppercase tracking-wide text-muted-foreground"
      >
        Farmer certification
      </Text>
      <Select
        id="certification-filter"
        variant="primary"
        value={value ?? ''}
        onChange={(event) =>
          onChange((event.target.value || null) as SustainabilityCertification | null)
        }
        aria-label="Filter by farmer sustainability certification"
      >
        <option value="">All certifications</option>
        {SUSTAINABILITY_CERTIFICATIONS.map((certification) => (
          <option key={certification} value={certification}>
            {CERTIFICATION_LABELS[certification]}
          </option>
        ))}
      </Select>
    </div>
  );
}
