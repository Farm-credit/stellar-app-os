import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';
import { emitTreeLifecycleEvent } from '@/lib/webhook/events';

interface BatchPhotoRequest {
  photoIds: number[];
  action: 'approve' | 'reject';
  reason?: string;
  resolveConflicts?: 'keep_newest' | 'keep_oldest' | 'manual';
}

interface VerificationPhoto {
  id: number;
  tree_id: number;
  tree_ref: string;
  status: string;
}

interface ConflictResolution {
  photoId: number;
  treeRef: string;
  conflictType: 'duplicate' | 'status_mismatch';
  resolution: string;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: BatchPhotoRequest = await request.json();
    const { photoIds, action, reason, resolveConflicts = 'keep_newest' } = body;

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ error: 'No photo IDs provided' }, { status: 400 });
    }

    if (
      photoIds.some((photoId) => !Number.isSafeInteger(photoId) || photoId <= 0) ||
      !['approve', 'reject'].includes(action)
    ) {
      return NextResponse.json(
        { error: 'Invalid action. Must be approve or reject' },
        { status: 400 }
      );
    }

    if (!['keep_newest', 'keep_oldest', 'manual'].includes(resolveConflicts)) {
      return NextResponse.json({ error: 'Invalid conflict resolution' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const photosResult = await client.query<VerificationPhoto>(
        `SELECT pu.id, pu.tree_id, t.tree_ref, t.status
         FROM progress_updates pu
         INNER JOIN trees t ON pu.tree_id = t.id
         WHERE pu.id = ANY($1::bigint[])
           AND pu.update_type = 'photo_submitted'
           AND pu.media_url IS NOT NULL
           AND t.deleted_at IS NULL
         ORDER BY pu.created_at DESC, pu.id DESC
         FOR UPDATE OF pu, t`,
        [photoIds]
      );
      const photos = photosResult.rows;

      if (photos.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No valid photos found' }, { status: 404 });
      }

      const conflicts: ConflictResolution[] = [];
      const selectedByTree = new Map<number, VerificationPhoto[]>();

      for (const photo of photos) {
        const group = selectedByTree.get(photo.tree_id) ?? [];
        group.push(photo);
        selectedByTree.set(photo.tree_id, group);
      }

      const photosToProcess: VerificationPhoto[] = [];
      for (const treePhotos of selectedByTree.values()) {
        if (treePhotos.length > 1 && resolveConflicts === 'manual') {
          conflicts.push({
            photoId: treePhotos[0].id,
            treeRef: treePhotos[0].tree_ref,
            conflictType: 'duplicate',
            resolution: 'manual_required',
          });
          continue;
        }

        const selectedPhoto =
          treePhotos.length === 1 || resolveConflicts === 'keep_newest'
            ? treePhotos[0]
            : treePhotos[treePhotos.length - 1];

        photosToProcess.push(selectedPhoto);
        for (const photo of treePhotos) {
          if (photo.id !== selectedPhoto.id) {
            conflicts.push({
              photoId: photo.id,
              treeRef: photo.tree_ref,
              conflictType: 'duplicate',
              resolution: `rejected_in_favor_of_${selectedPhoto.id}`,
            });
          }
        }
      }

      const eligiblePhotos: VerificationPhoto[] = [];
      for (const photo of photosToProcess) {
        if (action === 'approve' && photo.status !== 'planted') {
          conflicts.push({
            photoId: photo.id,
            treeRef: photo.tree_ref,
            conflictType: 'status_mismatch',
            resolution: `tree_status_is_${photo.status}`,
          });
        } else {
          eligiblePhotos.push(photo);
        }
      }

      if (action === 'approve' && eligiblePhotos.length > 0) {
        const treeIds = eligiblePhotos.map((photo) => photo.tree_id);
        const updatedTrees = await client.query<{ id: number; tree_ref: string }>(
          `UPDATE trees
           SET status = 'verified', verified_at = NOW(), updated_at = NOW()
           WHERE id = ANY($1::bigint[])
             AND status = 'planted'
             AND deleted_at IS NULL
           RETURNING id, tree_ref`,
          [treeIds]
        );

        for (const tree of updatedTrees.rows) {
          await client.query(
            `INSERT INTO progress_updates (
              tree_id, paging_token, update_type, from_status, to_status, submitted_by
            ) VALUES ($1, $2, 'status_change', 'planted', 'verified', 'admin')`,
            [tree.id, `admin-verification-${tree.id}-${Date.now()}`]
          );
        }

        const updatedTreeIds = new Set(updatedTrees.rows.map((tree) => tree.id));
        for (const photo of eligiblePhotos) {
          if (!updatedTreeIds.has(photo.tree_id)) {
            conflicts.push({
              photoId: photo.id,
              treeRef: photo.tree_ref,
              conflictType: 'status_mismatch',
              resolution: 'tree_status_changed_during_review',
            });
          }
        }

        await client.query('COMMIT');

        for (const tree of updatedTrees.rows) {
          await emitTreeLifecycleEvent('tree.verified', {
            treeId: tree.id,
            treeRef: tree.tree_ref,
            previousStatus: 'planted',
            newStatus: 'verified',
            source: 'admin_batch_approval',
          });
        }

        return NextResponse.json({
          success: true,
          processed: updatedTrees.rows.length,
          conflicts,
          action,
          message: `Successfully approved ${updatedTrees.rows.length} photo(s)`,
        });
      }

      if (action === 'reject' && eligiblePhotos.length > 0) {
        const eligiblePhotoIds = eligiblePhotos.map((photo) => photo.id);
        const rejectionMetadata = JSON.stringify({
          rejected_at: new Date().toISOString(),
          rejection_reason: reason?.trim() || 'Rejected by reviewer',
          rejected_by: 'admin',
        });

        await client.query(
          `UPDATE progress_updates
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE id = ANY($2::bigint[])`,
          [rejectionMetadata, eligiblePhotoIds]
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        processed: eligiblePhotos.length,
        conflicts,
        action,
        message: `Successfully ${action}ed ${eligiblePhotos.length} photo(s)`,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing batch photo action:', error);
    return NextResponse.json({ error: 'Failed to process batch action' }, { status: 500 });
  }
}
