/**
 * Offline-first submission queue for the field capture app (#1640).
 *
 * Captures are saved to a durable store (IndexedDB in the browser) and flushed
 * to the server once connectivity returns. The store and the sender are
 * injected so the flush logic can be tested without a browser.
 */

export interface FieldCapture {
  /** Client-generated id; doubles as the server-side idempotency key. */
  clientId: string;
  treeId: string;
  photo: Blob;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  healthScore: number | null;
  note: string;
  attempts: number;
  lastError?: string;
}

export interface CaptureStore {
  put(capture: FieldCapture): Promise<void>;
  getAll(): Promise<FieldCapture[]>;
  remove(clientId: string): Promise<void>;
}

/** Result of one send attempt. Permanent failures are dropped from retrying. */
export type SendOutcome = 'sent' | 'retry' | 'rejected';

export interface FlushResult {
  sent: number;
  retry: number;
  rejected: number;
}

export const MAX_ATTEMPTS = 5;

export async function flushQueue(
  store: CaptureStore,
  send: (capture: FieldCapture) => Promise<SendOutcome>
): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, retry: 0, rejected: 0 };
  const pending = (await store.getAll()).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  for (const capture of pending) {
    let outcome: SendOutcome;
    try {
      outcome = await send(capture);
    } catch {
      // Network failure: stop early, the remaining items will fail the same way.
      await store.put({ ...capture, attempts: capture.attempts + 1, lastError: 'Network error' });
      result.retry += 1;
      break;
    }

    if (outcome === 'sent') {
      await store.remove(capture.clientId);
      result.sent += 1;
    } else if (outcome === 'rejected') {
      // Keep rejected captures so the field worker can see and re-shoot them,
      // but never retry automatically.
      await store.put({ ...capture, attempts: MAX_ATTEMPTS, lastError: 'Rejected by server' });
      result.rejected += 1;
    } else {
      await store.put({
        ...capture,
        attempts: capture.attempts + 1,
        lastError: 'Server unavailable',
      });
      result.retry += 1;
    }
  }
  return result;
}

/** Captures still eligible for automatic retry. */
export function retryable(captures: FieldCapture[]): FieldCapture[] {
  return captures.filter((c) => c.attempts < MAX_ATTEMPTS);
}

export function createMemoryStore(): CaptureStore {
  const items = new Map<string, FieldCapture>();
  return {
    put(capture) {
      items.set(capture.clientId, capture);
      return Promise.resolve();
    },
    getAll() {
      return Promise.resolve([...items.values()]);
    },
    remove(clientId) {
      items.delete(clientId);
      return Promise.resolve();
    },
  };
}

const DB_NAME = 'field-captures';
const STORE_NAME = 'captures';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed store; photos are stored as Blobs so large images do not hit localStorage limits. */
export function createIndexedDbStore(): CaptureStore {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'clientId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const withStore = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const db = await open();
    try {
      return await request(fn(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
    } finally {
      db.close();
    }
  };

  return {
    async put(capture) {
      await withStore('readwrite', (s) => s.put(capture));
    },
    getAll: () => withStore('readonly', (s) => s.getAll() as IDBRequest<FieldCapture[]>),
    async remove(clientId) {
      await withStore('readwrite', (s) => s.delete(clientId));
    },
  };
}
