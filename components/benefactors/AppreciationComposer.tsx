'use client';

import { useState, type FormEvent } from 'react';
import { HeartHandshake, Loader2, LockKeyhole, Send } from 'lucide-react';

interface AppreciationComposerProps {
  benefactorId: string;
  stewardId: string;
  milestoneId: string;
  /** Shared secret established by the recipient's wallet/session. */
  sharedSecret: string;
  onSent?: () => void;
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function encryptNote(note: string, secret: string) {
  const encoded = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(note)
  );
  return {
    version: 1 as const,
    algorithm: 'AES-GCM' as const,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    keyFingerprint: toBase64(digest).slice(0, 16),
  };
}

export function AppreciationComposer({
  benefactorId,
  stewardId,
  milestoneId,
  sharedSecret,
  onSent,
}: AppreciationComposerProps) {
  const [note, setNote] = useState('');
  const [tipAmount, setTipAmount] = useState('0');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!sharedSecret) {
      setFeedback('A recipient session key is required before sending an encrypted note.');
      return;
    }
    if (!note.trim() || note.length > 500) {
      setFeedback('Write a note between 1 and 500 characters.');
      return;
    }
    if (!/^\d+(\.\d{1,7})?$/.test(tipAmount) || Number(tipAmount) < 0) {
      setFeedback('Enter a valid non-negative CARBON tip.');
      return;
    }
    setBusy(true);
    try {
      const envelope = await encryptNote(note, sharedSecret);
      const response = await fetch('/api/benefactors/appreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benefactorId,
          stewardId,
          milestoneId,
          envelope,
          tipAmount,
          tipAsset: 'CARBON',
        }),
      });
      const result = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !result.success)
        throw new Error(result.error ?? 'Unable to send appreciation.');
      setNote('');
      setTipAmount('0');
      setFeedback(
        'Encrypted appreciation sent. The tip will be attached to the verified milestone.'
      );
      onSent?.();
    } catch (error) {
      console.warn('[AppreciationComposer] Unable to send appreciation:', error);
      setFeedback(
        error instanceof Error ? error.message : 'Unable to send appreciation right now.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <div className="flex items-start gap-3">
        <HeartHandshake className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden="true" />
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Thank this steward</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Your note is encrypted in the browser before it is stored.
          </p>
        </div>
      </div>
      <label
        className="mt-4 block text-sm font-medium text-slate-800 dark:text-slate-200"
        htmlFor="appreciation-note"
      >
        Appreciation note
      </label>
      <textarea
        id="appreciation-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={4}
        placeholder="Thank you for restoring this place…"
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
            htmlFor="appreciation-tip"
          >
            Bonus tip (CARBON)
          </label>
          <input
            id="appreciation-tip"
            inputMode="decimal"
            value={tipAmount}
            onChange={(event) => setTipAmount(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {busy ? 'Encrypting…' : 'Send thanks'}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> AES-GCM encrypted; only the
        recipient session can decrypt it.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={feedback ? 'mt-3 text-sm text-emerald-800 dark:text-emerald-200' : 'sr-only'}
      >
        {feedback ?? ''}
      </p>
    </form>
  );
}
