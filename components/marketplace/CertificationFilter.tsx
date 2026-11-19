'use client';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import { CERTIFICATION_LABELS } from '@/lib/services/farmer-credentials';
import {
  SUSTAINABILITY_CERTIFICATIONS,
  type SustainabilityCertification,
  type CertificationProvider,
  type CertificationVerificationState,
} from '@/lib/types/issue-1374-1377';

const CERTIFICATION_PROVIDERS: { value: CertificationProvider; label: string }[] = [
  { value: 'verra', label: 'Verra' },
  { value: 'gold-standard', label: 'Gold Standard' },
];

const VERIFICATION_STATES: { value: CertificationVerificationState; label: string }[] = [
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'renewal-due', label: 'Renewal due' },
];

export function CertificationFilter({
  value,
  onChange,
  provider,
  onProviderChange,
  verificationState,
  onVerificationStateChange,
}: {
  value: SustainabilityCertification | null;
  onChange: (value: SustainabilityCertification | null) => void;
  provider?: CertificationProvider | null;
  onProviderChange?: (value: CertificationProvider | null) => void;
  verificationState?: CertificationVerificationState | null;
  onVerificationStateChange?: (value: CertificationVerificationState | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
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

      <div>
        <Text
          variant="label"
          as="p"
          className="mb-2 text-xs uppercase tracking-wide text-muted-foreground"
        >
          Certification provider
        </Text>
        <Select
          id="certification-provider-filter"
          variant="primary"
          value={provider ?? ''}
          onChange={(event) =>
            onProviderChange?.((event.target.value || null) as CertificationProvider | null)
          }
          aria-label="Filter by certification provider"
        >
          <option value="">All providers</option>
          {CERTIFICATION_PROVIDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Text
          variant="label"
          as="p"
          className="mb-2 text-xs uppercase tracking-wide text-muted-foreground"
        >
          Verification state
        </Text>
        <Select
          id="certification-verification-state-filter"
          variant="primary"
          value={verificationState ?? ''}
          onChange={(event) =>
            onVerificationStateChange?.(
              (event.target.value || null) as CertificationVerificationState | null,
            )
          }
          aria-label="Filter by certification verification state"
        >
          <option value="">All states</option>
          {VERIFICATION_STATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
</｜｜DSML｜｜ parameter>