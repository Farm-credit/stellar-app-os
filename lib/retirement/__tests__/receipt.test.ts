import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBlockchainReceipt,
  getBlockchainReceiptById,
  listBlockchainReceipts,
  verifyBlockchainReceipt,
  clearBlockchainReceiptsStore,
} from '@/lib/retirement/receipt';

describe('Immutable Blockchain Retirement Receipt', () => {
  beforeEach(() => {
    clearBlockchainReceiptsStore();
  });

  it('issues an immutable blockchain receipt with credits retired, project details, co-benefits achieved, and timestamp', () => {
    const receipt = createBlockchainReceipt({
      buyerAddress: 'GBUYERADDRESS1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      organizationName: 'Acme Sustainability Corp',
      quantityRetiredTons: 25,
      reason: 'Q4 Scope 3 emissions offset',
      projectId: 'proj-amazon-001',
      projectName: 'Amazon Rainforest Canopy Restoration',
      projectType: 'Reforestation',
      location: 'Para, Brazil',
      vintageYear: 2025,
      standard: 'Verra VCS',
      coBenefits: ['Biodiversity', 'Water Conservation', 'Indigenous Communities'],
      transactionHash: 'a'.repeat(64),
      ledgerSequence: 51234567,
      network: 'mainnet',
    });

    expect(receipt.isImmutable).toBe(true);
    expect(receipt.creditsRetired).toBe(25);
    expect(receipt.gramsRetired).toBe('25000000');
    expect(receipt.project).toMatchObject({
      id: 'proj-amazon-001',
      name: 'Amazon Rainforest Canopy Restoration',
      type: 'Reforestation',
      location: 'Para, Brazil',
      vintageYear: 2025,
      standard: 'Verra VCS',
    });
    expect(receipt.coBenefits).toHaveLength(3);
    expect(receipt.coBenefits.map((b) => b.category)).toEqual([
      'biodiversity',
      'water',
      'community',
    ]);
    expect(Date.parse(receipt.timestamp)).not.toBeNaN();
    expect(receipt.unixTimestamp).toBeGreaterThan(0);
    expect(receipt.cryptographicDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.explorerUrl).toBe(`https://stellar.expert/explorer/public/tx/${'a'.repeat(64)}`);
    expect(receipt.certificateUrl).toContain(receipt.receiptId);
  });

  it('freezes the receipt and returns the exact same receipt for repeated transactionHash (immutability)', () => {
    const txHash = 'b'.repeat(64);
    const first = createBlockchainReceipt({
      buyerAddress: 'GBUYER123',
      quantityRetiredTons: 10,
      projectId: 'proj-01',
      projectName: 'Mangrove Shield',
      transactionHash: txHash,
    });

    const second = createBlockchainReceipt({
      buyerAddress: 'GBUYER123',
      quantityRetiredTons: 999, // Attempted overwrite must be ignored
      projectId: 'proj-01',
      projectName: 'Tampered Name',
      transactionHash: txHash,
    });

    expect(second).toBe(first);
    expect(second.creditsRetired).toBe(10);
    expect(second.project.name).toBe('Mangrove Shield');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.project)).toBe(true);
    expect(Object.isFrozen(first.coBenefits)).toBe(true);
  });

  it('verifies a valid receipt and detects tampering in credits, project details, co-benefits, or timestamp', () => {
    const receipt = createBlockchainReceipt({
      buyerAddress: 'GBUYER123',
      quantityRetiredTons: 50,
      projectId: 'proj-02',
      projectName: 'Highland Watershed',
      coBenefits: ['Biodiversity', 'Soil Health'],
      transactionHash: 'c'.repeat(64),
    });

    const validResult = verifyBlockchainReceipt(receipt);
    expect(validResult.isValid).toBe(true);
    expect(validResult.verifiedFields).toEqual({
      transactionHashPresent: true,
      creditsBurnedValid: true,
      projectDetailsAttached: true,
      coBenefitsDocumented: true,
      timestampValid: true,
    });

    // Tamper credits retired
    expect(
      verifyBlockchainReceipt({ ...receipt, creditsRetired: 500 }).isValid
    ).toBe(false);

    // Tamper project details
    expect(
      verifyBlockchainReceipt({
        ...receipt,
        project: { ...receipt.project, name: 'Fake Project' },
      }).isValid
    ).toBe(false);

    // Tamper co-benefits
    expect(
      verifyBlockchainReceipt({
        ...receipt,
        coBenefits: [receipt.coBenefits[0]],
      }).isValid
    ).toBe(false);

    // Tamper timestamp
    expect(
      verifyBlockchainReceipt({
        ...receipt,
        timestamp: '2020-01-01T00:00:00.000Z',
      }).isValid
    ).toBe(false);
  });

  it('supports lookup by receiptId or transactionHash and filtering by buyerAddress', () => {
    const tx1 = 'd'.repeat(64);
    const tx2 = 'e'.repeat(64);

    const r1 = createBlockchainReceipt({
      buyerAddress: 'GALICE',
      quantityRetiredTons: 5,
      projectId: 'proj-a',
      transactionHash: tx1,
    });
    const r2 = createBlockchainReceipt({
      buyerAddress: 'GBOB',
      quantityRetiredTons: 12,
      projectId: 'proj-b',
      transactionHash: tx2,
    });

    expect(getBlockchainReceiptById(r1.receiptId)).toBe(r1);
    expect(getBlockchainReceiptById(tx1)).toBe(r1);
    expect(getBlockchainReceiptById('nonexistent')).toBeNull();

    expect(listBlockchainReceipts()).toHaveLength(2);
    expect(listBlockchainReceipts('galice')).toEqual([r1]);
    expect(listBlockchainReceipts('GBOB')).toEqual([r2]);
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      createBlockchainReceipt({
        buyerAddress: '',
        quantityRetiredTons: 5,
        projectId: 'proj-1',
      })
    ).toThrow('buyerAddress');

    expect(() =>
      createBlockchainReceipt({
        buyerAddress: 'GBUYER',
        quantityRetiredTons: 0,
        projectId: 'proj-1',
      })
    ).toThrow('quantityRetiredTons');
  });
});
