/**
 * Toast utility for user feedback
 * Provides simple toast notifications without external dependencies
 */

export type ToastType = 'success' | 'error' | 'info';

const DEFAULT_TOAST_DURATION = 5000;
const MIN_TOAST_DURATION = 2000;
const MAX_TOAST_DURATION = 10000;

export function normalizeToastDuration(duration?: number): number {
  if (duration === undefined || Number.isNaN(duration)) {
    return DEFAULT_TOAST_DURATION;
  }

  if (duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(duration, MIN_TOAST_DURATION), MAX_TOAST_DURATION);
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const toastCallbacks = new Set<(_toast: Toast) => void>();

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = DEFAULT_TOAST_DURATION
): string {
  const normalizedDuration = normalizeToastDuration(duration);
  const id = Math.random().toString(36).substring(7);
  const toast: Toast = { id, message, type, duration: normalizedDuration };

  toastCallbacks.forEach((callback) => callback(toast));

  if (typeof window !== 'undefined' && normalizedDuration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, normalizedDuration);
  }

  return id;
}

export function dismissToast(_id: string): void {
  // Handled by toast consumers
}

export function subscribeToToasts(callback: (_toast: Toast) => void): () => void {
  toastCallbacks.add(callback);
  return () => toastCallbacks.delete(callback);
}
