import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_CSV_COLUMNS,
  buildEmployeeCsvTemplate,
  buildEmployeeImportReportCsv,
  parseEmployeeCsv,
  planEmployeeAssignments,
  type EmployeeImportSummary,
} from '../employeeImport';

describe('corporate employee CSV import', () => {
  it('builds a downloadable template that parses into valid employee rows', () => {
    const template = buildEmployeeCsvTemplate('Acme Green Ventures');
    expect(template).toContain('Acme Green Ventures');
    expect(template).toContain(EMPLOYEE_CSV_COLUMNS.join(','));

    const parsed = parseEmployeeCsv(template);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Amara Okafor',
      email: 'amara.okafor@example.com',
      department: 'Engineering',
      treeCount: 1,
    });
  });

  it('parses quoted fields, CRLF line endings, and a BOM', () => {
    const csv =
      '\uFEFFname,email,department,tree_count\r\n"Okafor, Amara",amara@example.com,"People, Ops",2\r\n';
    const parsed = parseEmployeeCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Okafor, Amara',
      email: 'amara@example.com',
      department: 'People, Ops',
      treeCount: 2,
    });
  });

  it('defaults tree_count to 1 and normalises email casing', () => {
    const parsed = parseEmployeeCsv('name,email\nAmara Okafor,AMARA@Example.COM\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ email: 'amara@example.com', treeCount: 1 });
  });

  it('reports malformed emails, duplicates, missing names, and bad tree counts', () => {
    const csv = [
      'name,email,department,tree_count',
      'Amara Okafor,not-an-email,Engineering,1',
      'Liam Chen,liam@example.com,Product,1',
      'Liam Duplicate,Liam@Example.com,Product,1',
      ',nobody@example.com,Operations,1',
      'Sofia Martinez,sofia@example.com,Sustainability,zero',
      'Noah Mensah,noah@example.com,Ops,0',
    ].join('\n');

    const parsed = parseEmployeeCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].email).toBe('liam@example.com');

    const messages = parsed.errors.map((error) => `${error.lineNumber}:${error.message}`);
    expect(messages).toHaveLength(5);
    expect(messages[0]).toContain('2:"not-an-email" is not a valid email address.');
    expect(messages[1]).toContain('4:Duplicate email "liam@example.com"');
    expect(messages[2]).toContain('5:Employee name is required.');
    expect(messages[3]).toContain('6:tree_count must be a whole number');
    expect(messages[4]).toContain('7:tree_count must be between 1 and 500.');
  });

  it('rejects files without the required header columns', () => {
    const parsed = parseEmployeeCsv('employee,mail\nAmara,amara@example.com\n');
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0].message).toMatch(/must include "name" and "email"/);
  });

  it('allocates unassigned trees first and rejects requests exceeding the order', () => {
    const trees = [
      { treeCode: 'A-1', assignedEmployee: 'Someone' },
      { treeCode: 'A-2' },
      { treeCode: 'A-3' },
    ];
    const rows = parseEmployeeCsv(
      'name,email,tree_count\nAmara,amara@example.com,2\nLiam,liam@example.com,1\n'
    ).rows;

    const assignments = planEmployeeAssignments(trees, rows);
    expect(assignments.map((assignment) => assignment.treeCodes)).toEqual([
      ['A-2', 'A-3'],
      ['A-1'],
    ]);
    expect(assignments[0].emailStatus).toBe('skipped');

    expect(() =>
      planEmployeeAssignments(trees, [
        { lineNumber: 2, name: 'Amara', email: 'amara@example.com', treeCount: 4 },
      ])
    ).toThrow(/requests 4 trees but the order only has 3/);
  });

  it('renders the confirmation summary as a CSV report', () => {
    const summary: EmployeeImportSummary = {
      orderId: 'corp-1',
      orderNumber: 'CORP-2026-1234',
      companyName: 'Acme Green Ventures',
      processedAt: '2026-11-23T10:00:00.000Z',
      totalRows: 1,
      employeesAssigned: 1,
      treesAssigned: 2,
      treesRemaining: 48,
      emailsSent: 1,
      emailsFailed: 0,
      emailsSkipped: 0,
      assignments: [
        {
          name: 'Okafor, Amara',
          email: 'amara@example.com',
          department: 'Engineering',
          treeCount: 2,
          treeCodes: ['CORP-2026-1234-T0001', 'CORP-2026-1234-T0002'],
          emailStatus: 'sent',
        },
      ],
      errors: [],
    };

    const csv = buildEmployeeImportReportCsv(summary);
    expect(csv.split('\r\n')[0]).toBe(
      'employee_name,employee_email,department,trees_assigned,tree_codes,email_status'
    );
    expect(csv).toContain(
      '"Okafor, Amara",amara@example.com,Engineering,2,CORP-2026-1234-T0001 CORP-2026-1234-T0002,sent'
    );
  });
});
