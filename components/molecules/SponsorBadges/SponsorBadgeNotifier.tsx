'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { useWalletContext } from '@/contexts/WalletContext';

interface BadgeResponse {
  success: boolean;
  badges: Array<{
    id: string;
    name: string;
    description: string;
    earned: boolean;
    shareText: string | null;
    imageUrl: string | null;
  }>;
}

const storageKey = (address: string) => `sponsor-badges-seen:${address}`;

function readSeen(address: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(address));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(address: string, seen: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(address), JSON.stringify([...seen]));
  } catch {
    // Storage can be unavailable; the badge is simply announced again next time.
  }
}

/**
 * Announces newly earned badges to the connected sponsor with an in-app
 * notification (and a toast) that links to the shareable image. Renders nothing.
 */
export function SponsorBadgeNotifier(): null {
  const { wallet } = useWalletContext();
  const { addNotification, addToast } = useNotification();
  const checkedFor = useRef<string | null>(null);
  const address = wallet?.isConnected ? wallet.publicKey : null;

  useEffect(() => {
    if (!address || checkedFor.current === address) return;
    checkedFor.current = address;
    let cancelled = false;

    async function announce(sponsor: string) {
      try {
        const response = await fetch(`/api/sponsors/${encodeURIComponent(sponsor)}/badges`);
        if (!response.ok) return;
        const data = (await response.json()) as BadgeResponse;
        if (cancelled || !data.success) return;

        const seen = readSeen(sponsor);
        const fresh = data.badges.filter((badge) => badge.earned && !seen.has(badge.id));
        if (fresh.length === 0) return;

        for (const badge of fresh) {
          const imageUrl = badge.imageUrl;
          addNotification({
            title: `New badge: ${badge.name}`,
            description: badge.description,
            type: 'success',
            priority: 'medium',
            metadata: { badgeId: badge.id, imageUrl, shareText: badge.shareText },
            action: imageUrl
              ? { label: 'Share image', onClick: () => window.open(imageUrl, '_blank') }
              : undefined,
          });
          seen.add(badge.id);
        }
        addToast({
          type: 'success',
          title:
            fresh.length === 1 ? `Badge earned: ${fresh[0].name}` : `${fresh.length} new badges`,
          description: 'Open your notifications to share it.',
        });
        writeSeen(sponsor, seen);
      } catch {
        // Badge announcements are best-effort.
      }
    }

    void announce(address);
    return () => {
      cancelled = true;
      checkedFor.current = null;
    };
  }, [address, addNotification, addToast]);

  return null;
}
