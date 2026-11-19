import { TREE_SPECIES, type SpeciesInfo } from '@/lib/constants/species';

/** Platform policy: at least 70% of planted trees in restoration projects must be native. */
export const MINIMUM_NATIVE_SPECIES_RATIO = 70;

// Species whose published planting profile is indigenous to the project's supported regions.
const NATIVE_SPECIES_SLUGS = new Set([
  'moringa',
  'mangrove',
  'acacia',
  'neem',
  'mahogany',
  'baobab',
  'cedar',
  'iroko',
  'shea',
  'cashew',
  'locust_bean',
]);

export function isNativeSpecies(slug: string): boolean {
  return NATIVE_SPECIES_SLUGS.has(slug);
}

export function speciesWithNativeStatus(): Array<SpeciesInfo & { isNative: boolean }> {
  return TREE_SPECIES.map((species) => ({ ...species, isNative: isNativeSpecies(species.slug) }));
}

export interface NativeSpeciesRatio {
  nativeTrees: number;
  nonNativeTrees: number;
  totalTrees: number;
  nativePercentage: number;
  meetsPolicy: boolean;
}

export function calculateNativeSpeciesRatio(
  nativeTrees: number,
  totalTrees: number
): NativeSpeciesRatio {
  const safeTotal = Math.max(0, totalTrees);
  const safeNative = Math.min(Math.max(0, nativeTrees), safeTotal);
  const nonNativeTrees = safeTotal - safeNative;
  const nativePercentage = safeTotal === 0 ? 0 : (safeNative / safeTotal) * 100;
  return {
    nativeTrees: safeNative,
    nonNativeTrees,
    totalTrees: safeTotal,
    nativePercentage,
    meetsPolicy: nativePercentage >= MINIMUM_NATIVE_SPECIES_RATIO,
  };
}

export const DEFAULT_PROJECT_NATIVE_COUNTS = { nativeTrees: 920, totalTrees: 1_000 };

/** Ordered lifecycle stages a seed batch moves through, from collection to planting. */
export const SEED_BATCH_STAGES = [
  'collected',
  'stored',
  'distributed',
  'planted',
] as const;

export type SeedBatchStage = (typeof SEED_BATCH_STAGES)[number];

/** Provenance metadata captured at each hand-off so a batch's origin stays transparent. */
export interface SeedProvenance {
  /** Organisation or individual that collected the seed. */
  collectedBy: string;
  /** Free-form location description of the source plant(s). */
  collectionSite: string;
  /** ISO date (YYYY-MM-DD) the seed was collected. */
  collectedAt: string;
  /** Optional latitude of the collection site. */
  latitude?: number;
  /** Optional longitude of the collection site. */
  longitude?: number;
  /** Identifier of the parent tree the seed was harvested from, when known. */
  parentTreeId?: string;
  /** Notes carried through the lifecycle (e.g. viability, treatment). */
  notes?: string;
}

export interface SeedBank {
  id: string;
  name: string;
  /** Partner organisation operating the seed bank. */
  organisation: string;
  region: string;
  /** Storage capacity in kilograms of seed. */
  capacityKg: number;
}

export interface SeedBatch {
  id: string;
  speciesSlug: string;
  seedBankId: string;
  /** Quantity of seed in kilograms. */
  quantityKg: number;
  stage: SeedBatchStage;
  provenance: SeedProvenance;
  /** ISO timestamp of the last lifecycle transition. */
  updatedAt: string;
  /** Nursery the batch was distributed to, if any. */
  nurseryId?: string;
  /** Planting site the batch was planted at, if any. */
  plantingSiteId?: string;
  /** Tree profile created from this batch once planted, if any. */
  treeProfileId?: string;
}

export interface SeedDistribution {
  batchId: string;
  seedBankId: string;
  nurseryId: string;
  quantityKg: number;
  /** ISO date (YYYY-MM-DD) the batch left the seed bank. */
  distributedAt: string;
  provenance: SeedProvenance;
}

export interface SeedLifecycleEvent {
  batchId: string;
  stage: SeedBatchStage;
  /** ISO timestamp of the transition. */
  at: string;
  /** Provenance snapshot recorded at the transition. */
  provenance: SeedProvenance;
}

const STAGE_ORDER: Record<SeedBatchStage, number> = {
  collected: 0,
  stored: 1,
  distributed: 2,
  planted: 3,
};

function assertStage(batch: SeedBatch, expected: SeedBatchStage): void {
  if (batch.stage !== expected) {
    throw new Error(
      `Seed batch ${batch.id} must be in stage "${expected}" but is "${batch.stage}".`
    );
  }
}

function assertPositiveQuantity(quantityKg: number): void {
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    throw new Error(`Seed quantity must be a positive number of kilograms, received ${quantityKg}.`);
  }
}

/** Creates a new seed batch at the "collected" stage. */
export function collectSeed(input: {
  id: string;
  speciesSlug: string;
  seedBankId: string;
  quantityKg: number;
  provenance: SeedProvenance;
  collectedAt?: string;
}): SeedBatch {
  assertPositiveQuantity(input.quantityKg);
  return {
    id: input.id,
    speciesSlug: input.speciesSlug,
    seedBankId: input.seedBankId,
    quantityKg: input.quantityKg,
    stage: 'collected',
    provenance: { ...input.provenance },
    updatedAt: input.collectedAt ?? input.provenance.collectedAt,
  };
}

/** Moves a collected batch into seed bank storage. */
export function storeSeed(batch: SeedBatch, at: string, notes?: string): SeedBatch {
  assertStage(batch, 'collected');
  return {
    ...batch,
    stage: 'stored',
    updatedAt: at,
    provenance: notes ? { ...batch.provenance, notes } : batch.provenance,
  };
}

/** Distributes a stored batch to a nursery, returning the updated batch and distribution record. */
export function distributeToNursery(
  batch: SeedBatch,
  input: { nurseryId: string; quantityKg: number; distributedAt: string; notes?: string }
): { batch: SeedBatch; distribution: SeedDistribution } {
  assertStage(batch, 'stored');
  assertPositiveQuantity(input.quantityKg);
  if (input.quantityKg > batch.quantityKg) {
    throw new Error(
      `Cannot distribute ${input.quantityKg}kg from batch ${batch.id} holding ${batch.quantityKg}kg.`
    );
  }
  const provenance = input.notes ? { ...batch.provenance, notes: input.notes } : batch.provenance;
  const updated: SeedBatch = {
    ...batch,
    stage: 'distributed',
    nurseryId: input.nurseryId,
    quantityKg: input.quantityKg,
    updatedAt: input.distributedAt,
    provenance,
  };
  return {
    batch: updated,
    distribution: {
      batchId: batch.id,
      seedBankId: batch.seedBankId,
      nurseryId: input.nurseryId,
      quantityKg: input.quantityKg,
      distributedAt: input.distributedAt,
      provenance: { ...provenance },
    },
  };
}

/** Marks a distributed batch as planted at a site, linking it to the resulting tree profile. */
export function plantAtSite(
  batch: SeedBatch,
  input: { plantingSiteId: string; treeProfileId: string; plantedAt: string; notes?: string }
): SeedBatch {
  assertStage(batch, 'distributed');
  return {
    ...batch,
    stage: 'planted',
    plantingSiteId: input.plantingSiteId,
    treeProfileId: input.treeProfileId,
    updatedAt: input.plantedAt,
    provenance: input.notes ? { ...batch.provenance, notes: input.notes } : batch.provenance,
  };
}

/** Builds an ordered lifecycle event log from a batch's current state. */
export function seedLifecycleEvents(batch: SeedBatch): SeedLifecycleEvent[] {
  const events: SeedLifecycleEvent[] = [
    {
      batchId: batch.id,
      stage: 'collected',
      at: batch.provenance.collectedAt,
      provenance: { ...batch.provenance },
    },
  ];
  if (STAGE_ORDER[batch.stage] >= STAGE_ORDER.stored) {
    events.push({ batchId: batch.id, stage: 'stored', at: batch.updatedAt, provenance: { ...batch.provenance } });
  }
  if (STAGE_ORDER[batch.stage] >= STAGE_ORDER.distributed) {
    events.push({
      batchId: batch.id,
      stage: 'distributed',
      at: batch.updatedAt,
      provenance: { ...batch.provenance },
    });
  }
  if (STAGE_ORDER[batch.stage] >= STAGE_ORDER.planted) {
    events.push({ batchId: batch.id, stage: 'planted', at: batch.updatedAt, provenance: { ...batch.provenance } });
  }
  return events;
}

export interface SeedBankInventory {
  seedBankId: string;
  totalBatches: number;
  totalQuantityKg: number;
  /** Quantity in kilograms currently held in storage (stage "stored"). */
  storedQuantityKg: number;
  /** Quantity in kilograms already planted at sites. */
  plantedQuantityKg: number;
  /** Quantity in kilograms distributed to nurseries but not yet planted. */
  inNurseryQuantityKg: number;
  /** Per-species quantity breakdown in kilograms. */
  bySpecies: Record<string, number>;
  /** Per-stage batch counts. */
  byStage: Record<SeedBatchStage, number>;
  /** Percentage of capacity currently used by stored seed. */
  capacityUsedPercentage: number;
}

/** Aggregates batch data into an inventory summary for the seed bank dashboard. */
export function summariseSeedBankInventory(
  seedBank: SeedBank,
  batches: SeedBatch[]
): SeedBankInventory {
  const relevant = batches.filter((batch) => batch.seedBankId === seedBank.id);
  const bySpecies: Record<string, number> = {};
  const byStage: Record<SeedBatchStage, number> = {
    collected: 0,
    stored: 0,
    distributed: 0,
    planted: 0,
  };
  let totalQuantityKg = 0;
  let storedQuantityKg = 0;
  let plantedQuantityKg = 0;
  let inNurseryQuantityKg = 0;

  for (const batch of relevant) {
    totalQuantityKg += batch.quantityKg;
    bySpecies[batch.speciesSlug] = (bySpecies[batch.speciesSlug] ?? 0) + batch.quantityKg;
    byStage[batch.stage] += 1;
    if (batch.stage === 'stored') storedQuantityKg += batch.quantityKg;
    if (batch.stage === 'planted') plantedQuantityKg += batch.quantityKg;
    if (batch.stage === 'distributed') inNurseryQuantityKg += batch.quantityKg;
  }

  const capacityUsedPercentage =
    seedBank.capacityKg > 0 ? (storedQuantityKg / seedBank.capacityKg) * 100 : 0;

  return {
    seedBankId: seedBank.id,
    totalBatches: relevant.length,
    totalQuantityKg,
    storedQuantityKg,
    plantedQuantityKg,
    inNurseryQuantityKg,
    bySpecies,
    byStage,
    capacityUsedPercentage,
  };
}
