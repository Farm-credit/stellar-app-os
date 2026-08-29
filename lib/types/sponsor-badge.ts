export type SponsorBadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface SponsorBadge {
  id: SponsorBadgeTier;
  name: string;
  description: string;
  threshold: number;
}
