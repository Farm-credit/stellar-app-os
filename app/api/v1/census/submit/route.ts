/**
 * Tree Census Submission Endpoint — POST /api/v1/census/submit
 *
 * Receives annual tree census submissions (JSON batch or CSV) for up to 10,000 trees,
 * computes survival rate and health score distributions, and auto-updates the platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseCensusCsv, submitCensusData } from '@/lib/census/service';
import type { TreeCensusRow } from '@/lib/census/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') || '';

  let projectId = 'proj-001';
  let projectName = 'Northern Savanna Reforestation';
  let censusYear = new Date().getFullYear();
  let surveyorName = 'Field Team Surveyor';
  let surveyorAgentId = 'FLD-001';
  let records: TreeCensusRow[] = [];

  try {
    if (contentType.includes('application/json')) {
      const json = await req.json();
      if (json.projectId) projectId = String(json.projectId);
      if (json.projectName) projectName = String(json.projectName);
      if (json.censusYear) censusYear = Number(json.censusYear) || censusYear;
      if (json.surveyorName) surveyorName = String(json.surveyorName);
      if (json.surveyorAgentId) surveyorAgentId = String(json.surveyorAgentId);

      if (json.csv) {
        const parsed = parseCensusCsv(json.csv);
        if (!parsed.valid) {
          return NextResponse.json(
            { error: 'Invalid CSV census data', errors: parsed.errors },
            { status: 400 }
          );
        }
        records = parsed.previewRows;
      } else if (Array.isArray(json.records)) {
        records = json.records;
      }
    } else if (contentType.includes('text/csv')) {
      const csvText = await req.text();
      const parsed = parseCensusCsv(csvText);
      if (!parsed.valid) {
        return NextResponse.json(
          { error: 'Invalid CSV census data', errors: parsed.errors },
          { status: 400 }
        );
      }
      records = parsed.previewRows;
    } else {
      // Try parsing text or form data
      const text = await req.text();
      if (text.startsWith('{')) {
        const json = JSON.parse(text);
        if (Array.isArray(json.records)) records = json.records;
      } else {
        const parsed = parseCensusCsv(text);
        if (!parsed.valid) {
          return NextResponse.json(
            { error: 'Invalid CSV census data', errors: parsed.errors },
            { status: 400 }
          );
        }
        records = parsed.previewRows;
      }
    }

    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: 'Missing census records. Provide either records array or csv text.' },
        { status: 400 }
      );
    }

    const submission = await submitCensusData({
      projectId,
      projectName,
      censusYear,
      surveyorName,
      surveyorAgentId,
      records,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Successfully processed annual census for ${submission.totalTreesCounted} trees. Survival rate updated to ${submission.survivalRate}%.`,
        submission,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown census submission error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
