import crypto from 'crypto';

export const BULK_MIN_TONS = 100;

export interface VolumeDiscountTier {
  minTons: number;
  maxTons: number | null;
  discountPercentage: number;
  tierName: string;
  badge: string;
}

export const VOLUME_DISCOUNT_TIERS: VolumeDiscountTier[] = [
  {
    minTons: 100,
    maxTons: 499,
    discountPercentage: 10,
    tierName: 'Commercial Bulk (100–499t)',
    badge: '10% OFF',
  },
  {
    minTons: 500,
    maxTons: 999,
    discountPercentage: 18,
    tierName: 'Enterprise Bulk (500–999t)',
    badge: '18% OFF',
  },
  {
    minTons: 1000,
    maxTons: null,
    discountPercentage: 25,
    tierName: 'Institutional Bulk (1,000t+)',
    badge: '25% OFF',
  },
];

export interface BulkPricingResult {
  tons: number;
  basePricePerTon: number;
  isBulkEligible: boolean;
  appliedDiscountPercentage: number;
  effectivePricePerTon: number;
  standardTotalUsd: number;
  bulkTotalUsd: number;
  savingsUsd: number;
  isNegotiatedCustomRate: boolean;
  tierName: string;
}

export type AgreementStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'active'
  | 'completed'
  | 'cancelled';

export interface AgreementFarmer {
  walletAddress: string;
  name: string;
  farmName: string;
  region: string;
  cooperativeName?: string;
}

export interface AgreementBuyer {
  walletAddress: string;
  organizationName: string;
  contactEmail: string;
}

export interface AgreementTerms {
  deliverySchedule: 'immediate' | 'quarterly' | 'harvest_cycle';
  settlementMethod: 'escrow_milestone' | 'upfront_discount' | 'tranche_on_delivery';
  notes?: string;
}

export interface BulkPurchaseAgreement {
  id: string;
  buyer: AgreementBuyer;
  farmer: AgreementFarmer;
  projectId: string;
  projectName: string;
  committedTons: number;
  standardPricePerTon: number;
  negotiatedPricePerTon: number;
  totalValueUsd: number;
  discountPercentage: number;
  status: AgreementStatus;
  terms: AgreementTerms;
  contractHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgreementInput {
  buyer: AgreementBuyer;
  farmer: AgreementFarmer;
  projectId: string;
  projectName: string;
  committedTons: number;
  standardPricePerTon: number;
  negotiatedPricePerTon?: number;
  terms?: Partial<AgreementTerms>;
}

export function calculateBulkPricing(
  tons: number,
  basePricePerTon: number,
  negotiatedPricePerTon?: number
): BulkPricingResult {
  if (tons <= 0 || basePricePerTon <= 0) {
    return {
      tons: Math.max(0, tons),
      basePricePerTon,
      isBulkEligible: false,
      appliedDiscountPercentage: 0,
      effectivePricePerTon: basePricePerTon,
      standardTotalUsd: 0,
      bulkTotalUsd: 0,
      savingsUsd: 0,
      isNegotiatedCustomRate: false,
      tierName: 'Standard Retail (< 100t)',
    };
  }

  const standardTotalUsd = Number((tons * basePricePerTon).toFixed(2));

  // Custom negotiated bulk rate if provided and lower than base price
  if (negotiatedPricePerTon !== undefined && negotiatedPricePerTon > 0) {
    const effectivePrice = Math.min(negotiatedPricePerTon, basePricePerTon);
    const bulkTotalUsd = Number((tons * effectivePrice).toFixed(2));
    const savingsUsd = Number((standardTotalUsd - bulkTotalUsd).toFixed(2));
    const appliedDiscountPercentage = Number(
      (((basePricePerTon - effectivePrice) / basePricePerTon) * 100).toFixed(1)
    );

    return {
      tons,
      basePricePerTon,
      isBulkEligible: tons >= BULK_MIN_TONS,
      appliedDiscountPercentage,
      effectivePricePerTon: effectivePrice,
      standardTotalUsd,
      bulkTotalUsd,
      savingsUsd,
      isNegotiatedCustomRate: true,
      tierName: `Negotiated Bilateral Rate ($${effectivePrice}/t)`,
    };
  }

  // Tier-based volume discount
  if (tons < BULK_MIN_TONS) {
    return {
      tons,
      basePricePerTon,
      isBulkEligible: false,
      appliedDiscountPercentage: 0,
      effectivePricePerTon: basePricePerTon,
      standardTotalUsd,
      bulkTotalUsd: standardTotalUsd,
      savingsUsd: 0,
      isNegotiatedCustomRate: false,
      tierName: 'Standard Retail (< 100t)',
    };
  }

  const tier =
    VOLUME_DISCOUNT_TIERS.find((t) => {
      if (t.maxTons === null) return tons >= t.minTons;
      return tons >= t.minTons && tons <= t.maxTons;
    }) || VOLUME_DISCOUNT_TIERS[0];

  const discountDecimal = tier.discountPercentage / 100;
  const effectivePricePerTon = Number((basePricePerTon * (1 - discountDecimal)).toFixed(2));
  const bulkTotalUsd = Number((tons * effectivePricePerTon).toFixed(2));
  const savingsUsd = Number((standardTotalUsd - bulkTotalUsd).toFixed(2));

  return {
    tons,
    basePricePerTon,
    isBulkEligible: true,
    appliedDiscountPercentage: tier.discountPercentage,
    effectivePricePerTon,
    standardTotalUsd,
    bulkTotalUsd,
    savingsUsd,
    isNegotiatedCustomRate: false,
    tierName: tier.tierName,
  };
}

// In-memory store for agreements initialized with seed agreements
const agreementsStore = new Map<string, BulkPurchaseAgreement>();

// Seed initial bulk agreements for demonstration
const seedAgreementId = 'bpa_stellar_corp_2026_01';
agreementsStore.set(seedAgreementId, {
  id: seedAgreementId,
  buyer: {
    walletAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVVO5',
    organizationName: 'Global Green Logistics Ltd',
    contactEmail: 'sustainability@greenlogistics.com',
  },
  farmer: {
    walletAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
    name: 'Samuel Kiprop',
    farmName: 'Rift Valley Agroforestry Cooperative',
    region: 'Nakuru, Kenya',
    cooperativeName: 'Kenya Green Carbon Farmers Alliance',
  },
  projectId: 'proj-005',
  projectName: 'Sustainable Agriculture - Kenya',
  committedTons: 250,
  standardPricePerTon: 35.0,
  negotiatedPricePerTon: 29.75, // 15% negotiated bulk discount
  totalValueUsd: 7437.5,
  discountPercentage: 15.0,
  status: 'active',
  terms: {
    deliverySchedule: 'quarterly',
    settlementMethod: 'escrow_milestone',
    notes: '250 tons contracted over 2026 planting seasons with direct co-op escrow disbursements.',
  },
  contractHash: 'c4e389bf4d284a1d81a95b87729221bc34e028bcf62740ff30f898de54f89d31',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
});

export function createBulkPurchaseAgreement(input: CreateAgreementInput): BulkPurchaseAgreement {
  if (input.committedTons < BULK_MIN_TONS) {
    throw new Error(
      `Bulk purchase agreements require a minimum batch of ${BULK_MIN_TONS} metric tonnes.`
    );
  }

  const pricing = calculateBulkPricing(
    input.committedTons,
    input.standardPricePerTon,
    input.negotiatedPricePerTon
  );

  const id = `bpa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const contractHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id,
        buyer: input.buyer.walletAddress,
        farmer: input.farmer.walletAddress,
        tons: input.committedTons,
        price: pricing.effectivePricePerTon,
        project: input.projectId,
        createdAt: now,
      })
    )
    .digest('hex');

  const agreement: BulkPurchaseAgreement = {
    id,
    buyer: input.buyer,
    farmer: input.farmer,
    projectId: input.projectId,
    projectName: input.projectName,
    committedTons: input.committedTons,
    standardPricePerTon: input.standardPricePerTon,
    negotiatedPricePerTon: pricing.effectivePricePerTon,
    totalValueUsd: pricing.bulkTotalUsd,
    discountPercentage: pricing.appliedDiscountPercentage,
    status: 'proposed',
    terms: {
      deliverySchedule: input.terms?.deliverySchedule || 'immediate',
      settlementMethod: input.terms?.settlementMethod || 'escrow_milestone',
      notes: input.terms?.notes,
    },
    contractHash,
    createdAt: now,
    updatedAt: now,
  };

  agreementsStore.set(id, agreement);
  return agreement;
}

export function getBulkPurchaseAgreementById(id: string): BulkPurchaseAgreement | null {
  return agreementsStore.get(id) || null;
}

export function listBulkPurchaseAgreements(filters?: {
  buyerAddress?: string;
  farmerAddress?: string;
  status?: string;
  projectId?: string;
}): BulkPurchaseAgreement[] {
  let list = Array.from(agreementsStore.values());

  if (filters?.buyerAddress) {
    list = list.filter(
      (a) => a.buyer.walletAddress.toLowerCase() === filters.buyerAddress?.toLowerCase()
    );
  }
  if (filters?.farmerAddress) {
    list = list.filter(
      (a) => a.farmer.walletAddress.toLowerCase() === filters.farmerAddress?.toLowerCase()
    );
  }
  if (filters?.status) {
    list = list.filter((a) => a.status.toLowerCase() === filters.status?.toLowerCase());
  }
  if (filters?.projectId) {
    list = list.filter((a) => a.projectId === filters.projectId);
  }

  return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function updateBulkAgreementStatus(
  id: string,
  newStatus: AgreementStatus
): BulkPurchaseAgreement {
  const agreement = agreementsStore.get(id);
  if (!agreement) {
    throw new Error(`Agreement with ID '${id}' not found.`);
  }

  const updated: BulkPurchaseAgreement = {
    ...agreement,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  agreementsStore.set(id, updated);
  return updated;
}
