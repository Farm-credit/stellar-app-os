export interface CorporateMatchPledge {
  corporateName: string;
  matchTarget: number;
  matchRemaining: number;
  multiplier: number;
  currency: string;
}

export interface EducationSection {
  title: string;
  body: string;
}

export interface Campaign {
  slug: string;
  title: string;
  biome: string;
  ecosystem: string;
  quarter: string;
  location: string;
  deadline: string;
  treesTarget: number;
  treesRemaining: number;
  raised: number;
  isEndangeredBiome: boolean;
  educationContent: EducationSection[];
  corporateMatches: CorporateMatchPledge[];
}

export const CAMPAIGNS: Campaign[] = [
  {
    slug: 'mangrove-guardians-q3',
    title: 'Mangrove Guardians: Restoring the Coastal Shield',
    biome: 'Mangrove Forest',
    ecosystem: 'Coastal Mangrove Wetland',
    quarter: 'Q3 2025',
    location: 'Sundarbans Delta, Bangladesh',
    deadline: '2025-09-30T23:59:59Z',
    treesTarget: 250000,
    treesRemaining: 87500,
    raised: 162500,
    isEndangeredBiome: true,
    educationContent: [
      {
        title: 'Why Mangroves Matter',
        body: 'Mangrove forests are among the most carbon-dense ecosystems on Earth, storing up to five times more carbon per hectare than terrestrial forests. Their tangled root systems buffer coastlines against storm surges and tsunamis, protecting millions of coastal communities.',
      },
      {
        title: 'A Critically Threatened Ecosystem',
        body: 'More than a third of the world\u2019s mangrove forests have been lost in the past fifty years due to aquaculture expansion, coastal development, and pollution. The Sundarbans, the largest contiguous mangrove forest on Earth, continues to shrink at an alarming rate.',
      },
      {
        title: 'How Your Trees Help',
        body: 'Every tree planted in this campaign restores critical habitat for endangered species such as the Bengal tiger and the fishing cat, while rebuilding natural coastal defenses. Local community nurseries raise native mangrove propagules, creating sustainable livelihoods alongside ecological restoration.',
      },
    ],
    corporateMatches: [
      {
        corporateName: 'BlueWave Logistics',
        matchTarget: 50000,
        matchRemaining: 21500,
        multiplier: 2,
        currency: 'USD',
      },
      {
        corporateName: 'Coastal Trust Foundation',
        matchTarget: 25000,
        matchRemaining: 25000,
        multiplier: 1,
        currency: 'USD',
      },
    ],
  },
  {
    slug: 'cloud-forest-rescue-q4',
    title: 'Cloud Forest Rescue: Saving the Misty Canopy',
    biome: 'Tropical Montane Cloud Forest',
    ecosystem: 'Neotropical Cloud Forest',
    quarter: 'Q4 2025',
    location: 'Monteverde, Costa Rica',
    deadline: '2025-12-31T23:59:59Z',
    treesTarget: 120000,
    treesRemaining: 120000,
    raised: 0,
    isEndangeredBiome: true,
    educationContent: [
      {
        title: 'The Vanishing Mist',
        body: 'Cloud forests depend on persistent fog and mist to sustain their extraordinary biodiversity. Rising temperatures are pushing cloud layers to higher altitudes, leaving these fragile ecosystems literally high and dry.',
      },
      {
        title: 'Biodiversity Hotspots',
        body: 'Though they cover less than one percent of global forest area, cloud forests harbor a disproportionate share of the world\u2019s species, including countless endemic amphibians, orchids, and the resplendent quetzal.',
      },
      {
        title: 'Restoring the Canopy',
        body: 'This campaign focuses on reconnecting fragmented cloud forest patches through native tree corridors, allowing species to migrate and genetic diversity to flow between isolated populations.',
      },
    ],
    corporateMatches: [
      {
        corporateName: 'Evergreen Capital Partners',
        matchTarget: 40000,
        matchRemaining: 40000,
        multiplier: 2,
        currency: 'USD',
      },
    ],
  },
];

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((campaign) => campaign.slug === slug);
}

export function getProgressPercent(campaign: Campaign): number {
  if (campaign.treesTarget <= 0) {
    return 0;
  }
  const planted = campaign.treesTarget - campaign.treesRemaining;
  const percent = (planted / campaign.treesTarget) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function getRemainingMatchBalance(campaign: Campaign): number {
  return campaign.corporateMatches.reduce(
    (total, pledge) => total + pledge.matchRemaining,
    0,
  );
}

export function getTreesRemaining(campaign: Campaign): number {
  return campaign.treesRemaining;
}