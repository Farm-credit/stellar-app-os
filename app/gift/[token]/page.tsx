import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, TreePine } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { GiftCertificateCard } from '@/components/organisms/GiftCertificateCard/GiftCertificateCard';
import { decodeGiftShareToken, formatTreeCount } from '@/lib/gift/giftCertificate';

interface GiftSharePageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: GiftSharePageProps): Promise<Metadata> {
  const { token } = await params;
  const certificate = decodeGiftShareToken(token);
  if (!certificate) return { title: 'Gift certificate not found' };

  const title = `${certificate.senderName} gifted ${formatTreeCount(certificate.treeCount)} to ${certificate.recipientName}`;
  return {
    title,
    description: certificate.message || 'A tree sponsorship gift certificate.',
    openGraph: { title, description: certificate.message || undefined },
    robots: { index: false },
  };
}

/**
 * Shareable gift certificate view — Issue #1107
 */
export default async function GiftSharePage({ params }: GiftSharePageProps) {
  const { token } = await params;
  const certificate = decodeGiftShareToken(token);
  if (!certificate) notFound();

  return (
    <main className="container mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 text-center">
        <Text variant="h2" as="h1">
          You&apos;ve received a gift, {certificate.recipientName}!
        </Text>
        <Text variant="muted" className="mt-2">
          {certificate.senderName} sponsored {formatTreeCount(certificate.treeCount)} in your name.
          They&apos;ll absorb about {certificate.co2KgPerYear.toLocaleString('en-US')} kg of CO₂
          every year.
        </Text>
      </header>

      <GiftCertificateCard certificate={certificate} />

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={`/api/gift-certificates/${token}/pdf?download=1`}
          className="inline-flex items-center gap-2 rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/90"
        >
          <Download className="size-4" aria-hidden /> Download PDF
        </a>
        <Link
          href="/gift"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <TreePine className="size-4" aria-hidden /> Gift trees to someone else
        </Link>
      </div>
    </main>
  );
}
