// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Satellite Verification API Routes
 * Issue #1429: Environmental impact verification - satellite imagery
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  submitVerificationJob,
  getVerificationJob,
  listVerificationJobs,
  estimateJobCost,
  getSupportedProviders,
  VerificationRequest,
} from '@/backend/src/services/satelliteVerification';

/**
 * POST /api/satellite/verification
 * Submit a new satellite verification job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['projectId', 'bounds', 'verificationType', 'startDate', 'endDate'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate verificationType
    const validTypes = ['tree_count', 'land_cover_change', 'vegetation_health'];
    if (!validTypes.includes(body.verificationType)) {
      return NextResponse.json(
        { error: `Invalid verificationType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate bounds
    const { north, south, east, west } = body.bounds;
    if (north <= south) {
      return NextResponse.json({ error: 'north must be greater than south' }, { status: 400 });
    }
    if (east <= west) {
      return NextResponse.json({ error: 'east must be greater than west' }, { status: 400 });
    }

    const requestData: VerificationRequest = {
      projectId: body.projectId,
      bounds: body.bounds,
      verificationType: body.verificationType,
      startDate: body.startDate,
      endDate: body.endDate,
      provider: body.provider,
      resolutionMeters: body.resolutionMeters,
      cloudCoverThreshold: body.cloudCoverThreshold,
      webhookUrl: body.webhookUrl,
    };

    const job = await submitVerificationJob(requestData);
    const costEstimate = await estimateJobCost(requestData);

    return NextResponse.json({
      job,
      costEstimate,
      message: 'Verification job submitted successfully',
    }, { status: 201 });

  } catch (error) {
    console.error('Satellite verification POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/satellite/verification
 * List verification jobs or get a specific job
 * Query params: ?projectId=xxx or ?jobId=xxx
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    if (jobId) {
      const job = await getVerificationJob(jobId);
      if (!job) {
        return NextResponse.json(
          { error: 'Verification job not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ job });
    }

    if (projectId) {
      const jobs = await listVerificationJobs(projectId, { status: status || undefined, limit, offset });
      return NextResponse.json({ jobs });
    }

    return NextResponse.json(
      { error: 'Either jobId or projectId query parameter is required' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Satellite verification GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/satellite/verification
 * Get cost estimate or provider info
 * Query param: ?action=estimate-cost or ?action=providers
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'estimate-cost') {
      const body = await request.json();
      
      const requiredFields = ['projectId', 'bounds', 'verificationType', 'startDate', 'endDate'];
      for (const field of requiredFields) {
        if (!body[field]) {
          return NextResponse.json(
            { error: `Missing required field: ${field}` },
            { status: 400 }
          );
        }
      }

      const requestData: VerificationRequest = {
        projectId: body.projectId,
        bounds: body.bounds,
        verificationType: body.verificationType,
        startDate: body.startDate,
        endDate: body.endDate,
        provider: body.provider,
        resolutionMeters: body.resolutionMeters,
        cloudCoverThreshold: body.cloudCoverThreshold,
      };

      const costEstimate = await estimateJobCost(requestData);
      return NextResponse.json({ costEstimate });
    }

    if (action === 'providers') {
      const providers = getSupportedProviders();
      return NextResponse.json({ providers });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use ?action=estimate-cost or ?action=providers' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Satellite verification PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}