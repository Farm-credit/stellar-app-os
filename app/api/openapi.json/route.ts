import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const yamlPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
    if (!fs.existsSync(yamlPath)) {
      return NextResponse.json({ error: 'OpenAPI specification file not found' }, { status: 404 });
    }

    const yamlContent = fs.readFileSync(yamlPath, 'utf8');

    // Return YAML content with appropriate header for Swagger UI / OpenAPI consumers
    return new NextResponse(yamlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[api/openapi.json] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
