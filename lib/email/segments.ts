export type SponsorSegment = 'first-time' | 'vip' | 'lapsed' | 'regional';

export interface SponsorLike {
  id?: string;
  name?: string;
  email?: string;
  totalDonated?: number;
  donationCount?: number;
  lastDonationAt?: string | Date | null;
  region?: string | null;
  country?: string | null;
  tags?: string[];
  [key: string]: unknown;
}

export const SPONSOR_SEGMENTS: readonly SponsorSegment[] = [
  'first-time',
  'vip',
  'lapsed',
  'regional',
] as const;

const SEGMENT_LABELS: Record<SponsorSegment, string> = {
  'first-time': 'First-time sponsors',
  vip: 'VIP sponsors',
  lapsed: 'Lapsed sponsors',
  regional: 'Regional sponsors',
};

const VIP_MIN_TOTAL_DONATED = 1000;
const VIP_MIN_DONATION_COUNT = 5;
const LAPSED_DAYS = 180;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeRegion(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function matchesSegment(
  sponsor: SponsorLike,
  segment: SponsorSegment,
  region?: string,
): boolean {
  if (!sponsor) return false;

  const donationCount = sponsor.donationCount ?? 0;
  const totalDonated = sponsor.totalDonated ?? 0;
  const lastDonation = toDate(sponsor.lastDonationAt);

  switch (segment) {
    case 'first-time':
      return donationCount <= 1;
    case 'vip':
      return (
        totalDonated >= VIP_MIN_TOTAL_DONATED ||
        donationCount >= VIP_MIN_DONATION_COUNT
      );
    case 'lapsed': {
      if (!lastDonation) return false;
      return daysSince(lastDonation) >= LAPSED_DAYS;
    }
    case 'regional': {
      if (!region) return false;
      const target = normalizeRegion(region);
      if (!target) return false;
      const sponsorRegion = normalizeRegion(sponsor.region);
      const sponsorCountry = normalizeRegion(sponsor.country);
      return sponsorRegion === target || sponsorCountry === target;
    }
    default:
      return false;
  }
}

export function segmentLabel(segment: SponsorSegment): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

export function validateSegment(value: unknown): value is SponsorSegment {
  return (
    typeof value === 'string' &&
    (SPONSOR_SEGMENTS as readonly string[]).includes(value)
  );
}