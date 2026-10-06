// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Satellite Verification API Routes
 * Issue #1429: Environmental impact verification - satellite imagery
 */

import { NextRequest, NextResponse } from 'next/server';
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

    const requestData: VerificationRequest = {
      projectId: body.projectId,
      bounds: body.bounds,
      verificationType: body.verificationType,
      startDate: body.startDate,
      endDate: body.endDate,
    };

    const job = await submitVerificationJob(requestData);
    const costEstimate = estimateJobCost(requestData);

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
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const projectId = searchParams.get('projectId');

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
      const jobs = await listVerificationJobs(projectId);
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
 * GET /api/satellite/verification/providers
 * Get supported satellite imagery providers
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    
    if (searchParams.get('action') === 'estimate-cost') {
      const body = await request.json();
      const requestData: VerificationRequest = {
        projectId: body.projectId || 'estimate',
        bounds: body.bounds,
        verificationType: body.verificationType,
        startDate: body.startDate,
        endDate: body.endDate,
      };
      const costEstimate = estimateJobCost(requestData);
      return NextResponse.json({ costEstimate });
    }

    const providers = getSupportedProviders();
    return NextResponse.json({ providers });

  } catch (error) {
    console.error('Satellite verification providers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}