import { TreePine } from 'lucide-react';
import {
  GIFT_THEMES,
  formatTreeCount,
  giftHeadline,
  type GiftCertificate,
} from '@/lib/gift/giftCertificate';
import { cn } from '@/lib/utils';

interface GiftCertificateCardProps {
  certificate: GiftCertificate;
  className?: string;
}

/**
 * On-screen rendition of a gift sponsorship certificate (Issue #1107).
 * Mirrors the layout and theme colours of the generated PDF.
 */
export function GiftCertificateCard({ certificate, className }: GiftCertificateCardProps) {
  const theme = GIFT_THEMES[certificate.theme];
  const issued = new Date(certificate.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <article
      aria-label={`Gift certificate for ${certificate.recipientName}`}
      className={cn(
        'relative aspect-[297/210] w-full overflow-hidden rounded-xl shadow-lg',
        className
      )}
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <div
        className="absolute inset-[3%] rounded-md border-2"
        style={{ borderColor: theme.primary }}
        aria-hidden
      />
      <div
        className="absolute inset-[4.5%] rounded-sm border"
        style={{ borderColor: theme.accent }}
        aria-hidden
      />

      <div className="relative flex h-full flex-col items-center justify-center px-[10%] text-center">
        <span
          className="mb-[2%] flex size-[9%] min-h-7 min-w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}
          aria-hidden
        >
          <TreePine className="size-3/5" style={{ color: theme.primary }} />
        </span>
        <p
          className="text-[clamp(0.5rem,1.2vw,0.75rem)] font-semibold uppercase tracking-[0.35em]"
          style={{ color: theme.accent }}
        >
          Gift Certificate
        </p>
        <h2
          className="mt-1 font-serif text-[clamp(1rem,3vw,2rem)] leading-tight"
          style={{ color: theme.primary }}
        >
          {giftHeadline(certificate)}
        </h2>
        <p className="mt-[2%] text-[clamp(0.6rem,1.3vw,0.875rem)]">This certifies that</p>
        <p
          className="max-w-full truncate border-b px-6 pb-1 font-serif text-[clamp(1.1rem,3.4vw,2.25rem)] font-semibold italic"
          style={{ color: theme.primary, borderColor: theme.accent }}
        >
          {certificate.recipientName || 'Recipient name'}
        </p>
        <p className="mt-[1.5%] text-[clamp(0.6rem,1.4vw,0.95rem)]">
          has been gifted <strong>{formatTreeCount(certificate.treeCount)}</strong> by{' '}
          {certificate.senderName || 'you'}
        </p>
        {certificate.message && (
          <p className="mt-[1.5%] line-clamp-3 max-w-[85%] font-serif text-[clamp(0.65rem,1.5vw,1rem)] italic">
            &ldquo;{certificate.message}&rdquo;
          </p>
        )}

        <dl className="mt-[3%] grid w-full max-w-[80%] grid-cols-3 gap-2">
          {[
            [
              certificate.treeCount.toLocaleString('en-US'),
              certificate.treeCount === 1 ? 'Tree' : 'Trees',
            ],
            [`${certificate.co2KgPerYear.toLocaleString('en-US')} kg`, 'CO₂ / year'],
            [certificate.species, 'Species'],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="sr-only">{label}</dt>
              <dd
                className="truncate text-[clamp(0.65rem,1.6vw,1.1rem)] font-bold"
                style={{ color: theme.primary }}
              >
                {value}
              </dd>
              <dd className="text-[clamp(0.45rem,0.9vw,0.65rem)] uppercase tracking-wide opacity-80">
                {label}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="absolute inset-x-[8%] bottom-[7%] flex justify-between text-[clamp(0.4rem,0.85vw,0.65rem)] opacity-80">
        <span>
          Planted in {certificate.region} · Issued {issued}
        </span>
        <span>{certificate.code}</span>
      </div>
    </article>
  );
}
