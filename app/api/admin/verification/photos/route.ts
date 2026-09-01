import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';

interface VerificationPhoto {
  id: number;
  treeId: number;
  treeRef: string;
  updateType: string;
  mediaUrl: string;
  ipfsCid: string;
  lat: string;
  lng: string;
  metadata: Record<string, unknown>;
  submittedBy: string;
  createdAt: string;
  treeStatus: string;
  planterName: string;
  species: string;
  region: string;
  photoHash: string | null;
  duplicateOf: number | null;
  hammingDistance: number | null;
}

export async function GET(request: Request) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status') || 'pending';
    const region = searchParams.get('region') || 'all';
    const species = searchParams.get('species') || 'all';
    const duplicatesOnly = searchParams.get('duplicatesOnly') === 'true';
    
    const offset = (page - 1) * limit;

    const pool = getPool();

    // Build WHERE clause dynamically
    const conditions: string[] = ['pu.update_type = $1'];
    const params: (string | number | boolean)[] = ['photo_submitted'];
    let paramIndex = 2;

    // Filter by tree status (pending = planted, not yet verified)
    if (status === 'pending') {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push('planted');
    } else if (status !== 'all') {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status);
    }

    // Filter by region
    if (region !== 'all') {
      conditions.push(`t.region = $${paramIndex++}`);
      params.push(region);
    }

    // Filter by species
    if (species !== 'all') {
      conditions.push(`t.species_slug = $${paramIndex++}`);
      params.push(species);
    }

    // Filter for duplicates only
    if (duplicatesOnly) {
      conditions.push(`ph.duplicate_of IS NOT NULL`);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT pu.id) as total
      FROM progress_updates pu
      INNER JOIN trees t ON pu.tree_id = t.id
      LEFT JOIN planters p ON t.planter_id = p.id
      LEFT JOIN photo_hashes ph ON ph.entity_type = 'tree' 
        AND ph.entity_id = t.tree_ref
        AND ph.storage_ref = pu.media_url
      WHERE ${whereClause}
        AND pu.media_url IS NOT NULL
        AND t.deleted_at IS NULL
    `;

    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);

    // Get photos with metadata
    const photosQuery = `
      SELECT 
        pu.id,
        pu.tree_id as "treeId",
        t.tree_ref as "treeRef",
        pu.update_type as "updateType",
        pu.media_url as "mediaUrl",
        pu.ipfs_cid as "ipfsCid",
        pu.lat,
        pu.lng,
        pu.metadata,
        pu.submitted_by as "submittedBy",
        pu.created_at as "createdAt",
        t.status as "treeStatus",
        p.full_name as "planterName",
        t.species_slug as "species",
        t.region,
        ph.hash_hex as "photoHash",
        ph.duplicate_of as "duplicateOf",
        CASE 
          WHEN ph.duplicate_of IS NOT NULL THEN
            (SELECT bit_count(ph.hash # ph2.hash) 
             FROM photo_hashes ph2 
             WHERE ph2.id = ph.duplicate_of)
          ELSE NULL
        END as "hammingDistance"
      FROM progress_updates pu
      INNER JOIN trees t ON pu.tree_id = t.id
      LEFT JOIN planters p ON t.planter_id = p.id
      LEFT JOIN photo_hashes ph ON ph.entity_type = 'tree' 
        AND ph.entity_id = t.tree_ref
        AND ph.storage_ref = pu.media_url
      WHERE ${whereClause}
        AND pu.media_url IS NOT NULL
        AND t.deleted_at IS NULL
      ORDER BY 
        CASE WHEN ph.duplicate_of IS NOT NULL THEN 0 ELSE 1 END,
        pu.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const photosResult = await pool.query<VerificationPhoto>(photosQuery, params);

    // Get filter options
    const regionsQuery = `
      SELECT DISTINCT region FROM trees 
      WHERE deleted_at IS NULL 
      ORDER BY region
    `;
    const regionsResult = await pool.query(regionsQuery);
    const regions = regionsResult.rows.map(r => r.region);

    const speciesQuery = `
      SELECT DISTINCT species_slug FROM trees 
      WHERE deleted_at IS NULL AND species_slug IS NOT NULL
      ORDER BY species_slug
    `;
    const speciesResult = await pool.query(speciesQuery);
    const speciesList = speciesResult.rows.map(s => s.species_slug);

    return NextResponse.json({
      photos: photosResult.rows,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      filters: {
        regions,
        species: speciesList,
      },
    });
  } catch (error) {
    console.error('Error fetching verification photos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification photos' },
      { status: 500 }
    );
  }
}
