export interface CampaignSponsor {
  name: string;
  /** Multiplier applied to donations, e.g. 2 = every $1 donated is matched with $1 more. */
  matchMultiplier: number;
}

export interface Campaign {
  slug: string;
  title: string;
  ecosystem: string;
  location: string;
  description: string;
  /** Biome-specific education content paragraphs (issue #1706). */
  biomeEducation?: string[];
  threats: string[];
  areaHectares: number;
  endangeredSpecies: string[];
  goalUsd: number;
  /** Total raised from individual donors (before matching). */
  raisedUsd: number;
  /** Corporate match multiplier: matched = donations * (multiplier - 1), capped by matchCapUsd. */
  matchMultiplier: number;
  matchCapUsd: number;
  /** Total matching funds committed by corporates. */
  matchFund: number;
  /** Matching funds already consumed. */
  matchUsed: number;
  sponsors: CampaignSponsor[];
  endsAt: string;
  /** Deadline alias used by campaign list page. */
  deadline: string;
  /** Target number of trees to plant. */
  treeTarget: number;
  /** Trees planted so far. */
  treesPlanted: number;
  /** Whether this is an Endangered Biome quarterly campaign (issue #1706). */
  isEndangeredBiome?: boolean;
  /** Campaign quarter label, e.g. "Q1 2027". */
  quarter?: string;
}

export const CAMPAIGNS: Campaign[] = [
  {
    slug: 'save-the-mangrove-coast',
    title: 'Save the Mangrove Coast',
    ecosystem: 'Mangrove Forest',
    location: 'Niger Delta, Nigeria',
    description:
      'Mangrove forests protect coastlines, store up to 10x more carbon than upland forests and nurture fish stocks. Help us restore and protect 1,200 hectares before the next dredging season.',
    biomeEducation: [
      'Mangroves are among the most carbon-dense forests on Earth, sequestering up to 10× more CO₂ per hectare than tropical rainforests due to their deep anaerobic soils.',
      'They act as natural nurseries for over 70% of commercially important fish species, directly sustaining millions of coastal livelihoods across West Africa.',
      'Mangrove root networks dissipate wave energy and protect shorelines from erosion and storm surges, a critical service as sea levels rise.',
    ],
    threats: ['Oil spills', 'Illegal logging', 'Coastal erosion'],
    areaHectares: 1200,
    endangeredSpecies: ['West African manatee', 'Pygmy hippopotamus'],
    goalUsd: 250000,
    raisedUsd: 118400,
    matchMultiplier: 2,
    matchCapUsd: 125000,
    matchFund: 125000,
    matchUsed: 59200,
    sponsors: [{ name: 'BlueRiver Energy', matchMultiplier: 2 }],
    endsAt: '2027-03-01T00:00:00Z',
    deadline: '2027-03-01T00:00:00Z',
    treeTarget: 240000,
    treesPlanted: 96800,
    isEndangeredBiome: true,
    quarter: 'Q1 2027',
  },
  {
    slug: 'protect-the-cloud-forest',
    title: 'Protect the Cloud Forest',
    ecosystem: 'Tropical Montane Cloud Forest',
    location: 'Mount Cameroon, Cameroon',
    description:
      'Cloud forests capture moisture from mist and feed rivers for millions of people. Funds secure community-guarded buffer zones and native reforestation.',
    biomeEducation: [
      'Tropical montane cloud forests exist in a narrow altitude band where persistent mist provides moisture independent of rainfall — making them irreplaceable freshwater towers.',
      'They harbour extraordinary biodiversity: Mount Cameroon alone hosts over 2,400 plant species, including more than 40 endemic to the site.',
      'Less than 1% of the world\'s land surface is covered by cloud forest, yet they are disappearing twice as fast as lowland tropical rainforests.',
    ],
    threats: ['Agricultural expansion', 'Climate change', 'Poaching'],
    areaHectares: 800,
    endangeredSpecies: ['Mountain gorilla', 'Cross River gorilla'],
    goalUsd: 180000,
    raisedUsd: 61200,
    matchMultiplier: 3,
    matchCapUsd: 90000,
    matchFund: 90000,
    matchUsed: 36720,
    sponsors: [
      { name: 'Verdant Tech', matchMultiplier: 3 },
      { name: 'Northwind Capital', matchMultiplier: 3 },
    ],
    endsAt: '2027-05-15T00:00:00Z',
    deadline: '2027-05-15T00:00:00Z',
    treeTarget: 160000,
    treesPlanted: 38250,
    isEndangeredBiome: true,
    quarter: 'Q2 2027',
  },
  {
    slug: 'atlantic-forest-restoration',
    title: 'Atlantic Forest Restoration',
    ecosystem: 'Atlantic Forest',
    location: 'São Paulo State, Brazil',
    description:
      'One of the world\'s most biodiverse biomes, the Brazilian Atlantic Forest has lost over 85% of its original cover. Corporate partners are matching donations to plant native species across degraded agricultural land.',
    biomeEducation: [
      'The Atlantic Forest (Mata Atlântica) once covered 1.5 million km² along Brazil\'s eastern coast. Today fewer than 12% of the original forest remains, fragmented into thousands of patches.',
      'Despite its size reduction, the biome still harbours roughly 8,000 endemic vascular plant species and is home to iconic animals such as the golden lion tamarin and muriqui monkey.',
      'Restoring connectivity between fragments is critical: isolated patches smaller than 100 ha lose species rapidly due to edge effects and lack of genetic exchange.',
    ],
    threats: ['Agriculture', 'Urban sprawl', 'Fragmentation'],
    areaHectares: 650,
    endangeredSpecies: ['Golden lion tamarin', 'Southern muriqui'],
    goalUsd: 210000,
    raisedUsd: 44800,
    matchMultiplier: 2,
    matchCapUsd: 105000,
    matchFund: 105000,
    matchUsed: 22400,
    sponsors: [{ name: 'GreenFuture Corp', matchMultiplier: 2 }],
    endsAt: '2027-08-30T00:00:00Z',
    deadline: '2027-08-30T00:00:00Z',
    treeTarget: 130000,
    treesPlanted: 18600,
    isEndangeredBiome: true,
    quarter: 'Q3 2027',
  },
];

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug);
}

/** Resolve a campaign by its charity partner code (case-insensitive). */
export function getCampaignByCharityCode(code: string): Campaign | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;
  return CAMPAIGNS.find((c) => c.charityCode?.toLowerCase() === normalized);
}

/** All campaigns that have a charity partner attached. */
export function getCharityCampaigns(): Campaign[] {
  return CAMPAIGNS.filter((c) => Boolean(c.charityCode));
}

/** Matched funding contributed by corporate sponsors for the current donations. */
export function getMatchedAmount(campaign: Campaign): number {
  const raw = campaign.raisedUsd * (campaign.matchMultiplier - 1);
  return Math.min(raw, campaign.matchCapUsd);
}

export function getTotalFunding(campaign: Campaign): number {
  return campaign.raisedUsd + getMatchedAmount(campaign);
}

export function getProgressPercent(campaign: Campaign): number {
  return Math.min(100, Math.round((getTotalFunding(campaign) / campaign.goalUsd) * 100));
}

/** Remaining corporate match balance not yet consumed (issue #1706). */
export function getRemainingMatchBalance(campaign: Campaign): number {
  return Math.max(0, (campaign.matchFund ?? campaign.matchCapUsd) - (campaign.matchUsed ?? getMatchedAmount(campaign)));
}

/** Trees still required to meet the campaign target (issue #1706). */
export function getTreesRemaining(campaign: Campaign): number {
  return Math.max(0, campaign.treeTarget - campaign.treesPlanted);
}

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ended: boolean;
}

export function getTimeRemaining(endsAt: string, now: number = Date.now()): TimeRemaining {
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    ended: false,
  };
}
