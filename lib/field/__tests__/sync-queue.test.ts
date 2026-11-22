import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  createMemoryStore,
  flushQueue,
  retryable,
  type FieldCapture,
} from '../sync-queue';

function capture(clientId: string, capturedAt: string): FieldCapture {
  return {
    clientId,
    treeId: 'tree-001',
    photo: new Blob(['x']),
    latitude: 12,
    longitude: 8,
    accuracyMeters: 5,
    capturedAt,
    healthScore: null,
    note: '',
    attempts: 0,
  };
}

describe('flushQueue', () => {
  it('sends queued captures oldest first and removes them', async () => {
    const store = createMemoryStore();
    await store.put(capture('b', '2026-01-02T00:00:00Z'));
    await store.put(capture('a', '2026-01-01T00:00:00Z'));
    const order: string[] = [];

    const result = await flushQueue(store, (c) => {
      order.push(c.clientId);
      return Promise.resolve('sent' as const);
    });

    expect(order).toEqual(['a', 'b']);
    expect(result).toEqual({ sent: 2, retry: 0, rejected: 0 });
    expect(await store.getAll()).toHaveLength(0);
  });

  it('keeps captures and stops when the network fails', async () => {
    const store = createMemoryStore();
    await store.put(capture('a', '2026-01-01T00:00:00Z'));
    await store.put(capture('b', '2026-01-02T00:00:00Z'));
    let calls = 0;

    const result = await flushQueue(store, () => {
      calls += 1;
      return Promise.reject(new Error('offline'));
    });

    expect(calls).toBe(1);
    expect(result.retry).toBe(1);
    const left = await store.getAll();
    expect(left).toHaveLength(2);
    expect(left.find((c) => c.clientId === 'a')?.attempts).toBe(1);
  });

  it('marks server rejections as not retryable', async () => {
    const store = createMemoryStore();
    await store.put(capture('a', '2026-01-01T00:00:00Z'));

    const result = await flushQueue(store, () => Promise.resolve('rejected' as const));

    expect(result.rejected).toBe(1);
    const left = await store.getAll();
    expect(left[0].attempts).toBe(MAX_ATTEMPTS);
    expect(retryable(left)).toHaveLength(0);
  });

  it('counts server errors as retries', async () => {
    const store = createMemoryStore();
    await store.put(capture('a', '2026-01-01T00:00:00Z'));
    const result = await flushQueue(store, () => Promise.resolve('retry' as const));
    expect(result.retry).toBe(1);
    expect(retryable(await store.getAll())).toHaveLength(1);
  });
});
