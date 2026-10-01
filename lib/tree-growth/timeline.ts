import type { Tree } from '@/lib/types/tree';
import type {
  GrowthMilestone,
  GrowthMilestoneType,
  GrowthPhoto,
  TreeGrowthTimeline,
} from '@/lib/types/tree-growth';
import {
  GROWTH_TIMELINE_ANCHOR_MS,
  buildMonthlyGrowthSeries,
  type MonthlyGrowthPoint,
} from './model';

/**
 * Builds the sponsor growth story (Issue #1102) for one sponsored tree:
 * a month-by-month photo timeline with milestones and impact metrics.
 */

/**
 * Species-specific evidence photos. Field photos come from planters in
 * production; until then the story uses herbarium-style reference imagery so
 * the timeline renders end to end.
 */
const SPECIES_PHOTO_POOL: Record<string, string[]> = {
  Teak: [
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
  ],
  Moringa: [
    'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=900&q=80',
  ],
  Eucalyptus: [
    'https://images.unsplash.com/photo-1473445361085-b9a07f55608b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=900&q=80',
  ],
  Mangrove: [
    'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  ],
  Acacia: [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80',
  ],
};

const DEFAULT_PHOTO_POOL = [
  'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function photoUrlFor(tree: Tree, monthIndex: number): string {
  const pool = SPECIES_PHOTO_POOL[tree.species] ?? DEFAULT_PHOTO_POOL;
  return pool[monthIndex % pool.length];
}

function formatMonth(ms: number, monthIndex: number): string {
  const date = new Date(ms);
  const month = MONTH_NAMES[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${month} ${year} · month ${monthIndex + 1}`;
}

interface MilestoneCandidates {
  type: GrowthMilestoneType;
  label: string;
  description: string;
  reached: (point: MonthlyGrowthPoint) => boolean;
  /** Skip the milestone once it is this many months behind the latest photo. */
  maxBehindMonths?: number;
}

const MILESTONE_CANDIDATES: MilestoneCandidates[] = [
  {
    type: 'planted',
    label: 'Planted',
    description: 'Your tree was planted at the project site and tagged in the registry.',
    reached: (point) => point.monthIndex === 0,
  },
  {
    type: 'first-photo',
    label: 'First photo',
    description: 'The planter submitted the first field photo of your tree.',
    reached: (point) => point.monthIndex === 1,
  },
  {
    type: 'knee-high',
    label: 'Knee-high',
    description: 'Your tree passed 60 cm — past the survival pinch point for seedlings.',
    reached: (point) => point.heightCm >= 60,
    maxBehindMonths: 6,
  },
  {
    type: 'waist-high',
    label: 'Waist-high',
    description: 'Your tree passed one metre and is now visible above the undergrowth.',
    reached: (point) => point.heightCm >= 100,
    maxBehindMonths: 6,
  },
  {
    type: 'first-anniversary',
    label: 'First anniversary',
    description: 'One full year in the ground — your tree survived its first dry season.',
    reached: (point) => point.monthIndex === 12,
  },
  {
    type: 'canopy-closed',
    label: 'Canopy closed',
    description: 'The canopy passed 3 m and now shades the soil beneath it.',
    reached: (point) => point.canopyCm >= 300,
    maxBehindMonths: 6,
  },
];

function buildMilestones(points: MonthlyGrowthPoint[], tree: Tree): GrowthMilestone[] {
  const latest = points[points.length - 1];
  const milestones: GrowthMilestone[] = [];

  for (const candidate of MILESTONE_CANDIDATES) {
    const point = points.find((entry) => candidate.reached(entry));
    if (!point) continue;
    if (
      candidate.maxBehindMonths !== undefined &&
      latest.monthIndex - point.monthIndex > candidate.maxBehindMonths
    ) {
      // A tree that is already taller never "just" crossed a threshold; keep
      // the growth story focused on milestones that land near a photo.
      continue;
    }

    milestones.push({
      id: `${tree.id}-${candidate.type}`,
      type: candidate.type,
      label: candidate.label,
      description: candidate.description,
      monthIndex: point.monthIndex,
      occurredAt: new Date(point.capturedAtMs).toISOString(),
    });
  }

  if (tree.status === 'verified' || tree.status === 'completed') {
    milestones.push({
      id: `${tree.id}-verified`,
      type: 'verified',
      label: 'Verified',
      description: 'An independent verifier confirmed the planting evidence.',
      monthIndex: latest.monthIndex,
      occurredAt: new Date(latest.capturedAtMs).toISOString(),
    });
  }

  return milestones;
}

function emptyTimeline(tree: Tree): TreeGrowthTimeline {
  const awaiting: GrowthMilestone = {
    id: `${tree.id}-awaiting-planting`,
    type: 'awaiting-planting',
    label: 'Awaiting planting',
    description: 'Your sponsorship is confirmed. Photos begin once the tree is in the ground.',
    monthIndex: 0,
    occurredAt:
      GROWTH_TIMELINE_ANCHOR_MS === 0 ? '' : new Date(GROWTH_TIMELINE_ANCHOR_MS).toISOString(),
  };

  return {
    treeId: tree.treeId,
    species: tree.species,
    region: tree.region,
    projectName: tree.projectName,
    plantedAt: null,
    photos: [],
    milestones: [awaiting],
    years: [],
    impact: {
      heightCm: 0,
      canopyCm: 0,
      trunkMm: 0,
      cumulativeCo2Kg: 0,
      cumulativeCo2Tonnes: 0,
      annualCo2Kg: 0,
      monthsDocumented: 0,
      milestonesReached: 0,
      yearsCovered: 0,
    },
    awaitingPlanting: true,
  };
}

/**
 * Builds the full growth story for a tree. Returns an "awaiting planting"
 * timeline when the tree has no planting date yet.
 */
export function buildTreeGrowthTimeline(tree: Tree): TreeGrowthTimeline {
  if (!tree.plantedAt) return emptyTimeline(tree);

  const plantedAtMs = new Date(tree.plantedAt).getTime();
  if (!Number.isFinite(plantedAtMs)) return emptyTimeline(tree);

  const points = buildMonthlyGrowthSeries(tree.species, plantedAtMs, tree.id);
  if (points.length === 0) return emptyTimeline(tree);

  const milestones = buildMilestones(points, tree);

  // When a growth threshold and a calendar event land on the same month, the
  // calendar event is the story people remember — let it own the photo. Map
  // insertion order decides the winner, so date-based milestones go last.
  const dateMilestones = new Set<GrowthMilestoneType>([
    'planted',
    'first-photo',
    'first-anniversary',
    'verified',
  ]);
  const milestoneByMonth = new Map(
    [...milestones]
      .sort((a, b) => Number(dateMilestones.has(a.type)) - Number(dateMilestones.has(b.type)))
      .map((milestone) => [milestone.monthIndex, milestone])
  );

  const photos: GrowthPhoto[] = points.map((point) => ({
    id: `${tree.id}-month-${point.monthIndex}`,
    monthIndex: point.monthIndex,
    year: point.year,
    capturedAt: new Date(point.capturedAtMs).toISOString(),
    imageUrl: photoUrlFor(tree, point.monthIndex),
    caption: formatMonth(point.capturedAtMs, point.monthIndex),
    heightCm: point.heightCm,
    canopyCm: point.canopyCm,
    trunkMm: point.trunkMm,
    cumulativeCo2Kg: point.cumulativeCo2Kg,
    milestone: milestoneByMonth.get(point.monthIndex),
  }));

  const latest = points[points.length - 1];
  const years = [...new Set(photos.map((photo) => photo.year))].sort((a, b) => b - a);

  return {
    treeId: tree.treeId,
    species: tree.species,
    region: tree.region,
    projectName: tree.projectName,
    plantedAt: new Date(plantedAtMs).toISOString(),
    photos,
    milestones,
    years,
    impact: {
      heightCm: latest.heightCm,
      canopyCm: latest.canopyCm,
      trunkMm: latest.trunkMm,
      cumulativeCo2Kg: latest.cumulativeCo2Kg,
      cumulativeCo2Tonnes: Math.round((latest.cumulativeCo2Kg / 1000) * 100) / 100,
      annualCo2Kg: latest.annualCo2Kg,
      monthsDocumented: photos.length,
      milestonesReached: milestones.length,
      yearsCovered: latest.year + 1,
    },
    awaitingPlanting: false,
  };
}
