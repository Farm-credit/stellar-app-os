// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Embed Purchase Session Creation
 * Issue #1415: Carbon offset API - embed on websites
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateApiKey,
  createOffsetPurchaseSession,
  OffsetPurchaseRequest,
} from '@/backend/src/services/carbonOffsetApi';
import { isAllowedOrigin, isAllowedRedirectUrl } from '@/backend/src/services/carbonOffsetSecurity';

/**
 * POST /api/embed/purchase
 * Create a purchase session for offset credits
 * Requires valid API key in Authorization header
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract API key from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Use: Bearer <api_key>' },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '
    const config = await validateApiKey(apiKey);

    if (!config) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    const origin = request.headers.get('origin');
    if (!isAllowedOrigin(origin, config.allowedDomains)) {
      return NextResponse.json({ error: 'Origin is not allowed for this API key' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    if (
      typeof body.projectId !== 'string' ||
      typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 ||
      typeof body.currency !== 'string' ||
      typeof body.customerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail)
    ) {
      return NextResponse.json(
        { error: 'projectId, a positive amount, currency, and valid customerEmail are required' },
        { status: 400 }
      );
    }

    for (const field of ['returnUrl', 'cancelUrl'] as const) {
      if (body[field] !== undefined && (typeof body[field] !== 'string' || !isAllowedRedirectUrl(body[field], config.allowedDomains))) {
        return NextResponse.json(
          { error: `${field} must use an allowed website origin` },
          { status: 400 }
        );
      }
    }

    if (body.metadata !== undefined) {
      const metadataIsValid =
        typeof body.metadata === 'object' && body.metadata !== null &&
        !Array.isArray(body.metadata) &&
        Object.entries(body.metadata).length <= 20 &&
        Object.entries(body.metadata).every(([key, value]) =>
          key.length <= 40 && typeof value === 'string' && value.length <= 500
        );
      if (!metadataIsValid) {
        return NextResponse.json(
          { error: 'metadata must contain at most 20 string fields (keys up to 40 and values up to 500 characters)' },
          { status: 400 }
        );
      }
    }

    const purchaseRequest: OffsetPurchaseRequest = {
      projectId: body.projectId,
      amount: body.amount,
      currency: body.currency as OffsetPurchaseRequest['currency'],
      customerEmail: body.customerEmail,
      customerName: typeof body.customerName === 'string' ? body.customerName : undefined,
      metadata: typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, string>
        : undefined,
      returnUrl: typeof body.returnUrl === 'string'
        ? body.returnUrl
        : `${origin}/?carbon_offset=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: typeof body.cancelUrl === 'string'
        ? body.cancelUrl
        : `${origin}/?carbon_offset=cancelled`,
    };

    const response = await createOffsetPurchaseSession(config, purchaseRequest);

    return NextResponse.json(response, {
      status: 201,
      headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' },
    });

  } catch (error) {
    console.error('Create purchase session error:', error);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });
}