import type {
  BenefactorLandingConfig,
  BenefactorLandingPageData,
  BeneficiaryItem,
  SupportedProjectItem,
} from '@/lib/types/benefactor-landing';

/**
 * Normalizes a brand name or slug string into a URL-friendly slug.
 */
export function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Validates brand slug format.
 * Must be 2-50 lowercase alphanumeric characters or hyphens, not starting or ending with a hyphen.
 */
export function isValidBrandSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 50;
}

// In-memory registry of benefactor landing configurations, initialized with default seeds
const initialBenefactors: Record<string, BenefactorLandingConfig> = {
  GACME1111111111111111111111111111111111111111111111111111111: {
    walletAddress: 'GACME1111111111111111111111111111111111111111111111111111111',
    brandSlug: 'acme-corp',
    brandName: 'Acme Corp',
    logoUrl: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    coverImageUrl:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&h=500&fit=crop',
    description:
      'Empowering smallholder regenerative agroforestry through corporate climate pledges.',
    introduction:
      'At Acme Corp, we partner with rural farming communities and local stewards to fund resilient agroforestry, restore natural habitats, and drive measurable social and environmental impact.',
    websiteUrl: 'https://acme-example.com',
    primaryColor: '#14B6E7',
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
  GAPEX2222222222222222222222222222222222222222222222222222222: {
    walletAddress: 'GAPEX2222222222222222222222222222222222222222222222222222222',
    brandSlug: 'apex-logistics',
    brandName: 'Apex Logistics Global',
    logoUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=200&h=200&fit=crop',
    coverImageUrl:
      'https://images.unsplash.com/photo-1511497584788-87676104235f?w=1600&h=500&fit=crop',
    description:
      'Offsetting global freight operations through direct community-led mangrove and dryland reforestation.',
    introduction:
      'Apex Logistics is committed to net-positive logistics. Our CSR campaign directly finances community nurseries and supports tree stewards on the frontlines of climate resilience.',
    websiteUrl: 'https://apex-logistics-example.com',
    primaryColor: '#10B981',
    isPublished: true,
    updatedAt: new Date().toISOString(),
  },
};

// Seeded beneficiaries for Acme Corp
const acmeBeneficiaries: BeneficiaryItem[] = [
  {
    id: 'farmer-001',
    name: 'Aminu Musa',
    role: 'farmer',
    region: 'Kano State, Nigeria',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
    treesSupported: 1250,
    cropsOrSpecies: ['Acacia', 'Baobab', 'Millet'],
    joinedYear: 2024,
    story:
      'Supported by Acme Corp CSR funding, Aminu transformed 3.2 hectares of wind-scoured soil into a resilient canopy of indigenous trees protecting his family millet harvest.',
  },
  {
    id: 'steward-001',
    name: 'Amina Bello',
    role: 'community_steward',
    region: 'Kano State, Nigeria',
    avatarUrl:
      'https://images.unsplash.com/photo-1598346762291-aee885f2917e?auto=format&fit=crop&q=80&w=300',
    treesSupported: 3400,
    cropsOrSpecies: ['Moringa', 'Faidherbia albida'],
    joinedYear: 2023,
    story:
      'Leads a 40-member women nursery cooperative, raising drought-tolerant native seedlings with direct stipends funded by corporate CSR pledges.',
  },
  {
    id: 'farmer-002',
    name: 'Grace Mwangi',
    role: 'farmer',
    region: 'Nakuru, Kenya',
    avatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=300',
    treesSupported: 980,
    cropsOrSpecies: ['Macadamia', 'Avocado', 'Grevillea'],
    joinedYear: 2025,
    story:
      'Integrating agroforestry shade trees into hillside coffee gardens, increasing soil moisture retention and family revenue through carbon payouts.',
  },
  {
    id: 'steward-002',
    name: 'Carlos Mendoza',
    role: 'urban_planter',
    region: 'Manaus, Brazil',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
    treesSupported: 2100,
    cropsOrSpecies: ['Andiroba', 'Castanheira'],
    joinedYear: 2024,
    story:
      'Community nursery supervisor overseeing riparian buffer plantings along degraded Amazon tributaries.',
  },
];

// Seeded projects for Acme Corp
const acmeProjects: SupportedProjectItem[] = [
  {
    id: 'proj-001',
    name: 'Amazon Rainforest Restoration',
    location: 'Acre, Brazil',
    category: 'Afforestation & Reforestation',
    standard: 'Verra VCS + CCB Gold',
    co2Tonnes: 180.4,
    description:
      'Restoring critical riparian biodiversity corridors in degraded Amazonian pastureland through native agroforestry.',
    imageUrl:
      'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'proj-002',
    name: 'Kenya Mangrove Restoration',
    location: 'Kilifi Creek, Kenya',
    category: 'Blue Carbon',
    standard: 'Gold Standard',
    co2Tonnes: 142.1,
    description:
      'Protecting coastal fish breeding grounds and shielding local fishing villages from storm surges via community mangrove stewardship.',
    imageUrl:
      'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'proj-003',
    name: 'Sub-Saharan Agroforestry Initiative',
    location: 'Sahel Belt, Nigeria',
    category: 'Agroforestry',
    standard: 'Plan Vivo',
    co2Tonnes: 127.7,
    description:
      'Farmer-managed natural regeneration (FMNR) restoring dryland soil health and multi-tier tree canopies.',
    imageUrl:
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=600',
  },
];

// Seeded beneficiaries for Apex Logistics
const apexBeneficiaries: BeneficiaryItem[] = [
  {
    id: 'farmer-003',
    name: 'Samuel Kiprop',
    role: 'farmer',
    region: 'Rift Valley, Kenya',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
    treesSupported: 1540,
    cropsOrSpecies: ['Acacia senegal', 'Neem'],
    joinedYear: 2024,
    story:
      'Utilizing gum arabic agroforestry to rehabilitate eroded terrace farmland with Apex sponsorship.',
  },
  {
    id: 'steward-003',
    name: 'Maria Dos Santos',
    role: 'community_steward',
    region: 'Pará, Brazil',
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=300',
    treesSupported: 3800,
    cropsOrSpecies: ['Açaí', 'Cupuaçu'],
    joinedYear: 2023,
    story:
      'Coordinates youth environmental education and seed collecting expeditions for local restoration plots.',
  },
];

// In-memory store
const benefactorsByWallet = new Map<string, BenefactorLandingConfig>(
  Object.entries(initialBenefactors)
);

/**
 * Retrieves the benefactor landing configuration by wallet address.
 */
export function getBenefactorConfigByWallet(walletAddress: string): BenefactorLandingConfig | null {
  return benefactorsByWallet.get(walletAddress) ?? null;
}

/**
 * Retrieves the public landing page data for a given brand slug.
 * If requirePublished is true (default), returns null if the page is in draft status.
 */
export function getBenefactorLandingPage(
  brandSlug: string,
  options: { requirePublished?: boolean } = { requirePublished: true }
): BenefactorLandingPageData | null {
  const normalizedSlug = slugifyBrand(decodeURIComponent(brandSlug));

  // Find matching benefactor
  const config = Array.from(benefactorsByWallet.values()).find(
    (item) => item.brandSlug.toLowerCase() === normalizedSlug
  );

  if (!config) {
    return null;
  }

  // Publication check
  if (options.requirePublished !== false && !config.isPublished) {
    return null;
  }

  // Select appropriate beneficiaries and projects
  const isApex = config.brandSlug === 'apex-logistics';
  const beneficiaries = isApex ? apexBeneficiaries : acmeBeneficiaries;
  const projects = isApex
    ? [
        {
          id: 'proj-apex-01',
          name: 'Mombasa Coastal Mangrove Corridor',
          location: 'Mombasa, Kenya',
          category: 'Blue Carbon',
          standard: 'Gold Standard',
          co2Tonnes: 210.0,
          description:
            'Financing 100,000 mangrove propagules to counter harbor degradation and establish sustainable community crab aquaculture.',
          imageUrl:
            'https://images.unsplash.com/photo-1544979590-37e9b47eb705?auto=format&fit=crop&q=80&w=600',
        },
      ]
    : acmeProjects;

  const totalTrees =
    beneficiaries.reduce((sum, b) => sum + b.treesSupported, 0) + (isApex ? 8500 : 12500);
  const totalCo2 = projects.reduce((sum, p) => sum + p.co2Tonnes, 0);

  const metrics = {
    totalTreesFunded: totalTrees,
    totalCo2Tonnes: Number(totalCo2.toFixed(1)),
    supportedFarmersCount: beneficiaries.filter((b) => b.role === 'farmer').length,
    supportedStewardsCount: beneficiaries.filter(
      (b) => b.role === 'community_steward' || b.role === 'urban_planter'
    ).length,
    activeProjectsCount: projects.length,
  };

  return {
    config,
    metrics,
    beneficiaries,
    projects,
  };
}

/**
 * Updates or creates a benefactor landing configuration for an authorized corporate wallet.
 */
export function saveBenefactorConfig(
  walletAddress: string,
  updates: Partial<BenefactorLandingConfig>
): { success: boolean; config?: BenefactorLandingConfig; error?: string } {
  if (!walletAddress || walletAddress.trim().length === 0) {
    return { success: false, error: 'Unauthorized: Wallet address is required.' };
  }

  const existing = benefactorsByWallet.get(walletAddress) ?? {
    walletAddress,
    brandSlug: slugifyBrand(updates.brandName || 'corporate-sponsor'),
    brandName: updates.brandName || 'Corporate Sponsor',
    description: '',
    introduction: '',
    isPublished: false,
    updatedAt: new Date().toISOString(),
  };

  // If brandSlug is being updated, validate it
  let nextSlug = existing.brandSlug;
  if (updates.brandSlug !== undefined) {
    const candidateSlug = updates.brandSlug.trim().toLowerCase();
    if (!isValidBrandSlug(candidateSlug)) {
      return {
        success: false,
        error:
          'Invalid brand slug. Slugs must be 2-50 lowercase alphanumeric characters separated by single hyphens.',
      };
    }

    // Check collision with other benefactors
    const duplicate = Array.from(benefactorsByWallet.values()).find(
      (b) => b.walletAddress !== walletAddress && b.brandSlug.toLowerCase() === candidateSlug
    );

    if (duplicate) {
      return {
        success: false,
        error: 'This brand slug is already claimed by another organization.',
      };
    }

    nextSlug = candidateSlug;
  } else if (updates.brandName && !existing.brandSlug) {
    nextSlug = slugifyBrand(updates.brandName);
  }

  // Brand name validation
  if (updates.brandName !== undefined && updates.brandName.trim().length === 0) {
    return { success: false, error: 'Brand name cannot be empty.' };
  }

  const updatedConfig: BenefactorLandingConfig = {
    ...existing,
    ...updates,
    brandSlug: nextSlug,
    brandName: updates.brandName !== undefined ? updates.brandName.trim() : existing.brandName,
    updatedAt: new Date().toISOString(),
  };

  benefactorsByWallet.set(walletAddress, updatedConfig);

  return { success: true, config: updatedConfig };
}

/**
 * Returns all active published slugs for static generation or sitemap references.
 */
export function getAllPublishedBenefactorSlugs(): string[] {
  return Array.from(benefactorsByWallet.values())
    .filter((b) => b.isPublished)
    .map((b) => b.brandSlug);
}

/**
 * Resets the in-memory store for testing isolation.
 */
export function resetBenefactorStoreForTesting(): void {
  benefactorsByWallet.clear();
  for (const [wallet, config] of Object.entries(initialBenefactors)) {
    benefactorsByWallet.set(wallet, { ...config });
  }
}
