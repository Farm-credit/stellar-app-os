// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Embed API Keys Management
 * Issue #1415: Carbon offset API - embed on websites
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createEmbedApiKey,
  listEmbedApiKeys,
} from '@/backend/src/services/carbonOffsetApi';
import { isValidAllowedDomain } from '@/backend/src/services/carbonOffsetSecurity';

/**
 * POST /api/embed/keys
 * Create a new embed API key
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.allowedDomains || !Array.isArray(body.allowedDomains) || body.allowedDomains.length === 0) {
      return NextResponse.json(
        { error: 'Name and allowedDomains (array) are required' },
        { status: 400 }
      );
    }

    if (body.allowedDomains.some((domain: unknown) => typeof domain !== 'string' || !isValidAllowedDomain(domain))) {
      return NextResponse.json({ error: 'allowedDomains must contain valid hostnames' }, { status: 400 });
    }

    if (body.primaryColor && (typeof body.primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.primaryColor))) {
      return NextResponse.json({ error: 'primaryColor must be a 6-digit hex color' }, { status: 400 });
    }

    if (body.theme !== undefined && !['light', 'dark', 'auto'].includes(body.theme)) {
      return NextResponse.json({ error: 'theme must be light, dark, or auto' }, { status: 400 });
    }

    if (body.currency !== undefined && !['USD', 'EUR', 'GBP'].includes(body.currency)) {
      return NextResponse.json({ error: 'currency must be USD, EUR, or GBP' }, { status: 400 });
    }

    if (body.showBranding !== undefined && typeof body.showBranding !== 'boolean') {
      return NextResponse.json({ error: 'showBranding must be a boolean' }, { status: 400 });
    }

    const result = await createEmbedApiKey({
      companyId: session.user.companyId,
      name: body.name,
      allowedDomains: body.allowedDomains,
      theme: body.theme,
      primaryColor: body.primaryColor,
      showProjectSelector: body.showProjectSelector,
      defaultProjectId: body.defaultProjectId,
      defaultAmount: body.defaultAmount,
      currency: body.currency,
      locale: body.locale,
      webhookUrl: body.webhookUrl,
      metadata: body.metadata,
      widgetTitle: body.widgetTitle,
      brandName: body.brandName,
      showBranding: body.showBranding,
    });

    return NextResponse.json({
      apiKey: result.apiKey,
      config: result.config,
      message: 'API key created successfully. Save the key - it won\'t be shown again.',
    }, { status: 201 });

  } catch (error) {
    console.error('Create embed API key error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/embed/keys
 * List API keys for the company
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await listEmbedApiKeys(session.user.companyId);
    return NextResponse.json({ keys });

  } catch (error) {
    console.error('List embed API keys error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}