'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type {
  AdminCollaborationView,
  OrgScopedView,
  PartnerOrg,
  PlantingZone,
  UnifiedProjectReport,
} from '@/lib/types/project-collaboration';

/**
 * Multi-organisation collaboration dashboard — Issue #1696.
 *
 * Three panels on the project page:
 *   AC1 — partner organisation management (admin adds co-managers, assigns zones)
 *   AC2 — org-scoped planting zones: when "viewing as" an organisation the
 *         zone list and data-entry form only ever contain its assigned zones
 *   AC3 — unified project report aggregating every organisation's entries
 */
interface ProjectCollaborationDashboardProps {
  projectId: string;
  projectName: string;
  /** Address of the project admin — the only actor who can add co-managers. */
  adminAddress?: string;
}

const DEMO_ADMIN_ADDRESS = 'G-PROJECT-ADMIN';

type ViewingAs = { kind: 'admin' } | { kind: 'org'; orgId: string };

export function ProjectCollaborationDashboard({
  projectId,
  projectName,
  adminAddress = DEMO_ADMIN_ADDRESS,
}: ProjectCollaborationDashboardProps) {
  const [viewingAs, setViewingAs] = React.useState<ViewingAs>({ kind: 'admin' });
  const [adminView, setAdminView] = React.useState<AdminCollaborationView | null>(null);
  const [orgView, setOrgView] = React.useState<OrgScopedView | null>(null);
  const [report, setReport] = React.useState<UnifiedProjectReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [newOrgName, setNewOrgName] = React.useState('');
  const [newOrgEmail, setNewOrgEmail] = React.useState('');
  const [pendingZoneOrgId, setPendingZoneOrgId] = React.useState<string | null>(null);

  const [entryZoneId, setEntryZoneId] = React.useState('');
  const [entryTrees, setEntryTrees] = React.useState('');
  const [entryArea, setEntryArea] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewRes, reportRes] = await Promise.all([
        fetch(
          `/api/projects/${projectId}/collaboration?adminAddress=${encodeURIComponent(adminAddress)}`
        ),
        fetch(`/api/projects/${projectId}/collaboration/report`),
      ]);
      if (viewRes.ok) {
        const body = (await viewRes.json()) as { view?: AdminCollaborationView };
        setAdminView(body.view ?? null);
      }
      if (reportRes.ok) setReport((await reportRes.json()) as UnifiedProjectReport);

      if (viewingAs.kind === 'org') {
        const scoped = await fetch(
          `/api/projects/${projectId}/collaboration?orgId=${encodeURIComponent(viewingAs.orgId)}`
        );
        if (scoped.ok) {
          const body = (await scoped.json()) as { view?: OrgScopedView };
          setOrgView(body.view ?? null);
        }
      } else {
        setOrgView(null);
      }
    } catch {
      setError('Could not load collaboration data.');
    } finally {
      setLoading(false);
    }
  }, [projectId, adminAddress, viewingAs]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${projectId}/collaboration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };

  // ── AC1: admin adds a co-managing organisation ─────────────────────────────
  const handleAddOrg = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await post({
        action: 'add_org',
        name: newOrgName,
        contactEmail: newOrgEmail || undefined,
        actorAddress: adminAddress,
      });
      toast.success(`${newOrgName.trim()} added as co-manager`);
      setNewOrgName('');
      setNewOrgEmail('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add organisation');
    }
  };

  const handleToggleZoneAssignment = async (org: PartnerOrg, zone: PlantingZone) => {
    setPendingZoneOrgId(org.id);
    try {
      const isAssigned = zone.assignedOrgId === org.id;
      const ownZones = (adminView?.zones ?? []).filter(
        (z) => z.assignedOrgId === org.id && z.id !== zone.id
      );
      const zoneIds = isAssigned
        ? ownZones.map((z) => z.id)
        : [...ownZones.map((z) => z.id), zone.id];
      await post({ action: 'assign_zones', orgId: org.id, zoneIds, actorAddress: adminAddress });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign zone');
    } finally {
      setPendingZoneOrgId(null);
    }
  };

  // ── AC2: org-scoped data entry ─────────────────────────────────────────────
  const visibleZones: PlantingZone[] =
    viewingAs.kind === 'admin' ? (adminView?.zones ?? []) : (orgView?.zones ?? []);

  const handleSubmitEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (viewingAs.kind !== 'org') return;
    setSubmitting(true);
    try {
      await post({
        action: 'submit_entry',
        orgId: viewingAs.orgId,
        zoneId: entryZoneId,
        treesPlanted: Number(entryTrees),
        areaHectares: Number(entryArea),
      });
      toast.success('Planting data recorded for your organisation');
      setEntryZoneId('');
      setEntryTrees('');
      setEntryArea('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record entry');
    } finally {
      setSubmitting(false);
    }
  };

  const orgs = adminView?.orgs ?? [];

  return (
    <section aria-label="Organisation collaboration" className="mt-16 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Collaborating Organisations</h2>
          <p className="text-sm text-muted-foreground">
            Co-manage {projectName} across partner organisations with zone-level permissions.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Viewing as</span>
          <select
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={viewingAs.kind === 'admin' ? 'admin' : viewingAs.orgId}
            onChange={(event) =>
              setViewingAs(
                event.target.value === 'admin'
                  ? { kind: 'admin' }
                  : { kind: 'org', orgId: event.target.value }
              )
            }
          >
            <option value="admin">Project admin</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AC1 — partner organisation management */}
        <Card>
          <CardHeader>
            <CardTitle>Partner organisations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {orgs.length === 0 && (
                <li className="text-sm text-muted-foreground">No co-managers yet.</li>
              )}
              {orgs.map((org) => (
                <li
                  key={org.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{org.name}</span>
                    {org.contactEmail && (
                      <span className="ml-2 text-muted-foreground">{org.contactEmail}</span>
                    )}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {org.role}
                  </span>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddOrg} className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add co-managing organisation (project admin only)
              </p>
              <Input
                placeholder="Organisation name"
                value={newOrgName}
                onChange={(event) => setNewOrgName(event.target.value)}
                required
              />
              <Input
                type="email"
                placeholder="Contact email (optional)"
                value={newOrgEmail}
                onChange={(event) => setNewOrgEmail(event.target.value)}
              />
              <Button type="submit" size="sm" className="w-full">
                Add organisation
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* AC2 — org-scoped planting zones + data entry */}
        <Card>
          <CardHeader>
            <CardTitle>
              {viewingAs.kind === 'admin'
                ? 'All planting zones'
                : 'My organisation’s planting zones'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {visibleZones.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No zones assigned to this organisation yet.
                </li>
              )}
              {visibleZones.map((zone) => {
                const owner = orgs.find((org) => org.id === zone.assignedOrgId);
                return (
                  <li
                    key={zone.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{zone.name}</span>
                    {viewingAs.kind === 'admin' ? (
                      <button
                        type="button"
                        disabled={pendingZoneOrgId !== null}
                        onClick={() => {
                          const org = orgs.find((entry) => entry.role === 'data_entry') ?? orgs[0];
                          if (org) void handleToggleZoneAssignment(org, zone);
                        }}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          zone.assignedOrgId
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                        title={
                          owner ? `Assigned to ${owner.name} — click to reassign` : 'Unassigned'
                        }
                      >
                        {owner ? owner.name : 'Unassigned'}
                      </button>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Assigned
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {viewingAs.kind === 'org' && visibleZones.length > 0 && (
              <form onSubmit={handleSubmitEntry} className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Record planting data for your zones
                </p>
                <select
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={entryZoneId}
                  onChange={(event) => setEntryZoneId(event.target.value)}
                  required
                >
                  <option value="">Select your planting zone…</option>
                  {visibleZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Trees planted"
                    value={entryTrees}
                    onChange={(event) => setEntryTrees(event.target.value)}
                    required
                  />
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Area (ha)"
                    value={entryArea}
                    onChange={(event) => setEntryArea(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Record data'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AC3 — unified report across every organisation */}
      <Card>
        <CardHeader>
          <CardTitle>Unified project report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!report || report.totals.organisations === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add collaborating organisations to start the unified report.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <Stat label="Organisations" value={report.totals.organisations} />
                <Stat
                  label="Zones assigned"
                  value={`${report.totals.zonesAssigned}/${report.totals.zones}`}
                />
                <Stat label="Entries" value={report.totals.entries} />
                <Stat label="Trees planted" value={report.totals.treesPlanted.toLocaleString()} />
                <Stat label="Area (ha)" value={report.totals.areaHectares.toLocaleString()} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Organisation</th>
                      <th className="py-2 pr-4">Zones</th>
                      <th className="py-2 pr-4">Entries</th>
                      <th className="py-2 pr-4">Trees planted</th>
                      <th className="py-2">Area (ha)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byOrganisation.map((row) => (
                      <tr key={row.orgId} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium">{row.orgName}</td>
                        <td className="py-2 pr-4">{row.zones}</td>
                        <td className="py-2 pr-4">{row.entries}</td>
                        <td className="py-2 pr-4">{row.treesPlanted.toLocaleString()}</td>
                        <td className="py-2">{row.areaHectares.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
