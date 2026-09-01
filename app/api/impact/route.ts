import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { apiVersionHeaders, readStatus } from '@/lib/api/versioning';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_READ_REPLICA || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function getImpactResponse(request: Request, version: 'v1' | 'v2' = 'v1') {
  try {
    const url = new URL(request.url);
    const status = readStatus(url);
    let query = 'SELECT * FROM impact_data';
    const params: any[] = [];
    if (status && status !== 'all') {
      query += ' WHERE datus = $1';
      params.push(status);
    }
    const result = await pool.query(query, params);
    return NextResponse.json(result.rows, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        ...apiVersionHeaders(version, version === 'v1'),
      }
    });
  } catch (error) {
    console.error('Impact data fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return getImpactResponse(request, 'v1');
}
