import { describe, expect, it } from 'vitest';
import {
  PLANTING_PARTNERS,
  buildPartnerSponsorUrl,
  getAllPartnerSlugs,
  getPartnerBySlug,
  isCertificationCurrent,
  sumProjectTrees,
} from '../data';

describe('planting partners', () => {
  it('has unique slugs', () => {
    const slugs = getAllPartnerSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('looks partners up by slug', () => {
    expect(getPartnerBySlug('niger-delta-mangrove-trust')?.name).toBe('Niger Delta Mangrove Trust');
    expect(getPartnerBySlug('nope')).toBeUndefined();
  });

  it('never reports fewer platform trees than the listed projects sum to', () => {
    for (const partner of PLANTING_PARTNERS) {
      expect(partner.treesPlantedViaPlatform).toBeGreaterThanOrEqual(sumProjectTrees(partner));
    }
  });

  it('treats certifications without expiry as current and expired ones as not', () => {
    const now = new Date('2026-01-01');
    expect(isCertificationCurrent({ body: 'FSC', since: 2016 }, now)).toBe(true);
    expect(
      isCertificationCurrent({ body: 'FSC', since: 2016, validUntil: '2025-01-01' }, now)
    ).toBe(false);
    expect(
      isCertificationCurrent({ body: 'FSC', since: 2016, validUntil: '2027-01-01' }, now)
    ).toBe(true);
  });

  it('builds an encoded sponsor link', () => {
    expect(buildPartnerSponsorUrl('a b')).toBe('/donate/trees?partner=a%20b');
  });
});
