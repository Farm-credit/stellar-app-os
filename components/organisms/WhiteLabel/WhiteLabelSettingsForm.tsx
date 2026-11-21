'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import type { WhiteLabelConfig, WhiteLabelFees } from '@/lib/whiteLabel';
import { MAX_TOTAL_MARGIN_PERCENT, validateFees } from '@/lib/whiteLabel';

/**
 * Partner-admin form to configure the platform fee and partner margin, and the
 * brand palette, persisted through PATCH /api/partners/:id/config. (#1713)
 */
export function WhiteLabelSettingsForm({ config }: { config: WhiteLabelConfig }) {
  const router = useRouter();
  const [fees, setFees] = React.useState<WhiteLabelFees>(config.fees);
  const [colors, setColors] = React.useState({
    primaryColor: config.branding.primaryColor,
    accentColor: config.branding.accentColor,
    backgroundColor: config.branding.backgroundColor,
  });
  const [domain, setDomain] = React.useState(config.branding.customDomain);
  const [saving, setSaving] = React.useState(false);

  const feeErrors = validateFees(fees);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/partners/${config.partnerId}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding: { ...colors, customDomain: domain }, fees }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to save white-label settings');
        return;
      }
      toast.success('White-label settings saved');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-6 rounded-xl border border-border bg-card p-6"
      data-testid="wl-settings"
    >
      <div>
        <h3 className="font-semibold">Fees & margin</h3>
        <p className="text-sm text-muted-foreground">
          Platform fee plus your margin cannot exceed {MAX_TOTAL_MARGIN_PERCENT}% of each
          sponsorship.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Platform fee (%)</span>
            <Input
              type="number"
              min={0}
              max={MAX_TOTAL_MARGIN_PERCENT}
              step={0.5}
              value={fees.platformFeePercent}
              onChange={(e) =>
                setFees((prev) => ({ ...prev, platformFeePercent: Number(e.target.value) }))
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Partner margin (%)</span>
            <Input
              type="number"
              min={0}
              max={MAX_TOTAL_MARGIN_PERCENT}
              step={0.5}
              value={fees.partnerMarginPercent}
              onChange={(e) =>
                setFees((prev) => ({ ...prev, partnerMarginPercent: Number(e.target.value) }))
              }
            />
          </label>
        </div>
        {feeErrors.length > 0 && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {feeErrors.join(' • ')}
          </p>
        )}
      </div>

      <div>
        <h3 className="font-semibold">Brand palette & domain</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Primary</span>
            <Input
              type="color"
              value={colors.primaryColor}
              onChange={(e) => setColors((prev) => ({ ...prev, primaryColor: e.target.value }))}
              className="w-20 p-0.5"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Accent</span>
            <Input
              type="color"
              value={colors.accentColor}
              onChange={(e) => setColors((prev) => ({ ...prev, accentColor: e.target.value }))}
              className="w-20 p-0.5"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Background</span>
            <Input
              type="color"
              value={colors.backgroundColor}
              onChange={(e) => setColors((prev) => ({ ...prev, backgroundColor: e.target.value }))}
              className="w-20 p-0.5"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Custom domain</span>
            <Input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="trees.yourorg.org"
            />
          </label>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || feeErrors.length > 0}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}
