import { describe, expect, it } from 'vitest';

import {
  MAX_TOTAL_MARGIN_PERCENT,
  buildPartnerImpactFeed,
  buildThemeVariables,
  getWhiteLabelConfig,
  isValidHexColor,
  mockWhiteLabelPartners,
  resolveConfigByDomain,
  splitSponsorshipPrice,
  validateFees,
} from '../whiteLabel';

const acme = mockWhiteLabelPartners[0];

describe('branding configuration', () => {
  it('resolves a partner config from its custom domain', () => {
    const found = resolveConfigByDomain('trees.acme-foundation.org');
    expect(found?.partnerId).toBe('partner-acme');
    expect(resolveConfigByDomain('www.TREES.ACME-FOUNDATION.ORG')?.partnerId).toBe('partner-acme');
    expect(resolveConfigByDomain('nope.example')).toBeUndefined();
  });

  it('exposes the partner palette and logo as CSS variables', () => {
    const vars = buildThemeVariables(acme);
    expect(vars['--wl-primary']).toBe(acme.branding.primaryColor);
    expect(vars['--wl-accent']).toBe(acme.branding.accentColor);
    expect(vars['--wl-logo-url']).toContain(acme.branding.logoUrl);
  });

  it('validates hex colors', () => {
    expect(isValidHexColor('#1d4ed8')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false);
  });
});

describe('fee and margin configuration', () => {
  it('validates fee combinations against the cap', () => {
    expect(validateFees({ platformFeePercent: 8, partnerMarginPercent: 12 })).toEqual([]);
    expect(validateFees({ platformFeePercent: -1, partnerMarginPercent: 0 })).toHaveLength(1);
    const tooHigh = validateFees({
      platformFeePercent: MAX_TOTAL_MARGIN_PERCENT,
      partnerMarginPercent: 1,
    });
    expect(tooHigh.join()).toContain('exceed');
  });

  it('splits a sponsorship price into platform fee, partner margin and grower share', () => {
    const breakdown = splitSponsorshipPrice(20, {
      platformFeePercent: 10,
      partnerMarginPercent: 25,
    });
    expect(breakdown.platformFeeUsd).toBe(2);
    expect(breakdown.partnerMarginUsd).toBe(5);
    expect(breakdown.growerShareUsd).toBe(13);
    expect(
      breakdown.platformFeeUsd + breakdown.partnerMarginUsd + breakdown.growerShareUsd
    ).toBeCloseTo(breakdown.totalUsd, 2);
  });

  it('throws on invalid prices or fee combos', () => {
    expect(() => splitSponsorshipPrice(-1, acme.fees)).toThrow();
    expect(() =>
      splitSponsorshipPrice(10, { platformFeePercent: 50, partnerMarginPercent: 50 })
    ).toThrow();
  });

  it('rounds to cents without losing money', () => {
    const breakdown = splitSponsorshipPrice(9.99, {
      platformFeePercent: 8,
      partnerMarginPercent: 12,
    });
    expect(
      Math.round(
        (breakdown.platformFeeUsd + breakdown.partnerMarginUsd + breakdown.growerShareUsd) * 100
      )
    ).toBe(Math.round(breakdown.totalUsd * 100));
  });
});

describe('partner impact feed', () => {
  it('aggregates every configured project into totals for the admin panel', () => {
    const feed = buildPartnerImpactFeed(acme, '2026-10-19T00:00:00.000Z');
    expect(feed.partnerId).toBe(acme.partnerId);
    expect(feed.projects.map((p) => p.projectId)).toEqual(acme.projectIds);
    expect(feed.totals.emissionsReduced.value).toBeGreaterThanOrEqual(0);
    expect(feed.totals.emissionsReduced.unit).toBe('tCO₂e');
    for (const project of feed.projects) {
      expect(project.snapshot.asOf).toBe('2026-10-19T00:00:00.000Z');
    }
  });

  it('configs are addressable by partner id', () => {
    expect(getWhiteLabelConfig('partner-greenbank')?.branding.partnerName).toBe(
      'GreenBank Rewards'
    );
    expect(getWhiteLabelConfig('missing')).toBeUndefined();
  });
});
