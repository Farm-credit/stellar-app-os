// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Export API
 * Issue #1416: Project comparison tool - side-by-side review
 * Enhancement: Export comparison to CSV/PDF and shareable links
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/comparison/export
 * Export selected projects comparison
 * Body: { projectIds: string[], format: 'csv' | 'json', criteria?: string[] }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { projectIds?: string[]; format?: string; criteria?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.projectIds?.length || body.projectIds.length < 2) {
    return NextResponse.json({ error: 'At least 2 projectIds required' }, { status: 400 });
  }
  if (body.projectIds.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 projects' }, { status: 400 });
  }

  const format = body.format === 'json' ? 'json' : 'csv';

  // In production, fetch projects from DB and format
  // Here return a structured response that frontend can turn into a file
  const timestamp = new Date().toISOString();
  const filename = `comparison-${body.projectIds.join('-')}-${Date.now()}.${format}`;

  return NextResponse.json({
    projectIds: body.projectIds,
    criteria: body.criteria || ['name', 'pricePerTon', 'riskRating', 'methodology', 'verifier'],
    format,
    filename,
    exportedAt: timestamp,
    downloadUrl: `/api/comparison/export?ids=${body.projectIds.join(',')}&format=${format}`,
    message: 'Export ready - frontend will generate file from project data',
  });
}

/**
 * GET /api/comparison/export
 * Generate shareable link for comparison
 * Query: ?ids=xxx,yyy&criteria=a,b
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get('ids')?.split(',').filter(Boolean) || [];
  const criteria = searchParams.get('criteria')?.split(',').filter(Boolean) || [];

  if (ids.length < 2) {
    return NextResponse.json({ error: 'At least 2 ids required' }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const shareUrl = `${origin}/projects/compare?ids=${ids.join(',')}${criteria.length ? `&cols=${criteria.join(',')}` : ''}`;

  return NextResponse.json({
    shareUrl,
    ids,
    criteria,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  });
}
