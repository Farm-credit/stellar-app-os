/**
 * GET /api/v2/buyer-esg-report
 *
 * Generates a buyer ESG compliance report from their carbon offset analytics.
 * Issue #1407
 *
 * Query Parameters:
 * - buyerId (required): Opaque buyer identifier
 * - account (optional): Stellar public key for asset account
 * - from (optional): ISO 8601 start date
 * - to (optional): ISO 8601 end date
 * - interval (optional): 'month' | 'quarter' (default: 'month')
 * - format (optional): 'json' | 'pdf' | 'xlsx' (default: 'json')
 * - companyName (optional): Company name for the report
 *
 * Response:
 * - format=json: JSON envelope with report object
 * - format=pdf: Binary PDF file
 * - format=xlsx: Binary Excel file
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  aggregateBuyerAnalytics,
  parseBuyerAnalyticsQuery,
  type BuyerAnalyticsRequest,
} from '@/lib/api/buyer-analytics';
import {
  buildBuyerComplianceReport,
  buildPeriodLabel,
  type ReportPeriodType,
  type BuyerComplianceReportResponse,
} from '@/lib/esg-reporting-v2';
import { generateBuyerComplianceReportPdf, getPdfFilename } from '@/lib/esg-reporting/pdf-export-v2';
import { generateBuyerComplianceReportExcel, getExcelFilename } from '@/lib/esg-reporting/excel-export-v2';

const formatSchema = z.enum(['json', 'pdf', 'xlsx']).default('json');
const companyNameSchema = z.string().max(256).optional();

interface QueryParams {
  format?: string;
  companyName?: string;
}

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
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
