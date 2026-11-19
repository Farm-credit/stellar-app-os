import { type NextRequest, NextResponse } from 'next/server';

import {
  ensureDeforestationAlertsSeeded,
  getAllAlerts,
  getProjectAlerts,
} from '@/lib/deforestation/service';

/**
 * GET /api/deforestation/alerts?projectId=proj-001
 *
 * Stored deforestation alerts for monitored zones (Issue #672). Used by the
 * in-app notification bridge and by pages that display alert state. Without
 * `projectId` every alert is returned, newest detection first.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  await ensureDeforestationAlertsSeeded();

  const projectId = request.nextUrl.searchParams.get('projectId');
  const alerts = projectId ? getProjectAlerts(projectId) : getAllAlerts();

  return NextResponse.json({ alerts, count: alerts.length });
}
