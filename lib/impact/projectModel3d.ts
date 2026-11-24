// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Impact visualization — 3D project model (Issue #1433)
 *
 * Pure simulation behind the 3D project scene. For each year of a project it
 * derives the three things the scene shows:
 *
 * - **Forest growth** — canopy height, living trees and biomass carbon, using
 *   the Chapman–Richards growth curve `(1 - e^(-k·t))^p`, which is the standard
 *   sigmoid for stand growth: slow establishment, fast mid-life, saturation.
 * - **Soil sequestration depth** — cumulative soil organic carbon, split across
 *   0–30 / 30–60 / 60–100 cm layers. Carbon only reaches layers the root front
 *   has grown into, so the stored carbon visibly moves deeper over time.
 * - **Emissions reduction rate** — tCO₂e removed or avoided in that year
 *   (year-on-year stock gain plus avoided emissions for energy projects).
 *
 * No I/O, React or DOM, so the scene, any API layer and the tests share the
 * same numbers. The scene layout helper is seeded so the forest looks the same
 * on every render and on the server.
 */

import type { CarbonProject, ProjectType } from '@/lib/types/carbon';

export interface ProjectModelParams {
  areaHectares: number;
  /** Trees planted per hectare; 0 for projects without a forest component. */
  treesPerHectare: number;
  /** Share of planted trees that survive establishment (0–1). */
  survivalRate: number;
  /** Years until the stand is ~90% grown. */
  maturityYears: number;
  matureHeightM: number;
  /** Carbon stored in one mature tree (above + below ground), tCO₂e. */
  matureCo2PerTreeT: number;
  /** Soil organic carbon accrual, tCO₂e per hectare per year. */
  soilSeqPerHaPerYear: number;
  /** Deepest the root front reaches, in cm (≤ 100). */
  maxRootDepthCm: number;
  /** Emissions avoided per year once fully operational (energy projects), tCO₂e. */
  avoidedEmissionsPerYear: number;
}

export const SOIL_LAYERS = [
  { id: 'topsoil', label: '0–30 cm', topCm: 0, bottomCm: 30 },
  { id: 'subsoil', label: '30–60 cm', topCm: 30, bottomCm: 60 },
  { id: 'deep', label: '60–100 cm', topCm: 60, bottomCm: 100 },
] as const;
export type SoilLayerId = (typeof SOIL_LAYERS)[number]['id'];

export interface SoilLayerState {
  id: SoilLayerId;
  label: string;
  /** Cumulative soil carbon stored in this layer, tCO₂e. */
  carbonT: number;
  /** Share of all soil carbon held by this layer (0–1). */
  share: number;
}

export interface YearSnapshot {
  year: number;
  /** Stand growth progress (0–1). */
  growth: number;
  canopyHeightM: number;
  livingTrees: number;
  biomassCo2T: number;
  /** How deep roots — and so new soil carbon — reach this year, in cm. */
  rootDepthCm: number;
  soilCo2T: number;
  soilLayers: SoilLayerState[];
  /** tCO₂e removed or avoided during this year. */
  reductionRateT: number;
  /** tCO₂e removed or avoided since planting / commissioning. */
  cumulativeReductionT: number;
}

const CHAPMAN_RICHARDS_SHAPE = 2;
/** `k` such that growth reaches (1 - e^-3)^2 ≈ 90% at maturity. */
const MATURITY_RATE_FACTOR = 3;
/** Most establishment losses happen in the first few years. */
const ESTABLISHMENT_YEARS = 3;
/** Soil carbon concentrates near the surface: weight decays with depth. */
const SOIL_DEPTH_DECAY_CM = 45;
/** Energy projects ramp to full output over their commissioning period. */
const COMMISSIONING_YEARS = 2;

const PRESETS: Record<ProjectType, ProjectModelParams> = {
  Reforestation: {
    areaHectares: 250,
    treesPerHectare: 1_100,
    survivalRate: 0.85,
    maturityYears: 20,
    matureHeightM: 25,
    matureCo2PerTreeT: 0.5,
    soilSeqPerHaPerYear: 0.6,
    maxRootDepthCm: 100,
    avoidedEmissionsPerYear: 0,
  },
  'Mangrove Restoration': {
    areaHectares: 120,
    treesPerHectare: 2_500,
    survivalRate: 0.75,
    maturityYears: 15,
    matureHeightM: 10,
    matureCo2PerTreeT: 0.15,
    soilSeqPerHaPerYear: 2.5,
    maxRootDepthCm: 100,
    avoidedEmissionsPerYear: 0,
  },
  'Sustainable Agriculture': {
    areaHectares: 400,
    treesPerHectare: 150,
    survivalRate: 0.9,
    maturityYears: 12,
    matureHeightM: 12,
    matureCo2PerTreeT: 0.4,
    soilSeqPerHaPerYear: 1.2,
    maxRootDepthCm: 60,
    avoidedEmissionsPerYear: 0,
  },
  'Renewable Energy': {
    areaHectares: 50,
    treesPerHectare: 0,
    survivalRate: 1,
    maturityYears: 1,
    matureHeightM: 0,
    matureCo2PerTreeT: 0,
    soilSeqPerHaPerYear: 0,
    maxRootDepthCm: 0,
    avoidedEmissionsPerYear: 25_000,
  },
  Other: {
    areaHectares: 100,
    treesPerHectare: 400,
    survivalRate: 0.8,
    maturityYears: 15,
    matureHeightM: 15,
    matureCo2PerTreeT: 0.3,
    soilSeqPerHaPerYear: 0.5,
    maxRootDepthCm: 60,
    avoidedEmissionsPerYear: 0,
  },
};

export function presetForType(type: ProjectType): ProjectModelParams {
  return { ...PRESETS[type] };
}

export function presetForProject(project: Pick<CarbonProject, 'type'>): ProjectModelParams {
  return presetForType(project.type);
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Chapman–Richards growth progress (0–1) at `year`. */
export function growthAt(year: number, maturityYears: number): number {
  const t = nonNegative(year);
  const maturity = Math.max(1e-6, nonNegative(maturityYears));
  const k = MATURITY_RATE_FACTOR / maturity;
  return (1 - Math.exp(-k * t)) ** CHAPMAN_RICHARDS_SHAPE;
}

function livingTreesAt(params: ProjectModelParams, year: number): number {
  const planted = nonNegative(params.areaHectares) * nonNegative(params.treesPerHectare);
  const losses = 1 - Math.min(1, nonNegative(params.survivalRate));
  const establishment = Math.min(1, nonNegative(year) / ESTABLISHMENT_YEARS);
  return Math.round(planted * (1 - losses * establishment));
}

function soilLayersAt(soilCo2T: number, rootDepthCm: number): SoilLayerState[] {
  const weights = SOIL_LAYERS.map((layer) => {
    const reached = Math.max(0, Math.min(layer.bottomCm, rootDepthCm) - layer.topCm);
    const midpoint = layer.topCm + reached / 2;
    return reached * Math.exp(-midpoint / SOIL_DEPTH_DECAY_CM);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return SOIL_LAYERS.map((layer, index) => {
    const share = total > 0 ? weights[index] / total : 0;
    return { id: layer.id, label: layer.label, carbonT: soilCo2T * share, share };
  });
}

function stockAt(params: ProjectModelParams, year: number) {
  const growth = params.treesPerHectare > 0 ? growthAt(year, params.maturityYears) : 0;
  const livingTrees = livingTreesAt(params, year);
  const biomassCo2T = livingTrees * growth * nonNegative(params.matureCo2PerTreeT);
  const soilCo2T =
    nonNegative(params.soilSeqPerHaPerYear) * nonNegative(params.areaHectares) * nonNegative(year);
  return { growth, livingTrees, biomassCo2T, soilCo2T };
}

function avoidedAt(params: ProjectModelParams, year: number): number {
  if (year <= 0) return 0;
  return nonNegative(params.avoidedEmissionsPerYear) * Math.min(1, year / COMMISSIONING_YEARS);
}

/** Simulates years `0..years` (inclusive) of a project. */
export function simulateProject(params: ProjectModelParams, years: number): YearSnapshot[] {
  const horizon = Math.max(0, Math.floor(nonNegative(years)));
  const maxRootDepthCm = Math.min(100, nonNegative(params.maxRootDepthCm));
  const snapshots: YearSnapshot[] = [];
  let previousStock = 0;
  let cumulativeReductionT = 0;

  for (let year = 0; year <= horizon; year += 1) {
    const { growth, livingTrees, biomassCo2T, soilCo2T } = stockAt(params, year);
    // Roots follow the stand's growth curve; without trees they barely move.
    const rootGrowth = params.treesPerHectare > 0 ? growth : Math.min(1, year / 10);
    const rootDepthCm = maxRootDepthCm * rootGrowth;
    const stock = biomassCo2T + soilCo2T;
    const reductionRateT = year === 0 ? 0 : stock - previousStock + avoidedAt(params, year);
    cumulativeReductionT += reductionRateT;
    previousStock = stock;

    snapshots.push({
      year,
      growth,
      canopyHeightM: nonNegative(params.matureHeightM) * growth,
      livingTrees,
      biomassCo2T,
      rootDepthCm,
      soilCo2T,
      soilLayers: soilLayersAt(soilCo2T, rootDepthCm),
      reductionRateT,
      cumulativeReductionT,
    });
  }
  return snapshots;
}

// ── Scene layout ──────────────────────────────────────────────────────────────

export interface SceneTree {
  id: number;
  /** Position on the ground plane, each axis in [-1, 1]. */
  x: number;
  y: number;
  /** Per-tree size variation (0.75–1.25) so the stand doesn't look cloned. */
  scale: number;
  /**
   * Trees are culled in this order to show establishment losses: a tree is
   * drawn only while `mortalityRank < livingShare`.
   */
  mortalityRank: number;
}

/** Small, fast, seeded PRNG (mulberry32) so layouts are stable across renders. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Stable numeric seed from a string such as a project id. */
export function seedFrom(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Lays out up to `count` representative trees on a jittered grid. Each drawn
 * tree stands for many real ones; the scene scales the whole stand by growth.
 */
export function buildForestLayout(count: number, seed: number): SceneTree[] {
  const total = Math.max(0, Math.floor(nonNegative(count)));
  if (total === 0) return [];
  const random = seededRandom(seed);
  const columns = Math.ceil(Math.sqrt(total));
  const cell = 2 / columns;
  const trees: SceneTree[] = [];

  for (let id = 0; id < total; id += 1) {
    const column = id % columns;
    const row = Math.floor(id / columns);
    const jitter = () => (random() - 0.5) * cell * 0.6;
    trees.push({
      id,
      x: Math.max(-1, Math.min(1, -1 + cell * (column + 0.5) + jitter())),
      y: Math.max(-1, Math.min(1, -1 + cell * (row + 0.5) + jitter())),
      scale: 0.75 + random() * 0.5,
      mortalityRank: random(),
    });
  }
  return trees;
}
