'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { Camera, CloudOff, CloudUpload, MapPin, RefreshCw, Wifi } from 'lucide-react';
import { analyzePhoto, getDeviceLocation, type DeviceLocation } from '@/lib/field/analyze-photo';
import type { PhotoQualityResult } from '@/lib/field/photo-quality';
import {
  MAX_ATTEMPTS,
  createIndexedDbStore,
  flushQueue,
  retryable,
  type CaptureStore,
  type FieldCapture,
  type SendOutcome,
} from '@/lib/field/sync-queue';

const TOKEN_KEY = 'field_team_token';

function newClientId(): string {
  return `cap-${crypto.randomUUID()}`;
}

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

async function sendCapture(capture: FieldCapture, token: string): Promise<SendOutcome> {
  const form = new FormData();
  form.set('clientId', capture.clientId);
  form.set('treeId', capture.treeId);
  form.set('latitude', String(capture.latitude));
  form.set('longitude', String(capture.longitude));
  form.set('capturedAt', capture.capturedAt);
  if (capture.accuracyMeters !== null) form.set('accuracyMeters', String(capture.accuracyMeters));
  if (capture.healthScore !== null) form.set('healthScore', String(capture.healthScore));
  if (capture.note) form.set('note', capture.note);
  form.set('photo', capture.photo, `${capture.clientId}.jpg`);

  const res = await fetch('/api/field/tree-updates', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.ok) return 'sent';
  // 4xx (other than auth/rate limiting) will never succeed on retry.
  if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
    return 'rejected';
  }
  return 'retry';
}

/**
 * Lightweight mobile-web capture tool for field teams (#1640). Photographs a
 * tree, grabs GPS automatically, validates photo quality, and syncs to the
 * sponsor-facing tree record. Captures made offline wait in IndexedDB and are
 * uploaded when connectivity returns.
 */
export function FieldCaptureApp(): JSX.Element {
  const storeRef = useRef<CaptureStore | null>(null);
  const [token, setToken] = useState('');
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<FieldCapture[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [treeId, setTreeId] = useState('');
  const [healthScore, setHealthScore] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);

  const refreshQueue = useCallback(async () => {
    if (storeRef.current) setQueue(await storeRef.current.getAll());
  }, []);

  const sync = useCallback(async () => {
    const store = storeRef.current;
    if (!store || !navigator.onLine) return;
    const activeToken = readToken();
    if (!activeToken) {
      setStatus('Enter your field team token to sync.');
      return;
    }
    setSyncing(true);
    try {
      const pending = retryable(await store.getAll());
      if (pending.length === 0) return;
      const result = await flushQueue(
        {
          ...store,
          getAll: async () => retryable(await store.getAll()),
        },
        (capture) => sendCapture(capture, activeToken)
      );
      setStatus(
        `Synced ${result.sent}${result.retry ? `, ${result.retry} will retry` : ''}${
          result.rejected ? `, ${result.rejected} rejected` : ''
        }.`
      );
    } finally {
      setSyncing(false);
      await refreshQueue();
    }
  }, [refreshQueue]);

  useEffect(() => {
    storeRef.current = createIndexedDbStore();
    setToken(readToken());
    setOnline(navigator.onLine);
    void refreshQueue().then(() => sync());

    const goOnline = (): void => {
      setOnline(true);
      void sync();
    };
    const goOffline = (): void => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [refreshQueue, sync]);

  const locate = useCallback(async () => {
    setLocationError(null);
    try {
      setLocation(await getDeviceLocation());
    } catch (err) {
      setLocation(null);
      setLocationError(err instanceof Error ? err.message : 'Could not read GPS location');
    }
  }, []);

  const onPhoto = async (file: File | null): Promise<void> => {
    setPhoto(file);
    setQuality(null);
    if (!file) return;
    setAnalysing(true);
    // GPS is captured at the moment of the photo, not typed in.
    void locate();
    try {
      setQuality((await analyzePhoto(file)).quality);
    } catch {
      setQuality({
        ok: false,
        issues: [{ code: 'low_resolution', message: 'This photo could not be read. Retake it.' }],
      });
    } finally {
      setAnalysing(false);
    }
  };

  const canSave = useMemo(
    () => Boolean(treeId.trim() && photo && quality?.ok && location && !analysing),
    [treeId, photo, quality, location, analysing]
  );

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSave || !photo || !location || !storeRef.current) return;
    const score = healthScore.trim() === '' ? null : Number(healthScore);
    await storeRef.current.put({
      clientId: newClientId(),
      treeId: treeId.trim(),
      photo,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters,
      capturedAt: new Date().toISOString(),
      healthScore: score !== null && Number.isFinite(score) ? score : null,
      note: note.trim(),
      attempts: 0,
    });
    setStatus(
      online ? 'Saved. Uploading…' : 'Saved offline. It will upload when you are back online.'
    );
    setPhoto(null);
    setQuality(null);
    setLocation(null);
    setHealthScore('');
    setNote('');
    await refreshQueue();
    void sync();
  };

  const saveToken = (value: string): void => {
    setToken(value);
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      // Storage can be unavailable in private mode; the token just won't persist.
    }
  };

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-base';

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Field capture</h1>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
            online ? 'bg-stellar-green/10 text-stellar-green' : 'bg-amber-500/10 text-amber-600'
          }`}
          role="status"
        >
          {online ? (
            <Wifi className="h-3 w-3" aria-hidden />
          ) : (
            <CloudOff className="h-3 w-3" aria-hidden />
          )}
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <label className="block space-y-1 text-sm font-semibold">
        Field team token
        <input
          type="password"
          className={inputClass}
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          autoComplete="off"
        />
      </label>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1 text-sm font-semibold">
          Tree ID
          <input
            className={inputClass}
            value={treeId}
            onChange={(e) => setTreeId(e.target.value)}
            placeholder="HRV-2024-0001"
            required
          />
        </label>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm font-semibold">
          <Camera className="h-5 w-5" aria-hidden />
          {photo ? 'Retake photo' : 'Take photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
          />
        </label>

        {analysing && <p className="text-sm text-muted-foreground">Checking photo quality…</p>}
        {quality && !quality.ok && (
          <ul
            role="alert"
            className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {quality.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        )}
        {quality?.ok && <p className="text-sm font-medium text-stellar-green">Photo quality OK</p>}

        <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" aria-hidden />
            {location
              ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${
                  location.accuracyMeters !== null
                    ? ` (±${Math.round(location.accuracyMeters)} m)`
                    : ''
                }`
              : (locationError ?? 'GPS is captured when you take the photo')}
          </span>
          <button type="button" onClick={() => void locate()} aria-label="Refresh GPS location">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <label className="block space-y-1 text-sm font-semibold">
          Health score (0-100, optional)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className={inputClass}
            value={healthScore}
            onChange={(e) => setHealthScore(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm font-semibold">
          Notes
          <textarea
            className={inputClass}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={!canSave}
          className="w-full rounded-xl bg-stellar-green px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          Save update
        </button>
      </form>

      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}

      <section aria-labelledby="queue-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="queue-heading" className="font-bold">
            Waiting to sync ({queue.length})
          </h2>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing || !online || queue.length === 0}
            className="inline-flex items-center gap-1 text-sm font-semibold text-stellar-blue disabled:opacity-50"
          >
            <CloudUpload className="h-4 w-4" aria-hidden /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {queue.map((c) => (
            <li key={c.clientId} className="rounded-lg border p-3">
              <p className="font-semibold">{c.treeId}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(c.capturedAt).toLocaleString()}
                {c.attempts >= MAX_ATTEMPTS ? ' · needs attention' : ''}
                {c.lastError ? ` · ${c.lastError}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
