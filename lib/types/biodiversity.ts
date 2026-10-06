/**
 * Types for biodiversity monitoring in sponsored tree-planting regions (#1155).
 *
 * Covers bioacoustic sensor readings, drone survey results, species detection
 * events, and the aggregated ecosystem recovery score used in sponsor dashboards.
 */

export type SurveyMethod = 'bioacoustic' | 'drone' | 'manual' | 'camera-trap';

export type RecoveryStatus =
  | 'baseline'
  | 'early-recovery'
  | 'recovering'
  | 'recovered'
  | 'degraded';

// ── Raw data ingestion ────────────────────────────────────────────────────────

export interface BioacousticReading {
  /** Unique sensor device identifier */
  deviceId: string;
  /** Region key (matches oracle regionKey pattern) */
  regionKey: string;
  /** ISO-8601 timestamp of the recording window */
  recordedAt: string;
  /** Duration of the recording window in seconds */
  durationSeconds: number;
  /** List of detected species (common or scientific names) */
  detectedSpecies: string[];
  /** Acoustic complexity index — proxy for biodiversity richness (0–1) */
  aciScore: number;
  /** Optional: raw audio file S3/IPFS URI */
  audioUri?: string;
  /** ed25519 hex signature from the trusted biodiversity oracle */
  signature: string;
}

export interface DroneObservation {
  /** Unique drone flight identifier */
  flightId: string;
  regionKey: string;
  surveyedAt: string;
  /** Altitude of survey in metres */
  altitudeMetres: number;
  /** Estimated canopy cover percentage (0–100) */
  canopyCoverPercent: number;
  /** Detected fauna species from computer-vision classification */
  detectedFauna: string[];
  /** NDVI mean across the surveyed area */
  ndviMean: number;
  /** GeoJSON polygon of the surveyed area (stringified) */
  surveyAreaGeoJson?: string;
  /** S3/IPFS URI for the survey image mosaic */
  imageMosaicUri?: string;
  signature: string;
}

// ── Aggregated ecosystem metrics ──────────────────────────────────────────────

export interface SpeciesDetectionEvent {
  species: string;
  /** Taxonomy group: bird, mammal, reptile, amphibian, insect, plant, fungi */
  taxonomyGroup: string;
  /** ISO-8601 date of first detection in the region since monitoring began */
  firstDetectedAt: string;
  /** Most recent detection date */
  lastDetectedAt: string;
  method: SurveyMethod;
  /** Whether this species is on the IUCN Red List */
  isIucnThreatened: boolean;
  /** IUCN category: LC, NT, VU, EN, CR, EW, EX */
  iucnCategory?: string;
}

export interface EcosystemRecoverySnapshot {
  regionKey: string;
  snapshotDate: string; // ISO-8601
  /** Total unique species detected across all surveys in this region */
  totalSpeciesCount: number;
  /** Species new to the region since the baseline measurement */
  newSpeciesSinceBaseline: number;
  /** Percentage of IUCN-threatened species in the detected set */
  threatenedSpeciesPercent: number;
  /** Mean acoustic complexity index from bioacoustic sensors */
  meanAciScore: number;
  /** Latest drone canopy cover reading */
  canopyCoverPercent: number;
  /** NDVI mean from latest drone survey */
  ndviMean: number;
  /**
   * Composite ecosystem recovery score (0–100), a weighted combination of
   * ACI, canopy cover, NDVI, and species richness relative to baseline.
   */
  recoveryScore: number;
  recoveryStatus: RecoveryStatus;
  /** ISO-8601 timestamp of the most recent data point used */
  lastUpdatedAt: string;
}

// ── API request / response shapes ────────────────────────────────────────────

export interface SubmitBioacousticRequest extends BioacousticReading {}

export interface SubmitDroneObservationRequest extends DroneObservation {}

export interface GetEcosystemSnapshotRequest {
  regionKey: string;
  /** Optional ISO-8601 date; defaults to today */
  asOf?: string;
}

export interface GetEcosystemSnapshotResponse {
  snapshot: EcosystemRecoverySnapshot;
  recentSpeciesEvents: SpeciesDetectionEvent[];
}

export interface ListRegionMonitoringRequest {
  /** Filter by project / sponsor — optional */
  projectId?: string;
  /** Max results, default 20 */
  limit?: number;
  offset?: number;
}

export interface ListRegionMonitoringResponse {
  regions: EcosystemRecoverySnapshot[];
  total: number;
}
