'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsCard } from '@/components/molecules/SettingsCard';
import { useWalletContext } from '@/contexts/WalletContext';
import { recognitionSettingsSchema } from '@/lib/donor-wall/schema';
import type { RecognitionSettings } from '@/lib/donor-wall/service';

export function RecognitionSection() {
  const { wallet } = useWalletContext();
  const publicKey = wallet?.publicKey ?? null;

  const [optIn, setOptIn] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sponsor-recognition?wallet=${encodeURIComponent(publicKey)}`)
      .then((res) => (res.ok ? (res.json() as Promise<RecognitionSettings>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setOptIn(data.recognitionOptIn);
        setDisplayName(data.displayName);
        setLogoUrl(data.logoUrl);
      })
      .catch(() => setError('Could not load your recognition settings.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!publicKey) return;
    setError(null);

    const parsed = recognitionSettingsSchema.safeParse({
      recognitionOptIn: optIn,
      displayName,
      logoUrl,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid settings');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/sponsor-recognition', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey, ...parsed.data }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save your settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!publicKey) {
    return (
      <SettingsCard
        title="Donor recognition"
        description="Connect your wallet to manage how your sponsorship is recognised."
      >
        <p className="text-sm text-muted-foreground">No wallet connected.</p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Donor recognition"
      description="Choose whether your name and logo appear on the homepage donor recognition wall."
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="recognition-opt-in">Show me on the donor recognition wall</Label>
          <Switch
            id="recognition-opt-in"
            checked={optIn}
            onCheckedChange={setOptIn}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recognition-name">Display name</Label>
          <Input
            id="recognition-name"
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recognition-logo">Logo URL (optional)</Label>
          <Input
            id="recognition-logo"
            type="url"
            placeholder="https://"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-stellar-green">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          <Button type="submit" disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
