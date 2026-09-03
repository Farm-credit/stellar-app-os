import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';

export type { PlanterRegistrationFormData };

/** The four steps of the registration wizard in order */
export type RegistrationStep = 'wallet' | 'profile' | 'regions' | 'review';

export const REGISTRATION_STEPS: RegistrationStep[] = ['wallet', 'profile', 'regions', 'review'];

export const STEP_LABELS: Record<RegistrationStep, string> = {
  wallet: 'Connect Wallet',
  profile: 'Your Profile',
  regions: 'Operating Regions',
  review: 'Review & Submit',
};

/** The curated static list of operating regions available for selection */
export interface OperatingRegion {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const OPERATING_REGIONS: OperatingRegion[] = [
  {
    id: 'sub-saharan-africa',
    label: 'Sub-Saharan Africa',
    emoji: '🌍',
    description: 'Kenya, Tanzania, Uganda, Ethiopia, Ghana, and neighbouring countries',
  },
  {
    id: 'west-africa',
    label: 'West Africa',
    emoji: '🌿',
    description: "Nigeria, Senegal, Côte d'Ivoire, Mali, Burkina Faso",
  },
  {
    id: 'east-africa',
    label: 'East Africa',
    emoji: '🏔️',
    description: 'Kenya, Tanzania, Rwanda, Burundi, Uganda',
  },
  {
    id: 'southern-africa',
    label: 'Southern Africa',
    emoji: '🌱',
    description: 'Mozambique, Zambia, Zimbabwe, Malawi, South Africa',
  },
  {
    id: 'southeast-asia',
    label: 'Southeast Asia',
    emoji: '🌏',
    description: 'Indonesia, Philippines, Vietnam, Cambodia, Myanmar',
  },
  {
    id: 'south-asia',
    label: 'South Asia',
    emoji: '🌾',
    description: 'India, Bangladesh, Nepal, Sri Lanka, Pakistan',
  },
  {
    id: 'latin-america',
    label: 'Latin America',
    emoji: '🌎',
    description: 'Brazil, Colombia, Peru, Ecuador, Bolivia',
  },
  {
    id: 'central-america',
    label: 'Central America',
    emoji: '🌴',
    description: 'Guatemala, Honduras, Nicaragua, Costa Rica, Panama',
  },
];

/** Planter profile as returned by the API after registration */
export interface PlanterProfile {
  id: string;
  walletPublicKey: string;
  displayName: string;
  bio: string;
  profilePhotoIpfsCid: string;
  regions: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

/** Server response from POST /api/planters/register */
export interface RegisterPlanterResponse {
  planterId: string;
  status: 'pending';
}

// ── Planter Reviews ───────────────────────────────────────────────────────

/** Rating categories sponsors can score planting teams on */
export type ReviewCategory = 'quality' | 'responsiveness' | 'treeHealth';

/** A single sponsor review of a planting team */
export interface PlanterReview {
  id: string;
  planterId: string;
  sponsorName: string;
  sponsorAvatarUrl?: string;
  rating: number; // 1-5 overall
  categoryRatings: Record<ReviewCategory, number>;
  comment: string;
  treeSpecies?: string;
  projectId?: string;
  createdAt: string;
}

/** Aggregated review summary for a planter profile */
export interface PlanterReviewSummary {
  averageRating: number;
  totalReviews: number;
  categoryAverages: Record<ReviewCategory, number>;
  ratingDistribution: Record<number, number>; // 1-5 star counts
}

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  quality: 'Planting Quality',
  responsiveness: 'Responsiveness',
  treeHealth: 'Tree Health Outcomes',
};
