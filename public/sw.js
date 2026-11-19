// Service Worker for FarmCredit PWA
const CACHE_NAME = 'farmcredit-v2';
const RUNTIME_CACHE = 'farmcredit-runtime-v2';
const SYNC_TAG = 'sync-data';
const DB = 'farmcredit-offline';
const STORE = 'pending-records';
const SYNC_ENDPOINT = '/api/field-records';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Network first strategy for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version if available
          return caches.match(request);
        })
    );
    return;
  }

  // Cache first strategy for static assets
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network first with offline fallback for pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/offline');
          }
          return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncData());
  }
});

// Open (or create) the IndexedDBused by the app for offline storage
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Read all pending records from IndexedDB
function getPendingRecords() {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = (request.result || []).filter(
          (r) => r.status !== 'synced'
        );
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

// Update the status of a syngle record in IndexedDB
function updateRecordStatus(id, status, extra) {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          resolve(null);
          return;
        }
        record.status = status;
        record.updatedAt = Date.now();
        if (extra) {
          Object.assign(record, extra);
        }
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve(record);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

// Send a single record to the server
function uploadRecord(record) {
  const payload = {
    clientId: record.clientId,
    treeId: record.treeId,
    healthStatus: record.healthStatus,
    notes: record.notes,
    latitude: record.latitude,
    longitude: record.longitude,
    photos: record.photos || [],
    capturedAt: record.createdAt,
  };

  return fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
    return response.json().catch(() => ({}));
  });
}

// Notify connected clients about sync progress
function notifyClients(message) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// Background sync implementation: upload pending records one by one
async function syncData() {
  const records = await getPendingRecords();
  if (!records.length) {
    await notifyClients({ type: 'SYNC_COMPLETE', count: 0 });
    return;
  }

  await notifyClients({ type: 'SYNC_STARTED', count: records.length });

  let synced = 0;
  for (const record of records) {
    try {
      await updateRecordStatus(record.id, 'syncing');
      const result = await uploadRecord(record);
      await updateRecordStatus(record.id, 'synced', {
        serverId: result && result.id ? result.id : null,
      });
      synced += 1;
    } catch (error) {
      // Mark as failed but keep it for a future retry
      await updateRecordStatus(record.id, 'failed', {
        error: error && error.message ? error.message : 'Unknown error',
      });
    }
  }

  await notifyClients({ type: 'SYNC_COMPLETE', count: synced });

  // If some records failed, rethrow so the browser retries the sync event
  if (synced < records.length) {
    throw new Error(`Synced ${synced} of ${records.length} records`);
  }
}

// Message handler - allow the app to trigger a manual sync
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    event.waitUntil(
      syncData().catch(() => {
        // Failures are recorded per-record and retried on the next sync
      })
    );
  }
});

// Push notification handler
// Payloads are JSON: { title, body, url, tag, actions: [{ action, title, url }] }.
// Plain-text payloads from older senders still display as a basic notification.
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const actions = Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [];
  const options = {
    body: payload.body || 'New update available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: payload.tag,
    data: {
      dateOfArrival: Date.now(),
      url: payload.url || '/',
      actionUrls: Object.fromEntries(actions.map((a) => [a.action, a.url])),
    },
    actions: actions.length
      ? actions.map((a) => ({ action: a.action, title: a.title }))
      : [
          { action: 'explore', title: 'View' },
          { action: 'close', title: 'Close' },
        ],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'FarmCredit', options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const data = event.notification.data || {};
  const target =
    (event.action && data.actionUrls && data.actionUrls[event.action]) || data.url || '/';
  event.waitUntil(clients.openWindow(target));
});
