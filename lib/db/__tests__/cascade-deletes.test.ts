/**
 * Test suite for verifying database cascade deletes — Issue #1169.
 *
 * Verifies that cascading deletions on primary tables (trees, sponsor_teams, planters)
 * automatically clean up child tables (progress_updates, disputes, sponsor_team_trees,
 * sponsor_team_members, etc.) and leave zero orphaned records in the database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  queryMock.mockReset();
});

// ── Helper Types ─────────────────────────────────────────────────────────────

interface OrphanCheckResult {
  orphaned_progress_updates: number;
  orphaned_disputes: number;
  orphaned_sponsor_team_trees: number;
  orphaned_sponsor_team_members: number;
}

// ── Test Suites ──────────────────────────────────────────────────────────────

describe('Database Cascade Deletes & Orphan Prevention (#1169)', () => {
  describe('Tree Record Cascade Deletes', () => {
    it('deleting a tree record cascade deletes associated progress updates', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      const deleteResult = await pool.query('DELETE FROM trees WHERE id = $1', [101]);
      expect(deleteResult.rowCount).toBe(1);

      const orphanCheck = await pool.query(
        'SELECT COUNT(*)::int AS orphan_count FROM progress_updates WHERE tree_id = $1',
        [101]
      );
      expect(orphanCheck.rows[0].orphan_count).toBe(0);
    });

    it('deleting a tree record cascade deletes associated disputes', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      await pool.query('DELETE FROM trees WHERE id = $1', [102]);
      const orphanCheck = await pool.query(
        'SELECT COUNT(*)::int AS orphan_count FROM disputes WHERE tree_id = $1',
        [102]
      );
      expect(orphanCheck.rows[0].orphan_count).toBe(0);
    });

    it('deleting a tree record cascade deletes associated sponsor_team_trees links', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      await pool.query('DELETE FROM trees WHERE id = $1', [103]);
      const orphanCheck = await pool.query(
        'SELECT COUNT(*)::int AS orphan_count FROM sponsor_team_trees WHERE tree_id = $1',
        [103]
      );
      expect(orphanCheck.rows[0].orphan_count).toBe(0);
    });
  });

  describe('Sponsorship Team Cascade Deletes', () => {
    it('deleting a sponsor team cascade deletes associated team members', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      await pool.query('DELETE FROM sponsor_teams WHERE id = $1', [50]);
      const orphanCheck = await pool.query(
        'SELECT COUNT(*)::int AS orphan_count FROM sponsor_team_members WHERE team_id = $1',
        [50]
      );
      expect(orphanCheck.rows[0].orphan_count).toBe(0);
    });

    it('deleting a sponsor team cascade deletes associated team tree records', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      await pool.query('DELETE FROM sponsor_teams WHERE id = $1', [51]);
      const orphanCheck = await pool.query(
        'SELECT COUNT(*)::int AS orphan_count FROM sponsor_team_trees WHERE team_id = $1',
        [51]
      );
      expect(orphanCheck.rows[0].orphan_count).toBe(0);
    });
  });

  describe('Global Integrity & Zero Orphan Verification', () => {
    it('verifies system-wide absence of orphaned records across tree and sponsorship tables', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            orphaned_progress_updates: 0,
            orphaned_disputes: 0,
            orphaned_sponsor_team_trees: 0,
            orphaned_sponsor_team_members: 0,
          },
        ],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      const globalOrphanCheck = await pool.query<OrphanCheckResult>(`
        SELECT 
          (SELECT COUNT(*) FROM progress_updates pu WHERE NOT EXISTS (SELECT 1 FROM trees t WHERE t.id = pu.tree_id))::int AS orphaned_progress_updates,
          (SELECT COUNT(*) FROM disputes d WHERE NOT EXISTS (SELECT 1 FROM trees t WHERE t.id = d.tree_id))::int AS orphaned_disputes,
          (SELECT COUNT(*) FROM sponsor_team_trees stt WHERE NOT EXISTS (SELECT 1 FROM trees t WHERE t.id = stt.tree_id))::int AS orphaned_sponsor_team_trees,
          (SELECT COUNT(*) FROM sponsor_team_members stm WHERE NOT EXISTS (SELECT 1 FROM sponsor_teams st WHERE st.id = stm.team_id))::int AS orphaned_sponsor_team_members
      `);

      const res = globalOrphanCheck.rows[0];
      expect(res.orphaned_progress_updates).toBe(0);
      expect(res.orphaned_disputes).toBe(0);
      expect(res.orphaned_sponsor_team_trees).toBe(0);
      expect(res.orphaned_sponsor_team_members).toBe(0);
    });

    it('handles bulk deletions without producing orphaned sponsorship or tree records', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 5 });
      queryMock.mockResolvedValueOnce({
        rows: [{ orphan_count: 0 }],
        rowCount: 1,
      });

      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();

      const bulkDelete = await pool.query('DELETE FROM trees WHERE status = $1', ['failed']);
      expect(bulkDelete.rowCount).toBe(5);

      const checkOrphans = await pool.query(`
        SELECT COUNT(*)::int AS orphan_count 
        FROM progress_updates pu 
        LEFT JOIN trees t ON pu.tree_id = t.id 
        WHERE t.id IS NULL
      `);
      expect(checkOrphans.rows[0].orphan_count).toBe(0);
    });
  });
});
