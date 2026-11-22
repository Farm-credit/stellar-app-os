import { describe, it, expect, beforeEach } from 'vitest';
import {
  slugifyBrand,
  isValidBrandSlug,
  getBenefactorLandingPage,
  getBenefactorConfigByWallet,
  saveBenefactorConfig,
  getAllPublishedBenefactorSlugs,
  resetBenefactorStoreForTesting,
} from '@/lib/api/benefactor-landing';

describe('Benefactor Landing API & Resolver', () => {
  beforeEach(() => {
    resetBenefactorStoreForTesting();
  });

  describe('slugifyBrand & isValidBrandSlug', () => {
    it('normalizes brand names into valid lowercase slugs', () => {
      expect(slugifyBrand('Acme Corp')).toBe('acme-corp');
      expect(slugifyBrand('  Apex Logistics Global!!  ')).toBe('apex-logistics-global');
      expect(slugifyBrand('Eco-Tree 2026')).toBe('eco-tree-2026');
    });

    it('validates brand slugs accurately', () => {
      expect(isValidBrandSlug('acme-corp')).toBe(true);
      expect(isValidBrandSlug('apex-123')).toBe(true);
      expect(isValidBrandSlug('a')).toBe(false); // too short
      expect(isValidBrandSlug('-invalid-start')).toBe(false);
      expect(isValidBrandSlug('invalid-end-')).toBe(false);
      expect(isValidBrandSlug('invalid@character')).toBe(false);
    });
  });

  describe('getBenefactorLandingPage', () => {
    it('resolves published benefactor by exact brand slug', () => {
      const data = getBenefactorLandingPage('acme-corp');
      expect(data).not.toBeNull();
      expect(data?.config.brandName).toBe('Acme Corp');
      expect(data?.config.brandSlug).toBe('acme-corp');
      expect(data?.beneficiaries.length).toBeGreaterThan(0);
      expect(data?.projects.length).toBeGreaterThan(0);
      expect(data?.metrics.totalTreesFunded).toBeGreaterThan(0);
    });

    it('resolves brand slug case-insensitively and with URL encoding', () => {
      const data = getBenefactorLandingPage('Acme-Corp');
      expect(data).not.toBeNull();
      expect(data?.config.brandSlug).toBe('acme-corp');

      const encodedData = getBenefactorLandingPage(encodeURIComponent('acme-corp'));
      expect(encodedData).not.toBeNull();
      expect(encodedData?.config.brandSlug).toBe('acme-corp');
    });

    it('returns null for nonexistent brand slugs', () => {
      const data = getBenefactorLandingPage('nonexistent-brand-xyz');
      expect(data).toBeNull();
    });

    it('returns null for unpublished (draft) benefactor when requirePublished is true', () => {
      saveBenefactorConfig('GACME1111111111111111111111111111111111111111111111111111111', {
        isPublished: false,
      });

      expect(getBenefactorLandingPage('acme-corp')).toBeNull();
      // Can still preview when requirePublished is false
      const preview = getBenefactorLandingPage('acme-corp', { requirePublished: false });
      expect(preview).not.toBeNull();
      expect(preview?.config.isPublished).toBe(false);
    });

    it('correctly associates isolated beneficiaries and projects for different benefactors', () => {
      const acme = getBenefactorLandingPage('acme-corp');
      const apex = getBenefactorLandingPage('apex-logistics');

      expect(acme?.config.brandSlug).toBe('acme-corp');
      expect(apex?.config.brandSlug).toBe('apex-logistics');

      // Acme has Aminu Musa and Amina Bello
      expect(acme?.beneficiaries.some((b) => b.name === 'Aminu Musa')).toBe(true);
      // Apex has Samuel Kiprop
      expect(apex?.beneficiaries.some((b) => b.name === 'Samuel Kiprop')).toBe(true);
      expect(apex?.beneficiaries.some((b) => b.name === 'Aminu Musa')).toBe(false);
    });
  });

  describe('saveBenefactorConfig and authorization', () => {
    const acmeWallet = 'GACME1111111111111111111111111111111111111111111111111111111';
    const apexWallet = 'GAPEX2222222222222222222222222222222222222222222222222222222';

    it('updates branding information for authorized wallet', () => {
      const res = saveBenefactorConfig(acmeWallet, {
        brandName: 'Acme International',
        description: 'New corporate climate initiative',
        websiteUrl: 'https://acme-updated.com',
      });

      expect(res.success).toBe(true);
      expect(res.config?.brandName).toBe('Acme International');
      expect(res.config?.description).toBe('New corporate climate initiative');

      const updated = getBenefactorConfigByWallet(acmeWallet);
      expect(updated?.brandName).toBe('Acme International');
    });

    it('prevents slug collision with another benefactor', () => {
      const res = saveBenefactorConfig(apexWallet, {
        brandSlug: 'acme-corp', // Collision with Acme
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already claimed/i);
    });

    it('rejects empty wallet or unauthorized call', () => {
      const res = saveBenefactorConfig('', { brandName: 'Test' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unauthorized/i);
    });

    it('rejects invalid brand slug syntax', () => {
      const res = saveBenefactorConfig(acmeWallet, { brandSlug: 'invalid@slug!' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid brand slug/i);
    });

    it('rejects empty brand name', () => {
      const res = saveBenefactorConfig(acmeWallet, { brandName: '   ' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot be empty/i);
    });
  });

  describe('getAllPublishedBenefactorSlugs', () => {
    it('returns only published slugs', () => {
      const slugs = getAllPublishedBenefactorSlugs();
      expect(slugs).toContain('acme-corp');
      expect(slugs).toContain('apex-logistics');

      saveBenefactorConfig('GACME1111111111111111111111111111111111111111111111111111111', {
        isPublished: false,
      });

      const updatedSlugs = getAllPublishedBenefactorSlugs();
      expect(updatedSlugs).not.toContain('acme-corp');
      expect(updatedSlugs).toContain('apex-logistics');
    });
  });
});
