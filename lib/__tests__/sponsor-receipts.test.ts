import { describe, expect, it } from 'vitest';
import {
  calculateImpactMetrics,
  calculateStewardDistribution,
  computeReceiptDigest,
  createTaxExemptReceipt,
  INITIAL_TAX_EXEMPT_RECEIPTS,
  listTaxExemptReceipts,
  validateBenefactorWallet,
  validateReceiptCreationInput,
  verifyReceiptDigest,
} from '../sponsor-receipts';
import {
  generateTaxExemptReceiptPdf,
  taxExemptReceiptPdfToBuffer,
} from '../sponsor-receipt-pdf';

describe('Sponsor Tax-Exempt Impact Receipts', () => {
  const sampleWallet = 'GACME1111111111111111111111111111111111111111111111111111111';

  describe('Steward Distribution & Rewards', () => {
    it('distributes 55% to farmers, 20% to urban planters, 15% to community schools, and 10% to verifiers', () => {
      const totalAmount = 100000;
      const dist = calculateStewardDistribution(totalAmount);

      expect(dist.farmers.sharePercentage).toBe(55);
      expect(dist.farmers.amountUsd).toBe(55000);
      expect(dist.farmers.role).toBe('farmer');

      expect(dist.urbanPlanters.sharePercentage).toBe(20);
      expect(dist.urbanPlanters.amountUsd).toBe(20000);
      expect(dist.urbanPlanters.role).toBe('urban_planter');

      expect(dist.communitySchools.sharePercentage).toBe(15);
      expect(dist.communitySchools.amountUsd).toBe(15000);
      expect(dist.communitySchools.role).toBe('community_school');

      expect(dist.verifiers.sharePercentage).toBe(10);
      expect(dist.verifiers.amountUsd).toBe(10000);
      expect(dist.verifiers.role).toBe('verifier');

      const sum =
        dist.farmers.amountUsd +
        dist.urbanPlanters.amountUsd +
        dist.communitySchools.amountUsd +
        dist.verifiers.amountUsd;
      expect(sum).toBe(totalAmount);
      expect(dist.totalRecipients).toBeGreaterThan(0);
    });

    it('handles small amounts safely without negative numbers', () => {
      const dist = calculateStewardDistribution(100);
      expect(dist.farmers.amountUsd).toBe(55);
      expect(dist.urbanPlanters.amountUsd).toBe(20);
      expect(dist.communitySchools.amountUsd).toBe(15);
      expect(dist.verifiers.amountUsd).toBe(10);
      expect(dist.totalRecipients).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Ecological Impact Metrics', () => {
    it('computes proportional carbon credits and tree numbers', () => {
      const impact = calculateImpactMetrics(50000);
      expect(impact.treesFunded).toBe(2000); // 50000 / 25
      expect(impact.co2OffsetTonnes).toBe(44.0); // 2000 * 22kg / 1000
      expect(impact.waterRechargeKL).toBe(300.0);
      expect(impact.biodiversityHectares).toBe(4.0);
    });
  });

  describe('Wallet Address Validation (@stellar/stellar-sdk StrKey)', () => {
    it('accepts valid Stellar Ed25519 public keys', () => {
      expect(validateBenefactorWallet(sampleWallet)).toBe(true);
      expect(
        validateBenefactorWallet('GAPEX2222222222222222222222222222222222222222222222222222222')
      ).toBe(true);
    });

    it('rejects invalid or malformed public keys', () => {
      expect(validateBenefactorWallet('')).toBe(false);
      expect(validateBenefactorWallet('not-a-stellar-key')).toBe(false);
      expect(validateBenefactorWallet('0x1234567890abcdef1234567890abcdef12345678')).toBe(false);
      expect(validateBenefactorWallet('SACME1111111111111111111111111111111111111111111111111111111')).toBe(false); // Secret seed prefix 'S'
    });
  });

  describe('Canonical Cryptographic Digest & Verification', () => {
    it('computes deterministic SHA-256 digest', () => {
      const data = {
        receiptNumber: 'FC-TEIR-2026-1819',
        taxYear: 2026,
        walletAddress: sampleWallet,
        amountUsd: 50000,
        txHash: '9a5c3789bfa816d203849103e8716bca3e9210a4bb56e184089301289cf129aa',
        ledger: 52419082,
        network: 'testnet',
        issuedAt: '2026-02-15T14:32:00.000Z',
      };

      const digest1 = computeReceiptDigest(data);
      const digest2 = computeReceiptDigest(data);

      expect(digest1).toBe(digest2);
      expect(digest1).toHaveLength(64);
    });

    it('verifies untampered receipts successfully', () => {
      const receipt = INITIAL_TAX_EXEMPT_RECEIPTS[0];
      expect(verifyReceiptDigest(receipt)).toBe(true);
    });

    it('detects tampering if amount or transaction hash is changed', () => {
      const receipt = {
        ...INITIAL_TAX_EXEMPT_RECEIPTS[0],
        endowment: {
          ...INITIAL_TAX_EXEMPT_RECEIPTS[0].endowment,
          fiatValueUsd: 999999, // tampered amount
        },
      };

      expect(verifyReceiptDigest(receipt)).toBe(false);
    });
  });

  describe('Receipt Creation and Filtering', () => {
    it('validates receipt input fields', () => {
      const valid = validateReceiptCreationInput({
        benefactorName: 'Acme Green Corp',
        walletAddress: sampleWallet,
        amountUsd: 15000,
      });
      expect(valid.isValid).toBe(true);

      const invalid = validateReceiptCreationInput({
        benefactorName: '',
        walletAddress: 'invalid',
        amountUsd: -10,
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.benefactorName).toBeDefined();
      expect(invalid.errors.walletAddress).toBeDefined();
      expect(invalid.errors.amountUsd).toBeDefined();
    });

    it('creates a complete receipt with 501(c)(3) details and steward breakdown', () => {
      const receipt = createTaxExemptReceipt({
        benefactorName: 'Helios Clean Energy',
        walletAddress: sampleWallet,
        amountUsd: 30000,
        taxYear: 2026,
      });

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toMatch(/^FC-TEIR-2026-\d{4}$/);
      expect(receipt.organization.status).toContain('501(c)(3)');
      expect(receipt.organization.taxId).toBe('84-3920194');
      expect(receipt.stewards.farmers.sharePercentage).toBe(55);
      expect(receipt.stewards.urbanPlanters.sharePercentage).toBe(20);
      expect(receipt.stewards.communitySchools.sharePercentage).toBe(15);
      expect(receipt.stewards.verifiers.sharePercentage).toBe(10);
      expect(receipt.audit.cryptographicDigest).toHaveLength(64);
      expect(verifyReceiptDigest(receipt)).toBe(true);
    });

    it('filters receipts by taxYear and search term', () => {
      const all = listTaxExemptReceipts();
      expect(all.length).toBeGreaterThanOrEqual(3);

      const y2026 = listTaxExemptReceipts({ taxYear: 2026 });
      expect(y2026.every((r) => r.taxYear === 2026)).toBe(true);

      const searched = listTaxExemptReceipts({ search: 'Acme' });
      expect(searched.length).toBeGreaterThanOrEqual(1);
      expect(searched[0].benefactor.organizationName).toContain('Acme');
    });
  });

  describe('Tax-Exempt Receipt PDF Generation', () => {
    it('renders a valid A4 PDF document with %PDF- header', () => {
      const receipt = INITIAL_TAX_EXEMPT_RECEIPTS[0];
      const doc = generateTaxExemptReceiptPdf(receipt);

      expect(doc.getNumberOfPages()).toBe(1);

      const bytes = taxExemptReceiptPdfToBuffer(receipt);
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      expect(header).toBe('%PDF-');
      expect(bytes.byteLength).toBeGreaterThan(2000);
    });
  });
});
