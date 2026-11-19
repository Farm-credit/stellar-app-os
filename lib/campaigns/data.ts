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
  threats: string[];
  areaHectares: number;
  endangeredSpecies: string[];
  goalUsd: number;
  /** Total raised from individual donors (before matching). */
  raisedUsd: number;
  /** Corporate match multiplier: matched = donations * (multiplier - 1), capped by matchCapUsd. */
  matchMultiplier: number;
  matchCapUsd: number;
  sponsors: CampaignSponsor[];
  endsAt: string;
}

export const CAMPAIGNS: Campaign[] = [
  {
    slug: 'save-the-mangrove-coast',
    title: 'Save the Mangrove Coast',
    ecosystem: 'Mangrove Forest',
    location: 'Niger Delta, Nigeria',
    description:
      'Mangrove forests protect coastlines, store up to 10x more carbon than upland forests and nurture fish stocks. Help us restore and protect 1,200 hectares before the next dredging season.',
    threats: ['Oil spills', 'Illegal logging', 'Coastal erosion'],
    areaHectares: 1200,
    endangeredSpecies: ['West African manatee', 'Pygmy hippopotamus'],
    goalUsd: 250000,
    raisedUsd: 118400,
    matchMultiplier: 2,
    matchCapUsd: 125000,
    sponsors: [{ name: 'BlueRiver Energy', matchMultiplier: 2 }],
    endsAt: '2027-03-01T00:00:00Z',
  },
  {
    slug: 'protect-the-cloud-forest',
    title: 'Protect the Cloud Forest',
    ecosystem: 'Tropical Montane Cloud Forest',
    location: 'Mount Cameroon, Cameroon',
    description:
      'Cloud forests capture moisture from mist and feed rivers for millions of people. Funds secure community-guarded buffer zones and native reforestation.',
    threats: ['Agricultural expansion', 'Climate change', 'Poaching'],
    areaHectares: 800,
    endangeredSpecies: ['Mountain gorilla', 'Cross River gorilla'],
    goalUsd: 180000,
    raisedUsd: 61200,
    matchMultiplier: 3,
    matchCapUsd: 90000,
    sponsors: [
      { name: 'Verdant Tech', matchMultiplier: 3 },
      { name: 'Northwind Capital', matchMultiplier: 3 },
    ],
    endsAt: '2027-05-15T00:00:00Z',
  },
];

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug);
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
