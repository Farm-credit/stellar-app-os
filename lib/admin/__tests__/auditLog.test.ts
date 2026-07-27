import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { writeAuditLog, queryAuditLogs, getAuditLogByEventId } from '@/lib/admin/auditLog';
import type { AdminOverrideAuditRow, WriteAuditParams } from '@/lib/types/auditLog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockPool(overrides: Partial<Pool> = {}): Pool {
  return { query: vi.fn(), ...overrides } as unknown as Pool;
}

function queryResult<T>(rows: T[]): QueryResult<T> {
  return { rows, command: '', oid: 0, fields: [], rowCount: rows.length } as QueryResult<T>;
}

function makeAuditRow(overrides: Partial<AdminOverrideAuditRow> = {}): AdminOverrideAuditRow {
  return {
    id: 1,
    event_id: 'evt-uuid-0001',
    admin_id: 'admin_42',
    admin_display: 'Alice Admin',
    entity_type: 'tree',
    entity_id: 'tree_99',
    action: 'status_override',
    reason: 'Photo verified manually during field visit.',
    before_state: { status: 'funded' },
    after_state: { status: 'verified' },
    metadata: { ip: '10.0.0.1' },
    created_at: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

const baseParams: WriteAuditParams = {
  admin_id: 'admin_42',
  admin_display: 'Alice Admin',
  entity_type: 'tree',
  entity_id: 'tree_99',
  action: 'status_override',
  reason: 'Photo verified manually during field visit.',
  before_state: { status: 'funded' },
  after_state: { status: 'verified' },
};

// ── writeAuditLog ─────────────────────────────────────────────────────────────

describe('writeAuditLog', () => {
  it('executes an INSERT and returns the row', async () => {
    const pool = mockPool();
    const row = makeAuditRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await writeAuditLog(pool, baseParams);

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO admin_override_audit');
    expect(sql).toContain('RETURNING');
  });

  it('passes all required fields to the query', async () => {
    const pool = mockPool();
    const row = makeAuditRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    await writeAuditLog(pool, baseParams);

    const values = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(values).toContain('admin_42');
    expect(values).toContain('Alice Admin');
    expect(values).toContain('tree');
    expect(values).toContain('tree_99');
    expect(values).toContain('status_override');
    expect(values).toContain('Photo verified manually during field visit.');
  });

  it('serialises before_state and after_state as JSON strings', async () => {
    const pool = mockPool();
    const row = makeAuditRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    await writeAuditLog(pool, baseParams);

    const values = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    // before_state and after_state should be JSON strings
    expect(typeof values[6]).toBe('string');
    expect(typeof values[7]).toBe('string');
    expect(JSON.parse(values[6] as string)).toEqual({ status: 'funded' });
    expect(JSON.parse(values[7] as string)).toEqual({ status: 'verified' });
  });

  it('handles null before_state and after_state', async () => {
    const pool = mockPool();
    const row = makeAuditRow({ before_state: null, after_state: null });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await writeAuditLog(pool, {
      ...baseParams,
      before_state: null,
      after_state: null,
    });

    const values = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(values[6]).toBeNull();
    expect(values[7]).toBeNull();
    expect(result).toEqual(row);
  });

  it('throws when DB returns no row', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await expect(writeAuditLog(pool, baseParams)).rejects.toThrow('[auditLog] INSERT returned no row');
  });

  it('propagates DB errors', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('connection refused'));

    await expect(writeAuditLog(pool, baseParams)).rejects.toThrow('connection refused');
  });
});

// ── queryAuditLogs ────────────────────────────────────────────────────────────

describe('queryAuditLogs', () => {
  it('returns rows and total with no filters', async () => {
    const pool = mockPool();
    const rows = [makeAuditRow(), makeAuditRow({ id: 2, event_id: 'evt-uuid-0002' })];

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([{ total: 2 }]))
      .mockResolvedValueOnce(queryResult(rows));

    const result = await queryAuditLogs(pool);

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('applies admin_id filter', async () => {
    const pool = mockPool();
    const row = makeAuditRow();

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([{ total: 1 }]))
      .mockResolvedValueOnce(queryResult([row]));

    const result = await queryAuditLogs(pool, { admin_id: 'admin_42' });

    expect(result.rows).toHaveLength(1);
    // Both queries should have WHERE clause
    const countSql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(countSql).toContain('WHERE');
    const countValues = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(countValues).toContain('admin_42');
  });

  it('applies entity_type and entity_id filters together', async () => {
    const pool = mockPool();

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([{ total: 1 }]))
      .mockResolvedValueOnce(queryResult([makeAuditRow()]));

    await queryAuditLogs(pool, { entity_type: 'tree', entity_id: 'tree_99' });

    const countValues = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(countValues).toContain('tree');
    expect(countValues).toContain('tree_99');
  });

  it('uses default limit=20 and offset=0', async () => {
    const pool = mockPool();

    vi.mocked(pool.query)
      .mockResolvedValueOnce(queryResult([{ total: 0 }]))
      .mockResolvedValueOnce(queryResult([]));

    await queryAuditLogs(pool);

    const dataSql = vi.mocked(pool.query).mock.calls[1][0] as string;
    const dataValues = vi.mocked(pool.query).mock.calls[1][1] as unknown[];
    expect(dataSql).toContain('LIMIT');
    expect(dataSql).toContain('OFFSET');
    expect(dataValues).toContain(20);  // default limit
    expect(dataValues).toContain(0);   // default offset
  });
});

// ── getAuditLogByEventId ──────────────────────────────────────────────────────

describe('getAuditLogByEventId', () => {
  it('returns the row when found', async () => {
    const pool = mockPool();
    const row = makeAuditRow();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([row]));

    const result = await getAuditLogByEventId(pool, 'evt-uuid-0001');
    expect(result).toEqual(row);
  });

  it('returns null when not found', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const result = await getAuditLogByEventId(pool, 'nonexistent');
    expect(result).toBeNull();
  });

  it('queries by event_id', async () => {
    const pool = mockPool();
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await getAuditLogByEventId(pool, 'evt-uuid-0001');

    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    const values = vi.mocked(pool.query).mock.calls[0][1] as unknown[];
    expect(sql).toContain('event_id');
    expect(values).toContain('evt-uuid-0001');
  });
});
