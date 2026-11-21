export type AdminProjectType =
  | 'Reforestation'
  | 'Renewable Energy'
  | 'Mangrove Restoration'
  | 'Sustainable Agriculture'
  | 'Blue Carbon'
  | 'Direct Air Capture'
  | 'Other';

export type AdminProjectLifecycleStatus =
  'Draft' | 'Under Review' | 'Approved' | 'Paused' | 'Archived';

export type AdminRiskRating = 'Low' | 'Medium' | 'High';

export type AdminMrvDocumentStatus = 'Current' | 'Superseded' | 'Pending Review';

export interface AdminMrvDocument {
  id: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  version: string;
  status: AdminMrvDocumentStatus;
}

export interface AdminCreditIssuanceRecord {
  id: string;
  issuanceDate: string;
  batchId: string;
  quantityTons: number;
  recipient: string;
  issuedBy: string;
  notes: string;
}

export interface AdminActivityLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

/**
 * A designated forest protection buffer zone around a reforestation project.
 * Implements issue #1714.
 */
export interface ProjectBufferZone {
  /** GeoJSON polygon coordinates [lng, lat] defining the buffer boundary. */
  polygonCoordinates: Array<[number, number]>;
  /** Area of the protection zone in hectares. */
  areaHectares: number;
  /** Whether deforestation has been detected inside the buffer zone. */
  deforestationAlert: boolean;
  /** ISO-8601 timestamp of the last satellite check for deforestation. */
  lastCheckedAt?: string;
  /** Human-readable description of the protection designation. */
  designationLabel?: string;
}

export interface AdminProjectDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: AdminProjectType;
  lifecycleStatus: AdminProjectLifecycleStatus;
  location: string;
  country: string;
  region: string;
  developer: string;
  methodology: string;
  registry: string;
  registryProjectId: string;
  vintageYear: number;
  startDate: string;
  expectedCreditingEndDate: string;
  pricePerTonUsd: number;
  availableSupplyTons: number;
  totalIssuedTons: number;
  bufferPoolPercent: number;
  estimatedAnnualRemovalTons: number;
  riskRating: AdminRiskRating;
  coBenefits: string[];
  tags: string[];
  verificationEnabled: boolean;
  verificationNotes: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  mrvDocuments: AdminMrvDocument[];
  creditIssuanceHistory: AdminCreditIssuanceRecord[];
  activityLog: AdminActivityLogEntry[];
  /**
   * Optional forest protection buffer zone designation (issue #1714).
   * Only present for reforestation / nature-based projects.
   */
  bufferZone?: ProjectBufferZone;
  /**
   * Primary tree species planted at this project site.
   * Used by the forest regeneration simulation (issue #1710).
   */
  primarySpecies?: string;
  /**
   * Climate zone of the project location.
   * Used by the forest regeneration simulation (issue #1710).
   */
  climateZone?: 'Tropical' | 'Subtropical' | 'Temperate' | 'Boreal' | 'Arid';
}

export interface AdminProjectFormValues {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: AdminProjectType;
  lifecycleStatus: AdminProjectLifecycleStatus;
  location: string;
  country: string;
  region: string;
  developer: string;
  methodology: string;
  registry: string;
  registryProjectId: string;
  vintageYear: number;
  startDate: string;
  expectedCreditingEndDate: string;
  pricePerTonUsd: number;
  availableSupplyTons: number;
  totalIssuedTons: number;
  bufferPoolPercent: number;
  estimatedAnnualRemovalTons: number;
  riskRating: AdminRiskRating;
  coBenefitsText: string;
  tagsText: string;
  verificationEnabled: boolean;
  verificationNotes: string;
}
