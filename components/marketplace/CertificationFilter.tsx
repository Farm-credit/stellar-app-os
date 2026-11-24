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

export type CertificationFilterValue = {
  certification: SustainabilityCertification | null;
  provider: CertificationProvider | null;
  verificationState: CertificationVerificationState | null;
};

export const EMPTY_CERTIFICATION_FILTER: CertificationFilterValue = {
  certification: null,
  provider: null,
  verificationState: null,
};

const CERTIFICATION_PARAM = 'certification';
const PROVIDER_PARAM = 'certificationProvider';
const VERIFICATION_STATE_PARAM = 'certificationVerificationState';

function isCertification(value: string | null): value is SustainabilityCertification {
  return !!value && (SUSTAINABILITY_CERTIFICATIONS as readonly string[]).includes(value);
}

function isProvider(value: string | null): value is CertificationProvider {
  return CERTIFICATION_PROVIDERS.some((option) => option.value === value);
}

function isVerificationState(value: string | null): value is CertificationVerificationState {
  return VERIFICATION_STATES.some((option) => option.value === value);
}

/** Parse certification filters from marketplace URL search params. */
export function parseCertificationFilter(
  params: Pick<URLSearchParams, 'get'>
): CertificationFilterValue {
  const certification = params.get(CERTIFICATION_PARAM);
  const provider = params.get(PROVIDER_PARAM);
  const verificationState = params.get(VERIFICATION_STATE_PARAM);
  return {
    certification: isCertification(certification) ? certification : null,
    provider: isProvider(provider) ? provider : null,
    verificationState: isVerificationState(verificationState) ? verificationState : null,
  };
}

/** Serialize certification filters into marketplace URL search params. */
export function applyCertificationFilter(
  params: URLSearchParams,
  filter: CertificationFilterValue
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filter.certification) {
    next.set(CERTIFICATION_PARAM, filter.certification);
  } else {
    next.delete(CERTIFICATION_PARAM);
  }
  if (filter.provider) {
    next.set(PROVIDER_PARAM, filter.provider);
  } else {
    next.delete(PROVIDER_PARAM);
  }
  if (filter.verificationState) {
    next.set(VERIFICATION_STATE_PARAM, filter.verificationState);
  } else {
    next.delete(VERIFICATION_STATE_PARAM);
  }
  return next;
}

/** Whether a listing's certification metadata matches the active filters. */
export function matchesCertificationFilter(
  filter: CertificationFilterValue,
  listing: {
    certification?: SustainabilityCertification | null;
    certificationProvider?: CertificationProvider | null;
    certificationVerificationState?: CertificationVerificationState | null;
  }
): boolean {
  if (filter.certification && listing.certification !== filter.certification) {
    return false;
  }
  if (filter.provider && listing.certificationProvider !== filter.provider) {
    return false;
  }
  if (
    filter.verificationState &&
    listing.certificationVerificationState !== filter.verificationState
  ) {
    return false;
  }
  return true;
}

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
  const hasActiveFilter = !!value || !!provider || !!verificationState;

  const clearAll = () => {
    onChange(null);
    onProviderChange?.(null);
    onVerificationStateChange?.(null);
  };
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
              (event.target.value || null) as CertificationVerificationState | null
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

      {hasActiveFilter && (
        <button
          type="button"
          onClick={clearAll}
          className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear certification filters
        </button>
      )}
    </div>
  );
}
