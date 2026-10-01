import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isAdminRequest, getPool, emitTreeLifecycleEvent } = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getPool: vi.fn(),
  emitTreeLifecycleEvent: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest }));
vi.mock('@/lib/db/client', () => ({ getPool }));
vi.mock('@/lib/webhook/events', () => ({ emitTreeLifecycleEvent }));

import { POST } from './route';

type Row = Record<string, unknown>;

interface Fixtures {
  photos: Row[];
  treeIds: Row[];
  updatedTrees: Row[];
}

const fixtures: Fixtures = { photos: [], treeIds: [], updatedTrees: [] };

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();

// Routes a query by its normalized SQL to the relevant fixture. Params are
// captured on the mock so tests can assert on them (e.g. the wrapped array form
// the route passes to ANY($1::bigint[])).
function queryImpl(sql: string): { rows: Row[] } {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  if (/^BEGIN$|^COMMIT$|^ROLLBACK$/i.test(normalized)) {
    return { rows: [] };
  }
  if (/SELECT DISTINCT tree_id/i.test(normalized)) {
    return { rows: fixtures.treeIds };
  }
  if (/INSERT INTO progress_updates/i.test(normalized)) {
    return { rows: [] };
  }
  if (/UPDATE trees/i.test(normalized)) {
    return { rows: fixtures.updatedTrees };
  }
  if (/UPDATE progress_updates/i.test(normalized)) {
    return { rows: [] };
  }
  if (/FROM progress_updates pu/i.test(normalized)) {
    return { rows: fixtures.photos };
  }
  return { rows: [] };
}

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function callsFor(pattern: RegExp): unknown[][] {
  return queryMock.mock.calls.filter((call) =>
    pattern.test(String(call[0]).replace(/\s+/g, ' '))
  );
}

describe('admin batch verification photos route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.photos = [];
    fixtures.treeIds = [];
    fixtures.updatedTrees = [];

    queryMock.mockImplementation(queryImpl);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    getPool.mockReturnValue({ connect: connectMock });
    isAdminRequest.mockResolvedValue(true);
    emitTreeLifecycleEvent.mockResolvedValue(undefined);
  });

  it('returns 401 and never touches the database for non-admin requests', async () => {
    isAdminRequest.mockResolvedValue(false);

    const response = await POST(makeRequest({ photoIds: [1], action: 'approve' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getPool).not.toHaveBeenCalled();
  });

  it('returns 400 when no photo IDs are provided', async () => {
    const response = await POST(makeRequest({ photoIds: [], action: 'approve' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'No photo IDs provided' });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid action', async () => {
    const response = await POST(makeRequest({ photoIds: [1], action: 'maybe' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid action. Must be approve or reject',
    });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 404 and rolls back when no valid photos are found', async () => {
    const response = await POST(makeRequest({ photoIds: [999], action: 'approve' }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No valid photos found' });
    expect(callsFor(/^ROLLBACK$/i)).toHaveLength(1);
    expect(callsFor(/^COMMIT$/i)).toHaveLength(0);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('approves a single planted tree, verifies it and emits a lifecycle event', async () => {
    fixtures.photos = [
      { id: 1, tree_id: 10, tree_ref: 'TREE-1', status: 'planted' },
    ];
    fixtures.treeIds = [{ tree_id: 10 }];
    fixtures.updatedTrees = [{ id: 10, tree_ref: 'TREE-1' }];

    const response = await POST(makeRequest({ photoIds: [1], action: 'approve' }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: true, processed: 1, action: 'approve' });
    expect(data.conflicts).toEqual([]);

    // tree IDs are passed wrapped: the route calls query(sql, [treeIds])
    const updateTrees = callsFor(/UPDATE trees/i);
    expect(updateTrees).toHaveLength(1);
    expect(updateTrees[0][1]).toEqual([[10]]);

    expect(callsFor(/INSERT INTO progress_updates/i)).toHaveLength(1);
    expect(emitTreeLifecycleEvent).toHaveBeenCalledWith(
      'tree.verified',
      expect.objectContaining({
        treeId: 10,
        treeRef: 'TREE-1',
        previousStatus: 'planted',
        newStatus: 'verified',
        source: 'admin_batch_approval',
      })
    );
    expect(callsFor(/^COMMIT$/i)).toHaveLength(1);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('records a status_mismatch conflict and skips processing when a tree is already verified', async () => {
    fixtures.photos = [
      { id: 2, tree_id: 20, tree_ref: 'TREE-2', status: 'verified' },
    ];

    const response = await POST(makeRequest({ photoIds: [2], action: 'approve' }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.processed).toBe(0);
    expect(data.conflicts).toEqual([
      {
        photoId: 2,
        treeRef: 'TREE-2',
        conflictType: 'status_mismatch',
        resolution: 'tree_status_is_verified',
      },
    ]);
    expect(callsFor(/UPDATE trees/i)).toHaveLength(0);
    expect(emitTreeLifecycleEvent).not.toHaveBeenCalled();
    expect(callsFor(/^COMMIT$/i)).toHaveLength(1);
  });

  it('keep_newest selects the newest photo and rejects the older duplicate', async () => {
    // Sorted by created_at DESC: id 11 is newer than id 10.
    fixtures.photos = [
      { id: 11, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
      { id: 10, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
    ];
    fixtures.treeIds = [{ tree_id: 30 }];
    fixtures.updatedTrees = [{ id: 30, tree_ref: 'TREE-3' }];

    const response = await POST(
      makeRequest({ photoIds: [10, 11], action: 'approve', resolveConflicts: 'keep_newest' })
    );

    const data = await response.json();
    expect(data.processed).toBe(1);
    expect(data.conflicts).toEqual([
      {
        photoId: 10,
        treeRef: 'TREE-3',
        conflictType: 'duplicate',
        resolution: 'rejected_in_favor_of_11',
      },
    ]);
    expect(emitTreeLifecycleEvent).toHaveBeenCalledTimes(1);
  });

  it('keep_oldest selects the oldest photo and rejects the newer duplicate', async () => {
    fixtures.photos = [
      { id: 11, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
      { id: 10, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
    ];
    fixtures.treeIds = [{ tree_id: 30 }];
    fixtures.updatedTrees = [{ id: 30, tree_ref: 'TREE-3' }];

    const response = await POST(
      makeRequest({ photoIds: [10, 11], action: 'approve', resolveConflicts: 'keep_oldest' })
    );

    const data = await response.json();
    expect(data.processed).toBe(1);
    expect(data.conflicts).toEqual([
      {
        photoId: 11,
        treeRef: 'TREE-3',
        conflictType: 'duplicate',
        resolution: 'rejected_in_favor_of_10',
      },
    ]);
  });

  it('manual resolution flags the tree for review and processes nothing', async () => {
    fixtures.photos = [
      { id: 11, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
      { id: 10, tree_id: 30, tree_ref: 'TREE-3', status: 'planted' },
    ];

    const response = await POST(
      makeRequest({ photoIds: [10, 11], action: 'approve', resolveConflicts: 'manual' })
    );

    const data = await response.json();
    expect(data.processed).toBe(0);
    expect(data.conflicts).toEqual([
      {
        photoId: 11,
        treeRef: 'TREE-3',
        conflictType: 'duplicate',
        resolution: 'manual_required',
      },
    ]);
    expect(callsFor(/UPDATE trees/i)).toHaveLength(0);
    expect(emitTreeLifecycleEvent).not.toHaveBeenCalled();
  });

  it('reject writes rejection metadata with the provided reason and emits no event', async () => {
    fixtures.photos = [
      { id: 1, tree_id: 10, tree_ref: 'TREE-1', status: 'planted' },
    ];

    const response = await POST(
      makeRequest({ photoIds: [1], action: 'reject', reason: 'blurry' })
    );

    const data = await response.json();
    expect(data.action).toBe('reject');
    expect(data.processed).toBe(1);

    const rejectCalls = callsFor(/UPDATE progress_updates/i);
    expect(rejectCalls).toHaveLength(1);
    const params = rejectCalls[0][1] as [string, number[]];
    expect(params[1]).toEqual([1]);
    expect(JSON.parse(params[0])).toMatchObject({
      rejection_reason: 'blurry',
      rejected_by: 'admin',
    });
    expect(emitTreeLifecycleEvent).not.toHaveBeenCalled();
    expect(callsFor(/^COMMIT$/i)).toHaveLength(1);
  });

  it('returns 500 and rolls back when the tree update throws', async () => {
    fixtures.photos = [
      { id: 1, tree_id: 10, tree_ref: 'TREE-1', status: 'planted' },
    ];
    fixtures.treeIds = [{ tree_id: 10 }];
    queryMock.mockImplementation((sql: string) => {
      if (/UPDATE trees/i.test(String(sql).replace(/\s+/g, ' '))) {
        throw new Error('db down');
      }
      return queryImpl(sql);
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(makeRequest({ photoIds: [1], action: 'approve' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to process batch action' });
    expect(callsFor(/^ROLLBACK$/i)).toHaveLength(1);
    expect(callsFor(/^COMMIT$/i)).toHaveLength(0);
    expect(releaseMock).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
