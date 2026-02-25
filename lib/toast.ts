/* eslint-disable no-unused-vars */
/**
 * Toast utility for user feedback
 * Provides simple toast notifications without external dependencies
 */

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const toastCallbacks = new Set<(_toast: Toast) => void>();

export function showToast(message: string, type: ToastType = 'info', duration = 3000): string {
  const id = Math.random().toString(36).substring(7);
  const toast: Toast = { id, message, type, duration };

  toastCallbacks.forEach((callback) => callback(toast));

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
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
