import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isEmailConfigured, sendEmployeeTreeAssignmentEmail } from '@/lib/email/sendgrid';
import {
  parseEmployeeCsv,
  totalRequestedTrees,
  type EmployeeImportSummary,
} from '@/lib/corporate-sponsorship/employeeImport';
import {
  assignEmployeesToOrder,
  getCorporateOrderById,
  saveEmployeeImportSummary,
} from '@/lib/corporate-sponsorship/store';

export const runtime = 'nodejs';

const MAX_CSV_BYTES = 1024 * 1024;

const importSchema = z.object({
  orderId: z.string().trim().min(1, 'Corporate order is required'),
  csv: z
    .string()
    .min(1, 'CSV content is required')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_CSV_BYTES, {
      message: 'CSV file must be 1 MB or smaller',
    }),
  sendEmails: z.boolean().optional().default(true),
});

/**
 * POST /api/corporate-sponsorship/employees/import
 *
 * Validates an employee CSV and assigns the requested trees from a corporate
 * order to each employee, then emails the assignments and returns the
 * confirmation summary report for the HR manager.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid employee import request',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const order = getCorporateOrderById(parsed.data.orderId);
  if (!order) {
    return NextResponse.json({ error: 'Corporate order not found' }, { status: 404 });
  }

  const { rows, errors } = parseEmployeeCsv(parsed.data.csv);
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: 'Employee CSV validation failed. Fix the listed rows and try again.',
        errors,
      },
      { status: 400 }
    );
  }

  let assignments;
  try {
    assignments = assignEmployeesToOrder(order.id, rows).assignments;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to assign employees';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const emailEnabled = parsed.data.sendEmails && isEmailConfigured();
  if (parsed.data.sendEmails) {
    for (const assignment of assignments) {
      if (!emailEnabled) {
        assignment.emailStatus = 'skipped';
        continue;
      }
      try {
        await sendEmployeeTreeAssignmentEmail({
          employeeName: assignment.name,
          employeeEmail: assignment.email,
          companyName: order.branding.companyName,
          department: assignment.department,
          treeCount: assignment.treeCount,
          treeCodes: assignment.treeCodes,
          orderNumber: order.orderNumber,
          primaryColor: order.branding.primaryColor,
        });
        assignment.emailStatus = 'sent';
      } catch (error) {
        assignment.emailStatus = 'failed';
        assignment.emailError =
          error instanceof Error ? error.message : 'Assignment email could not be sent';
      }
    }
  }

  const treesAssigned = assignments.reduce((sum, assignment) => sum + assignment.treeCount, 0);
  const summary: EmployeeImportSummary = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    companyName: order.branding.companyName,
    processedAt: new Date().toISOString(),
    totalRows: rows.length,
    employeesAssigned: assignments.length,
    treesAssigned,
    treesRemaining: order.trees.length - treesAssigned,
    emailsSent: assignments.filter((assignment) => assignment.emailStatus === 'sent').length,
    emailsFailed: assignments.filter((assignment) => assignment.emailStatus === 'failed').length,
    emailsSkipped: assignments.filter((assignment) => assignment.emailStatus === 'skipped').length,
    assignments,
    errors,
  };

  saveEmployeeImportSummary(order.id, summary);

  return NextResponse.json(
    {
      summary,
      requestedTrees: totalRequestedTrees(rows),
      reportUrl: `/api/corporate-sponsorship/employees/report?orderId=${order.id}`,
    },
    { status: 201 }
  );
}
