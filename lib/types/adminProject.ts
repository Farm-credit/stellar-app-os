export type AdminProjectType =
  | 'Reforestation'
  | 'Renewable Energy'
  | 'Mangrove Restoration'
  | 'Sustainable Agriculture'
  | 'Blue Carbon'
  | 'Direct Air Capture'
  | 'Other';

export type AdminProjectLifecycleStatus =
  | 'Draft'
  | 'Under Review'
  | 'Approved'
  | 'Paused'
  | 'Archived';

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
