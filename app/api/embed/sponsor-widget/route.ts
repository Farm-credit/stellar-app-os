// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { type NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

/**
 * GET /api/embed/sponsor-widget
 *
 * Serves the white-label vanilla JS embed SDK for third-party websites.
 */
export async function GET(request: NextRequest) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'embed', 'sponsor-widget.js');
    const content = fs.readFileSync(filePath, 'utf-8');

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error serving embed sponsor widget script:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
