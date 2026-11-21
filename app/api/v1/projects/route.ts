/**
 * Public Projects API — GET /api/v1/projects
 *
 * REST endpoint for third-party apps to read tree sponsorship project data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, applyRateLimit, unauthorized, rateLimited } from '@/app/api/v1/trees/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  region: string;
  country: string;
  description: string;
  totalTrees: number;
  sponsoredTrees: number;
  speciesCount: number;
  totalCo2OffsetKgPerYear: number;
  targetTrees: number;
  status: 'active' | 'completed' | 'expanding';
  establishedYear: number;
  primarySpecies: string[];
}

export const PROJECTS: ProjectRecord[] = [
  {
    id: 'proj-001',
    name: 'Northern Savanna Reforestation',
    slug: 'northern-savanna-reforestation',
    region: 'Kano & Jigawa',
    country: 'Nigeria',
    description: 'Restoring degraded drylands and combating desert encroachment in the Sudan-Sahel zone.',
    totalTrees: 12500,
    sponsoredTrees: 8420,
    speciesCount: 6,
    totalCo2OffsetKgPerYear: 275000,
    targetTrees: 20000,
    status: 'active',
    establishedYear: 2023,
    primarySpecies: ['Teak', 'Moringa', 'Neem', 'Acacia', 'Baobab'],
  },
  {
    id: 'proj-002',
    name: 'Coastal Mangrove Recovery',
    slug: 'coastal-mangrove-recovery',
    region: 'Greater Accra & Volta Delta',
    country: 'Ghana',
    description: 'Protecting coastal shorelines and marine ecosystems through estuarine mangrove planting.',
    totalTrees: 18200,
    sponsoredTrees: 14650,
    speciesCount: 3,
    totalCo2OffsetKgPerYear: 455000,
    targetTrees: 25000,
    status: 'active',
    establishedYear: 2022,
    primarySpecies: ['Mangrove', 'Cashew', 'Bamboo (Moso)'],
  },
  {
    id: 'proj-003',
    name: 'Central Belt Agroforestry',
    slug: 'central-belt-agroforestry',
    region: 'Kaduna & Plateau',
    country: 'Nigeria',
    description: 'Empowering smallholder farmers with economic timber and fruit tree integration.',
    totalTrees: 9400,
    sponsoredTrees: 6100,
    speciesCount: 8,
    totalCo2OffsetKgPerYear: 216200,
    targetTrees: 15000,
    status: 'active',
    establishedYear: 2024,
    primarySpecies: ['African Mahogany', 'West African Cedar', 'Shea', 'Eucalyptus'],
  },
  {
    id: 'proj-004',
    name: 'Eastern Arc Montane Conservation',
    slug: 'eastern-arc-montane-conservation',
    region: 'Tanga & Morogoro',
    country: 'Tanzania',
    description: 'Preserving high-biodiversity tropical montane rainforests and vital water catchment zones.',
    totalTrees: 15000,
    sponsoredTrees: 15000,
    speciesCount: 12,
    totalCo2OffsetKgPerYear: 390000,
    targetTrees: 15000,
    status: 'completed',
    establishedYear: 2021,
    primarySpecies: ['African Mahogany', 'Iroko', 'Bamboo (Moso)', 'African Locust Bean'],
  },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = authenticate(req);
  if (!ctx) return unauthorized();

  const rl = applyRateLimit(ctx);
  if (!rl.ok) return rateLimited(rl.headers);

  const { searchParams } = new URL(req.url);
  const country = searchParams.get('country');
  const status = searchParams.get('status');

  let results = PROJECTS;
  if (country) {
    results = results.filter((p) => p.country.toLowerCase() === country.toLowerCase());
  }
  if (status) {
    results = results.filter((p) => p.status.toLowerCase() === status.toLowerCase());
  }

  return NextResponse.json(
    {
      data: results,
      total: results.length,
    },
    { status: 200, headers: rl.headers }
  );
}
