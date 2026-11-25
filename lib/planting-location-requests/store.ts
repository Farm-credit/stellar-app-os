import crypto from 'crypto';
import type { PlantingLocation } from '@/lib/db/schema';
import { getMockPlantingLocations } from '@/lib/api/mock/plantingLocations';
import type {
  CreateLocationRequestInput,
  LocationRequestStatus,
  PlantingLocationRequest,
} from './types';

interface PlantingLocationRequestRow {
  id: string;
  sponsor_id: string | null;
  sponsor_name: string;
  sponsor_email: string;
  transaction_ref: string | null;
  tree_count: number;
  preferred_region: string;
  preferred_country: string | null;
  preference_notes: string | null;
  status: LocationRequestStatus;
  assigned_location_id: number | null;
  assigned_zone_name: string | null;
  assigned_region: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  notified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToRequest(row: PlantingLocationRequestRow): PlantingLocationRequest {
  return {
    id: row.id,
    sponsorId: row.sponsor_id,
    sponsorName: row.sponsor_name,
    sponsorEmail: row.sponsor_email,
    transactionRef: row.transaction_ref,
    treeCount: Number(row.tree_count),
    preferredRegion: row.preferred_region,
    preferredCountry: row.preferred_country,
    preferenceNotes: row.preference_notes,
    status: row.status,
    assignedLocationId: row.assigned_location_id !== null ? Number(row.assigned_location_id) : null,
    assignedZoneName: row.assigned_zone_name,
    assignedRegion: row.assigned_region,
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
    notifiedAt: toIso(row.notified_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function buildSeedRequests(): PlantingLocationRequest[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'locreq_seed_1',
      sponsorId: 'GA7EXAMPLE1111111111111111111111111111111111111111111111',
      sponsorName: 'Amara Okafor',
      sponsorEmail: 'amara.okafor@example.org',
      transactionRef: 'tx_seed_kano_001',
      treeCount: 25,
      preferredRegion: 'Sub-Saharan Africa',
      preferredCountry: 'Nigeria',
      preferenceNotes: 'Would love drought-tolerant species in northern Nigeria.',
      status: 'pending',
      assignedLocationId: null,
      assignedZoneName: null,
      assignedRegion: null,
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'locreq_seed_2',
      sponsorId: null,
      sponsorName: 'Lucas Silva',
      sponsorEmail: 'lucas.silva@example.org',
      transactionRef: 'pi_seed_brazil_002',
      treeCount: 50,
      preferredRegion: 'Latin America',
      preferredCountry: 'Brazil',
      preferenceNotes: 'Atlantic Forest restoration if capacity allows.',
      status: 'pending',
      assignedLocationId: null,
      assignedZoneName: null,
      assignedRegion: null,
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'locreq_seed_3',
      sponsorId: null,
      sponsorName: 'Elena Rossi',
      sponsorEmail: 'elena.rossi@example.org',
      transactionRef: 'pi_seed_nordic_003',
      treeCount: 15,
      preferredRegion: 'Northern Europe',
      preferredCountry: 'Norway',
      preferenceNotes: 'Prefer boreal or temperate European restoration zone.',
      status: 'pending',
      assignedLocationId: null,
      assignedZoneName: null,
      assignedRegion: null,
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

let inMemoryRequests: PlantingLocationRequest[] = buildSeedRequests();

export function resetInMemoryLocationRequests(seed = true): void {
  inMemoryRequests = seed ? buildSeedRequests() : [];
}

async function getDbPoolOrNull() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  try {
    const { getPool } = await import('@/lib/db/client');
    return getPool();
  } catch {
    return null;
  }
}

export async function getAvailablePlantingZones(): Promise<PlantingLocation[]> {
  const pool = await getDbPoolOrNull();
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, name, description, latitude, longitude, region, climate,
                species, available_capacity AS "availableCapacity"
         FROM planting_locations
         WHERE available_capacity > 0
         ORDER BY available_capacity DESC`
      );
      return result.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        description: String(row.description),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        region: String(row.region),
        climate: String(row.climate),
        species: Array.isArray(row.species) ? row.species : [],
        availableCapacity: Number(row.availableCapacity ?? 0),
      }));
    } catch {
      // Fallback to mock locations when DB is unreachable in local/test mode
    }
  }
  return getMockPlantingLocations();
}

export async function createLocationRequest(
  input: CreateLocationRequestInput
): Promise<PlantingLocationRequest> {
  const id = `locreq_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();

  const pool = await getDbPoolOrNull();
  if (pool) {
    try {
      const result = await pool.query<PlantingLocationRequestRow>(
        `INSERT INTO planting_location_requests (
           id, sponsor_id, sponsor_name, sponsor_email, transaction_ref,
           tree_count, preferred_region, preferred_country, preference_notes,
           status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $10)
         RETURNING *`,
        [
          id,
          input.sponsorId ?? null,
          input.sponsorName?.trim() ?? '',
          input.sponsorEmail.trim(),
          input.transactionRef ?? null,
          input.treeCount,
          input.preferredRegion.trim(),
          input.preferredCountry?.trim() || null,
          input.preferenceNotes?.trim() || null,
          now,
        ]
      );
      return rowToRequest(result.rows[0]);
    } catch {
      // Fall through to in-memory store if DB table/connection is unavailable
    }
  }

  const record: PlantingLocationRequest = {
    id,
    sponsorId: input.sponsorId ?? null,
    sponsorName: input.sponsorName?.trim() ?? '',
    sponsorEmail: input.sponsorEmail.trim(),
    transactionRef: input.transactionRef ?? null,
    treeCount: input.treeCount,
    preferredRegion: input.preferredRegion.trim(),
    preferredCountry: input.preferredCountry?.trim() || null,
    preferenceNotes: input.preferenceNotes?.trim() || null,
    status: 'pending',
    assignedLocationId: null,
    assignedZoneName: null,
    assignedRegion: null,
    adminNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryRequests = [record, ...inMemoryRequests];
  return record;
}

export interface ListLocationRequestsFilter {
  status?: LocationRequestStatus | 'all';
  email?: string;
  transactionRef?: string;
  search?: string;
}

export async function listLocationRequests(
  filter: ListLocationRequestsFilter = {}
): Promise<PlantingLocationRequest[]> {
  const pool = await getDbPoolOrNull();
  if (pool) {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (filter.status && filter.status !== 'all') {
        conditions.push(`status = $${idx++}`);
        params.push(filter.status);
      }
      if (filter.email) {
        conditions.push(`LOWER(sponsor_email) = LOWER($${idx++})`);
        params.push(filter.email.trim());
      }
      if (filter.transactionRef) {
        conditions.push(`transaction_ref = $${idx++}`);
        params.push(filter.transactionRef.trim());
      }
      if (filter.search) {
        const pattern = `%${filter.search.trim()}%`;
        conditions.push(
          `(sponsor_name ILIKE $${idx} OR sponsor_email ILIKE $${idx} OR preferred_region ILIKE $${idx} OR COALESCE(preferred_country, '') ILIKE $${idx})`
        );
        params.push(pattern);
        idx++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query<PlantingLocationRequestRow>(
        `SELECT * FROM planting_location_requests ${where} ORDER BY created_at DESC`,
        params
      );
      return result.rows.map(rowToRequest);
    } catch {
      // Fallback to in-memory store
    }
  }

  return inMemoryRequests.filter((req) => {
    if (filter.status && filter.status !== 'all' && req.status !== filter.status) {
      return false;
    }
    if (filter.email && req.sponsorEmail.toLowerCase() !== filter.email.trim().toLowerCase()) {
      return false;
    }
    if (filter.transactionRef && req.transactionRef !== filter.transactionRef.trim()) {
      return false;
    }
    if (filter.search) {
      const q = filter.search.trim().toLowerCase();
      const hay = [
        req.sponsorName,
        req.sponsorEmail,
        req.preferredRegion,
        req.preferredCountry ?? '',
        req.assignedZoneName ?? '',
        req.transactionRef ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function getLocationRequestById(id: string): Promise<PlantingLocationRequest | null> {
  const pool = await getDbPoolOrNull();
  if (pool) {
    try {
      const result = await pool.query<PlantingLocationRequestRow>(
        'SELECT * FROM planting_location_requests WHERE id = $1 LIMIT 1',
        [id]
      );
      return result.rows[0] ? rowToRequest(result.rows[0]) : null;
    } catch {
      // Fallback to in-memory store
    }
  }

  return inMemoryRequests.find((req) => req.id === id) ?? null;
}

export interface ResolveLocationRequestParams {
  id: string;
  location: PlantingLocation;
  resolution: 'confirmed' | 'alternative_assigned';
  adminNotes?: string | null;
  reviewedBy?: string;
  notifiedAt: string;
}

export async function resolveLocationRequest(
  params: ResolveLocationRequestParams
): Promise<PlantingLocationRequest | null> {
  const now = new Date().toISOString();
  const pool = await getDbPoolOrNull();

  if (pool) {
    try {
      const result = await pool.query<PlantingLocationRequestRow>(
        `UPDATE planting_location_requests
         SET status = $2,
             assigned_location_id = $3,
             assigned_zone_name = $4,
             assigned_region = $5,
             admin_notes = $6,
             reviewed_by = $7,
             reviewed_at = $8,
             notified_at = $9,
             updated_at = $8
         WHERE id = $1
         RETURNING *`,
        [
          params.id,
          params.resolution,
          params.location.id,
          params.location.name,
          params.location.region,
          params.adminNotes?.trim() || null,
          params.reviewedBy?.trim() || 'admin',
          now,
          params.notifiedAt,
        ]
      );
      return result.rows[0] ? rowToRequest(result.rows[0]) : null;
    } catch {
      // Fallback to in-memory store
    }
  }

  const index = inMemoryRequests.findIndex((req) => req.id === params.id);
  if (index === -1) return null;

  const updated: PlantingLocationRequest = {
    ...inMemoryRequests[index],
    status: params.resolution,
    assignedLocationId: params.location.id,
    assignedZoneName: params.location.name,
    assignedRegion: params.location.region,
    adminNotes: params.adminNotes?.trim() || null,
    reviewedBy: params.reviewedBy?.trim() || 'admin',
    reviewedAt: now,
    notifiedAt: params.notifiedAt,
    updatedAt: now,
  };

  inMemoryRequests[index] = updated;
  return updated;
}
