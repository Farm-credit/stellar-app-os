export type BeneficiaryRole = 'farmer' | 'community_steward' | 'urban_planter';

export interface BeneficiaryItem {
  id: string;
  name: string;
  role: BeneficiaryRole;
  region: string;
  avatarUrl?: string;
  treesSupported: number;
  story?: string;
  cropsOrSpecies?: string[];
  joinedYear?: number;
}

export interface SupportedProjectItem {
  id: string;
  name: string;
  location: string;
  category: string;
  standard: string;
  co2Tonnes: number;
  description: string;
  imageUrl?: string;
}

export interface BenefactorImpactMetrics {
  totalTreesFunded: number;
  totalCo2Tonnes: number;
  supportedFarmersCount: number;
  supportedStewardsCount: number;
  activeProjectsCount: number;
}

export interface BenefactorLandingConfig {
  walletAddress: string;
  brandSlug: string;
  brandName: string;
  logoUrl?: string;
  coverImageUrl?: string;
  description: string;
  introduction: string;
  websiteUrl?: string;
  primaryColor?: string;
  isPublished: boolean;
  updatedAt?: string;
}

export interface BenefactorLandingPageData {
  config: BenefactorLandingConfig;
  metrics: BenefactorImpactMetrics;
  beneficiaries: BeneficiaryItem[];
  projects: SupportedProjectItem[];
}
