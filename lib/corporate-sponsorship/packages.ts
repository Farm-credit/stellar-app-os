export type BulkPackageQuantity = 10 | 50 | 100 | 500;

export interface BulkSponsorshipPackage {
  id: string;
  name: string;
  quantity: BulkPackageQuantity;
  discountPercent: number;
  badge?: string;
  description: string;
  features: string[];
}

export interface BulkOrderQuote {
  quantity: number;
  packageId: string;
  packageName: string;
  baseUnitPriceUsd: number;
  discountPercent: number;
  discountedUnitPriceUsd: number;
  subtotalUsd: number;
  discountAmountUsd: number;
  totalUsd: number;
  estimatedCo2KgPerYear: number;
}

export interface CorporateBranding {
  companyName: string;
  tagline?: string;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string;
}

export type SponsoredTreeStatus = 'planted' | 'verified' | 'growing';

export interface SponsoredTreeRecord {
  id: string;
  treeCode: string;
  orderId: string;
  species: string;
  region: string;
  plantedAt: string;
  status: SponsoredTreeStatus;
  co2OffsetKgPerYear: number;
  assignedEmployee?: string;
  assignedEmployeeEmail?: string;
}

export interface CorporateOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  branding: CorporateBranding;
  quote: BulkOrderQuote;
  trees: SponsoredTreeRecord[];
}

export interface EmployeeCertificateRecipient {
  name: string;
  email?: string;
  department?: string;
  treeCount: number;
  treeCodes?: string[];
}

export interface CorporateImpactSummary {
  totalTrees: number;
  totalOrders: number;
  totalSpendUsd: number;
  totalSavingsUsd: number;
  annualCo2OffsetKg: number;
  uniqueSpecies: number;
  uniqueRegions: number;
}

export const BASE_TREE_PRICE_USD = 25;
export const CO2_KG_PER_TREE_PER_YEAR = 22;

export const BULK_SPONSORSHIP_PACKAGES: readonly BulkSponsorshipPackage[] = [
  {
    id: 'starter-10',
    name: 'Team Grove',
    quantity: 10,
    discountPercent: 5,
    description: 'Ideal for small teams, quarterly milestones, or client appreciation.',
    features: [
      '10 verified native trees',
      'Branded corporate impact dashboard',
      'Co-branded employee PDF certificates',
    ],
  },
  {
    id: 'growth-50',
    name: 'Department Forest',
    quantity: 50,
    discountPercent: 10,
    badge: 'Popular',
    description: 'Built for growing organizations celebrating company-wide initiatives.',
    features: [
      '50 verified native trees',
      '10% volume discount',
      'Branded impact dashboard & tree registry',
      'Bulk downloadable co-branded PDFs',
    ],
  },
  {
    id: 'enterprise-100',
    name: 'Corporate Canopy',
    quantity: 100,
    discountPercent: 15,
    badge: 'Best Value',
    description: 'Comprehensive ESG impact package for mid-size and enterprise teams.',
    features: [
      '100 verified native trees',
      '15% volume discount',
      'Custom brand color theming',
      'Multi-recipient bulk PDF certificate pack',
    ],
  },
  {
    id: 'impact-500',
    name: 'Global Sanctuary',
    quantity: 500,
    discountPercent: 25,
    badge: 'Max Savings',
    description: 'Flagship corporate reforestation tier with maximum volume savings.',
    features: [
      '500 verified native trees',
      '25% volume discount',
      'Full tree-level GPS & species ledger',
      'Unlimited co-branded employee certificates',
    ],
  },
] as const;

const TREE_SPECIES = [
  'Mangrove (Rhizophora mangle)',
  'African Mahogany (Khaya senegalensis)',
  'Shea Tree (Vitellaria paradoxa)',
  'Acacia (Acacia senegal)',
  'Moringa (Moringa oleifera)',
] as const;

const PLANTING_REGIONS = [
  'Cross River, Nigeria',
  'Rift Valley, Kenya',
  'Kilimanjaro, Tanzania',
  'Ashanti, Ghana',
  'Western Cape, South Africa',
] as const;

export function getPackageForQuantity(quantity: number): BulkSponsorshipPackage {
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error('Quantity must be a positive number.');
  }

  const exact = BULK_SPONSORSHIP_PACKAGES.find((pkg) => pkg.quantity === quantity);
  if (exact) return exact;

  // Fallback to the highest tier whose quantity is <= requested quantity.
  const sorted = [...BULK_SPONSORSHIP_PACKAGES].sort((a, b) => b.quantity - a.quantity);
  return sorted.find((pkg) => quantity >= pkg.quantity) ?? BULK_SPONSORSHIP_PACKAGES[0];
}

export function calculateBulkOrderQuote(
  quantity: number,
  baseUnitPriceUsd: number = BASE_TREE_PRICE_USD
): BulkOrderQuote {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Quantity must be a positive integer.');
  }
  if (!Number.isFinite(baseUnitPriceUsd) || baseUnitPriceUsd <= 0) {
    throw new Error('Base unit price must be a positive number.');
  }

  const pkg = getPackageForQuantity(quantity);
  const discountPercent = quantity >= 10 ? pkg.discountPercent : 0;
  const subtotalUsd = roundCurrency(quantity * baseUnitPriceUsd);
  const discountAmountUsd = roundCurrency((subtotalUsd * discountPercent) / 100);
  const totalUsd = roundCurrency(subtotalUsd - discountAmountUsd);
  const discountedUnitPriceUsd = roundCurrency(totalUsd / quantity);

  return {
    quantity,
    packageId: pkg.id,
    packageName: pkg.name,
    baseUnitPriceUsd,
    discountPercent,
    discountedUnitPriceUsd,
    subtotalUsd,
    discountAmountUsd,
    totalUsd,
    estimatedCo2KgPerYear: quantity * CO2_KG_PER_TREE_PER_YEAR,
  };
}

export function generateSponsoredTrees(
  orderId: string,
  orderNumber: string,
  quantity: number,
  plantedAt: string
): SponsoredTreeRecord[] {
  const trees: SponsoredTreeRecord[] = [];
  for (let i = 0; i < quantity; i++) {
    const seq = String(i + 1).padStart(4, '0');
    const species = TREE_SPECIES[i % TREE_SPECIES.length];
    const region = PLANTING_REGIONS[i % PLANTING_REGIONS.length];
    const status: SponsoredTreeStatus =
      i % 3 === 0 ? 'verified' : i % 3 === 1 ? 'growing' : 'planted';

    trees.push({
      id: `${orderId}-tree-${seq}`,
      treeCode: `${orderNumber}-T${seq}`,
      orderId,
      species,
      region,
      plantedAt,
      status,
      co2OffsetKgPerYear: CO2_KG_PER_TREE_PER_YEAR,
    });
  }
  return trees;
}

export function createCorporateOrder(params: {
  quantity: number;
  branding: CorporateBranding;
  createdAt?: string;
  orderNumber?: string;
}): CorporateOrder {
  const companyName = params.branding.companyName.trim();
  if (!companyName) {
    throw new Error('Company name is required.');
  }

  const createdAt = params.createdAt ?? new Date().toISOString();
  const quote = calculateBulkOrderQuote(params.quantity);
  const id = `corp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const orderNumber =
    params.orderNumber ??
    `CORP-${new Date(createdAt).getUTCFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const branding: CorporateBranding = {
    companyName,
    tagline: params.branding.tagline?.trim() || 'Growing a Greener Future Together',
    primaryColor: isValidHexColor(params.branding.primaryColor)
      ? params.branding.primaryColor
      : '#166534',
    secondaryColor: isValidHexColor(params.branding.secondaryColor)
      ? params.branding.secondaryColor
      : '#0f766e',
    contactEmail: params.branding.contactEmail.trim(),
  };

  const trees = generateSponsoredTrees(id, orderNumber, quote.quantity, createdAt);

  return {
    id,
    orderNumber,
    createdAt,
    branding,
    quote,
    trees,
  };
}

export function computeCorporateImpactSummary(orders: CorporateOrder[]): CorporateImpactSummary {
  const allTrees = orders.flatMap((o) => o.trees);
  const speciesSet = new Set(allTrees.map((t) => t.species));
  const regionSet = new Set(allTrees.map((t) => t.region));

  return {
    totalTrees: allTrees.length,
    totalOrders: orders.length,
    totalSpendUsd: roundCurrency(orders.reduce((sum, o) => sum + o.quote.totalUsd, 0)),
    totalSavingsUsd: roundCurrency(orders.reduce((sum, o) => sum + o.quote.discountAmountUsd, 0)),
    annualCo2OffsetKg: allTrees.reduce((sum, t) => sum + t.co2OffsetKgPerYear, 0),
    uniqueSpecies: speciesSet.size,
    uniqueRegions: regionSet.size,
  };
}

export function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
