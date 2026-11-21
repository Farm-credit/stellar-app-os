/**
 * Tree health tracking and sponsor alerts (#1698).
 */

/** A health score drop larger than this many points triggers a sponsor alert. */
export const HEALTH_ALERT_DROP_THRESHOLD = 20;

export type TreeHealthCause = 'pest_damage' | 'drought_stress' | 'disease' | 'other';

/** Causes that notify the sponsor when the score drops sharply. */
export const ALERTABLE_HEALTH_CAUSES: readonly TreeHealthCause[] = [
  'pest_damage',
  'drought_stress',
];

export const HEALTH_CAUSE_LABELS: Record<TreeHealthCause, string> = {
  pest_damage: 'pest damage',
  drought_stress: 'drought stress',
  disease: 'disease',
  other: 'an unspecified cause',
};

/** One field team health reading for a tree. */
export interface TreeHealthObservation {
  id: string;
  treeId: string;
  /** Health score from 0 (dead) to 100 (thriving). */
  score: number;
  cause: TreeHealthCause | null;
  /** Steps the field team has taken or is taking. */
  remediation: string[];
  note: string | null;
  /** Photo URLs attached by the field team (#1692). */
  photoUrls?: string[];
  recordedAt: string;
}

export interface PushDeliveryResult {
  sent: number;
  failed: number;
  /** Subscriptions the push service reported as expired and that were removed. */
  removed: number;
  /** True when push is not configured, so nothing was attempted. */
  skipped: boolean;
}

export interface TreeHealthAlert {
  id: string;
  treeId: string;
  sponsorId: string;
  previousScore: number;
  newScore: number;
  drop: number;
  cause: TreeHealthCause;
  remediation: string[];
  title: string;
  body: string;
  /** Tree profile. */
  profileUrl: string;
  /** Tree profile, scrolled to the latest field team update. */
  fieldUpdateUrl: string;
  createdAt: string;
  delivery: PushDeliveryResult;
}

/** JSON the service worker receives and turns into a notification. */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification itself is clicked. */
  url: string;
  tag: string;
  actions: Array<{ action: string; title: string; url: string }>;
}
