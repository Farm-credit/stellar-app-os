/**
 * Planting partner organisations (#1643).
 *
 * Seed data for the public partner directory. Replace `PLANTING_PARTNERS` with a
 * database/API lookup without changing the page components.
 */

export type CertificationBody = 'FSC' | 'Rainforest Alliance' | 'Verra' | 'Gold Standard' | 'PEFC';

export const CERTIFICATION_DESCRIPTIONS: Record<CertificationBody, string> = {
  FSC: 'Forest Stewardship Council: responsible forest management',
  'Rainforest Alliance': 'Rainforest Alliance: biodiversity and community-focused land use',
  Verra: 'Verra: verified carbon standard',
  'Gold Standard': 'Gold Standard: climate and sustainable development impact',
  PEFC: 'PEFC: sustainable forest management certification',
};

export interface PartnerCertification {
  body: CertificationBody;
  /** Year the certification was first awarded. */
  since: number;
  /** ISO date the certification expires, if it has an expiry. */
  validUntil?: string;
}

export interface PartnerProject {
  id: string;
  name: string;
  location: string;
  treesPlanted: number;
  status: 'active' | 'completed';
}

export interface PlantingPartner {
  slug: string;
  name: string;
  region: string;
  founded: number;
  summary: string;
  certifications: PartnerCertification[];
  projects: PartnerProject[];
  /** Fraction (0-1) of planted trees verified alive at the last survival check. */
  survivalRate: number;
  /** Trees planted via the platform, including projects not listed above. */
  treesPlantedViaPlatform: number;
}

export const PLANTING_PARTNERS: PlantingPartner[] = [
  {
    slug: 'sahel-restoration-collective',
    name: 'Sahel Restoration Collective',
    region: 'Kano, Nigeria',
    founded: 2012,
    summary:
      'A farmer-led collective restoring degraded savanna land across northern Nigeria with native and agroforestry species.',
    certifications: [
      { body: 'FSC', since: 2016, validUntil: '2028-06-30' },
      { body: 'Gold Standard', since: 2019 },
    ],
    projects: [
      {
        id: 'ssr-1',
        name: 'Northern Savanna Reforestation',
        location: 'Kano',
        treesPlanted: 18200,
        status: 'active',
      },
      {
        id: 'ssr-2',
        name: 'Shea Parkland Renewal',
        location: 'Katsina',
        treesPlanted: 6400,
        status: 'completed',
      },
    ],
    survivalRate: 0.91,
    treesPlantedViaPlatform: 24600,
  },
  {
    slug: 'niger-delta-mangrove-trust',
    name: 'Niger Delta Mangrove Trust',
    region: 'Bayelsa, Nigeria',
    founded: 2015,
    summary:
      'Community nurseries and planting crews rebuilding mangrove belts that protect coastal villages from erosion.',
    certifications: [
      { body: 'Rainforest Alliance', since: 2018, validUntil: '2027-12-31' },
      { body: 'Verra', since: 2020 },
    ],
    projects: [
      {
        id: 'ndm-1',
        name: 'Coastal Mangrove Shield',
        location: 'Bayelsa',
        treesPlanted: 12800,
        status: 'active',
      },
    ],
    survivalRate: 0.84,
    treesPlantedViaPlatform: 12800,
  },
  {
    slug: 'central-belt-agroforestry-network',
    name: 'Central Belt Agroforestry Network',
    region: 'Kaduna, Nigeria',
    founded: 2009,
    summary:
      'Smallholder cooperatives planting mixed timber and fruit trees to restore soil and diversify farm income.',
    certifications: [
      { body: 'FSC', since: 2014, validUntil: '2027-03-31' },
      { body: 'Rainforest Alliance', since: 2017 },
      { body: 'PEFC', since: 2021 },
    ],
    projects: [
      {
        id: 'cba-1',
        name: 'Central Belt Afforestation',
        location: 'Kaduna',
        treesPlanted: 21500,
        status: 'active',
      },
      {
        id: 'cba-2',
        name: 'Cashew Smallholder Programme',
        location: 'Kogi',
        treesPlanted: 9300,
        status: 'completed',
      },
    ],
    survivalRate: 0.88,
    treesPlantedViaPlatform: 30800,
  },
];

export function getPartnerBySlug(slug: string): PlantingPartner | undefined {
  return PLANTING_PARTNERS.find((p) => p.slug === slug);
}

export function getAllPartnerSlugs(): string[] {
  return PLANTING_PARTNERS.map((p) => p.slug);
}

export function sumProjectTrees(partner: PlantingPartner): number {
  return partner.projects.reduce((sum, p) => sum + p.treesPlanted, 0);
}

/** A certification is current when it has no expiry or has not yet expired. */
export function isCertificationCurrent(cert: PartnerCertification, now = new Date()): boolean {
  return !cert.validUntil || new Date(cert.validUntil).getTime() >= now.getTime();
}

/** Sponsor checkout link that routes funding to a specific partner. */
export function buildPartnerSponsorUrl(slug: string): string {
  return `/donate/trees?partner=${encodeURIComponent(slug)}`;
}
