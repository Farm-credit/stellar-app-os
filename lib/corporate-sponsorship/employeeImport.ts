/**
 * Bulk employee sponsorship import for corporate HR programmes.
 *
 * HR managers upload a CSV of employees (`name`, `email`, `department`,
 * `tree_count`). Every row is validated before anything is assigned, then the
 * requested trees are allocated from the corporate order and each employee is
 * emailed their tree codes with a confirmation summary for the manager.
 */

export const EMPLOYEE_CSV_COLUMNS = ['name', 'email', 'department', 'tree_count'] as const;

export const EMPLOYEE_CSV_FILENAME = 'harvesta-employee-sponsorship-template.csv';

export const MAX_TREES_PER_EMPLOYEE = 500;

export interface EmployeeCsvRow {
  /** 1-based line number in the uploaded file, used for error reporting. */
  lineNumber: number;
  name: string;
  email: string;
  department?: string;
  treeCount: number;
}

export interface EmployeeCsvRowError {
  lineNumber: number;
  email?: string;
  message: string;
}

export interface ParsedEmployeeCsv {
  rows: EmployeeCsvRow[];
  errors: EmployeeCsvRowError[];
}

export type EmployeeAssignmentEmailStatus = 'sent' | 'failed' | 'skipped';

export interface EmployeeTreeAssignment {
  name: string;
  email: string;
  department?: string;
  treeCount: number;
  treeCodes: string[];
  emailStatus: EmployeeAssignmentEmailStatus;
  emailError?: string;
}

export interface EmployeeImportSummary {
  orderId: string;
  orderNumber: string;
  companyName: string;
  processedAt: string;
  totalRows: number;
  employeesAssigned: number;
  treesAssigned: number;
  treesRemaining: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  assignments: EmployeeTreeAssignment[];
  errors: EmployeeCsvRowError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmployeeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * CSV template offered for download from the corporate dashboard. It includes
 * header names plus example rows so HR managers know the expected shape.
 */
export function buildEmployeeCsvTemplate(companyName?: string): string {
  const safeCompany = (companyName ?? 'Your Company').replace(/[",\r\n]/g, ' ').trim();
  const rows: string[][] = [
    [...EMPLOYEE_CSV_COLUMNS],
    ['Amara Okafor', 'amara.okafor@example.com', 'Engineering', '1'],
    ['Liam Chen', 'liam.chen@example.com', 'Product', '2'],
    ['Sofia Martinez', 'sofia.martinez@example.com', 'Sustainability', '1'],
  ];

  const header = [
    `# ${safeCompany} employee tree sponsorship import`,
    '# Columns: name (required), email (required), department (optional), tree_count (optional, defaults to 1)',
  ].join('\r\n');

  return `${header}\r\n${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}

/**
 * Parses and validates an uploaded employee CSV. Invalid rows are reported with
 * their file line numbers; callers should reject the import when `errors` is
 * non-empty rather than partially assigning people.
 */
export function parseEmployeeCsv(csvText: string): ParsedEmployeeCsv {
  const errors: EmployeeCsvRowError[] = [];
  const rows: EmployeeCsvRow[] = [];

  const records = parseCsvRecords(csvText).filter(
    (record) => !(record.values.length === 1 && record.values[0].trim() === '')
  );

  // Skip leading comment lines emitted by the downloadable template.
  const meaningful = records.filter((record) => !record.values[0].trim().startsWith('#'));
  if (meaningful.length === 0) {
    return { rows, errors: [{ lineNumber: 1, message: 'The CSV file is empty.' }] };
  }

  const headerRecord = meaningful[0];
  const header = headerRecord.values.map((value) => value.trim().toLowerCase());
  const nameIndex = header.indexOf('name');
  const emailIndex = header.indexOf('email');
  const departmentIndex = header.indexOf('department');
  const treeCountIndex = header.findIndex((value) =>
    ['tree_count', 'tree count', 'trees', 'treecount'].includes(value)
  );

  if (nameIndex === -1 || emailIndex === -1) {
    return {
      rows,
      errors: [
        {
          lineNumber: headerRecord.lineNumber,
          message: 'CSV header must include "name" and "email" columns.',
        },
      ],
    };
  }

  const seenEmails = new Set<string>();

  for (const record of meaningful.slice(1)) {
    const lineNumber = record.lineNumber;
    const name = (record.values[nameIndex] ?? '').trim();
    const email = (record.values[emailIndex] ?? '').trim().toLowerCase();
    const department = departmentIndex >= 0 ? (record.values[departmentIndex] ?? '').trim() : '';
    const rawTreeCount = treeCountIndex >= 0 ? (record.values[treeCountIndex] ?? '').trim() : '';

    if (!name) {
      errors.push({ lineNumber, email: email || undefined, message: 'Employee name is required.' });
      continue;
    }

    if (!email) {
      errors.push({ lineNumber, message: 'Employee email is required.' });
      continue;
    }

    if (!isValidEmployeeEmail(email)) {
      errors.push({ lineNumber, email, message: `"${email}" is not a valid email address.` });
      continue;
    }

    if (seenEmails.has(email)) {
      errors.push({
        lineNumber,
        email,
        message: `Duplicate email "${email}" — each employee may only appear once.`,
      });
      continue;
    }

    let treeCount = 1;
    if (rawTreeCount) {
      if (!/^\d+$/.test(rawTreeCount)) {
        errors.push({
          lineNumber,
          email,
          message: `tree_count must be a whole number (received "${rawTreeCount}").`,
        });
        continue;
      }
      treeCount = Number(rawTreeCount);
      if (treeCount < 1 || treeCount > MAX_TREES_PER_EMPLOYEE) {
        errors.push({
          lineNumber,
          email,
          message: `tree_count must be between 1 and ${MAX_TREES_PER_EMPLOYEE}.`,
        });
        continue;
      }
    }

    seenEmails.add(email);
    rows.push({
      lineNumber,
      name,
      email,
      department: department || undefined,
      treeCount,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ lineNumber: 2, message: 'The CSV file does not contain any employee rows.' });
  }

  return { rows, errors };
}

/**
 * Distributes the order's trees across employees in file order. Trees that are
 * already assigned to someone are reused only after all unassigned trees have
 * been handed out.
 */
export function planEmployeeAssignments(
  trees: Array<{ treeCode: string; assignedEmployee?: string }>,
  rows: EmployeeCsvRow[]
): EmployeeTreeAssignment[] {
  const requested = totalRequestedTrees(rows);
  if (requested > trees.length) {
    throw new Error(
      `The CSV requests ${requested} trees but the order only has ${trees.length} sponsored trees available.`
    );
  }

  const pool = [
    ...trees.filter((tree) => !tree.assignedEmployee).map((tree) => tree.treeCode),
    ...trees.filter((tree) => tree.assignedEmployee).map((tree) => tree.treeCode),
  ];

  return rows.map((row) => {
    const treeCodes = pool.splice(0, row.treeCount);
    return {
      name: row.name,
      email: row.email,
      department: row.department,
      treeCount: treeCodes.length,
      treeCodes,
      emailStatus: 'skipped' as EmployeeAssignmentEmailStatus,
    };
  });
}

export function totalRequestedTrees(rows: EmployeeCsvRow[]): number {
  return rows.reduce((sum, row) => sum + row.treeCount, 0);
}

/** Confirmation summary report the HR manager can download or archive. */
export function buildEmployeeImportReportCsv(summary: EmployeeImportSummary): string {
  const header = [
    'employee_name',
    'employee_email',
    'department',
    'trees_assigned',
    'tree_codes',
    'email_status',
  ];
  const body = summary.assignments.map((assignment) => [
    assignment.name,
    assignment.email,
    assignment.department ?? '',
    String(assignment.treeCount),
    assignment.treeCodes.join(' '),
    assignment.emailStatus,
  ]);

  return [header, ...body].map((row) => row.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
}

export function buildEmployeeAssignmentSummaryText(summary: EmployeeImportSummary): string {
  const lines = [
    `Bulk employee tree sponsorship import — ${summary.companyName} (${summary.orderNumber})`,
    `Processed: ${summary.processedAt}`,
    `Employees assigned: ${summary.employeesAssigned}`,
    `Trees assigned: ${summary.treesAssigned}`,
    `Trees remaining on order: ${summary.treesRemaining}`,
    `Assignment emails — sent: ${summary.emailsSent}, skipped: ${summary.emailsSkipped}, failed: ${summary.emailsFailed}`,
  ];

  if (summary.errors.length > 0) {
    lines.push('Skipped rows:');
    for (const error of summary.errors) {
      lines.push(`  Line ${error.lineNumber}: ${error.message}`);
    }
  }

  return lines.join('\n');
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface CsvRecord {
  lineNumber: number;
  values: string[];
}

/** Minimal RFC 4180 parser supporting quoted fields and CRLF/LF line endings. */
function parseCsvRecords(text: string): CsvRecord[] {
  const source = text.replace(/^\uFEFF/, '');
  const records: CsvRecord[] = [];
  let values: string[] = [];
  let field = '';
  let inQuotes = false;
  let lineNumber = 1;
  let recordLine = 1;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') lineNumber++;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      values.push(field);
      field = '';
    } else if (char === '\r') {
      // handled by the following \n
    } else if (char === '\n') {
      values.push(field);
      records.push({ lineNumber: recordLine, values });
      values = [];
      field = '';
      lineNumber++;
      recordLine = lineNumber;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || values.length > 0) {
    values.push(field);
    records.push({ lineNumber: recordLine, values });
  }

  return records;
}
