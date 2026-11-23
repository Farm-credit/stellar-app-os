import { NextResponse } from 'next/server';
import { buildEmployeeImportReportCsv } from '@/lib/corporate-sponsorship/employeeImport';
import { getEmployeeImportSummary } from '@/lib/corporate-sponsorship/store';

export const runtime = 'nodejs';

/**
 * GET /api/corporate-sponsorship/employees/report?orderId=...
 *
 * Returns the most recent import confirmation summary as a CSV report so HR
 * managers can archive or share the assignment outcome.
 */
export function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId query parameter is required' }, { status: 400 });
  }

  const summary = getEmployeeImportSummary(orderId);
  if (!summary) {
    return NextResponse.json(
      { error: 'No employee import summary found for this corporate order' },
      { status: 404 }
    );
  }

  const csv = buildEmployeeImportReportCsv(summary);
  const filename = `employee-sponsorship-report-${summary.orderNumber}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
