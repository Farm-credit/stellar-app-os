// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { type NextRequest, NextResponse } from 'next/server';
import { getSponsorWidgetData } from '@/lib/api/sponsor-widget';

export const runtime = 'nodejs';

/**
 * GET /api/v1/sponsor/widget-data
 *
 * Returns live tree counts, community rewards distributed, and on-chain verification
 * stats for a given sponsor (by wallet address or brand slug).
 *
 * Query params:
 *   sponsor — Stellar wallet address (G...) or brand slug (e.g. acme-corp)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sponsor = searchParams.get('sponsor')?.trim();

    if (!sponsor) {
      return NextResponse.json(
        { error: 'Missing required query parameter "sponsor"' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
          },
        }
      );
    }

    const data = await getSponsorWidgetData(sponsor);

    if (!data) {
      return NextResponse.json(
        { error: `Sponsor "${sponsor}" not found` },
        {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
          },
        }
      );
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, smaxage=30, stale-while-revalidate=60',
        'X-Cached-At': data.updatedAt,
      },
    });
  } catch (error) {
    console.error('[api/v1/sponsor/widget-data] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
