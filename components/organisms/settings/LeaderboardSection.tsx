'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { useWalletContext } from '@/contexts/WalletContext';
import { authenticateFreighter } from '@/lib/auth/authenticateFreighter';
import { DEFAULT_LEADERBOARD_PREFERENCES } from '@/lib/leaderboard/treeSponsorsSchema';
import type { LeaderboardPreferences } from '@/lib/leaderboard/treeSponsorsSchema';

export function LeaderboardSection() {
  const { wallet } = useWalletContext();
  if (!wallet?.publicKey)
    return <p>Connect your wallet to manage leaderboard privacy. You are hidden by default.</p>;
  if (wallet.type !== 'freighter')
    return (
      <p>
        Use Freighter with this wallet address to verify ownership and manage leaderboard privacy.
        Your existing choice is unchanged.
      </p>
    );
  return <LeaderboardForm key={wallet.publicKey} walletAddress={wallet.publicKey} />;
}

function LeaderboardForm({ walletAddress }: { walletAddress: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<LeaderboardPreferences>({
    ...DEFAULT_LEADERBOARD_PREFERENCES,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const authenticate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await authenticateFreighter(walletAddress);
      const response = await fetch('/api/leaderboard/preferences', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load your saved preferences. Please try again.');
      setPreferences((await response.json()) as LeaderboardPreferences);
      setToken(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet authentication failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const save = async () => {
    if (inFlight.current || !token) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/leaderboard/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(preferences),
      });
      if (response.status === 401) {
        setToken(null);
        throw new Error('Your session expired. Verify your wallet again.');
      }
      if (!response.ok) throw new Error('Your choice was not saved. Please try again.');
      setPreferences((await response.json()) as LeaderboardPreferences);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your choice.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-label="Leaderboard privacy">
      <h2 className="text-xl font-semibold">Public leaderboard</h2>
      <p className="text-sm text-muted-foreground">
        Participation is optional and off by default. When you opt in, your display name and tree
        totals are public. Opting out removes you from both monthly and all-time rankings on their
        next refresh (within 5 seconds).
      </p>
      {!token ? (
        <Button disabled={busy} onClick={() => void authenticate()}>
          {busy ? 'Verifying...' : 'Verify wallet to manage privacy'}
        </Button>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences.optedIn}
                onChange={(event) => {
                  setPreferences({ ...preferences, optedIn: event.target.checked });
                  setSaved(false);
                }}
                className="h-5 w-5 accent-stellar-green"
              />
              Show me on the public leaderboard
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Public display name</span>
              <input
                className="block w-full rounded-md border bg-background px-3 py-2"
                maxLength={80}
                required={preferences.optedIn}
                value={preferences.displayName}
                onChange={(event) => {
                  setPreferences({ ...preferences, displayName: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Sponsor category</span>
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
                value={preferences.sponsorType}
                onChange={(event) => {
                  setPreferences({
                    ...preferences,
                    sponsorType: event.target.value as LeaderboardPreferences['sponsorType'],
                  });
                  setSaved(false);
                }}
              >
                <option value="individual">Individual</option>
                <option value="corporate">Corporate / organisation</option>
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Categories are self-declared. This setting is separate from homepage donor
              recognition.
            </p>
            <Button
              type="submit"
              disabled={busy || (preferences.optedIn && !preferences.displayName.trim())}
            >
              {busy ? 'Saving...' : 'Save leaderboard preferences'}
            </Button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status">
          Saved.{' '}
          {preferences.optedIn
            ? 'You can appear once you have sponsored trees.'
            : 'You are hidden from the leaderboard.'}
        </p>
      )}
      <Link href="/leaderboard/tree-sponsors" className="block text-sm text-stellar-blue underline">
        View tree sponsorship leaderboard
      </Link>
    </section>
  );
}
