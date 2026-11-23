import type { Pool } from 'pg';
import type { AdminProjectLifecycleStatus, AdminProjectType } from '@/lib/types/adminProject';
import {
  notifyPriceChanged,
  notifyProjectApproved,
  notifyProjectStatusChanged,
} from '@/lib/webhook/offset-verification-bridge';

export const ADMIN_PROJECT_LIFECYCLE_STATUSES: readonly AdminProjectLifecycleStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Paused',
  'Archived',
] as const;

export interface AdminProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  project_type: AdminProjectType;
  region: string;
  country: string;
  standard: string;
  methodology: string;
  registry_project_id: string;
  expected_annual_tonnes: string | number;
  price_per_ton_usd: string | number;
  available_supply_tons: string | number;
  total_issued_tons: string | number;
  lifecycle_status: AdminProjectLifecycleStatus;
  verification_enabled: boolean;
  verification_notes: string;
  updated_by: string;
  updated_at: Date | string;
  created_at: Date | string;
}

export interface AdminProjectRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: AdminProjectType;
  region: string;
  country: string;
  standard: string;
  methodology: string;
  registryProjectId: string;
  expectedAnnualTonnes: number;
  pricePerTonUsd: number;
  availableSupplyTons: number;
  totalIssuedTons: number;
  lifecycleStatus: AdminProjectLifecycleStatus;
  verificationEnabled: boolean;
  verificationNotes: string;
  updatedBy: string;
  updatedAt: string;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapRow(row: AdminProjectRow): AdminProjectRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.project_type,
    region: row.region,
    country: row.country,
    standard: row.standard,
    methodology: row.methodology,
    registryProjectId: row.registry_project_id,
    expectedAnnualTonnes: Number(row.expected_annual_tonnes),
    pricePerTonUsd: Number(row.price_per_ton_usd),
    availableSupplyTons: Number(row.available_supply_tons),
    totalIssuedTons: Number(row.total_issued_tons),
    lifecycleStatus: row.lifecycle_status,
    verificationEnabled: row.verification_enabled,
    verificationNotes: row.verification_notes,
    updatedBy: row.updated_by,
    updatedAt: toIso(row.updated_at),
  };
}

export function isValidAdminLifecycleStatus(value: unknown): value is AdminProjectLifecycleStatus {
  return (
    typeof value === 'string' &&
    (ADMIN_PROJECT_LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

export async function listAdminProjects(pool: Pool): Promise<AdminProjectRecord[]> {
  const { rows } = await pool.query<AdminProjectRow>(
    `SELECT * FROM admin_projects ORDER BY id ASC`
  );
  return rows.map(mapRow);
}

export async function getAdminProjectById(
  pool: Pool,
  id: string
): Promise<AdminProjectRecord | null> {
  const { rows } = await pool.query<AdminProjectRow>(
    `SELECT * FROM admin_projects WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface UpdateAdminProjectInput {
  lifecycleStatus?: AdminProjectLifecycleStatus;
  pricePerTonUsd?: number;
  verificationEnabled?: boolean;
  verificationNotes?: string;
  updatedBy?: string;
}

export async function updateAdminProject(
  pool: Pool,
  id: string,
  input: UpdateAdminProjectInput
): Promise<{ previous: AdminProjectRecord; updated: AdminProjectRecord } | null> {
  const previous = await getAdminProjectById(pool, id);
  if (!previous) return null;

  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];

  if (input.lifecycleStatus !== undefined) {
    values.push(input.lifecycleStatus);
    sets.push(`lifecycle_status = $${values.length}`);
  }
  if (input.pricePerTonUsd !== undefined) {
    values.push(Math.round(input.pricePerTonUsd * 100) / 100);
    sets.push(`price_per_ton_usd = $${values.length}`);
  }
  if (input.verificationEnabled !== undefined) {
    values.push(input.verificationEnabled);
    sets.push(`verification_enabled = $${values.length}`);
  }
  if (input.verificationNotes !== undefined) {
    values.push(input.verificationNotes);
    sets.push(`verification_notes = $${values.length}`);
  }
  if (input.updatedBy !== undefined) {
    values.push(input.updatedBy);
    sets.push(`updated_by = $${values.length}`);
  }

  values.push(id);
  const { rows } = await pool.query<AdminProjectRow>(
    `UPDATE admin_projects
        SET ${sets.join(', ')}
      WHERE id = $${values.length}
      RETURNING *`,
    values
  );

  if (!rows[0]) return null;
  return { previous, updated: mapRow(rows[0]) };
}

export function emitAdminProjectTransitionWebhooks(
  previous: AdminProjectRecord,
  updated: AdminProjectRecord,
  context: {
    note?: string | null;
    approvedBy?: string;
    approvalReference?: string;
    transactionHash?: string | null;
    explorerUrl?: string | null;
    reason?: string | null;
  } = {}
): void {
  const statusChanged = previous.lifecycleStatus !== updated.lifecycleStatus;
  if (statusChanged) {
    void notifyProjectStatusChanged({
      projectId: updated.id,
      projectName: updated.name,
      previousStatus: previous.lifecycleStatus,
      newStatus: updated.lifecycleStatus,
      note: context.note ?? null,
      transactionHash: context.transactionHash ?? null,
      explorerUrl: context.explorerUrl ?? null,
      changedAt: updated.updatedAt,
    });

    if (updated.lifecycleStatus === 'Approved' && previous.lifecycleStatus !== 'Approved') {
      void notifyProjectApproved({
        projectId: updated.id,
        projectName: updated.name,
        projectType: updated.type,
        region: updated.region,
        standard: updated.standard,
        expectedAnnualTonnes: updated.expectedAnnualTonnes,
        approvedBy: context.approvedBy ?? updated.updatedBy ?? 'admin',
        approvalReference:
          context.approvalReference ?? `APPROVAL-${updated.id.toUpperCase()}-${Date.now()}`,
        transactionHash: context.transactionHash ?? null,
        explorerUrl: context.explorerUrl ?? null,
        approvedAt: updated.updatedAt,
      });
    }
  }

  if (updated.pricePerTonUsd !== previous.pricePerTonUsd) {
    const year = new Date(updated.updatedAt).getUTCFullYear();
    void notifyPriceChanged({
      assetCode: `CARBON-${updated.id.toUpperCase()}-${year}`,
      projectId: updated.id,
      currency: 'USD',
      previousPricePerTon: previous.pricePerTonUsd,
      pricePerTon: updated.pricePerTonUsd,
      reason: context.reason ?? 'Admin project price update',
      transactionHash: context.transactionHash ?? null,
      explorerUrl: context.explorerUrl ?? null,
      changedAt: updated.updatedAt,
    });
  }
}
