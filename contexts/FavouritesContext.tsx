'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';

const GUEST_KEY = 'favorites_guest';

function getFavoritesKey(publicKey?: string) {
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

function saveFavorites(key: string, favorites: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(favorites));
}

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (projectId: string) => void;
  undoRemove: () => void;
  clearUndo: () => void;
  undoTarget: string | null;
  isFavorited: (id: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { wallet } = useWallet();
  const publicKey = wallet?.publicKey;
  const [mounted, setMounted] = useState(false);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [undoTarget, setUndoTarget] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const key = getFavoritesKey(publicKey);
    setFavorites(loadFavorites(key));
  }, [publicKey]);

  useEffect(() => {
    const key = getFavoritesKey(publicKey);
    setFavorites(loadFavorites(key));
  }, [publicKey]);

  //   const toggleFavorite = useCallback(
  //     (projectId: string) => {
  //       const key = getFavoritesKey(publicKey);
  //       const isRemoving = favorites.includes(projectId);
  //       const updated = isRemoving
  //         ? favorites.filter((id) => id !== projectId)
  //         : [...favorites, projectId];

  //       setFavorites(updated);
  //       saveFavorites(key, updated);

  //       if (isRemoving) setUndoTarget(projectId);
  //     },
  //     [favorites, publicKey]
  //   );

  const toggleFavorite = useCallback(
    (projectId: string) => {
      const key = getFavoritesKey(publicKey);

      setFavorites((prev) => {
        // use prev instead of favorites directly
        const isRemoving = prev.includes(projectId);
        const updated = isRemoving ? prev.filter((id) => id !== projectId) : [...prev, projectId];

        saveFavorites(key, updated);

        if (isRemoving) setUndoTarget(projectId);

        return updated;
      });
    },
    [publicKey] // remove favorites from deps entirely
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

  return (
    <FavoritesContext.Provider
      value={{
        // favorites,
        favorites: mounted ? favorites : [],
        toggleFavorite,
        undoRemove,
        clearUndo,
        undoTarget,
        isFavorited: (id) => favorites.includes(id),
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within a FavoritesProvider');
  return context;
}
