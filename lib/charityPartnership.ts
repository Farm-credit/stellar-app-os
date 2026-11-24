export interface CharityPartnership {
  partnerId: string;
  charityName: string;
  logoUrl?: string;
}

const CHARITY_PARTNERSHIPS: Record<string, CharityPartnership> = {};

export function getCharityPartnership(partnerId: string): CharityPartnership | undefined {
  return CHARITY_PARTNERSHIPS[partnerId];
}
