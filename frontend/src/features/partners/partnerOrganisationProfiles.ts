export type CertificationStandard = 'FSC' | 'Rainforest Alliance' | 'Verra VCS' | 'Gold Standard';

export interface PartnerCertificationBadge {
  standard: CertificationStandard;
  certificateCode: string;
  verifiedUntilIso: string;
}

export interface PlantingPartnerProfile {
  id: string;
  slug: string;
  name: string;
  region: string;
  treesPlantedTotal: number;
  survivalRatePct: number;
  costPerTreeUsd: number;
  certifications: PartnerCertificationBadge[];
  activeProjectIds: string[];
}

export function normalizePartnerSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildPartnerProfileRoute(slug: string): string {
  const clean = normalizePartnerSlug(slug);
  if (!clean) {
    throw new Error('Partner slug must not be empty');
  }
  return `/partners/${clean}`;
}

export function filterActiveCertifications(
  certifications: PartnerCertificationBadge[],
  referenceDateIso: string,
): PartnerCertificationBadge[] {
  const refMs = Date.parse(referenceDateIso);
  return certifications.filter((badge) => {
    const expMs = Date.parse(badge.verifiedUntilIso);
    return Number.isFinite(expMs) && expMs >= refMs;
  });
}

export function calculatePartnerSponsorshipQuote(
  partner: PlantingPartnerProfile,
  treeCount: number,
): { partnerSlug: string; route: string; treeCount: number; totalUsd: number; estimatedCo2OffsetKg: number } {
  const safeCount = Math.max(1, Math.floor(Number(treeCount) || 0));
  const totalUsd = Math.round(safeCount * partner.costPerTreeUsd * 100) / 100;
  const estimatedCo2OffsetKg = Math.round(safeCount * 21.77 * (partner.survivalRatePct / 100) * 10) / 10;
  return {
    partnerSlug: partner.slug,
    route: buildPartnerProfileRoute(partner.slug),
    treeCount: safeCount,
    totalUsd,
    estimatedCo2OffsetKg,
  };
}
