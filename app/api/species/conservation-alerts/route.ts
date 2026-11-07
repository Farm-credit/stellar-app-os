/**
 * GET /api/species/conservation-alerts — Issue #1657
 *
 * In-app feed of conservation alerts for one sponsor wallet. The web client
 * (SpeciesConservationNotifier) polls this once per wallet on load and turns
 * unseen alerts into notification-center entries, mirroring the sponsor
 * badge notifier.
 *
 * Query:
 *   wallet — Stellar wallet of the sponsor (required)
 *   limit  — max alerts to return (default 25, max 100)
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  alertPriorityFor,
  categoryLabel,
  isIucnCategoryCode,
  speciesEducationPath,
  type IucnCategoryCode,
} from '@/lib/species/conservation';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type AlertRow = {
  id: string;
  species_slug: string;
  common_name: string;
  scientific_name: string;
  change_kind: string;
  previous_status_code: string | null;
  new_status_code: string;
  population_trend: string | null;
  tree_count: number;
  check_quarter: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim();
  if (!wallet) {
    return NextResponse.json({ error: 'wallet query parameter is required' }, { status: 400 });
  }

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const { rows } = await getPool().query<AlertRow>(
    `
      SELECT id, species_slug, common_name, scientific_name, change_kind,
             previous_status_code, new_status_code, population_trend,
             tree_count, check_quarter, created_at
      FROM species_conservation_alerts
      WHERE sponsor_wallet = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [wallet, limit]
  );

  return NextResponse.json({
    success: true,
    wallet,
    alerts: rows.map((row) => {
      const newStatusCode = isIucnCategoryCode(row.new_status_code)
        ? row.new_status_code
        : ('NE' as IucnCategoryCode);
      return {
        id: String(row.id),
        speciesSlug: row.species_slug,
        commonName: row.common_name,
        scientificName: row.scientific_name,
        changeKind: row.change_kind,
        previousStatusCode: row.previous_status_code,
        newStatusCode,
        statusLabel: categoryLabel(newStatusCode),
        populationTrend: row.population_trend,
        treeCount: Number(row.tree_count) || 1,
        checkQuarter: row.check_quarter,
        priority: alertPriorityFor(newStatusCode),
        educationUrl: speciesEducationPath(row.species_slug),
        createdAt: row.created_at,
      };
    }),
  });
}
