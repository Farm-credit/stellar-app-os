import { useCallback, useEffect, useState } from 'react';
import { useWallet } from './useWallet';

const GUEST_KEY = 'favorites_guest';

function getFavoritesKey(publicKey?: string): string {
  return publicKey ? `favorites_${publicKey}` : GUEST_KEY;
}

function loadFavorites(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFavorites(key: string, favorites: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(favorites));
}

export function useFavorites() {
  const { wallet } = useWallet();
  const publicKey = wallet?.publicKey;

  const [favorites, setFavorites] = useState<string[]>(() =>
    loadFavorites(getFavoritesKey(publicKey))
  );

  const [undoTarget, setUndoTarget] = useState<string | null>(null);

  // When wallet connects/disconnects, reload favorites for that identity
  useEffect(() => {
    const key = getFavoritesKey(publicKey);
    setFavorites(loadFavorites(key));
  }, [publicKey]);

  const toggleFavorite = useCallback(
    (projectId: string) => {
      const key = getFavoritesKey(publicKey);
      const isRemoving = favorites.includes(projectId);

      // Optimistic update
      const updated = isRemoving
        ? favorites.filter((id) => id !== projectId)
        : [...favorites, projectId];

      setFavorites(updated);
      saveFavorites(key, updated);

      if (isRemoving) {
        setUndoTarget(projectId);
      }
    },
    [favorites, publicKey]
  );

  const undoRemove = useCallback(() => {
    if (!undoTarget) return;
    const key = getFavoritesKey(publicKey);
    const restored = [...favorites, undoTarget];
    setFavorites(restored);
    saveFavorites(key, restored);
    setUndoTarget(null);
  }, [undoTarget, favorites, publicKey]);

  const clearUndo = useCallback(() => setUndoTarget(null), []);

  return {
    favorites,
    toggleFavorite,
    undoTarget,
    undoRemove,
    clearUndo,
    isFavorited: (id: string) => favorites.includes(id),
  };
}
