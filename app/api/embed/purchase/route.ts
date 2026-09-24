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
  EmbedConfig,
} from '@/backend/src/services/carbonOffsetApi';

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

    const body = await request.json();

    // Validate required fields
    const requiredFields = ['projectId', 'amount', 'currency', 'customerEmail'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const purchaseRequest: OffsetPurchaseRequest = {
      projectId: body.projectId,
      amount: body.amount,
      currency: body.currency,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      metadata: body.metadata,
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
    };

    const response = await createOffsetPurchaseSession(config as any, purchaseRequest);

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Create purchase session error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}