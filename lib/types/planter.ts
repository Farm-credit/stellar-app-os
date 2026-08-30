/**
 * Type definitions for the Planter Profiles feature (Issue #1150).
 *
 * Detailed profiles of the people planting and caring for sponsored trees, so
 * sponsors can learn about the background, expertise and community work behind
 * the projects they support and connect directly with the planters.
 */

export interface PlanterCommunityWork {
  /** Title of the community initiative, e.g. "Youth agroforestry club" */
  title: string;
  description: string;
  /** ISO year the initiative was founded */
  since?: number;
  /** Optional external reference */
  link?: string;
}

export interface PlanterStats {
  /** Approximate number of trees planted to date */
  treesPlanted: number;
  /** Number of projects the planter has worked on */
  projectsJoined: number;
  /** Years of hands-on planting experience */
  yearsExperience: number;
  /** Survival rate across verified plots (0–100), null if unmeasured */
  survivalRate: number | null;
  /** Community members engaged through their work */
  communityMembersEngaged: number;
}

export interface PlanterSocialLinks {
  twitter?: string;
  linkedin?: string;
  instagram?: string;
}

export interface PlanterProfile {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  /** Role / title, e.g. "Lead Agroforester" */
  role: string;
  /** Whether the planter is open to sponsor connections */
  availableForConnections: boolean;
  /** Average response time text, e.g. "Responds within 2 days" */
  responseTime?: string;
  avatarUrl: string;
  coverPhotoUrl?: string;
  /** Region + country, e.g. "Kano State, Nigeria" */
  location: string;
  country: string;
  /** Languages spoken */
  languages: string[];
  /** Short one-line summary shown in cards */
  tagline: string;
  /** Longer narrative background */
  background: string;
  /** Areas of expertise, e.g. "Agroforestry", "Soil regeneration" */
  expertise: string[];
  /** Community work / initiatives */
  communityWork: PlanterCommunityWork[];
  /** Professional / livelihood certifications */
  certifications: string[];
  /** Quantitative record */
  stats: PlanterStats;
  /** Project IDs this planter is (or has been) involved with */
  projectIds: string[];
  /** Display names of associated projects (for cards/quick view) */
  associatedProjects: string[];
  /** ISO date the planter joined the platform */
  joinedDate: string;
  isFeatured: boolean;
  socialLinks?: PlanterSocialLinks;
}
