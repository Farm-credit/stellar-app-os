import { z } from 'zod';

export const sponsorTypeSchema = z.enum(['individual', 'corporate']);
export const leaderboardPeriodSchema = z.enum(['monthly', 'all-time']);
export const leaderboardPreferencesSchema = z
  .object({
    optedIn: z.boolean(),
    displayName: z.string().trim().max(80),
    sponsorType: sponsorTypeSchema,
  })
  .strict()
  .refine((value) => !value.optedIn || value.displayName.length > 0, {
    message: 'Choose a public display name to join the leaderboard.',
    path: ['displayName'],
  });

export type SponsorType = z.infer<typeof sponsorTypeSchema>;
export type LeaderboardPeriod = z.infer<typeof leaderboardPeriodSchema>;
export type LeaderboardPreferences = z.infer<typeof leaderboardPreferencesSchema>;
export interface TreeSponsorEntry {
  rank: number;
  displayName: string;
  trees: number;
}
export interface TreeSponsorSnapshot {
  entries: TreeSponsorEntry[];
  updatedAt: string;
  period: LeaderboardPeriod;
  sponsorType: SponsorType;
}
export const DEFAULT_LEADERBOARD_PREFERENCES: LeaderboardPreferences = {
  optedIn: false,
  displayName: '',
  sponsorType: 'individual',
};
