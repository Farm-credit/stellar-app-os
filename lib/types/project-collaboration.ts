/**
 * Multi-organisation forest project collaboration — Issue #1696.
 *
 * Types for co-managing a single large forest project across partner
 * organisations: membership, planting-zone assignments, org-scoped data
 * entry, and the unified cross-org report.
 */

/** Role of a partner organisation within a project. */
export type PartnerOrgRole = 'admin' | 'data_entry';

/** A partner organisation co-managing a project. */
export interface PartnerOrg {
  id: string;
  projectId: string;
  name: string;
  contactEmail?: string;
  role: PartnerOrgRole;
  /** Address of the project admin who added this organisation. */
  addedById: string;
  addedAt: number;
}

/** A named planting zone owned by exactly one partner organisation. */
export interface PlantingZone {
  id: string;
  projectId: string;
  name: string;
  /** Org currently assigned to this zone; null while unassigned. */
  assignedOrgId: string | null;
}

/** One org's data submission for a planting zone. */
export interface ZoneDataEntry {
  id: string;
  projectId: string;
  zoneId: string;
  orgId: string;
  treesPlanted: number;
  areaHectares: number;
  notes?: string;
  submittedAt: number;
}

export interface AddPartnerOrgInput {
  name: string;
  contactEmail?: string;
  role?: PartnerOrgRole;
}

export interface AssignZonesInput {
  orgId: string;
  zoneIds: string[];
}

export interface SubmitZoneEntryInput {
  orgId: string;
  zoneId: string;
  treesPlanted: number;
  areaHectares: number;
  notes?: string;
}

/** Reason a collaboration action was denied. */
export type CollaborationErrorCode =
  | 'project_not_found'
  | 'not_project_admin'
  | 'org_not_found'
  | 'org_not_assigned_to_zone'
  | 'invalid_zone'
  | 'invalid_input';

export type CollaborationResult<T> =
  { ok: true; value: T } | { ok: false; error: CollaborationErrorCode; message: string };

/** Org-scoped view: only that org's zones, assignments and entries. */
export interface OrgScopedView {
  orgId: string;
  org: PartnerOrg;
  zones: PlantingZone[];
  entries: ZoneDataEntry[];
}

/** Full admin view: every org, zone and entry in the project. */
export interface AdminCollaborationView {
  isProjectAdmin: boolean;
  adminAddress: string;
  orgs: PartnerOrg[];
  zones: PlantingZone[];
  entries: ZoneDataEntry[];
}

/** AC3 — unified report aggregating data from all organisations. */
export interface UnifiedProjectReport {
  projectId: string;
  generatedAt: number;
  totals: {
    organisations: number;
    zones: number;
    zonesAssigned: number;
    treesPlanted: number;
    areaHectares: number;
    entries: number;
  };
  byOrganisation: Array<{
    orgId: string;
    orgName: string;
    zones: number;
    entries: number;
    treesPlanted: number;
    areaHectares: number;
  }>;
  byZone: Array<{
    zoneId: string;
    zoneName: string;
    orgId: string | null;
    orgName: string | null;
    entries: number;
    treesPlanted: number;
    areaHectares: number;
  }>;
}
