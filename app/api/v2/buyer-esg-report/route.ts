/**
 * GET /api/v2/buyer-esg-report
 *
 * Generates a buyer ESG compliance report from their carbon offset analytics.
 * Issues #1407, #1670
 *
 * Query Parameters:
 * - buyerId (required): Opaque buyer identifier
 * - account (optional): Stellar public key for asset account
 * - from (optional): ISO 8601 start date
 * - to (optional): ISO 8601 end date
 * - interval (optional): 'month' | 'quarter' (default: 'month')
 * - format (optional): 'json' | 'pdf' | 'xlsx' | 'gri' | 'tcfd' (default: 'json')
 * - companyName (optional): Company name for the report
 * - dataSource (optional): 'ledger' | 'db' — required to be 'ledger' for gri/tcfd formats
 *
 * Response:
 * - format=json:  JSON envelope with report object
 * - format=pdf:   Binary PDF file download
 * - format=xlsx:  Binary Excel workbook download
 * - format=gri:   Signed JSON — GRI Standards structured disclosure template
 *                 (Ed25519-signed, ISO 8601-timestamped; verify at POST /api/v2/csr-report/verify)
 * - format=tcfd:  Signed JSON — TCFD four-pillar structured disclosure template
 *                 (Ed25519-signed, ISO 8601-timestamped; verify at POST /api/v2/csr-report/verify)
 *
 * Signed CSR exports (gri/tcfd) require:
 * - dataSource=ledger query param
 * - CSR_REPORT_SIGNING_PRIVATE_KEY_HEX env var (32-byte Ed25519 seed, hex-encoded)
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  aggregateBuyerAnalytics,
  parseBuyerAnalyticsQuery,
  type BuyerAnalyticsRequest,
} from '@/lib/api/buyer-analytics';
import {
  buildBuyerComplianceReport,
  type ReportPeriodType,
  type BuyerComplianceReportResponse,
} from '@/lib/esg-reporting-v2';
import {
  generateBuyerComplianceReportPdf,
  getPdfFilename,
} from '@/lib/esg-reporting/pdf-export-v2';
import {
  generateBuyerComplianceReportExcel,
  getExcelFilename,
} from '@/lib/esg-reporting/excel-export-v2';
import { buildCsrReportTemplate, signCsrReport } from '@/lib/csr-reporting';

const formatSchema = z.enum(['json', 'pdf', 'xlsx', 'gri', 'tcfd']).default('json');
const companyNameSchema = z.string().max(256).optional();

export async function GET(request: NextRequest) {
  try {
    // Parse buyer analytics query
    const analyticsResult = parseBuyerAnalyticsQuery(request.nextUrl.searchParams);
    if (!analyticsResult.ok) {
      return NextResponse.json(
        { error: `Invalid request: ${analyticsResult.errors.join('; ')}` },
        { status: 400 }
      );
    }

    const analyticsRequest: BuyerAnalyticsRequest = analyticsResult.data;

    // Parse additional report parameters
    const format = formatSchema.parse(request.nextUrl.searchParams.get('format'));
    const companyName = companyNameSchema.parse(request.nextUrl.searchParams.get('companyName'));
    if ((format === 'gri' || format === 'tcfd') && analyticsRequest.dataSource !== 'ledger') {
      return NextResponse.json(
        { error: 'Signed CSR exports require dataSource=ledger.' },
        { status: 400 }
      );
    }

    // Generate buyer analytics
    const analytics = await aggregateBuyerAnalytics(analyticsRequest);

    // Determine period type for report labeling
    const interval = analyticsRequest.interval ?? 'month';
    const periodType: ReportPeriodType = interval === 'quarter' ? 'quarter' : 'month';

    // Build compliance report from analytics
    const report = buildBuyerComplianceReport(
      analytics,
      companyName || analytics.buyerId,
      periodType
    );

    if (format === 'gri' || format === 'tcfd') {
      const signingPrivateKey = process.env.CSR_REPORT_SIGNING_PRIVATE_KEY_HEX;
      if (!signingPrivateKey) {
        return NextResponse.json(
          { error: 'CSR report signing is not configured on this platform.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const signedReport = signCsrReport(buildCsrReportTemplate(report, format), signingPrivateKey);
      return NextResponse.json(signedReport, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="${format}-csr-${report.reportId}.json"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Return based on requested format
    if (format === 'pdf') {
      const pdfBytes = generateBuyerComplianceReportPdf(report);
      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${getPdfFilename(report)}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    if (format === 'xlsx') {
      const excelBytes = generateBuyerComplianceReportExcel(report);
      return new NextResponse(excelBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${getExcelFilename(report)}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Default: return JSON
    const response: BuyerComplianceReportResponse = {
      report,
      generated: new Date().toISOString(),
      disclaimer:
        'This report aggregates your carbon offset purchases and verified co-benefits from partner projects. It is not validated against any specific compliance standard (GHG Protocol, ISSB, CSRD, or similar). For regulatory or compliance attestation, consult your carbon verification partner or auditor.',
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[buyer-esg-report] Error:', error);

    // Check if this is a BuyerAnalyticsError (all sources failed)
    if (error instanceof Error && error.name === 'BuyerAnalyticsError') {
      return NextResponse.json(
        {
          error: 'Failed to load buyer analytics. All data sources are unavailable.',
          details: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
