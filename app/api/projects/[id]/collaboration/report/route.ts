export const runtime = 'nodejs';

import { getUnifiedReport } from '@/lib/api/projectCollaboration';

/** Unified cross-organisation project report — Issue #1696, AC3. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getUnifiedReport(id);
  if (!report) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
