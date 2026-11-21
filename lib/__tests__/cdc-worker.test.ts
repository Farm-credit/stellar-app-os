import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type SorobanRpc, xdr } from '@stellar/stellar-sdk';
import { CDCEventIndexer, type CDCWorkerConfig, type ParsedEvent } from '@/lib/indexer/cdc-worker';
import { getPool } from '@/lib/db/client';
import { upsertContractEvent, loadEventCursor, saveEventCursor } from '@/lib/indexer/event-upsert';
import type { Pool } from 'pg';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  getPool: vi.fn(),
}));

vi.mock('@/lib/indexer/event-upsert', () => ({
  upsertContractEvent: vi.fn(),
  loadEventCursor: vi.fn(),
  saveEventCursor: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockPool(): Pool {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Pool;
}

function createMockEventResponse(overrides: Partial<SorobanRpc.Api.EventResponse> = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    ledger: 1000,
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'C1234567890ABCDEF',
    topic: ['AAAAEAAAAAF0cmVl'],
    value: 'AAAAEAAAAAZwbGFudGVk',
    pagingToken: 'token_123',
    ...overrides,
  } as SorobanRpc.Api.EventResponse;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CDCEventIndexer', () => {
  let mockPool: Pool;
  let mockGetEvents: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
    (loadEventCursor as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (saveEventCursor as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (upsertContractEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    mockGetEvents = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor & Config ─────────────────────────────────────────────────

  it('uses default configuration when no overrides provided', () => {
    const indexer = new CDCEventIndexer();
    expect(indexer).toBeDefined();
  });

  it('accepts custom configuration overrides', () => {
    const config: Partial<CDCWorkerConfig> = {
      network: 'mainnet',
      pollIntervalMs: 10000,
      maxEventsPerPoll: 50,
      maxRetries: 5,
      contractIds: ['CABC123'],
    };
    const indexer = new CDCEventIndexer(config);
    expect(indexer).toBeDefined();
  });

  // ── Happy Path ─────────────────────────────────────────────────────────────

  it('polls events and upserts them successfully', async () => {
    const event = createMockEventResponse();
    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    // Replace the internal server with our mock
    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();

    // Let one poll cycle complete
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    expect(loadEventCursor).toHaveBeenCalledWith(mockPool, 'testnet');
    expect(mockGetEvents).toHaveBeenCalledTimes(1);
    expect(upsertContractEvent).toHaveBeenCalledTimes(1);
    expect(saveEventCursor).toHaveBeenCalledWith(mockPool, 'testnet', 1001);
  });

  it('handles empty event batches without saving cursor', async () => {
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 500,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    expect(upsertContractEvent).not.toHaveBeenCalled();
    // When no events, cursor should not advance beyond start
    expect(saveEventCursor).not.toHaveBeenCalled();
  });

  it('resumes from saved cursor', async () => {
    (loadEventCursor as ReturnType<typeof vi.fn>).mockResolvedValue(999);
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 1000,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const callArgs = mockGetEvents.mock.calls[0][0] as SorobanRpc.Server.GetEventsRequest;
    expect(callArgs.startLedger).toBe(999);
  });

  // ── Retry Logic ──────────────────────────────────────────────────────────

  it('retries getEvents on transient failure then succeeds', async () => {
    mockGetEvents.mockRejectedValueOnce(new Error('RPC timeout')).mockResolvedValueOnce({
      events: [],
      latestLedger: 100,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 2,
      retryBaseDelayMs: 100,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(500);

    indexer.stop();
    await startPromise;

    expect(mockGetEvents).toHaveBeenCalledTimes(2);
  });

  it('stops retrying after max retries exceeded and logs error', async () => {
    mockGetEvents.mockRejectedValue(new Error('RPC down'));

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
      retryBaseDelayMs: 50,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(1000);

    indexer.stop();
    await startPromise;

    expect(mockGetEvents).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('retries upsertContractEvent on failure then succeeds', async () => {
    const event = createMockEventResponse();
    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    (upsertContractEvent as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('DB deadlock'))
      .mockResolvedValueOnce(undefined);

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 2,
      retryBaseDelayMs: 50,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(500);

    indexer.stop();
    await startPromise;

    expect(upsertContractEvent).toHaveBeenCalledTimes(2);
  });

  // ── Graceful Shutdown ────────────────────────────────────────────────────

  it('stops gracefully when stop() is called', async () => {
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 100,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 10000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    expect(mockGetEvents).toHaveBeenCalledTimes(1);
  });

  it('prevents double-start', async () => {
    const indexer = new CDCEventIndexer();
    (indexer as any).running = true;

    await indexer.start();
    // Should return immediately without doing work
  });

  // ── Event Classification ─────────────────────────────────────────────────

  it('classifies known TreeMinted events correctly', async () => {
    const event = createMockEventResponse({
      topic: [xdr.ScVal.scvSymbol('TreeMinted').toXDR('base64')],
    });

    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const upsertCall = (upsertContractEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as ParsedEvent;
    expect(upsertCall.eventType).toBe('TreeMinted');
  });

  it('classifies unknown events as other', async () => {
    const event = createMockEventResponse({
      topic: [xdr.ScVal.scvSymbol('UnknownEvent').toXDR('base64')],
    });

    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const upsertCall = (upsertContractEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as ParsedEvent;
    expect(upsertCall.eventType).toBe('other');
  });

  // ── Contract Filtering ───────────────────────────────────────────────────

  it('includes contractIds in filter when configured', async () => {
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 100,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
      contractIds: ['CABC', 'CDEF'],
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const callArgs = mockGetEvents.mock.calls[0][0] as SorobanRpc.Server.GetEventsRequest;
    expect(callArgs.filters[0].contractIds).toEqual(['CABC', 'CDEF']);
  });

  it('omits contractIds from filter when empty', async () => {
    mockGetEvents.mockResolvedValue({
      events: [],
      latestLedger: 100,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
      contractIds: [],
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const callArgs = mockGetEvents.mock.calls[0][0] as SorobanRpc.Server.GetEventsRequest;
    expect(callArgs.filters[0].contractIds).toBeUndefined();
  });

  // ── Error Handling ───────────────────────────────────────────────────────

  it('handles malformed XDR topics gracefully', async () => {
    const event = createMockEventResponse({
      topic: ['invalid-xdr!!!'],
    });

    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const upsertCall = (upsertContractEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as ParsedEvent;
    expect(upsertCall.eventType).toBe('other');
  });

  it('handles missing event value gracefully', async () => {
    const event = createMockEventResponse({
      value: undefined,
    });

    mockGetEvents.mockResolvedValue({
      events: [event],
      latestLedger: 1001,
    });

    const indexer = new CDCEventIndexer({
      pollIntervalMs: 5000,
      maxRetries: 1,
    });

    (indexer as any).server = { getEvents: mockGetEvents };

    const startPromise = indexer.start();
    await vi.advanceTimersByTimeAsync(100);

    indexer.stop();
    await startPromise;

    const upsertCall = (upsertContractEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as ParsedEvent;
    expect(upsertCall.valueXdr).toBeNull();
  });
});
