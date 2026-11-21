export const runtime = 'nodejs';

import {
  addPartnerOrg,
  assignZones,
  getAdminView,
  getOrgScopedView,
  listPartnerOrgs,
  removePartnerOrg,
  submitZoneEntry,
} from '@/lib/api/projectCollaboration';

/**
 * Multi-org collaboration API — Issue #1696.
 *
 * GET  ?orgId=…&adminAddress=…  → org-scoped view (only that org's zones) or
 *                                admin view (everything) (AC2)
 * POST { action: 'add_org' | 'remove_org' | 'assign_zones' | 'submit_entry', … } (AC1/AC2)
 */

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId');
  const adminAddress = url.searchParams.get('adminAddress');

  if (orgId) {
    const view = getOrgScopedView(id, orgId);
    return view ? json({ view }) : json({ error: 'Organisation not found for this project' }, 404);
  }
  if (adminAddress) {
    const view = getAdminView(id, adminAddress);
    return view ? json({ view }) : json({ error: 'Project not found' }, 404);
  }
  return json({ orgs: listPartnerOrgs(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    action?: string;
    name?: string;
    contactEmail?: string;
    role?: 'admin' | 'data_entry';
    actorAddress?: string;
    orgId?: string;
    zoneIds?: string[];
    zoneId?: string;
    treesPlanted?: number;
    areaHectares?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request body' }, 400);
  }

  switch (body.action) {
    case 'add_org': {
      if (!body.actorAddress) return json({ error: 'actorAddress is required' }, 400);
      const result = addPartnerOrg(
        id,
        { name: body.name ?? '', contactEmail: body.contactEmail, role: body.role },
        body.actorAddress
      );
      return result.ok
        ? json({ org: result.value }, 201)
        : json(
            { error: result.message, code: result.error },
            result.error === 'project_not_found' ? 404 : 403
          );
    }
    case 'remove_org': {
      if (!body.actorAddress) return json({ error: 'actorAddress is required' }, 400);
      const result = removePartnerOrg(id, body.orgId ?? '', body.actorAddress);
      return result.ok
        ? json({ org: result.value })
        : json(
            { error: result.message, code: result.error },
            result.error === 'project_not_found'
              ? 404
              : result.error === 'not_project_admin'
                ? 403
                : 400
          );
    }
    case 'assign_zones': {
      if (!body.actorAddress) return json({ error: 'actorAddress is required' }, 400);
      const result = assignZones(
        id,
        { orgId: body.orgId ?? '', zoneIds: body.zoneIds ?? [] },
        body.actorAddress
      );
      return result.ok
        ? json({ zones: result.value })
        : json(
            { error: result.message, code: result.error },
            result.error === 'project_not_found' ? 404 : 400
          );
    }
    case 'submit_entry': {
      const result = submitZoneEntry(id, {
        orgId: body.orgId ?? '',
        zoneId: body.zoneId ?? '',
        treesPlanted: body.treesPlanted ?? Number.NaN,
        areaHectares: body.areaHectares ?? Number.NaN,
        notes: body.notes,
      });
      return result.ok
        ? json({ entry: result.value }, 201)
        : json(
            { error: result.message, code: result.error },
            result.error === 'project_not_found' ? 404 : 400
          );
    }
    default:
      return json(
        { error: 'action must be one of: add_org, remove_org, assign_zones, submit_entry' },
        400
      );
  }
}
