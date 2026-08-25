/**
 * GET /api/compliance/reports
 * Generate compliance reports for carbon registry standards
 *
 * Query Parameters:
 * - type: project-registry | carbon-credits | tree-inventory | verification-audits | issuance-report | retirement-report
 * - format: csv | json | both
 * - registry: verra | gold-standard | car | plan-vivo | cdm | generic
 * - startDate: ISO 8601 date string (default: 30 days ago)
 * - endDate: ISO 8601 date string (default: now)
 * - projectIds: comma-separated project IDs
 * - sponsorAddresses: comma-separated sponsor addresses
 * - species: comma-separated species names
 * - regions: comma-separated region names
 * - status: comma-separated status values
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getComplianceReportGenerator } from '@/lib/compliance/report-generator';

export const runtime = 'nodejs';

function parseDateParam(dateStr: string | null, defaultDate: Date): Date {
  if (!dateStr) return defaultDate;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? defaultDate : parsed;
}

function parseCommaSeparated(str: string | null): string[] | undefined {
  if (!str) return undefined;
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const reportType =
    (searchParams.get('type') as
      | 'project-registry'
      | 'carbon-credits'
      | 'tree-inventory'
      | 'verification-audits'
      | 'issuance-report'
      | 'retirement-report') || 'carbon-credits';

  const format = (searchParams.get('format') as 'csv' | 'json' | 'both') || 'json';
  const registry =
    (searchParams.get('registry') as
      | 'verra'
      | 'gold-standard'
      | 'car'
      | 'plan-vivo'
      | 'cdm'
      | 'generic') || 'verra';

  const startDate = parseDateParam(
    searchParams.get('startDate'),
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const endDate = parseDateParam(searchParams.get('endDate'), new Date());

  const filters = {
    projectIds: parseCommaSeparated(searchParams.get('projectIds')),
    sponsorAddresses: parseCommaSeparated(searchParams.get('sponsorAddresses')),
    species: parseCommaSeparated(searchParams.get('species')),
    regions: parseCommaSeparated(searchParams.get('regions')),
    status: parseCommaSeparated(searchParams.get('status')),
    minCo2OffsetKg: searchParams.get('minCo2OffsetKg')
      ? parseFloat(searchParams.get('minCo2OffsetKg') as string)
      : undefined,
    maxCo2OffsetKg: searchParams.get('maxCo2OffsetKg')
      ? parseFloat(searchParams.get('maxCo2OffsetKg') as string)
      : undefined,
  };

  try {
    const generator = getComplianceReportGenerator();
    const response = await generator.generateReport(
      reportType,
      format,
      registry,
      { startDate, endDate },
      filters
    );

    const contentType =
      format === 'csv' ? 'text/csv' : format === 'json' ? 'application/json' : 'application/zip';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0',
    };

    if (format === 'csv' || format === 'both') {
      const filename = `compliance-${reportType}-${registry}-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`;
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    if (format === 'csv') {
      return new NextResponse(response.csvContent, { headers });
    }

    if (format === 'json') {
      headers['Content-Type'] = 'application/json';
      return NextResponse.json(
        response.jsonContent
          ? JSON.parse(response.jsonContent)
          : { metadata: response.metadata, data: response.data },
        { headers }
      );
    }

    return NextResponse.json(
      {
        metadata: response.metadata,
        data: response.data,
        csvContent: response.csvContent,
        jsonContent: response.jsonContent,
      },
      { headers }
    );
  } catch (error) {
    console.error('[api/compliance/reports] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      type = 'carbon-credits',
      format = 'json',
      registry = 'verra',
      startDate,
      endDate,
      filters = {},
    } = body;

    const generator = getComplianceReportGenerator();
    const response = await generator.generateReport(
      type,
      format,
      registry,
      {
        startDate: startDate
          ? new Date(startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
      },
      filters
    );

    if (format === 'csv') {
      return new NextResponse(response.csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="compliance-${type}-${registry}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (format === 'json') {
      return NextResponse.json(
        response.jsonContent
          ? JSON.parse(response.jsonContent)
          : { metadata: response.metadata, data: response.data }
      );
    }

    return NextResponse.json({
      metadata: response.metadata,
      data: response.data,
      csvContent: response.csvContent,
      jsonContent: response.jsonContent,
    });
  } catch (error) {
    console.error('[api/compliance/reports] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
