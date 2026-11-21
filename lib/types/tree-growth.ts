import type { TreeGrowthStage, TreeSpecies } from './tree';

export type { TreeGrowthStage };

/** A field-team uploaded photo documenting a tree's growth stage. */
export interface GrowthStagePhoto {
  id: string;
  treeId: string;
  stage: TreeGrowthStage;
  imageUrl: string;
  caption?: string;
  /** Name of the field team or team member who uploaded the photo. */
  uploadedBy: string;
  /** ISO timestamp of when the photo was captured/uploaded. */
  uploadedAt: string;
  /** Optional measured height in centimetres at the time of the photo. */
  heightCm?: number;
}

/** Notification sent to a sponsor when their tree transitions to a new growth stage. */
export interface GrowthStageTransitionNotification {
  id: string;
  treeId: string;
  sponsorId: string;
  previousStage: TreeGrowthStage | null;
  newStage: TreeGrowthStage;
  title: string;
  message: string;
  notifiedAt: string;
}

/** Full growth-stage tracking state for a single tree. */
export interface TreeGrowthStageTimeline {
  treeId: string;
  currentStage: TreeGrowthStage;
  /** Field-team uploaded photos sorted chronologically (oldest first). */
  photos: GrowthStagePhoto[];
  /** Sponsor notifications emitted on stage transitions. */
  notifications: GrowthStageTransitionNotification[];
}

/**
 * Sponsor growth-story types for the photo timeline (Issue #1102).
 */

export type GrowthMilestoneType =
  | 'planted'
  | 'first-photo'
  | 'knee-high'
  | 'waist-high'
  | 'first-anniversary'
  | 'canopy-closed'
  | 'verified'
  | 'awaiting-planting';

export interface GrowthMilestone {
  id: string;
  type: GrowthMilestoneType;
  label: string;
  description: string;
  /** Months since planting, when the milestone was reached. */
  monthIndex: number;
  occurredAt: string;
}

export interface GrowthPhoto {
  id: string;
  /** Months since planting. */
  monthIndex: number;
  year: number;
  capturedAt: string;
  imageUrl: string;
  caption: string;
  heightCm: number;
  canopyCm: number;
  trunkMm: number;
  /** Total CO₂ absorbed by this point, in kilograms. */
  cumulativeCo2Kg: number;
  /** Milestone celebrated by this month's photo, when there is one. */
  milestone?: GrowthMilestone;
}

export interface GrowthStoryImpact {
  /** Latest measured height, in centimetres. */
  heightCm: number;
  /** Latest canopy width, in centimetres. */
  canopyCm: number;
  /** Latest trunk diameter, in millimetres. */
  trunkMm: number;
  /** Total CO₂ absorbed since planting, in kilograms. */
  cumulativeCo2Kg: number;
  /** Total CO₂ absorbed since planting, in tonnes. */
  cumulativeCo2Tonnes: number;
  /** CO₂ absorbed over the last 12 months, in kilograms. */
  annualCo2Kg: number;
  /** Whole months of photographic evidence captured. */
  monthsDocumented: number;
  /** Number of milestones reached. */
  milestonesReached: number;
  /** Years of growth covered by the story so far. */
  yearsCovered: number;
}

export interface TreeGrowthTimeline {
  treeId: string;
  species: TreeSpecies;
  region: string;
  projectName: string;
  plantedAt: string | null;
  /** Every month documented so far, oldest first. */
  photos: GrowthPhoto[];
  /** Milestones reached so far, oldest first. */
  milestones: GrowthMilestone[];
  /** Years that have at least one photo, newest first. */
  years: number[];
  impact: GrowthStoryImpact;
  /** True until the tree has a planting date. */
  awaitingPlanting: boolean;
}
