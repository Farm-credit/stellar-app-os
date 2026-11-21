/**
 * Marketplace supply chain tracing — Issue #1420
 *
 * Full transparency on credit origin: buyers can trace a carbon credit back
 * to the specific farm it came from, see planting and sequestration photos,
 * the farmer behind it, and every custody event through to retirement.
 *
 * `verifyTrace` cross-checks the chain so buyers are told when evidence is
 * missing or inconsistent instead of being shown an unqualified story.
 */

export type TraceEventStage =
  'planting' | 'monitoring' | 'verification' | 'issuance' | 'listing' | 'transfer' | 'retirement';

export type TracePhotoStage = 'planting' | 'growth' | 'sequestration' | 'verification';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TraceFarm {
  id: string;
  name: string;
  country: string;
  region: string;
  location: GeoPoint;
  areaHectares: number;
  landUse: string;
  certifications: string[];
}

export interface TraceFarmer {
  id: string;
  name: string;
  photoUrl?: string;
  bio: string;
  yearsFarming: number;
  cooperative?: string;
  treesPlanted: number;
  joinedAt: string;
  /** Whether the farmer agreed to have their name and photo shown to buyers. */
  consentToShare: boolean;
}

export interface TracePhoto {
  id: string;
  url: string;
  caption: string;
  stage: TracePhotoStage;
  takenAt: string;
  location?: GeoPoint;
  capturedBy: string;
}

export interface TraceEvent {
  id: string;
  stage: TraceEventStage;
  occurredAt: string;
  title: string;
  description: string;
  actor: string;
  /** Stellar transaction hash anchoring the event on-chain, when available. */
  txHash?: string;
  photoIds?: string[];
}

export interface SequestrationMeasurement {
  measuredAt: string;
  /** Cumulative tonnes of CO₂e sequestered by the batch at this date. */
  cumulativeTonnes: number;
  method: string;
}

export interface CreditTrace {
  batchId: string;
  listingId?: string;
  projectName: string;
  standard: string;
  vintageYear: number;
  /** Tonnes of CO₂e issued as credits in this batch. */
  issuedTonnes: number;
  treeCount: number;
  species: string[];
  farm: TraceFarm;
  farmer: TraceFarmer;
  events: TraceEvent[];
  photos: TracePhoto[];
  sequestration: SequestrationMeasurement[];
}

export type TraceIssueSeverity = 'warning' | 'error';

export interface TraceIssue {
  severity: TraceIssueSeverity;
  code:
    | 'EVENTS_OUT_OF_ORDER'
    | 'MISSING_STAGE'
    | 'ISSUED_BEFORE_VERIFICATION'
    | 'OVER_ISSUED'
    | 'MISSING_PHOTO_EVIDENCE'
    | 'PHOTO_OFF_SITE'
    | 'UNKNOWN_PHOTO_REFERENCE';
  message: string;
}

export interface TraceVerification {
  /** True when there are no error-level issues. */
  verified: boolean;
  /** 0-100: how much of the expected evidence is present. */
  completeness: number;
  issues: TraceIssue[];
}

export interface TraceSummary {
  daysSincePlanting: number;
  latestSequestrationTonnes: number;
  /** Share of sequestered tonnes that were issued as credits (0-1). */
  issuanceCoverage: number;
  onChainEvents: number;
}

/** Photos taken further than this from the farm are flagged as off-site. */
export const PHOTO_MAX_DISTANCE_KM = 5;

const REQUIRED_STAGES: TraceEventStage[] = ['planting', 'verification', 'issuance'];
const REQUIRED_PHOTO_STAGES: TracePhotoStage[] = ['planting', 'sequestration'];

const EVENT_ORDER: Record<TraceEventStage, number> = {
  planting: 0,
  monitoring: 1,
  verification: 2,
  issuance: 3,
  listing: 4,
  transfer: 5,
  retirement: 6,
};

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function time(iso: string): number {
  return new Date(iso).getTime();
}

export function sortEvents(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort(
    (a, b) => time(a.occurredAt) - time(b.occurredAt) || EVENT_ORDER[a.stage] - EVENT_ORDER[b.stage]
  );
}

export function verifyTrace(trace: CreditTrace): TraceVerification {
  const issues: TraceIssue[] = [];
  const events = sortEvents(trace.events);
  const firstOf = (stage: TraceEventStage) => events.find((e) => e.stage === stage);

  // Lifecycle stages should never go backwards in time.
  let maxStageSoFar = -1;
  for (const event of events) {
    const order = EVENT_ORDER[event.stage];
    // Monitoring and transfers can recur, so only flag regressions to an earlier lifecycle phase.
    if (order < maxStageSoFar && event.stage !== 'monitoring' && event.stage !== 'transfer') {
      issues.push({
        severity: 'error',
        code: 'EVENTS_OUT_OF_ORDER',
        message: `"${event.title}" (${event.stage}) is recorded after a later lifecycle stage`,
      });
    }
    maxStageSoFar = Math.max(maxStageSoFar, order);
  }

  const missingStages = REQUIRED_STAGES.filter((stage) => !firstOf(stage));
  for (const stage of missingStages) {
    issues.push({
      severity: 'error',
      code: 'MISSING_STAGE',
      message: `No ${stage} event recorded`,
    });
  }

  const verification = firstOf('verification');
  const issuance = firstOf('issuance');
  if (verification && issuance && time(issuance.occurredAt) < time(verification.occurredAt)) {
    issues.push({
      severity: 'error',
      code: 'ISSUED_BEFORE_VERIFICATION',
      message: 'Credits were issued before the verification was completed',
    });
  }

  const latest = latestSequestration(trace);
  if (latest < trace.issuedTonnes) {
    issues.push({
      severity: 'error',
      code: 'OVER_ISSUED',
      message: `${trace.issuedTonnes} t issued but only ${latest} t of sequestration measured`,
    });
  }

  const missingPhotoStages = REQUIRED_PHOTO_STAGES.filter(
    (stage) => !trace.photos.some((p) => p.stage === stage)
  );
  for (const stage of missingPhotoStages) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_PHOTO_EVIDENCE',
      message: `No ${stage} photos on record`,
    });
  }

  for (const photo of trace.photos) {
    if (!photo.location) continue;
    const km = haversineKm(photo.location, trace.farm.location);
    if (km > PHOTO_MAX_DISTANCE_KM) {
      issues.push({
        severity: 'warning',
        code: 'PHOTO_OFF_SITE',
        message: `Photo "${photo.caption}" was taken ${km.toFixed(1)} km from the farm`,
      });
    }
  }

  const photoIds = new Set(trace.photos.map((p) => p.id));
  for (const event of events) {
    for (const id of event.photoIds ?? []) {
      if (!photoIds.has(id)) {
        issues.push({
          severity: 'warning',
          code: 'UNKNOWN_PHOTO_REFERENCE',
          message: `"${event.title}" references missing photo ${id}`,
        });
      }
    }
  }

  const expected = REQUIRED_STAGES.length + REQUIRED_PHOTO_STAGES.length + 1; // +1 sequestration data
  const present =
    REQUIRED_STAGES.length -
    missingStages.length +
    (REQUIRED_PHOTO_STAGES.length - missingPhotoStages.length) +
    (trace.sequestration.length > 0 ? 1 : 0);

  return {
    verified: !issues.some((i) => i.severity === 'error'),
    completeness: Math.round((present / expected) * 100),
    issues,
  };
}

export function latestSequestration(trace: CreditTrace): number {
  const sorted = [...trace.sequestration].sort((a, b) => time(a.measuredAt) - time(b.measuredAt));
  return sorted.length ? sorted[sorted.length - 1].cumulativeTonnes : 0;
}

export function summarizeTrace(trace: CreditTrace, now: Date = new Date()): TraceSummary {
  const planting = sortEvents(trace.events).find((e) => e.stage === 'planting');
  const latest = latestSequestration(trace);
  return {
    daysSincePlanting: planting
      ? Math.max(0, Math.floor((now.getTime() - time(planting.occurredAt)) / 86_400_000))
      : 0,
    latestSequestrationTonnes: latest,
    issuanceCoverage: latest > 0 ? Math.min(trace.issuedTonnes / latest, 1) : 0,
    onChainEvents: trace.events.filter((e) => Boolean(e.txHash)).length,
  };
}

/**
 * Hides identifying farmer details unless the farmer consented to sharing.
 * Always applied before a trace leaves the server.
 */
export function redactFarmer(farmer: TraceFarmer): TraceFarmer {
  if (farmer.consentToShare) return farmer;
  const initials = farmer.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
  return { ...farmer, name: `Farmer ${initials}`.trim(), photoUrl: undefined };
}

export function toPublicTrace(trace: CreditTrace): CreditTrace {
  return { ...trace, farmer: redactFarmer(trace.farmer), events: sortEvents(trace.events) };
}

export function stellarExplorerTxUrl(
  txHash: string,
  network: 'public' | 'testnet' = 'testnet'
): string {
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

// ── Reference data ──────────────────────────────────────────────────────────
// Seed traces for nature-based marketplace listings until the trace service
// is backed by the planting, verification and indexer tables.

const img = (id: string) => `https://images.unsplash.com/${id}?w=800&h=600&fit=crop`;

export const MOCK_CREDIT_TRACES: CreditTrace[] = [
  {
    batchId: 'batch-br-2023-017',
    listingId: 'listing-001',
    projectName: 'Amazon Rainforest Reforestation',
    standard: 'Gold Standard',
    vintageYear: 2023,
    issuedTonnes: 50.5,
    treeCount: 1_250,
    species: ['Brazil nut', 'Mahogany', 'Açaí palm'],
    farm: {
      id: 'farm-br-0042',
      name: 'Sítio Esperança',
      country: 'Brazil',
      region: 'Pará, Amazon Basin',
      location: { lat: -1.4558, lng: -48.5044 },
      areaHectares: 12.5,
      landUse: 'Degraded pasture restored to agroforest',
      certifications: ['Gold Standard A/R', 'Rainforest Alliance'],
    },
    farmer: {
      id: 'farmer-br-0042',
      name: 'Maria da Silva',
      photoUrl: img('photo-1595273670150-bd0c3c392e46'),
      bio: 'Third-generation smallholder restoring her family pasture into a productive agroforest that feeds her community.',
      yearsFarming: 24,
      cooperative: 'Cooperativa Agroextrativista do Pará',
      treesPlanted: 3_400,
      joinedAt: '2021-08-14T00:00:00Z',
      consentToShare: true,
    },
    photos: [
      {
        id: 'ph-br-1',
        url: img('photo-1542601906990-b4d3fb778b09'),
        caption: 'Seedlings planted along the stream buffer',
        stage: 'planting',
        takenAt: '2022-02-10T09:12:00Z',
        location: { lat: -1.4561, lng: -48.5039 },
        capturedBy: 'Maria da Silva',
      },
      {
        id: 'ph-br-2',
        url: img('photo-1448375240586-882707db888b'),
        caption: 'Canopy closing over the restored plot',
        stage: 'growth',
        takenAt: '2023-03-22T14:40:00Z',
        location: { lat: -1.4552, lng: -48.5051 },
        capturedBy: 'Field monitor J. Costa',
      },
      {
        id: 'ph-br-3',
        url: img('photo-1441974231531-c6227db76b6e'),
        caption: 'Biomass plot measurement for sequestration audit',
        stage: 'sequestration',
        takenAt: '2023-10-05T10:05:00Z',
        location: { lat: -1.4549, lng: -48.5047 },
        capturedBy: 'SCS Global Services',
      },
    ],
    events: [
      {
        id: 'ev-br-1',
        stage: 'planting',
        occurredAt: '2022-02-10T09:00:00Z',
        title: '1,250 native trees planted',
        description: 'Mixed native species planted across 12.5 ha of degraded pasture.',
        actor: 'Maria da Silva',
        txHash: 'a3f1c9e2b7d84f0c9e1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
        photoIds: ['ph-br-1'],
      },
      {
        id: 'ev-br-2',
        stage: 'monitoring',
        occurredAt: '2023-03-22T14:30:00Z',
        title: 'Survival check: 92% of trees thriving',
        description: 'Field monitor counted surviving trees and replaced losses.',
        actor: 'Field monitor J. Costa',
        photoIds: ['ph-br-2'],
      },
      {
        id: 'ev-br-3',
        stage: 'verification',
        occurredAt: '2023-10-05T10:00:00Z',
        title: 'Third-party verification',
        description: 'Biomass sampling confirmed 58.2 t CO₂e sequestered to date.',
        actor: 'SCS Global Services',
        photoIds: ['ph-br-3'],
      },
      {
        id: 'ev-br-4',
        stage: 'issuance',
        occurredAt: '2023-11-01T12:00:00Z',
        title: '50.5 credits issued',
        description: 'Credits minted on Stellar under batch BR-2023-017.',
        actor: 'Farm-credit registry',
        txHash: 'b4e2d0f3c8e95a1d0f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081',
      },
      {
        id: 'ev-br-5',
        stage: 'listing',
        occurredAt: '2024-02-15T10:30:00Z',
        title: 'Listed on the marketplace',
        description: 'Listed for sale at $42.00 per tonne.',
        actor: 'Alice Green',
        txHash: 'c5f3e1a4d9fa6b2e1a3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192',
      },
    ],
    sequestration: [
      { measuredAt: '2022-10-01T00:00:00Z', cumulativeTonnes: 14.1, method: 'Allometric model' },
      { measuredAt: '2023-04-01T00:00:00Z', cumulativeTonnes: 33.8, method: 'Allometric model' },
      {
        measuredAt: '2023-10-05T00:00:00Z',
        cumulativeTonnes: 58.2,
        method: 'Biomass plot sampling',
      },
    ],
  },
  {
    batchId: 'batch-id-2024-004',
    listingId: 'listing-003',
    projectName: 'Mangrove Restoration - Indonesia',
    standard: 'Plan Vivo',
    vintageYear: 2024,
    issuedTonnes: 75.25,
    treeCount: 4_800,
    species: ['Rhizophora mucronata', 'Avicennia marina'],
    farm: {
      id: 'farm-id-0119',
      name: 'Tambak Lestari Mangrove Plot',
      country: 'Indonesia',
      region: 'Demak, Central Java',
      location: { lat: -6.8931, lng: 110.5087 },
      areaHectares: 9.2,
      landUse: 'Abandoned shrimp ponds restored to mangrove',
      certifications: ['Plan Vivo'],
    },
    farmer: {
      id: 'farmer-id-0119',
      name: 'Budi Santoso',
      bio: 'Former shrimp farmer who now leads a village group replanting mangroves to protect the coast from erosion.',
      yearsFarming: 15,
      cooperative: 'Kelompok Tani Mangrove Demak',
      treesPlanted: 11_200,
      joinedAt: '2022-05-02T00:00:00Z',
      consentToShare: false,
    },
    photos: [
      {
        id: 'ph-id-1',
        url: img('photo-1590523741831-ab7e8b8f9c7f'),
        caption: 'Propagules planted at low tide',
        stage: 'planting',
        takenAt: '2022-09-18T06:30:00Z',
        location: { lat: -6.8925, lng: 110.5091 },
        capturedBy: 'Village planting group',
      },
      {
        id: 'ph-id-2',
        url: img('photo-1583212292454-1fe6229603b7'),
        caption: 'Sediment carbon core sampling',
        stage: 'sequestration',
        takenAt: '2024-03-12T08:00:00Z',
        location: { lat: -6.8938, lng: 110.508 },
        capturedBy: 'Plan Vivo validator',
      },
    ],
    events: [
      {
        id: 'ev-id-1',
        stage: 'planting',
        occurredAt: '2022-09-18T06:00:00Z',
        title: '4,800 mangrove propagules planted',
        description: 'Planted across reopened tidal channels in former shrimp ponds.',
        actor: 'Kelompok Tani Mangrove Demak',
        txHash: 'd6a4f2b5eafb7c3f2b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3',
        photoIds: ['ph-id-1'],
      },
      {
        id: 'ev-id-2',
        stage: 'verification',
        occurredAt: '2024-03-12T08:00:00Z',
        title: 'Plan Vivo verification',
        description: 'Above-ground and sediment carbon sampling completed.',
        actor: 'Plan Vivo validator',
        photoIds: ['ph-id-2'],
      },
      {
        id: 'ev-id-3',
        stage: 'issuance',
        occurredAt: '2024-04-02T12:00:00Z',
        title: '75.25 credits issued',
        description: 'Credits minted on Stellar under batch ID-2024-004.',
        actor: 'Farm-credit registry',
        txHash: 'e7b5a3c6fb0c8d4a3c5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4',
      },
      {
        id: 'ev-id-4',
        stage: 'listing',
        occurredAt: '2024-04-10T09:15:00Z',
        title: 'Listed on the marketplace',
        description: 'Listed for sale on the secondary market.',
        actor: 'Carol Chen',
      },
    ],
    sequestration: [
      { measuredAt: '2023-06-01T00:00:00Z', cumulativeTonnes: 41.0, method: 'Allometric model' },
      {
        measuredAt: '2024-03-12T00:00:00Z',
        cumulativeTonnes: 81.4,
        method: 'Sediment core sampling',
      },
    ],
  },
  {
    batchId: 'batch-ke-2022-031',
    listingId: 'listing-005',
    projectName: 'Sustainable Agriculture - Kenya',
    standard: 'Gold Standard',
    vintageYear: 2022,
    issuedTonnes: 30,
    treeCount: 900,
    species: ['Grevillea robusta', 'Mango', 'Macadamia'],
    farm: {
      id: 'farm-ke-0007',
      name: 'Kiambu Ridge Farm',
      country: 'Kenya',
      region: 'Kiambu County',
      location: { lat: -1.1714, lng: 36.8356 },
      areaHectares: 4.1,
      landUse: 'Smallholder coffee intercropped with shade trees',
      certifications: ['Gold Standard', 'Fairtrade'],
    },
    farmer: {
      id: 'farmer-ke-0007',
      name: 'Grace Wanjiru',
      photoUrl: img('photo-1531123897727-8f129e1688ce'),
      bio: 'Coffee grower who added shade trees to cut soil erosion and diversify her income with fruit and nuts.',
      yearsFarming: 18,
      cooperative: 'Kiambu Coffee Farmers Society',
      treesPlanted: 1_450,
      joinedAt: '2020-11-20T00:00:00Z',
      consentToShare: true,
    },
    photos: [
      {
        id: 'ph-ke-1',
        url: img('photo-1500382017468-9049fed747ef'),
        caption: 'Shade tree seedlings between coffee rows',
        stage: 'planting',
        takenAt: '2021-04-03T08:20:00Z',
        location: { lat: -1.1711, lng: 36.8361 },
        capturedBy: 'Grace Wanjiru',
      },
      {
        id: 'ph-ke-2',
        url: img('photo-1464226184884-fa280b87c399'),
        caption: 'Trunk diameter measurement for carbon stock',
        stage: 'sequestration',
        takenAt: '2022-09-14T11:00:00Z',
        location: { lat: -1.1719, lng: 36.835 },
        capturedBy: 'Gold Standard VVB',
      },
    ],
    events: [
      {
        id: 'ev-ke-1',
        stage: 'planting',
        occurredAt: '2021-04-03T08:00:00Z',
        title: '900 shade and fruit trees planted',
        description: 'Intercropped between coffee rows across 4.1 ha.',
        actor: 'Grace Wanjiru',
        txHash: 'f8c6b4d70c1d9e5b4d6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5',
        photoIds: ['ph-ke-1'],
      },
      {
        id: 'ev-ke-2',
        stage: 'verification',
        occurredAt: '2022-09-14T11:00:00Z',
        title: 'Gold Standard verification',
        description: 'DBH survey confirmed 34.6 t CO₂e stored in shade trees.',
        actor: 'Gold Standard VVB',
        photoIds: ['ph-ke-2'],
      },
      {
        id: 'ev-ke-3',
        stage: 'issuance',
        occurredAt: '2022-10-10T12:00:00Z',
        title: '30 credits issued',
        description: 'Credits minted on Stellar under batch KE-2022-031.',
        actor: 'Farm-credit registry',
        txHash: '09d7c5e81d2eaf6c5e708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6',
      },
      {
        id: 'ev-ke-4',
        stage: 'listing',
        occurredAt: '2024-02-10T08:00:00Z',
        title: 'Listed on the marketplace',
        description: 'Listed for sale at $38.00 per tonne.',
        actor: 'Emma Wilson',
      },
    ],
    sequestration: [
      { measuredAt: '2021-12-01T00:00:00Z', cumulativeTonnes: 12.3, method: 'Allometric model' },
      { measuredAt: '2022-09-14T00:00:00Z', cumulativeTonnes: 34.6, method: 'DBH survey' },
    ],
  },
];

/** Looks a trace up by batch id or by the marketplace listing it backs. */
export function findCreditTrace(
  id: string,
  traces: CreditTrace[] = MOCK_CREDIT_TRACES
): CreditTrace | undefined {
  return traces.find((t) => t.batchId === id || t.listingId === id);
}
