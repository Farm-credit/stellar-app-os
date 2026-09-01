import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';

interface BatchActionRequest {
  photoIds: number[];
  action: 'approve' | 'reject';
  reason?: string;
  resolveConflicts?: 'keep_newest' | 'keep_oldest' | 'manual';
}

interface ConflictResolution {
  photoId: number;
  treeRef: string;
  conflictType: 'duplicate' | 'status_mismatch';
  resolution: string;
}

export async function POST(request: Request) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: BatchActionRequest = await request.json();
    const { photoIds, action, reason, resolveConflicts = 'keep_newest' } = body;

    if (!photoIds || photoIds.length === 0) {
      return NextResponse.json(
        { error: 'No photo IDs provided' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be approve or reject' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get photo details and check for conflicts
      const photosQuery = `
        SELECT 
          pu.id,
          pu.tree_id,
          t.tree_ref,
          t.status,
          ph.duplicate_of,
          ph.hash_hex,
          pu.created_at
        FROM progress_updates pu
        INNER JOIN trees t ON pu.tree_id = t.id
        LEFT JOIN photo_hashes ph ON ph.entity_type = 'tree' 
          AND ph.entity_id = t.tree_ref
        WHERE pu.id = ANY($1::bigint[])
          AND t.deleted_at IS NULL
        ORDER BY pu.created_at DESC
      `;

      const photosResult = await client.query(photosQuery, [photoIds]);
      const photos = photosResult.rows;

      if (photos.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'No valid photos found' },
          { status: 404 }
        );
      }

      // Check for conflicts
      const conflicts: ConflictResolution[] = [];
      const photosToProcess: number[] = [];

      // Group photos by tree for conflict detection
      const photosByTree = photos.reduce((acc: Record<string, typeof photos>, photo) => {
        if (!acc[photo.tree_ref]) {
          acc[photo.tree_ref] = [];
        }
        acc[photo.tree_ref].push(photo);
        return acc;
      }, {});

      // Resolve conflicts for trees with multiple photos
      for (const [treeRef, treePhotos] of Object.entries(photosByTree)) {
        if (treePhotos.length > 1) {
          // Multiple photos for same tree - apply conflict resolution
          let selectedPhoto;
          
          if (resolveConflicts === 'keep_newest') {
            selectedPhoto = treePhotos[0]; // Already sorted by created_at DESC
          } else if (resolveConflicts === 'keep_oldest') {
            selectedPhoto = treePhotos[treePhotos.length - 1];
          } else {
            // Manual resolution required
            conflicts.push({
              photoId: treePhotos[0].id,
              treeRef,
              conflictType: 'duplicate',
              resolution: 'manual_required',
            });
            continue;
          }

          photosToProcess.push(selectedPhoto.id);
          
          // Mark others as conflicted
          const rejectedPhotos = treePhotos.filter(p => p.id !== selectedPhoto.id);
          for (const photo of rejectedPhotos) {
            conflicts.push({
              photoId: photo.id,
              treeRef,
              conflictType: 'duplicate',
              resolution: `rejected_in_favor_of_${selectedPhoto.id}`,
            });
          }
        } else {
          // Check for status conflicts
          const photo = treePhotos[0];
          if (action === 'approve' && photo.status !== 'planted') {
            conflicts.push({
              photoId: photo.id,
              treeRef: photo.tree_ref,
              conflictType: 'status_mismatch',
              resolution: `tree_status_is_${photo.status}`,
            });
          } else {
            photosToProcess.push(photo.id);
          }
        }
      }

      // Process approved photos
      if (action === 'approve' && photosToProcess.length > 0) {
        // Get tree IDs from the photos to process
        const treeIdsQuery = `
          SELECT DISTINCT tree_id 
          FROM progress_updates 
          WHERE id = ANY($1::bigint[])
        `;
        const treeIdsResult = await client.query(treeIdsQuery, [photosToProcess]);
        const treeIds = treeIdsResult.rows.map(r => r.tree_id);

        // Update tree status to verified
        const updateTreesQuery = `
          UPDATE trees 
          SET 
            status = 'verified',
            verified_at = NOW(),
            updated_at = NOW()
          WHERE id = ANY($1::bigint[])
            AND status = 'planted'
            AND deleted_at IS NULL
          RETURNING id, tree_ref
        `;
        const updatedTrees = await client.query(updateTreesQuery, [treeIds]);

        // Create status change progress updates
        for (const tree of updatedTrees.rows) {
          await client.query(
            `INSERT INTO progress_updates (
              tree_id,
              paging_token,
              update_type,
              from_status,
              to_status,
              metadata,
              submitted_by,
              created_at
            ) VALUES (
              $1,
              $2,
              'status_change',
              'planted',
              'verified',
              $3,
              'admin_batch_approval',
              NOW()
            )`,
            [
              tree.id,
              `admin-batch-${Date.now()}-${tree.id}`,
              JSON.stringify({ 
                reason: reason || 'Batch approval',
                processedPhotos: photosToProcess.length,
                conflicts: conflicts.length,
              }),
            ]
          );
        }
      }

      // Process rejected photos
      if (action === 'reject') {
        // Add rejection metadata to photos
        const rejectionMetadata = {
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || 'Batch rejection',
          rejected_by: 'admin',
        };

        const updateRejectedQuery = `
          UPDATE progress_updates 
          SET metadata = metadata || $1::jsonb
          WHERE id = ANY($2::bigint[])
        `;
        await client.query(updateRejectedQuery, [
          JSON.stringify(rejectionMetadata),
          photoIds,
        ]);
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        processed: photosToProcess.length,
        conflicts,
        action,
        message: `Successfully ${action}ed ${photosToProcess.length} photo(s)`,
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error processing batch action:', error);
    return NextResponse.json(
      { error: 'Failed to process batch action' },
      { status: 500 }
    );
  }
}
