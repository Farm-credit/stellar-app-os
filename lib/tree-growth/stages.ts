import type { Tree, TreeGrowthStage } from '@/lib/types/tree';
import type {
  GrowthStagePhoto,
  GrowthStageTransitionNotification,
  TreeGrowthStageTimeline,
} from '@/lib/types/tree-growth';

export const GROWTH_STAGE_ORDER: readonly TreeGrowthStage[] = [
  'sapling',
  'juvenile',
  'mature',
] as const;

export const GROWTH_STAGE_LABELS: Record<TreeGrowthStage, string> = {
  sapling: 'Sapling',
  juvenile: 'Juvenile',
  mature: 'Mature',
};

export const GROWTH_STAGE_DESCRIPTIONS: Record<TreeGrowthStage, string> = {
  sapling: 'Newly planted young tree establishing its root system.',
  juvenile: 'Actively growing tree developing trunk strength and canopy.',
  mature: 'Fully established tree delivering peak carbon sequestration.',
};

const STAGE_PHOTO_DEFAULTS: Record<TreeGrowthStage, { imageUrl: string; caption: string; heightCm: number }> = {
  sapling: {
    imageUrl:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=900&q=80',
    caption: 'Sapling stage verified by field team after planting.',
    heightCm: 45,
  },
  juvenile: {
    imageUrl:
      'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=900&q=80',
    caption: 'Juvenile stage reached with strong stem and expanding foliage.',
    heightCm: 165,
  },
  mature: {
    imageUrl:
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
    caption: 'Mature canopy established and confirmed during field inspection.',
    heightCm: 420,
  },
};

export function isValidGrowthStage(value: unknown): value is TreeGrowthStage {
  return value === 'sapling' || value === 'juvenile' || value === 'mature';
}

/**
 * Derives a tree's growth stage from its explicit `growthStage` property
 * or falls back to its age since `plantedAt`:
 *   - < 2 years  -> sapling
 *   - 2–5 years  -> juvenile
 *   - >= 5 years -> mature
 */
export function deriveGrowthStage(
  tree: Pick<Tree, 'growthStage' | 'plantedAt'>,
  nowMs: number = Date.now()
): TreeGrowthStage {
  if (tree.growthStage && isValidGrowthStage(tree.growthStage)) {
    return tree.growthStage;
  }

  if (!tree.plantedAt) {
    return 'sapling';
  }

  const plantedMs = new Date(tree.plantedAt).getTime();
  if (!Number.isFinite(plantedMs)) {
    return 'sapling';
  }

  const ageYears = (nowMs - plantedMs) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears >= 5) return 'mature';
  if (ageYears >= 2) return 'juvenile';
  return 'sapling';
}

/**
 * Sorts field-team uploaded photos chronologically (oldest first).
 */
export function sortStagePhotosChronologically(photos: GrowthStagePhoto[]): GrowthStagePhoto[] {
  return [...photos].sort((a, b) => {
    const timeDiff = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return GROWTH_STAGE_ORDER.indexOf(a.stage) - GROWTH_STAGE_ORDER.indexOf(b.stage);
  });
}

interface TreeStageStoreRecord {
  currentStage: TreeGrowthStage;
  photos: GrowthStagePhoto[];
  notifications: GrowthStageTransitionNotification[];
}

const stageStore = new Map<string, TreeStageStoreRecord>();

function seedTreeRecord(treeId: string, tree?: Tree): TreeStageStoreRecord {
  const currentStage = tree ? deriveGrowthStage(tree) : 'sapling';
  const currentStageIndex = GROWTH_STAGE_ORDER.indexOf(currentStage);
  const baseMs = tree?.plantedAt
    ? new Date(tree.plantedAt).getTime()
    : Date.UTC(2024, 0, 15);
  const safeBaseMs = Number.isFinite(baseMs) ? baseMs : Date.UTC(2024, 0, 15);
  const teamName = tree?.region ? `${tree.region} Field Team` : 'Field Monitoring Team';

  const stageOffsetsMs: Record<TreeGrowthStage, number> = {
    sapling: 14 * 24 * 60 * 60 * 1000, // +14 days
    juvenile: 2 * 365 * 24 * 60 * 60 * 1000, // +2 years
    mature: 5 * 365 * 24 * 60 * 60 * 1000, // +5 years
  };

  const photos: GrowthStagePhoto[] = GROWTH_STAGE_ORDER.slice(0, currentStageIndex + 1).map(
    (stage) => {
      const defaults = STAGE_PHOTO_DEFAULTS[stage];
      return {
        id: `${treeId}-stage-${stage}-seed`,
        treeId,
        stage,
        imageUrl: stage === 'sapling' && tree?.imageUrl ? tree.imageUrl : defaults.imageUrl,
        caption: defaults.caption,
        uploadedBy: teamName,
        uploadedAt: new Date(safeBaseMs + stageOffsetsMs[stage]).toISOString(),
        heightCm: defaults.heightCm,
      };
    }
  );

  return {
    currentStage,
    photos: sortStagePhotosChronologically(photos),
    notifications: [],
  };
}

function getOrCreateRecord(treeId: string, tree?: Tree): TreeStageStoreRecord {
  const existing = stageStore.get(treeId);
  if (existing) return existing;
  const seeded = seedTreeRecord(treeId, tree);
  stageStore.set(treeId, seeded);
  return seeded;
}

export function getTreeGrowthStageTimeline(
  treeId: string,
  tree?: Tree
): TreeGrowthStageTimeline {
  const record = getOrCreateRecord(treeId, tree);
  return {
    treeId,
    currentStage: record.currentStage,
    photos: sortStagePhotosChronologically(record.photos),
    notifications: [...record.notifications],
  };
}

export interface UploadGrowthStagePhotoInput {
  treeId: string;
  stage: TreeGrowthStage;
  imageUrl: string;
  uploadedBy: string;
  caption?: string;
  heightCm?: number;
  uploadedAt?: string;
  sponsorId?: string;
}

export interface UploadGrowthStagePhotoResult {
  photo: GrowthStagePhoto;
  currentStage: TreeGrowthStage;
  previousStage: TreeGrowthStage;
  transitioned: boolean;
  notification: GrowthStageTransitionNotification | null;
}

/**
 * Records a new field-team photo for a tree's growth stage.
 * When the uploaded photo moves the tree into a different growth stage,
 * updates `currentStage` and creates a sponsor transition notification.
 */
export function uploadGrowthStagePhoto(
  input: UploadGrowthStagePhotoInput,
  tree?: Tree
): UploadGrowthStagePhotoResult {
  const record = getOrCreateRecord(input.treeId, tree);
  const previousStage = record.currentStage;
  const uploadedAt = input.uploadedAt ?? new Date().toISOString();

  const photo: GrowthStagePhoto = {
    id: `${input.treeId}-stage-${input.stage}-${Date.now()}-${record.photos.length + 1}`,
    treeId: input.treeId,
    stage: input.stage,
    imageUrl: input.imageUrl.trim(),
    caption: input.caption?.trim() || undefined,
    uploadedBy: input.uploadedBy.trim(),
    uploadedAt,
    heightCm: input.heightCm,
  };

  record.photos = sortStagePhotosChronologically([...record.photos, photo]);

  const transitioned = input.stage !== previousStage;
  let notification: GrowthStageTransitionNotification | null = null;

  if (transitioned) {
    record.currentStage = input.stage;
    const sponsorId = input.sponsorId?.trim() || tree?.sponsorName?.trim() || 'sponsor';
    const prevLabel = GROWTH_STAGE_LABELS[previousStage];
    const nextLabel = GROWTH_STAGE_LABELS[input.stage];

    notification = {
      id: `notif-${input.treeId}-${input.stage}-${Date.now()}`,
      treeId: input.treeId,
      sponsorId,
      previousStage,
      newStage: input.stage,
      title: `Your tree reached the ${nextLabel} stage!`,
      message: `Tree ${tree?.treeId ?? input.treeId} transitioned from ${prevLabel} to ${nextLabel} (uploaded by ${photo.uploadedBy}).`,
      notifiedAt: new Date().toISOString(),
    };
    record.notifications.push(notification);
  }

  return {
    photo,
    currentStage: record.currentStage,
    previousStage,
    transitioned,
    notification,
  };
}

export function getStageTransitionNotifications(
  treeId: string
): GrowthStageTransitionNotification[] {
  const record = stageStore.get(treeId);
  return record ? [...record.notifications] : [];
}

export function resetGrowthStageStore(): void {
  stageStore.clear();
}
