'use client';

import { Controller } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Label } from '@/components/ui/label';
import { OPERATING_REGIONS } from '@/lib/types/planter';
import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';
import { Wallet, User, MapPin, ImageIcon, CheckCircle2 } from 'lucide-react';

interface ReviewStepProps {
  form: UseFormReturn<PlanterRegistrationFormData>;
  photoPreviewUrl: string | null;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}

/**
 * Step 4 — Review & Submit
 *
 * Renders a read-only summary of all form values, a terms checkbox,
 * and the final submit button.
 *
 * Security: public key is truncated in the UI summary to avoid
 * accidentally exposing the full key in screenshots / support flows.
 */
export function ReviewStep({
  form,
  photoPreviewUrl,
  isSubmitting,
  submitError,
  onSubmit,
}: ReviewStepProps) {
  const values = form.watch();
  const truncatedKey = values.walletPublicKey
    ? `${values.walletPublicKey.slice(0, 6)}…${values.walletPublicKey.slice(-6)}`
    : '—';

  const selectedRegionLabels = (values.regions ?? [])
    .map((id) => OPERATING_REGIONS.find((r) => r.id === id)?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      {/* ── Summary card ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-muted/30 divide-y divide-border overflow-hidden">
        {/* Wallet */}
        <SummaryRow
          icon={<Wallet className="h-4 w-4" />}
          label="Wallet"
          value={
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-md">
              {truncatedKey}
            </span>
          }
        />

        {/* Profile photo + name */}
        <SummaryRow
          icon={<User className="h-4 w-4" />}
          label="Display Name"
          value={
            <span className="flex items-center gap-3">
              {photoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreviewUrl}
                  alt="Profile photo thumbnail"
                  className="h-8 w-8 rounded-full object-cover border border-border"
                />
              ) : (
                <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
              <span className="font-medium">{values.displayName || '—'}</span>
            </span>
          }
        />

        {/* Bio */}
        {values.bio && (
          <div className="px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bio
            </p>
            <p className="text-sm leading-relaxed">{values.bio}</p>
          </div>
        )}

        {/* Regions */}
        <SummaryRow
          icon={<MapPin className="h-4 w-4" />}
          label="Operating Regions"
          value={<span className="text-sm">{selectedRegionLabels || '—'}</span>}
        />
      </div>

      {/* ── Info callout ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-stellar-blue/10 border border-stellar-blue/30 px-4 py-3 flex gap-3">
        <CheckCircle2 className="h-5 w-5 text-stellar-blue shrink-0 mt-0.5" />
        <p className="text-sm text-stellar-blue/90">
          Your registration will be reviewed by our team. You&apos;ll be notified once your profile
          is approved and you can start accepting planting assignments.
        </p>
      </div>

      {/* ── Terms checkbox ─────────────────────────────────────────────── */}
      <Controller
        control={form.control}
        name="termsAccepted"
        render={({ field, fieldState }) => (
          <div className="space-y-1">
            <div className="flex items-start gap-3">
              <Checkbox
                id="planter-terms"
                checked={field.value === true}
                onChange={(e) => field.onChange(e.target.checked ? true : undefined)}
                aria-describedby={fieldState.error ? 'planter-terms-error' : undefined}
                aria-invalid={!!fieldState.error}
                className="mt-0.5"
              />
              <Label htmlFor="planter-terms" className="leading-relaxed cursor-pointer">
                I agree to the{' '}
                <a
                  href="/terms-of-service"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stellar-blue hover:underline"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stellar-blue hover:underline"
                >
                  Privacy Policy
                </a>
                , and confirm that the information I have provided is accurate.
              </Label>
            </div>
            {fieldState.error && (
              <p id="planter-terms-error" className="text-xs text-destructive pl-7" role="alert">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />

      {/* ── Submit error ──────────────────────────────────────────────── */}
      {submitError && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      )}

      {/* ── Submit button ─────────────────────────────────────────────── */}
      <Button
        className="w-full"
        stellar="accent"
        size="lg"
        onClick={onSubmit}
        disabled={isSubmitting}
        id="planter-register-submit"
        aria-label="Submit planter registration"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" />
            Submitting…
          </span>
        ) : (
          'Submit Registration'
        )}
      </Button>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28 shrink-0">
        {label}
      </span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}
