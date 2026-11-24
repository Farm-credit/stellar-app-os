import { getMockTrees } from '@/lib/api/mock/trees';
import {
  computeHealthScore,
  type HealthObservation,
  type HealthStatus,
  type PestPresence,
  type WateringStatus,
} from './health-score';

export interface CreateHealthObservationPayload {
  treeId: string;
  heightCm: number;
  pestPresence: PestPresence;
  wateringStatus: WateringStatus;
  soilMoisturePercent?: number;
  observerName: string;
  notes?: string;
  observedAt?: string;
}

export interface TreeHealthSummary {
  treeId: string;
  currentScore: number;
  currentStatus: HealthStatus;
  trendDelta: number;
  latestObservation: HealthObservation | null;
  observations: HealthObservation[];
}

const globalForTreeHealth = globalThis as unknown as {
  __treeHealthObservations?: Map<string, HealthObservation[]>;
};

function buildSeedObservations(treeId: string, seedIndex: number): HealthObservation[] {
  const baseHeight = 75 + (seedIndex % 5) * 18;
  const presets: Array<{
    monthsAgo: number;
    heightDelta: number;
    pestPresence: PestPresence;
    wateringStatus: WateringStatus;
    observerName: string;
    notes: string;
  }> = [
    {
      monthsAgo: 5,
      heightDelta: 0,
      pestPresence: 'mild',
      wateringStatus: 'adequate',
      observerName: 'Amina Yusuf',
      notes: 'Initial baseline field check after planting.',
    },
    {
      monthsAgo: 4,
      heightDelta: 8,
      pestPresence: 'none',
      wateringStatus: 'adequate',
      observerName: 'Amina Yusuf',
      notes: 'Steady shoot growth, light mulching applied.',
    },
    {
      monthsAgo: 3,
      heightDelta: 15,
      pestPresence: seedIndex % 3 === 0 ? 'moderate' : 'none',
      wateringStatus: seedIndex % 2 === 0 ? 'dry' : 'optimal',
      observerName: 'Chidi Okafor',
      notes:
        seedIndex % 3 === 0
          ? 'Minor leaf-spot treated with organic neem spray.'
          : 'Canopy filling out well.',
    },
    {
      monthsAgo: 2,
      heightDelta: 24,
      pestPresence: 'none',
      wateringStatus: 'optimal',
      observerName: 'Chidi Okafor',
      notes: 'Healthy foliage and strong stem rigidity.',
    },
    {
      monthsAgo: 1,
      heightDelta: 34,
      pestPresence: 'none',
      wateringStatus: 'optimal',
      observerName: 'Fatima Bello',
      notes: 'Thriving after seasonal rainfall; synced to sponsor profile.',
    },
  ];

  const now = new Date();
  const observations: HealthObservation[] = [];

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const observedDate = new Date(now);
    observedDate.setMonth(observedDate.getMonth() - preset.monthsAgo);
    const heightCm = baseHeight + preset.heightDelta;
    const prevHeight = i > 0 ? observations[i - 1].heightCm : undefined;
    const computed = computeHealthScore(
      {
        heightCm,
        pestPresence: preset.pestPresence,
        wateringStatus: preset.wateringStatus,
      },
      prevHeight
    );

    observations.push({
      id: `obs-${treeId}-${i + 1}`,
      treeId,
      observedAt: observedDate.toISOString(),
      observerName: preset.observerName,
      heightCm,
      pestPresence: preset.pestPresence,
      wateringStatus: preset.wateringStatus,
      notes: preset.notes,
      healthScore: computed.score,
      healthStatus: computed.status,
      syncedToSponsor: true,
    });
  }

  return observations;
}

function getStore(): Map<string, HealthObservation[]> {
  if (!globalForTreeHealth.__treeHealthObservations) {
    const store = new Map<string, HealthObservation[]>();
    const trees = getMockTrees();
    trees.forEach((tree, index) => {
      store.set(tree.id, buildSeedObservations(tree.id, index));
    });
    globalForTreeHealth.__treeHealthObservations = store;
  }
  return globalForTreeHealth.__treeHealthObservations;
}

export function getTreeHealthSummary(treeId: string): TreeHealthSummary {
  const store = getStore();
  let observations = store.get(treeId);

  if (!observations) {
    observations = buildSeedObservations(treeId, 1);
    store.set(treeId, observations);
  }

  const sorted = [...observations].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );

  const latestObservation = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const previousObservation = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const currentScore = latestObservation?.healthScore ?? 0;
  const currentStatus = latestObservation?.healthStatus ?? 'critical';
  const trendDelta =
    latestObservation && previousObservation
      ? latestObservation.healthScore - previousObservation.healthScore
      : 0;

  return {
    treeId,
    currentScore,
    currentStatus,
    trendDelta,
    latestObservation,
    observations: sorted,
  };
}

export function addHealthObservation(payload: CreateHealthObservationPayload): {
  observation: HealthObservation;
  summary: TreeHealthSummary;
} {
  const store = getStore();
  const existing = store.get(payload.treeId) ?? buildSeedObservations(payload.treeId, 1);
  const sorted = [...existing].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );
  const previousHeightCm = sorted.length > 0 ? sorted[sorted.length - 1].heightCm : undefined;

  const computed = computeHealthScore(
    {
      heightCm: payload.heightCm,
      pestPresence: payload.pestPresence,
      wateringStatus: payload.wateringStatus,
    },
    previousHeightCm
  );

  const observation: HealthObservation = {
    id: `obs-${payload.treeId}-${Date.now()}`,
    treeId: payload.treeId,
    observedAt: payload.observedAt ?? new Date().toISOString(),
    observerName: payload.observerName.trim() || 'Field Officer',
    heightCm: payload.heightCm,
    pestPresence: payload.pestPresence,
    wateringStatus: payload.wateringStatus,
    soilMoisturePercent: payload.soilMoisturePercent,
    notes: payload.notes?.trim() || undefined,
    healthScore: computed.score,
    healthStatus: computed.status,
    syncedToSponsor: true,
  };

  store.set(payload.treeId, [...sorted, observation]);

  return {
    observation,
    summary: getTreeHealthSummary(payload.treeId),
  };
}

export function getRecentHealthObservations(limit = 10): HealthObservation[] {
  const store = getStore();
  const all: HealthObservation[] = [];
  for (const list of store.values()) {
    all.push(...list);
  }
  return all
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
    .slice(0, limit);
}
