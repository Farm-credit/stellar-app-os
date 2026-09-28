// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Embed Projects Listing
 * Issue #1415: Carbon offset API - embed on websites
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEmbeddableProjects, validateApiKey } from '@/backend/src/services/carbonOffsetApi';
import { isAllowedOrigin } from '@/backend/src/services/carbonOffsetSecurity';

/**
 * GET /api/embed/projects
 * List projects available for embedding
 * Requires authentication
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = request.headers.get('authorization');
    const apiKey = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const config = apiKey ? await validateApiKey(apiKey) : null;
    if (!config) {
      return NextResponse.json({ error: 'Missing or invalid API key' }, { status: 401 });
    }

    const origin = request.headers.get('origin');
    if (!isAllowedOrigin(origin, config.allowedDomains)) {
      return NextResponse.json({ error: 'Origin is not allowed for this API key' }, { status: 403 });
    }

    const projects = await getEmbeddableProjects(config.companyId);

    return NextResponse.json(
      {
        projects,
        config: {
          theme: config.theme,
          primaryColor: config.primaryColor,
          showProjectSelector: config.showProjectSelector,
          defaultProjectId: config.defaultProjectId,
          defaultAmount: config.defaultAmount,
          currency: config.currency,
          locale: config.locale,
          widgetTitle: config.widgetTitle,
          brandName: config.brandName,
          showBranding: config.showBranding,
        },
      },
      { headers: { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' } }
    );

  } catch (error) {
    console.error('List embeddable projects error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });
}