// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Planting Method Descriptions Domain Layer (#1675)
 *
 * Feature: Document and display the specific planting methods used per project
 * (seed broadcasting, containerised nursery stock, assisted natural
 * regeneration).
 *
 * Acceptance Criteria:
 * - Planting methods section on project detail page
 * - Photos or videos of the planting method
 * - Link to scientific rationale for the chosen approach
 */

export type PlantingMethodKind =
  | 'seed-broadcasting'
  | 'containerised-nursery-stock'
  | 'assisted-natural-regeneration'
  | 'direct-seeding'
  | 'sapling-planting';

export interface PlantingMethodMedia {
  type: 'photo' | 'video';
  url: string;
  caption: string;
}

export interface PlantingMethod {
  id: string;
  projectId: string;
  kind: PlantingMethodKind;
  name: string;
  /** Plain-language description of how the method is executed on this site. */
  description: string;
  /** Ordered field steps crews follow for this method. */
  steps: string[];
  /** Share of the project area planted with this method (0–100). */
  coveragePercent: number;
  media: PlantingMethodMedia[];
  /** URL to the peer-reviewed or institutional rationale for this approach. */
  rationaleUrl: string;
  rationaleSummary: string;
}

const PHOTO = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=800`;

export const MOCK_PLANTING_METHODS: PlantingMethod[] = [
  {
    id: 'pm-proj-001-broadcast',
    projectId: 'proj-001',
    kind: 'seed-broadcasting',
    name: 'Seed Broadcasting',
    description:
      'Pre-treated native seeds are mixed with a clay-and-compost coating and broadcast by hand over degraded upland plots during the first heavy rains, letting natural stratification drive germination.',
    steps: [
      'Collect and clean seed from local mother trees',
      'Coat seed in clay-compost pellets to deter granivores',
      'Broadcast evenly across prepared microsites at 4–6 kg/ha',
      'Light mulching and 12-month germination monitoring',
    ],
    coveragePercent: 35,
    media: [
      {
        type: 'photo',
        url: PHOTO('photo-1416879595882-3373a0481b61'),
        caption: 'Crew broadcasting pelleted native seed across a prepared parcel',
      },
      {
        type: 'photo',
        url: PHOTO('photo-1466692476868-a031f160002b'),
        caption: 'Germination flush eight weeks after monsoon broadcasting',
      },
    ],
    rationaleUrl:
      'https://www.worldforestresearch.org/news/detail/article/seed-bombing-for-reforestation.html',
    rationaleSummary:
      'Broadcasting pelleted seed establishes dense, genetically diverse pioneer canopy at a fraction of sapling-planting cost on accessible degraded land.',
  },
  {
    id: 'pm-proj-001-nursery',
    projectId: 'proj-001',
    kind: 'containerised-nursery-stock',
    name: 'Containerised Nursery Stock',
    description:
      'Hardwood cuttings and pot-grown seedlings raised in community nurseries are planted into hand-dig pits on riparian corridors, where guaranteed water supply lifts survival above 90%.',
    steps: [
      'Raise 12–18 month seedlings in shade-house containers',
      'Harden off stock for 4 weeks before outplanting',
      'Dig 45 cm pits on contour along watercourses',
      'Plant, water-in, and fit grow tubes where browse pressure is high',
    ],
    coveragePercent: 45,
    media: [
      {
        type: 'photo',
        url: PHOTO('photo-1591151076270-8a3a19b31f58'),
        caption: 'Containerised native seedlings ready for riparian outplanting',
      },
      {
        type: 'video',
        url: 'https://www.w3schools.com/html/mov_bbb.mp4',
        caption: 'Field clip: pit preparation and seedling transplant technique',
      },
    ],
    rationaleUrl: 'https://www.fao.org/3/y4101e/y4101e05.htm',
    rationaleSummary:
      'FAO guidance finds containerised stock delivers the highest outplant survival for high-value native species where sites are water-secure.',
  },
  {
    id: 'pm-proj-001-anr',
    projectId: 'proj-001',
    kind: 'assisted-natural-regeneration',
    name: 'Assisted Natural Regeneration (ANR)',
    description:
      'Existing rootstocks and seed banks on lightly degraded plots are released from competition by selective clearing and protective fencing, letting indigenous resprouts regenerate in situ.',
    steps: [
      'Map standing rootstocks and resprout density per plot',
      'Cut and ring competing lianas and invasive stems',
      'Exclude cattle with community-managed fencing',
      'Supplement-plant gaps greater than 8 m with nursery stock',
    ],
    coveragePercent: 20,
    media: [
      {
        type: 'photo',
        url: PHOTO('photo-1542601906990-b4d3fb778b09'),
        caption: 'Released resprouts six months after ANR treatment',
      },
    ],
    rationaleUrl: 'https://www.cifor.org/knowledge/publication/35868',
    rationaleSummary:
      'CIFOR research shows ANR can cut restoration costs by up to 80% while preserving local genetic adaptation on lightly degraded land.',
  },
  {
    id: 'pm-proj-004-nursery',
    projectId: 'proj-004',
    kind: 'sapling-planting',
    name: 'Community Nursery Sapling Planting',
    description:
      'Mangrove propagules collected from verified mother stands are raised in coastal community nurseries and planted in hydrologically restored tidal plots.',
    steps: [
      'Collect mature propagules during spring tides',
      'Nursery-reduce for 2–4 months to reduce predation losses',
      'Re-establish tidal flow on abandoned aquaculture ponds',
      'Plant in species-specific zonation matching natural stands',
    ],
    coveragePercent: 100,
    media: [
      {
        type: 'photo',
        url: PHOTO('photo-1518709268805-4e9042af9f23'),
        caption: 'Propagule nursery beds at a coastal community restoration site',
      },
    ],
    rationaleUrl: 'https://www.rspb.org.uk/our-work/projects/restoring-mangroves/',
    rationaleSummary:
      'Hydrological restoration plus nursery-raised propagules is the documented best-practice sequence for mangrove rehabilitation.',
  },
];

/** Returns every documented planting method for a project, coverage-descending. */
export function getPlantingMethodsForProject(projectId: string): PlantingMethod[] {
  return MOCK_PLANTING_METHODS.filter((method) => method.projectId === projectId).sort(
    (a, b) => b.coveragePercent - a.coveragePercent
  );
}

/** True when the project has at least one documented method. */
export function hasPlantingMethods(projectId: string): boolean {
  return getPlantingMethodsForProject(projectId).length > 0;
}

/** Weighted average coverage check helper used by the detail section badge. */
export function sumPlantingCoverage(methods: readonly PlantingMethod[]): number {
  return methods.reduce((total, method) => total + method.coveragePercent, 0);
}

/** Media gallery source for the section, flattening photos then videos. */
export function getPlantingMethodMedia(methods: readonly PlantingMethod[]): PlantingMethodMedia[] {
  const photos = methods.flatMap((m) => m.media.filter((item) => item.type === 'photo'));
  const videos = methods.flatMap((m) => m.media.filter((item) => item.type === 'video'));
  return [...photos, ...videos];
}
