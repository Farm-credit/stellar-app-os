'use client';

import { useRef, useCallback } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { FormField } from '@/components/molecules/FormField';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/atoms/Textarea';
import { Spinner } from '@/components/atoms/Spinner';
import { cn } from '@/lib/utils';
import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';
import { Upload, X, ImageIcon, CheckCircle2 } from 'lucide-react';

interface ProfileStepProps {
  form: UseFormReturn<PlanterRegistrationFormData>;
  photoPreviewUrl: string | null;
  isUploadingPhoto: boolean;
  photoUploadError: string | null;
  onUploadPhoto: (file: File) => Promise<void>;
  onClearPhoto: () => void;
}

/**
 * Step 2 — Profile
 *
 * Collects: display name, bio, and optional profile photo.
 * Profile photo is uploaded to IPFS server-side; the returned CID is
 * stored in the form state. All rendered data is escaped by React JSX.
 */
export function ProfileStep({
  form,
  photoPreviewUrl,
  isUploadingPhoto,
  photoUploadError,
  onUploadPhoto,
  onClearPhoto,
}: ProfileStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await onUploadPhoto(file);
      // Reset input so the same file can be re-selected after clearing
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onUploadPhoto]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) await onUploadPhoto(file);
    },
    [onUploadPhoto]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const photoIpfsCid = form.watch('profilePhotoIpfsCid');
  const bioValue = form.watch('bio') ?? '';

  return (
    <div className="space-y-6">
      {/* ── Display Name ─────────────────────────────────────────────── */}
      <Controller
        control={form.control}
        name="displayName"
        render={({ field, fieldState }) => (
          <FormField
            {...field}
            id="planter-display-name"
            label="Display Name"
            placeholder="e.g. Amara Diallo"
            errorMessage={fieldState.error?.message}
            helperText="This is the name shown to donors and project managers (2–60 characters)"
            autoComplete="name"
            inputSize="lg"
          />
        )}
      />

      {/* ── Bio ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="planter-bio">
          Bio <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Controller
          control={form.control}
          name="bio"
          render={({ field, fieldState }) => (
            <>
              <Textarea
                {...field}
                id="planter-bio"
                placeholder="Tell donors and project owners a little about yourself — your experience, your region, what motivates you…"
                rows={4}
                maxLength={500}
                className={cn(
                  fieldState.error && 'border-destructive focus-visible:ring-destructive'
                )}
                aria-describedby="planter-bio-count planter-bio-error"
              />
              <div className="flex justify-between items-center">
                {fieldState.error ? (
                  <p id="planter-bio-error" className="text-xs text-destructive" role="alert">
                    {fieldState.error.message}
                  </p>
                ) : (
                  <span />
                )}
                <p
                  id="planter-bio-count"
                  className="text-xs text-muted-foreground tabular-nums"
                  aria-live="polite"
                >
                  {bioValue.length}/500
                </p>
              </div>
            </>
          )}
        />
      </div>

      {/* ── Profile Photo ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="planter-photo-upload">
          Profile Photo{' '}
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>

        {photoPreviewUrl ? (
          /* Photo preview with clear button */
          <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-2 border-stellar-blue/40 shadow-md group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreviewUrl}
              alt="Profile photo preview"
              className="w-full h-full object-cover"
            />
            {isUploadingPhoto && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Spinner size="sm" className="text-white" />
              </div>
            )}
            {!isUploadingPhoto && photoIpfsCid && (
              <div className="absolute bottom-1 right-1 bg-stellar-green rounded-full p-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <button
              type="button"
              onClick={onClearPhoto}
              disabled={isUploadingPhoto}
              aria-label="Remove profile photo"
              className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        ) : (
          /* Drop zone */
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload profile photo — click or drag and drop"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-colors select-none',
              'border-border hover:border-stellar-blue/50 hover:bg-stellar-blue/5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue'
            )}
          >
            <div className="rounded-full bg-muted p-3">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Upload className="h-4 w-4" />
                Click or drag & drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">JPEG, PNG or WebP · max 5 MB</p>
            </div>
          </div>
        )}

        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          id="planter-photo-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleFileChange}
          aria-hidden="true"
        />

        {photoUploadError && (
          <p className="text-xs text-destructive" role="alert">
            {photoUploadError}
          </p>
        )}
        {!isUploadingPhoto && photoIpfsCid && (
          <p className="text-xs text-stellar-green flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Photo pinned to IPFS successfully
          </p>
        )}
      </div>
    </div>
  );
}
