import { BadgeCheck } from 'lucide-react';
import {
  CERTIFICATION_DESCRIPTIONS,
  isCertificationCurrent,
  type PartnerCertification,
} from '@/lib/partners/data';

export function CertificationBadge({ cert }: { cert: PartnerCertification }) {
  const current = isCertificationCurrent(cert);
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        current ? 'border-stellar-green/40 bg-stellar-green/5' : 'border-border opacity-70'
      }`}
      data-testid={`cert-${cert.body}`}
    >
      <BadgeCheck
        className={`mt-0.5 h-5 w-5 shrink-0 ${current ? 'text-stellar-green' : 'text-muted-foreground'}`}
        aria-hidden
      />
      <div>
        <p className="font-semibold">{cert.body}</p>
        <p className="text-xs text-muted-foreground">{CERTIFICATION_DESCRIPTIONS[cert.body]}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Certified since {cert.since}
          {cert.validUntil && ` · ${current ? 'valid until' : 'expired'} ${cert.validUntil}`}
        </p>
      </div>
    </li>
  );
}
