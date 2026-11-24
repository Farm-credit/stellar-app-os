export const FORUM_CATEGORIES = [
  'species-talk',
  'volunteer-meetups',
  'conservation-news',
  'platform-help',
] as const;

export const FORUM_CATEGORY_LABELS: Record<(typeof FORUM_CATEGORIES)[number], string> = {
  'species-talk': 'Species Talk',
  'volunteer-meetups': 'Volunteer Meetups',
  'conservation-news': 'Conservation News',
  'platform-help': 'Platform Help',
};

export type ForumCategory = (typeof FORUM_CATEGORIES)[number];
export type ForumPostStatus = 'published' | 'hidden';

export interface ForumPost {
  id: string;
  authorWallet: string;
  category: ForumCategory;
  title: string;
  body: string;
  tags: string[];
  status: ForumPostStatus;
  voteCount: number;
  hasVoted: boolean;
  createdAt: string;
  moderatedAt: string | null;
}
