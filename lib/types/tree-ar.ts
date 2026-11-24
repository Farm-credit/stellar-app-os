import type { TreeSpecies } from './tree';

/**
 * WebAR 20-year tree growth projection types (Issue #1106).
 */

export interface TreeProjectionYear {
  /** Years since planting, 0–20. */
  year: number;
  heightCm: number;
  canopyCm: number;
  trunkMm: number;
  /** CO₂ absorbed over the last 12 months, in kilograms. */
  annualCo2Kg: number;
  /** Total CO₂ absorbed since planting, in kilograms. */
  cumulativeCo2Kg: number;
  /** Share of the 20-year projection reached, 0–1. */
  maturityProgress: number;
  /** Height relative to the mature tree, 0–1 — drives the AR overlay scale. */
  scale: number;
}

export interface TreeARProjection {
  treeId: string;
  species: TreeSpecies;
  region: string;
  projectName: string;
  plantedAt: string | null;
  /** Whether the tree is in the ground yet. */
  planted: boolean;
  /** Age today in whole years, clamped to the 20-year horizon. */
  currentAgeYears: number;
  /** Object URL-free label for "today" markers, e.g. "Age 2". */
  currentAgeLabel: string;
  /** The year the slider opens on — the sponsor's tree at maturity. */
  defaultYear: number;
  /** Projection for every year 0–20 inclusive. */
  timeline: TreeProjectionYear[];
  /** Size at the maturity horizon, shown as the AR anchor measurement. */
  matureHeightCm: number;
  matureCanopyCm: number;
  matureTrunkMm: number;
  /** CO₂ absorbed across the whole 20-year projection, in kilograms. */
  lifetimeCo2Kg: number;
  /** CO₂ absorbed across the whole 20-year projection, in tonnes. */
  lifetimeCo2Tonnes: number;
}

export type ARCameraStatus = 'unsupported' | 'idle' | 'starting' | 'active' | 'denied' | 'error';
