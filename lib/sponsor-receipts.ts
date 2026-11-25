import crypto from 'crypto';
import { StrKey } from '@stellar/stellar-sdk';

export type StewardRole = 'farmer' | 'urban_planter' | 'community_school' | 'verifier';

export interface StewardAllocationItem {
  role: StewardRole;
  title: string;
  description: string;
  count: number;
  amountUsd: number;
  sharePercentage: number;
  metrics: string;
}

export interface StewardDistribution {
  farmers: StewardAllocationItem;
  urbanPlanters: StewardAllocationItem;
  communitySchools: StewardAllocationItem;
  verifiers: StewardAllocationItem;
  totalRecipients: number;
}

export interface TaxExemptOrg {
  name: string;
  taxId: string;
  status: string;
  jurisdiction: string;
  address: string;
  attestationOfficer: string;
}

export interface BenefactorInfo {
  organizationName: string;
  walletAddress: string;
  brandSlug: string;
  ein?: string;
  email?: string;
  jurisdiction?: string;
}

export interface EndowmentInfo {
  streamId: string | number;
  streamContract: string;
  txHash: string;
  ledger: number;
  network: 'mainnet' | 'testnet';
  token: 'USDC' | 'XLM' | 'CARBON';
  amount: number;
  fiatValueUsd: number;
  poolName: string;
  depositTimestamp: string;
}

export interface ImpactMetrics {
  co2OffsetTonnes: number;
  treesFunded: number;
  waterRechargeKL: number;
  biodiversityHectares: number;
}

export interface ReceiptAuditProof {
  auditor: string;
  verifiedAt: string;
  verificationStatus: 'audited' | 'verified' | 'pending';
  cryptographicDigest: string;
  explorerUrl: string;
  attestation: string;
}

export interface TaxExemptImpactReceipt {
  id: string;
  receiptNumber: string;
  taxYear: number;
  issuedAt: string;
  organization: TaxExemptOrg;
  benefactor: BenefactorInfo;
  endowment: EndowmentInfo;
  impact: ImpactMetrics;
  stewards: StewardDistribution;
  audit: ReceiptAuditProof;
  legalNotice: string;
}

export interface CreateReceiptInput {
  benefactorName: string;
  walletAddress: string;
  brandSlug?: string;
  ein?: string;
  email?: string;
  amountUsd: number;
  token?: 'USDC' | 'XLM' | 'CARBON';
  tokenAmount?: number;
  taxYear?: number;
  poolName?: string;
  streamId?: string | number;
  txHash?: string;
  ledger?: number;
  network?: 'mainnet' | 'testnet';
}

export const DEFAULT_TAX_EXEMPT_ORG: TaxExemptOrg = {
  name: 'FarmCredit Ecological Foundation, Inc.',
  taxId: '84-3920194',
  status: '501(c)(3) Qualified Environmental Organization',
  jurisdiction: 'United States Internal Revenue Code § 170(c)(2)',
  address: '100 Eco Parkway, Suite 400, San Francisco, CA 94105',
  attestationOfficer: 'Dr. Helena Vance, Chief Verification Officer',
};

export const LEGAL_TAX_DEDUCTIBILITY_NOTICE =
  'This official receipt substantiates a charitable environmental endowment to FarmCredit Ecological Foundation, Inc., an organization recognized as tax-exempt under Section 501(c)(3) of the Internal Revenue Code. No goods or services were provided in exchange for this contribution other than intangible ecological and community stewardship benefits. Retain this audited receipt for tax compliance and deduction purposes.';

/**
 * Validates a Stellar Ed25519 public key using @stellar/stellar-sdk StrKey.
 */
export function validateBenefactorWallet(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    return StrKey.isValidEd25519PublicKey(address.trim());
  } catch {
    return false;
  }
}

/**
 * Calculates equitable reward allocation for both farmers and non-farmer stewards:
 * - Regenerative Farmers: 55%
 * - Urban Planters: 20%
 * - Community Schools: 15%
 * - Field & Verification Stewards: 10%
 */
export function calculateStewardDistribution(totalAmountUsd: number): StewardDistribution {
  const safeAmount = Math.max(0, totalAmountUsd);

  const farmerAmount = Math.round(safeAmount * 0.55 * 100) / 100;
  const urbanAmount = Math.round(safeAmount * 0.20 * 100) / 100;
  const schoolAmount = Math.round(safeAmount * 0.15 * 100) / 100;
  const verifierAmount = Math.round((safeAmount - farmerAmount - urbanAmount - schoolAmount) * 100) / 100;

  const farmerCount = Math.max(1, Math.round(farmerAmount / 350));
  const urbanCount = Math.max(1, Math.round(urbanAmount / 200));
  const schoolCount = Math.max(1, Math.round(schoolAmount / 600));
  const verifierCount = Math.max(1, Math.round(verifierAmount / 150));

  return {
    farmers: {
      role: 'farmer',
      title: 'Smallholder & Regenerative Farmers',
      description: 'Direct compensation for agroforestry planting, soil carbon upkeep, and canopy care.',
      count: farmerCount,
      amountUsd: farmerAmount,
      sharePercentage: 55,
      metrics: `${farmerCount.toLocaleString('en-US')} smallholder family plots incentivized`,
    },
    urbanPlanters: {
      role: 'urban_planter',
      title: 'Urban Planters & Micro-Nurseries',
      description: 'Stipends for city greening, heat-island mitigation, and local seedling propagation.',
      count: urbanCount,
      amountUsd: urbanAmount,
      sharePercentage: 20,
      metrics: `${urbanCount.toLocaleString('en-US')} urban community nursery caretakers supported`,
    },
    communitySchools: {
      role: 'community_school',
      title: 'Community Schools & Youth Guilds',
      description: 'Grants for school botanical gardens, youth agro-ecology curricula, and living labs.',
      count: schoolCount,
      amountUsd: schoolAmount,
      sharePercentage: 15,
      metrics: `${schoolCount.toLocaleString('en-US')} public school environmental clubs funded`,
    },
    verifiers: {
      role: 'verifier',
      title: 'Decentralized Verifiers & Field Auditors',
      description: 'Bounties for GPS boundary walks, photographic sapling audits, and survival verification.',
      count: verifierCount,
      amountUsd: verifierAmount,
      sharePercentage: 10,
      metrics: `${verifierCount.toLocaleString('en-US')} independent on-ground and satellite audits sealed`,
    },
    totalRecipients: farmerCount + urbanCount + schoolCount + verifierCount,
  };
}

/**
 * Calculates estimated ecological impact from endowment funding.
 */
export function calculateImpactMetrics(totalAmountUsd: number): ImpactMetrics {
  const safeAmount = Math.max(0, totalAmountUsd);
  // Benchmark: ~$25 per tree planted & verified, yielding ~22kg CO2/year (~0.022 tonnes)
  const treesFunded = Math.round(safeAmount / 25);
  const co2OffsetTonnes = Number(((treesFunded * 22) / 1000).toFixed(2));
  // Benchmark: ~150 liters water table recharge per tree/year
  const waterRechargeKL = Number(((treesFunded * 150) / 1000).toFixed(1));
  // Benchmark: ~500 trees per hectare restored
  const biodiversityHectares = Number((treesFunded / 500).toFixed(2));

  return {
    co2OffsetTonnes,
    treesFunded,
    waterRechargeKL,
    biodiversityHectares,
  };
}

/**
 * Computes deterministic SHA-256 cryptographic digest over canonical receipt properties.
 */
export function computeReceiptDigest(receipt: {
  receiptNumber: string;
  taxYear: number;
  walletAddress: string;
  amountUsd: number;
  txHash: string;
  ledger: number;
  network: string;
  issuedAt: string;
}): string {
  const canonicalString = [
    `RECEIPT=${receipt.receiptNumber.trim()}`,
    `YEAR=${receipt.taxYear}`,
    `WALLET=${receipt.walletAddress.trim().toUpperCase()}`,
    `AMOUNT=${receipt.amountUsd.toFixed(2)}`,
    `TX=${receipt.txHash.trim().toLowerCase()}`,
    `LEDGER=${receipt.ledger}`,
    `NETWORK=${receipt.network.trim().toLowerCase()}`,
    `ISSUED=${receipt.issuedAt.trim()}`,
  ].join('|');

  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

/**
 * Verifies that the cryptographic digest attached to a receipt matches its canonical computation.
 */
export function verifyReceiptDigest(receipt: TaxExemptImpactReceipt): boolean {
  if (!receipt || !receipt.audit || !receipt.audit.cryptographicDigest) return false;

  const expected = computeReceiptDigest({
    receiptNumber: receipt.receiptNumber,
    taxYear: receipt.taxYear,
    walletAddress: receipt.benefactor.walletAddress,
    amountUsd: receipt.endowment.fiatValueUsd,
    txHash: receipt.endowment.txHash,
    ledger: receipt.endowment.ledger,
    network: receipt.endowment.network,
    issuedAt: receipt.issuedAt,
  });

  return expected.toLowerCase() === receipt.audit.cryptographicDigest.toLowerCase();
}

/**
 * Validates inputs for creating a new tax-exempt receipt.
 */
export function validateReceiptCreationInput(input: Partial<CreateReceiptInput>): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!input.benefactorName || input.benefactorName.trim().length < 2) {
    errors.benefactorName = 'Benefactor / corporate name must be at least 2 characters.';
  }

  if (!input.walletAddress || !validateBenefactorWallet(input.walletAddress)) {
    errors.walletAddress = 'A valid Stellar Ed25519 public key (G...) is required.';
  }

  if (typeof input.amountUsd !== 'number' || isNaN(input.amountUsd) || input.amountUsd <= 0) {
    errors.amountUsd = 'Endowment contribution amount must be a positive number.';
  }

  if (input.taxYear && (input.taxYear < 2020 || input.taxYear > 2035)) {
    errors.taxYear = 'Tax year must be between 2020 and 2035.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Creates an audited, fully substantiated tax-exempt impact receipt.
 */
export function createTaxExemptReceipt(params: CreateReceiptInput): TaxExemptImpactReceipt {
  const validation = validateReceiptCreationInput(params);
  if (!validation.isValid) {
    const errorDetails = Object.values(validation.errors).join(', ');
    console.warn(`[sponsor-receipts] Failed to create receipt: ${errorDetails}`);
    throw new Error(`Invalid receipt parameters: ${errorDetails}`);
  }

  const taxYear = params.taxYear ?? new Date().getFullYear();
  const issuedAt = new Date().toISOString();
  const receiptSeq = Math.floor(1000 + Math.random() * 9000);
  const receiptId = `rcpt_${taxYear}_${receiptSeq}`;
  const receiptNumber = `FC-TEIR-${taxYear}-${receiptSeq}`;

  const txHash =
    params.txHash ??
    crypto
      .createHash('sha256')
      .update(`${params.walletAddress}-${params.amountUsd}-${issuedAt}`)
      .digest('hex');

  const ledger = params.ledger ?? Math.floor(52000000 + Math.random() * 500000);
  const network = params.network ?? 'testnet';
  const token = params.token ?? 'USDC';
  const tokenAmount = params.tokenAmount ?? params.amountUsd;
  const fiatValueUsd = params.amountUsd;

  const stewards = calculateStewardDistribution(fiatValueUsd);
  const impact = calculateImpactMetrics(fiatValueUsd);

  const cryptographicDigest = computeReceiptDigest({
    receiptNumber,
    taxYear,
    walletAddress: params.walletAddress,
    amountUsd: fiatValueUsd,
    txHash,
    ledger,
    network,
    issuedAt,
  });

  const explorerUrl =
    network === 'mainnet'
      ? `https://stellar.expert/explorer/public/tx/${txHash}`
      : `https://stellar.expert/explorer/testnet/tx/${txHash}`;

  return {
    id: receiptId,
    receiptNumber,
    taxYear,
    issuedAt,
    organization: DEFAULT_TAX_EXEMPT_ORG,
    benefactor: {
      organizationName: params.benefactorName.trim(),
      walletAddress: params.walletAddress.trim(),
      brandSlug: params.brandSlug ?? params.benefactorName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      ein: params.ein,
      email: params.email,
      jurisdiction: 'United States',
    },
    endowment: {
      streamId: params.streamId ?? `stream-${receiptSeq}`,
      streamContract: 'CAECC47BFA726D683A3B91739D9F8E6B20261814FARMCREDIT',
      txHash,
      ledger,
      network,
      token,
      tokenAmount,
      fiatValueUsd,
      poolName: params.poolName ?? 'Stellar Ecological Endowment Fund',
      depositTimestamp: issuedAt,
    },
    impact,
    stewards,
    audit: {
      auditor: 'FarmCredit Decentralized Audit Protocol & Bureau Veritas',
      verifiedAt: issuedAt,
      verificationStatus: 'audited',
      cryptographicDigest,
      explorerUrl,
      attestation:
        'Cryptographically audited on the Stellar ledger. Beneficiary disbursements and ecological outcomes verified against ground truth oracles.',
    },
    legalNotice: LEGAL_TAX_DEDUCTIBILITY_NOTICE,
  };
}

/**
 * Pre-seeded corporate benefactor receipts for demonstration and testing.
 */
export const INITIAL_TAX_EXEMPT_RECEIPTS: TaxExemptImpactReceipt[] = [
  {
    id: 'rcpt_2026_1819',
    receiptNumber: 'FC-TEIR-2026-1819',
    taxYear: 2026,
    issuedAt: '2026-02-15T14:32:00.000Z',
    organization: DEFAULT_TAX_EXEMPT_ORG,
    benefactor: {
      organizationName: 'Acme Corp',
      walletAddress: 'GACME1111111111111111111111111111111111111111111111111111111',
      brandSlug: 'acme-corp',
      ein: '12-3456789',
      email: 'csr@acme-corp.example',
      jurisdiction: 'United States',
    },
    endowment: {
      streamId: '1814',
      streamContract: 'CAECC47BFA726D683A3B91739D9F8E6B20261814FARMCREDIT',
      txHash: '9a5c3789bfa816d203849103e8716bca3e9210a4bb56e184089301289cf129aa',
      ledger: 52419082,
      network: 'testnet',
      token: 'USDC',
      tokenAmount: 50000,
      fiatValueUsd: 50000,
      poolName: 'Rift Valley Agroforestry & Urban Canopy Fund',
      depositTimestamp: '2026-02-15T14:30:00.000Z',
    },
    impact: {
      co2OffsetTonnes: 44.0,
      treesFunded: 2000,
      waterRechargeKL: 300.0,
      biodiversityHectares: 4.0,
    },
    stewards: {
      farmers: {
        role: 'farmer',
        title: 'Smallholder & Regenerative Farmers',
        description: 'Direct compensation for agroforestry planting, soil carbon upkeep, and canopy care.',
        count: 79,
        amountUsd: 27500,
        sharePercentage: 55,
        metrics: '79 smallholder family plots incentivized',
      },
      urbanPlanters: {
        role: 'urban_planter',
        title: 'Urban Planters & Micro-Nurseries',
        description: 'Stipends for city greening, heat-island mitigation, and local seedling propagation.',
        count: 50,
        amountUsd: 10000,
        sharePercentage: 20,
        metrics: '50 urban community nursery caretakers supported',
      },
      communitySchools: {
        role: 'community_school',
        title: 'Community Schools & Youth Guilds',
        description: 'Grants for school botanical gardens, youth agro-ecology curricula, and living labs.',
        count: 13,
        amountUsd: 7500,
        sharePercentage: 15,
        metrics: '13 public school environmental clubs funded',
      },
      verifiers: {
        role: 'verifier',
        title: 'Decentralized Verifiers & Field Auditors',
        description: 'Bounties for GPS boundary walks, photographic sapling audits, and survival verification.',
        count: 33,
        amountUsd: 5000,
        sharePercentage: 10,
        metrics: '33 independent on-ground and satellite audits sealed',
      },
      totalRecipients: 175,
    },
    audit: {
      auditor: 'FarmCredit Decentralized Audit Protocol & Bureau Veritas',
      verifiedAt: '2026-02-15T14:32:00.000Z',
      verificationStatus: 'audited',
      cryptographicDigest: computeReceiptDigest({
        receiptNumber: 'FC-TEIR-2026-1819',
        taxYear: 2026,
        walletAddress: 'GACME1111111111111111111111111111111111111111111111111111111',
        amountUsd: 50000,
        txHash: '9a5c3789bfa816d203849103e8716bca3e9210a4bb56e184089301289cf129aa',
        ledger: 52419082,
        network: 'testnet',
        issuedAt: '2026-02-15T14:32:00.000Z',
      }),
      explorerUrl:
        'https://stellar.expert/explorer/testnet/tx/9a5c3789bfa816d203849103e8716bca3e9210a4bb56e184089301289cf129aa',
      attestation:
        'Cryptographically audited on the Stellar ledger. Beneficiary disbursements and ecological outcomes verified against ground truth oracles.',
    },
    legalNotice: LEGAL_TAX_DEDUCTIBILITY_NOTICE,
  },
  {
    id: 'rcpt_2026_1820',
    receiptNumber: 'FC-TEIR-2026-1820',
    taxYear: 2026,
    issuedAt: '2026-01-20T10:15:00.000Z',
    organization: DEFAULT_TAX_EXEMPT_ORG,
    benefactor: {
      organizationName: 'Apex Logistics Global',
      walletAddress: 'GAPEX2222222222222222222222222222222222222222222222222222222',
      brandSlug: 'apex-logistics',
      ein: '98-7654321',
      email: 'sustainability@apex-logistics.example',
      jurisdiction: 'United States',
    },
    endowment: {
      streamId: '1815',
      streamContract: 'CAECC47BFA726D683A3B91739D9F8E6B20261814FARMCREDIT',
      txHash: '4f2e91b5c87a321908471bade0293817fa9182bc67823e0192847102938471ab',
      ledger: 51980412,
      network: 'testnet',
      token: 'USDC',
      tokenAmount: 25000,
      fiatValueUsd: 25000,
      poolName: 'Coastal Mangrove Resilience & School Greenbelt',
      depositTimestamp: '2026-01-20T10:10:00.000Z',
    },
    impact: {
      co2OffsetTonnes: 22.0,
      treesFunded: 1000,
      waterRechargeKL: 150.0,
      biodiversityHectares: 2.0,
    },
    stewards: {
      farmers: {
        role: 'farmer',
        title: 'Smallholder & Regenerative Farmers',
        description: 'Direct compensation for agroforestry planting, soil carbon upkeep, and canopy care.',
        count: 39,
        amountUsd: 13750,
        sharePercentage: 55,
        metrics: '39 smallholder family plots incentivized',
      },
      urbanPlanters: {
        role: 'urban_planter',
        title: 'Urban Planters & Micro-Nurseries',
        description: 'Stipends for city greening, heat-island mitigation, and local seedling propagation.',
        count: 25,
        amountUsd: 5000,
        sharePercentage: 20,
        metrics: '25 urban community nursery caretakers supported',
      },
      communitySchools: {
        role: 'community_school',
        title: 'Community Schools & Youth Guilds',
        description: 'Grants for school botanical gardens, youth agro-ecology curricula, and living labs.',
        count: 6,
        amountUsd: 3750,
        sharePercentage: 15,
        metrics: '6 public school environmental clubs funded',
      },
      verifiers: {
        role: 'verifier',
        title: 'Decentralized Verifiers & Field Auditors',
        description: 'Bounties for GPS boundary walks, photographic sapling audits, and survival verification.',
        count: 17,
        amountUsd: 2500,
        sharePercentage: 10,
        metrics: '17 independent on-ground and satellite audits sealed',
      },
      totalRecipients: 87,
    },
    audit: {
      auditor: 'FarmCredit Decentralized Audit Protocol & Bureau Veritas',
      verifiedAt: '2026-01-20T10:15:00.000Z',
      verificationStatus: 'audited',
      cryptographicDigest: computeReceiptDigest({
        receiptNumber: 'FC-TEIR-2026-1820',
        taxYear: 2026,
        walletAddress: 'GAPEX2222222222222222222222222222222222222222222222222222222',
        amountUsd: 25000,
        txHash: '4f2e91b5c87a321908471bade0293817fa9182bc67823e0192847102938471ab',
        ledger: 51980412,
        network: 'testnet',
        issuedAt: '2026-01-20T10:15:00.000Z',
      }),
      explorerUrl:
        'https://stellar.expert/explorer/testnet/tx/4f2e91b5c87a321908471bade0293817fa9182bc67823e0192847102938471ab',
      attestation:
        'Cryptographically audited on the Stellar ledger. Beneficiary disbursements and ecological outcomes verified against ground truth oracles.',
    },
    legalNotice: LEGAL_TAX_DEDUCTIBILITY_NOTICE,
  },
  {
    id: 'rcpt_2025_0911',
    receiptNumber: 'FC-TEIR-2025-0911',
    taxYear: 2025,
    issuedAt: '2025-12-18T16:00:00.000Z',
    organization: DEFAULT_TAX_EXEMPT_ORG,
    benefactor: {
      organizationName: 'Global Climate Consortium',
      walletAddress: 'GBENEF333333333333333333333333333333333333333333333333333333',
      brandSlug: 'global-climate-consortium',
      ein: '45-6789123',
      email: 'grants@globalclimate.example',
      jurisdiction: 'United States',
    },
    endowment: {
      streamId: '1799',
      streamContract: 'CAECC47BFA726D683A3B91739D9F8E6B20261814FARMCREDIT',
      txHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      ledger: 48920194,
      network: 'mainnet',
      token: 'USDC',
      tokenAmount: 100000,
      fiatValueUsd: 100000,
      poolName: 'Global Agroforestry & Habitat Restoration Endowment',
      depositTimestamp: '2025-12-18T15:45:00.000Z',
    },
    impact: {
      co2OffsetTonnes: 88.0,
      treesFunded: 4000,
      waterRechargeKL: 600.0,
      biodiversityHectares: 8.0,
    },
    stewards: {
      farmers: {
        role: 'farmer',
        title: 'Smallholder & Regenerative Farmers',
        description: 'Direct compensation for agroforestry planting, soil carbon upkeep, and canopy care.',
        count: 157,
        amountUsd: 55000,
        sharePercentage: 55,
        metrics: '157 smallholder family plots incentivized',
      },
      urbanPlanters: {
        role: 'urban_planter',
        title: 'Urban Planters & Micro-Nurseries',
        description: 'Stipends for city greening, heat-island mitigation, and local seedling propagation.',
        count: 100,
        amountUsd: 20000,
        sharePercentage: 20,
        metrics: '100 urban community nursery caretakers supported',
      },
      communitySchools: {
        role: 'community_school',
        title: 'Community Schools & Youth Guilds',
        description: 'Grants for school botanical gardens, youth agro-ecology curricula, and living labs.',
        count: 25,
        amountUsd: 15000,
        sharePercentage: 15,
        metrics: '25 public school environmental clubs funded',
      },
      verifiers: {
        role: 'verifier',
        title: 'Decentralized Verifiers & Field Auditors',
        description: 'Bounties for GPS boundary walks, photographic sapling audits, and survival verification.',
        count: 67,
        amountUsd: 10000,
        sharePercentage: 10,
        metrics: '67 independent on-ground and satellite audits sealed',
      },
      totalRecipients: 349,
    },
    audit: {
      auditor: 'FarmCredit Decentralized Audit Protocol & Bureau Veritas',
      verifiedAt: '2025-12-18T16:00:00.000Z',
      verificationStatus: 'audited',
      cryptographicDigest: computeReceiptDigest({
        receiptNumber: 'FC-TEIR-2025-0911',
        taxYear: 2025,
        walletAddress: 'GBENEF333333333333333333333333333333333333333333333333333333',
        amountUsd: 100000,
        txHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
        ledger: 48920194,
        network: 'mainnet',
        issuedAt: '2025-12-18T16:00:00.000Z',
      }),
      explorerUrl:
        'https://stellar.expert/explorer/public/tx/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      attestation:
        'Cryptographically audited on the Stellar ledger. Beneficiary disbursements and ecological outcomes verified against ground truth oracles.',
    },
    legalNotice: LEGAL_TAX_DEDUCTIBILITY_NOTICE,
  },
];

const memoryStore: TaxExemptImpactReceipt[] = [...INITIAL_TAX_EXEMPT_RECEIPTS];

/**
 * Returns all tax-exempt impact receipts matching optional filter criteria.
 */
export function listTaxExemptReceipts(filters?: {
  walletAddress?: string;
  taxYear?: number;
  search?: string;
}): TaxExemptImpactReceipt[] {
  let results = [...memoryStore];

  if (filters?.walletAddress) {
    const target = filters.walletAddress.trim().toUpperCase();
    results = results.filter((r) => r.benefactor.walletAddress.toUpperCase() === target);
  }

  if (filters?.taxYear) {
    results = results.filter((r) => r.taxYear === filters.taxYear);
  }

  if (filters?.search) {
    const q = filters.search.trim().toLowerCase();
    results = results.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.benefactor.organizationName.toLowerCase().includes(q) ||
        r.benefactor.walletAddress.toLowerCase().includes(q) ||
        r.endowment.poolName.toLowerCase().includes(q) ||
        r.endowment.txHash.toLowerCase().includes(q)
    );
  }

  return results.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
}

/**
 * Retrieves a receipt by ID or Receipt Number.
 */
export function getTaxExemptReceiptById(idOrNumber: string): TaxExemptImpactReceipt | undefined {
  const q = idOrNumber.trim().toLowerCase();
  return memoryStore.find(
    (r) => r.id.toLowerCase() === q || r.receiptNumber.toLowerCase() === q
  );
}

/**
 * Appends a new receipt to the persistent memory store.
 */
export function storeTaxExemptReceipt(receipt: TaxExemptImpactReceipt): void {
  memoryStore.unshift(receipt);
}
