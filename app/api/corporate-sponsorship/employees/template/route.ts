import { NextResponse } from 'next/server';
import {
  buildEmployeeCsvTemplate,
  EMPLOYEE_CSV_FILENAME,
} from '@/lib/corporate-sponsorship/employeeImport';

export const runtime = 'nodejs';

/**
 * GET /api/corporate-sponsorship/employees/template
 *
 * Downloads the employee sponsorship CSV template used by corporate HR
 * managers. Pass `?companyName=` to brand the comment header.
 */
export function GET(request: Request) {
  const companyName = new URL(request.url).searchParams.get('companyName') ?? undefined;
  const csv = buildEmployeeCsvTemplate(companyName);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${EMPLOYEE_CSV_FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  });
}
