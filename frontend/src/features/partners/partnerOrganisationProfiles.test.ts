import {
  buildPartnerProfileRoute,
  calculatePartnerSponsorshipQuote,
  filterActiveCertifications,
  normalizePartnerSlug,
  PlantingPartnerProfile,
} from './partnerOrganisationProfiles';

describe('partnerOrganisationProfiles (#1643)', () => {
  const samplePartner: PlantingPartnerProfile = {
    id: 'partner-01',
    slug: 'amazonia-reforest-trust',
    name: 'Amazonia Reforest Trust',
    region: 'South America',
    treesPlantedTotal: 145000,
    survivalRatePct: 92.5,
    costPerTreeUsd: 2.5,
    certifications: [
      { standard: 'FSC', certificateCode: 'FSC-C123456', verifiedUntilIso: '2028-12-31T00:00:00Z' },
      { standard: 'Rainforest Alliance', certificateCode: 'RA-9988', verifiedUntilIso: '2025-01-01T00:00:00Z' },
    ],
    activeProjectIds: ['PRJ-101', 'PRJ-104'],
  };

  it('normalizes partner slugs and constructs /partners/{slug} routes', () => {
    expect(normalizePartnerSlug('  Amazonia Reforest Trust! ')).toBe('amazonia-reforest-trust');
    expect(buildPartnerProfileRoute('Amazonia Reforest Trust')).toBe('/partners/amazonia-reforest-trust');
  });

  it('filters active certification badges against reference timestamp', () => {
    const active = filterActiveCertifications(samplePartner.certifications, '2026-11-05T00:00:00Z');
    expect(active).toHaveLength(1);
    expect(active[0].standard).toBe('FSC');
  });

  it('calculates sponsor funding quote and CO2 offset for a chosen partner', () => {
    const quote = calculatePartnerSponsorshipQuote(samplePartner, 40);
    expect(quote.route).toBe('/partners/amazonia-reforest-trust');
    expect(quote.treeCount).toBe(40);
    expect(quote.totalUsd).toBe(100);
    expect(quote.estimatedCo2OffsetKg).toBeGreaterThan(750);
  });
});
