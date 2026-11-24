/**
 * Multi-organisation forest project collaboration — Issue #1696.
 *
 * Lets a project admin co-manage one large forest project with partner
 * organisations:
 *
 *  - AC1: `addPartnerOrg` — only the project admin can add co-managers
 *  - AC2: `listZonesForOrg` / `submitZoneEntry` — an organisation only ever
 *         sees its assigned planting zones, and can only record data for them
 *  - AC3: `getUnifiedReport` — one report aggregating every organisation's
 *         entries with per-org and per-zone breakdowns
 *
 * Persistence is an in-process Map so the feature works in dev and unit tests
 * without a database — swap `store` for the Postgres/Prisma layer in
 * production without changing routes or components (same convention as
 * `lib/api/cooperatives.ts`).
 */

import type {
  AddPartnerOrgInput,
  AdminCollaborationView,
  AssignZonesInput,
  CollaborationResult,
  OrgScopedView,
  PartnerOrg,
  PlantingZone,
  SubmitZoneEntryInput,
  UnifiedProjectReport,
  ZoneDataEntry,
} from '@/lib/types/project-collaboration';

interface ProjectCollaboration {
  /** The project admin: the only actor allowed to add/remove co-managers. */
  adminAddress: string;
  orgs: PartnerOrg[];
  zones: PlantingZone[];
  entries: ZoneDataEntry[];
  seededZones: boolean;
}

const store = new Map<string, ProjectCollaboration>();

let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const fail = <T>(error: string, message: string): CollaborationResult<T> => ({
  ok: false,
  error: error as never,
  message,
});

/**
 * Demo-friendly default zones so a project is usable before zones are
 * curated. Seeded once per project, on first access.
 */
const DEFAULT_ZONE_NAMES = [
  'North Planting Zone',
  'South Planting Zone',
  'East Planting Zone',
  'West Planting Zone',
];

function ensureProject(projectId: string, adminAddress?: string): ProjectCollaboration | null {
  const existing = store.get(projectId);
  if (existing) return existing;
  if (!adminAddress) return null;
  const seeded: ProjectCollaboration = {
    adminAddress,
    orgs: [],
    zones: [],
    entries: [],
    seededZones: false,
  };
  store.set(projectId, seeded);
  return seeded;
}

function ensureSeededZones(project: ProjectCollaboration, projectId: string): void {
  if (project.seededZones) return;
  project.seededZones = true;
  for (const name of DEFAULT_ZONE_NAMES) {
    project.zones.push({
      id: nextId('zone'),
      projectId,
      name,
      assignedOrgId: null,
    });
  }
}

const sameActor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ── AC1: project admin adds co-managing organisations ────────────────────────

export function addPartnerOrg(
  projectId: string,
  input: AddPartnerOrgInput,
  actorAddress: string,
  now = Date.now()
): CollaborationResult<PartnerOrg> {
  const project = ensureProject(projectId, actorAddress);
  if (!project) return fail('project_not_found', 'Project not found');
  ensureSeededZones(project, projectId);

  if (!sameActor(actorAddress, project.adminAddress)) {
    return fail('not_project_admin', 'Only the project admin can add co-managing organisations');
  }
  const name = input.name?.trim();
  if (!name) return fail('invalid_input', 'Organisation name is required');
  if (project.orgs.some((org) => org.name.toLowerCase() === name.toLowerCase())) {
    return fail('invalid_input', 'An organisation with that name already manages this project');
  }

  const org: PartnerOrg = {
    id: nextId('org'),
    projectId,
    name,
    contactEmail: input.contactEmail?.trim() || undefined,
    role: input.role ?? 'data_entry',
    addedById: project.adminAddress,
    addedAt: now,
  };
  project.orgs.push(org);
  return { ok: true, value: org };
}

export function listPartnerOrgs(projectId: string): PartnerOrg[] {
  return store.get(projectId)?.orgs ?? [];
}

/**
 * AC1 — the project admin can also remove a co-managing organisation.
 * The org's planting zones are released back to the pool and its data-entry
 * records are discarded (export the unified report first if they must be kept).
 */
export function removePartnerOrg(
  projectId: string,
  orgId: string,
  actorAddress: string
): CollaborationResult<PartnerOrg> {
  const project = store.get(projectId);
  if (!project) return fail('project_not_found', 'Project not found');
  if (!sameActor(actorAddress, project.adminAddress)) {
    return fail('not_project_admin', 'Only the project admin can remove co-managing organisations');
  }
  const index = project.orgs.findIndex((entry) => entry.id === orgId);
  if (index === -1) return fail('org_not_found', 'Organisation not found in this project');
  const [removed] = project.orgs.splice(index, 1);
  for (const zone of project.zones) {
    if (zone.assignedOrgId === orgId) zone.assignedOrgId = null;
  }
  project.entries = project.entries.filter((entry) => entry.orgId !== orgId);
  return { ok: true, value: removed };
}

// ── AC2: zone assignment and org-scoped data entry ───────────────────────────

export function assignZones(
  projectId: string,
  input: AssignZonesInput,
  actorAddress: string,
  now = Date.now()
): CollaborationResult<PlantingZone[]> {
  void now;
  const project = store.get(projectId);
  if (!project) return fail('project_not_found', 'Project not found');
  if (!sameActor(actorAddress, project.adminAddress)) {
    return fail('not_project_admin', 'Only the project admin can assign planting zones');
  }
  const org = project.orgs.find((entry) => entry.id === input.orgId);
  if (!org) return fail('org_not_found', 'Organisation not found in this project');
  if (!Array.isArray(input.zoneIds) || input.zoneIds.length === 0) {
    return fail('invalid_zone', 'At least one zone id is required');
  }
  const known = new Set(project.zones.map((zone) => zone.id));
  for (const zoneId of input.zoneIds) {
    if (!known.has(zoneId)) return fail('invalid_zone', `Unknown zone: ${zoneId}`);
  }
  const assigned = new Set(input.zoneIds);
  for (const zone of project.zones) {
    zone.assignedOrgId = assigned.has(zone.id)
      ? org.id
      : zone.assignedOrgId === org.id
        ? null
        : zone.assignedOrgId;
  }
  return { ok: true, value: project.zones.filter((zone) => zone.assignedOrgId === org.id) };
}

/** AC2 — the zones visible to one organisation: only its assignments. */
export function listZonesForOrg(projectId: string, orgId: string): PlantingZone[] {
  const project = store.get(projectId);
  if (!project) return [];
  return project.zones.filter((zone) => zone.assignedOrgId === orgId);
}

/**
 * AC2 — record planting data for a zone. Denied when the organisation is not
 * the assignee of that zone, so no org can read or write another's zones.
 */
export function submitZoneEntry(
  projectId: string,
  input: SubmitZoneEntryInput,
  now = Date.now()
): CollaborationResult<ZoneDataEntry> {
  const project = store.get(projectId);
  if (!project) return fail('project_not_found', 'Project not found');
  const org = project.orgs.find((entry) => entry.id === input.orgId);
  if (!org) return fail('org_not_found', 'Organisation not found in this project');
  const zone = project.zones.find((entry) => entry.id === input.zoneId);
  if (!zone) return fail('invalid_zone', 'Planting zone not found');
  if (zone.assignedOrgId !== org.id) {
    return fail(
      'org_not_assigned_to_zone',
      'Your organisation is not assigned to this planting zone'
    );
  }
  if (!Number.isFinite(input.treesPlanted) || input.treesPlanted < 0) {
    return fail('invalid_input', 'treesPlanted must be a non-negative number');
  }
  if (!Number.isFinite(input.areaHectares) || input.areaHectares < 0) {
    return fail('invalid_input', 'areaHectares must be a non-negative number');
  }

  const entry: ZoneDataEntry = {
    id: nextId('entry'),
    projectId,
    zoneId: zone.id,
    orgId: org.id,
    treesPlanted: Math.round(input.treesPlanted),
    areaHectares: input.areaHectares,
    notes: input.notes?.trim() || undefined,
    submittedAt: now,
  };
  project.entries.push(entry);
  return { ok: true, value: entry };
}

/** Admin view: everything. */
export function getAdminView(
  projectId: string,
  actorAddress: string
): AdminCollaborationView | null {
  const project = store.get(projectId);
  if (!project) return null;
  return {
    isProjectAdmin: sameActor(actorAddress, project.adminAddress),
    adminAddress: project.adminAddress,
    orgs: [...project.orgs],
    zones: [...project.zones],
    entries: [...project.entries],
  };
}

/** Org-scoped view: only that organisation's zones and entries (AC2). */
export function getOrgScopedView(projectId: string, orgId: string): OrgScopedView | null {
  const project = store.get(projectId);
  if (!project) return null;
  const org = project.orgs.find((entry) => entry.id === orgId);
  if (!org) return null;
  return {
    orgId,
    org,
    zones: listZonesForOrg(projectId, orgId),
    entries: project.entries.filter((entry) => entry.orgId === orgId),
  };
}

// ── AC3: unified report across all organisations ─────────────────────────────

export function getUnifiedReport(projectId: string, now = Date.now()): UnifiedProjectReport | null {
  const project = store.get(projectId);
  if (!project) return null;

  const orgById = new Map(project.orgs.map((org) => [org.id, org]));

  const totalsByOrg = new Map<
    string,
    { zones: number; entries: number; treesPlanted: number; areaHectares: number }
  >();
  for (const org of project.orgs) {
    totalsByOrg.set(org.id, { zones: 0, entries: 0, treesPlanted: 0, areaHectares: 0 });
  }
  const totalsByZone = new Map<
    string,
    { entries: number; treesPlanted: number; areaHectares: number }
  >();
  for (const zone of project.zones) {
    totalsByZone.set(zone.id, { entries: 0, treesPlanted: 0, areaHectares: 0 });
  }

  let trees = 0;
  let area = 0;
  for (const entry of project.entries) {
    trees += entry.treesPlanted;
    area += entry.areaHectares;
    const orgTotals = totalsByOrg.get(entry.orgId);
    if (orgTotals) {
      orgTotals.entries += 1;
      orgTotals.treesPlanted += entry.treesPlanted;
      orgTotals.areaHectares += entry.areaHectares;
    }
    const zoneTotals = totalsByZone.get(entry.zoneId);
    if (zoneTotals) {
      zoneTotals.entries += 1;
      zoneTotals.treesPlanted += entry.treesPlanted;
      zoneTotals.areaHectares += entry.areaHectares;
    }
  }

  for (const zone of project.zones) {
    if (zone.assignedOrgId) {
      const orgTotals = totalsByOrg.get(zone.assignedOrgId);
      if (orgTotals) orgTotals.zones += 1;
    }
  }

  return {
    projectId,
    generatedAt: now,
    totals: {
      organisations: project.orgs.length,
      zones: project.zones.length,
      zonesAssigned: project.zones.filter((zone) => zone.assignedOrgId !== null).length,
      treesPlanted: trees,
      areaHectares: area,
      entries: project.entries.length,
    },
    byOrganisation: project.orgs.map((org) => {
      const totals = totalsByOrg.get(org.id)!;
      return {
        orgId: org.id,
        orgName: org.name,
        zones: totals.zones,
        entries: totals.entries,
        treesPlanted: totals.treesPlanted,
        areaHectares: totals.areaHectares,
      };
    }),
    byZone: project.zones.map((zone) => {
      const totals = totalsByZone.get(zone.id)!;
      const owner = zone.assignedOrgId ? orgById.get(zone.assignedOrgId) : null;
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        orgId: zone.assignedOrgId,
        orgName: owner ? owner.name : null,
        entries: totals.entries,
        treesPlanted: totals.treesPlanted,
        areaHectares: totals.areaHectares,
      };
    }),
  };
}

/** Test helper: drop all collaboration state. */
export function resetProjectCollaboration(): void {
  store.clear();
}
