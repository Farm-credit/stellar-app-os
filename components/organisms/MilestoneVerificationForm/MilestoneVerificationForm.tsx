'use client';

import { useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { DuplicatePhotoAlert } from '@/components/molecules/DuplicatePhotoAlert/DuplicatePhotoAlert';
import { MapPin, Camera, CheckCircle, AlertCircle, Loader2, Fingerprint } from 'lucide-react';
import type { GpsCoordinates, MilestoneReleaseResponse } from '@/lib/types/escrow';
import {
  CLIENT_DEFAULT_DUPLICATE_THRESHOLD,
  recordLocalPhotoHash,
  runClientDuplicatePrecheck,
  warnDuplicatePhotoDetected,
  type DuplicateFlagDetails,
} from '@/lib/image/client-phash';
import type { PHashHex } from '@/lib/image/dct-core';

export interface MilestoneVerificationFormProps {
  loanId: string;
  farmerWalletAddress: string;
  escrowSecretKey: string;
  totalAmountUsdc: number;
  network: 'testnet' | 'mainnet';
  onSuccess?: (result: MilestoneReleaseResponse) => void;
  onError?: (error: string) => void;
  /** Optional custom image decoder seam for deterministic headless testing. */
  decodeToGrayscale?: (file: Blob) => Promise<Float64Array>;
}

type FormStatus = 'idle' | 'locating' | 'checking-hash' | 'submitting' | 'success' | 'error';

interface EscrowReleaseApiPayload extends MilestoneReleaseResponse {
  error?: string;
  code?: string;
  hash?: string;
  photoHash?: string;
  distance?: number;
  similarity?: number;
  threshold?: number;
  duplicateOf?: number;
}

export function MilestoneVerificationForm({
  loanId,
  farmerWalletAddress,
  escrowSecretKey,
  totalAmountUsdc,
  network,
  onSuccess,
  onError,
  decodeToGrayscale,
}: MilestoneVerificationFormProps) {
  const [gps, setGps] = useState<GpsCoordinates | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
  const [photoHash, setPhotoHash] = useState<PHashHex | null>(null);
  const [duplicateFlag, setDuplicateFlag] = useState<DuplicateFlagDetails | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MilestoneReleaseResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const releaseAmount = (totalAmountUsdc * 0.75).toFixed(2);

  function handleCaptureGps() {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setStatus('locating');
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus('idle');
      },
      () => {
        setErrorMsg('Unable to retrieve GPS location. Please allow location access.');
        setStatus('idle');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function clearSelectedPhoto() {
    setPhotoBase64(null);
    setPhotoHash(null);
    setDuplicateFlag(null);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setDuplicateFlag(null);
    setPhotoHash(null);
    setErrorMsg(null);
    setStatus('checking-hash');

    const base64Promise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const parts = dataUrl.split(',');
        resolve(parts[1] ?? '');
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read photo file'));
      reader.readAsDataURL(file);
    });

    const [encodedOutcome, precheckOutcome] = await Promise.allSettled([
      base64Promise,
      runClientDuplicatePrecheck(file, {
        entityType: 'tree',
        entityId: loanId,
        decodeToGrayscale,
      }),
    ]);

    if (encodedOutcome.status === 'fulfilled') {
      setPhotoBase64(encodedOutcome.value);
      setPhotoMimeType(file.type);
    }

    if (precheckOutcome.status === 'fulfilled') {
      const precheck = precheckOutcome.value;
      if (precheck.hash) {
        setPhotoHash(precheck.hash.hex);
      }
      if (precheck.isDuplicate && precheck.flag) {
        setDuplicateFlag(precheck.flag);
        setStatus('error');
        onError?.('Duplicate or reused field photo detected.');
        return;
      }
    }

    setStatus('idle');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gps || !photoBase64 || duplicateFlag) return;

    setStatus('submitting');
    setErrorMsg(null);

    try {
      const response = await fetch('/api/escrow/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId,
          farmerWalletAddress,
          escrowSecretKey,
          network,
          totalAmountUsdc,
          verification: {
            gpsCoordinates: gps,
            photoBase64,
            photoMimeType,
            submittedAt: new Date().toISOString(),
            notes: notes.trim() || undefined,
          },
        }),
      });

      const data = (await response.json()) as EscrowReleaseApiPayload;

      if (!response.ok) {
        if (
          response.status === 422 &&
          (data.code === 'DUPLICATE_PHOTO' ||
            (typeof data.error === 'string' && /duplicate/i.test(data.error)))
        ) {
          const resolvedHash = (data.hash ?? photoHash ?? '0000000000000000') as PHashHex;
          const distance = data.distance ?? 0;
          const threshold = data.threshold ?? CLIENT_DEFAULT_DUPLICATE_THRESHOLD;
          const serverFlag: DuplicateFlagDetails = {
            hash: resolvedHash,
            distance,
            threshold,
            similarityScore:
              typeof data.similarity === 'number'
                ? data.similarity
                : Math.max(0, Math.min(1, 1 - distance / 64)),
            source: 'upload-response',
            duplicateId: data.duplicateOf,
          };
          warnDuplicatePhotoDetected(serverFlag, 'milestone-escrow-release');
          setDuplicateFlag(serverFlag);
          setStatus('error');
          onError?.(data.error ?? 'Duplicate field verification photo detected.');
          return;
        }
        throw new Error(data.error ?? 'Release failed');
      }

      const finalHash = data.photoHash ?? photoHash ?? undefined;
      if (finalHash && /^[0-9a-f]{16}$/i.test(finalHash)) {
        recordLocalPhotoHash({
          hash: finalHash.toLowerCase(),
          entityType: 'tree',
          entityId: loanId,
          storageRef: `escrow:${data.transactionHash}`,
        });
      }

      setResult(data);
      setStatus('success');
      onSuccess?.(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      setErrorMsg(msg);
      setStatus('error');
      onError?.(msg);
    }
  }

  if (status === 'success' && result) {
    return (
      <div className="space-y-4 rounded-2xl border border-stellar-green/30 bg-stellar-green/5 p-8 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-stellar-green" aria-hidden="true" />
        <Text variant="h3" as="h2">
          Funds Released!
        </Text>
        <Text variant="muted">
          <strong className="text-stellar-green">
            {result.releasedAmountUsdc.toFixed(2)} USDC
          </strong>{' '}
          sent to your wallet.
        </Text>
        <a
          href={result.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-stellar-blue underline underline-offset-2"
        >
          View on Stellar Explorer ↗
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-label="Milestone verification form">
      <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <Text variant="h4" as="h2">
          Milestone 1 Verification
        </Text>
        <Text variant="muted" className="text-sm">
          Submit GPS location and an original field photo to release{' '}
          <strong>{releaseAmount} USDC</strong> (75% of escrow).
        </Text>
      </div>

      {/* GPS */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
          <Text className="font-semibold">GPS Location</Text>
          {gps && <CheckCircle className="ml-auto h-4 w-4 text-stellar-green" aria-hidden="true" />}
        </div>

        {gps ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Lat: {gps.latitude.toFixed(6)}</p>
            <p>Lng: {gps.longitude.toFixed(6)}</p>
            {gps.accuracy && <p>Accuracy: ±{Math.round(gps.accuracy)}m</p>}
          </div>
        ) : (
          <Text variant="muted" className="text-sm">
            No location captured yet.
          </Text>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCaptureGps}
          disabled={status === 'locating' || status === 'submitting'}
          aria-label="Capture current GPS location"
        >
          {status === 'locating' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Locating…
            </>
          ) : gps ? (
            'Re-capture Location'
          ) : (
            'Capture GPS Location'
          )}
        </Button>
      </div>

      {/* Photo */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
          <Text className="font-semibold">Field Photo</Text>
          {photoBase64 && !duplicateFlag && (
            <CheckCircle className="ml-auto h-4 w-4 text-stellar-green" aria-hidden="true" />
          )}
        </div>

        {photoBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${photoMimeType};base64,${photoBase64}`}
            alt="Uploaded field photo preview"
            className="h-40 w-full rounded-lg object-cover"
          />
        )}

        {duplicateFlag && (
          <DuplicatePhotoAlert
            flag={duplicateFlag}
            onReplacePhoto={() => {
              clearSelectedPhoto();
              fileInputRef.current?.click();
            }}
          />
        )}

        {photoHash && !duplicateFlag && status !== 'checking-hash' && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stellar-green/30 bg-stellar-green/5 px-3 py-2"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Fingerprint className="h-3.5 w-3.5 text-stellar-green" aria-hidden="true" />
              pHash originality verified
            </span>
            <Badge variant="success" className="font-mono text-[11px]">
              {photoHash}
            </Badge>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void handlePhotoChange(e)}
          className="sr-only"
          id="photo-upload"
          aria-label="Upload field photo"
          disabled={status === 'submitting'}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={status === 'submitting'}
          aria-label="Choose photo to upload"
        >
          {photoBase64 ? 'Change Photo' : 'Upload Photo'}
        </Button>
      </div>

      {/* Notes (optional) */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <label htmlFor="notes" className="block text-sm font-medium text-foreground">
          Notes <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Describe the current state of the farm…"
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          disabled={status === 'submitting'}
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={
          !gps ||
          !photoBase64 ||
          Boolean(duplicateFlag) ||
          status === 'submitting' ||
          status === 'locating' ||
          status === 'checking-hash'
        }
        className="w-full bg-stellar-green hover:bg-stellar-green/90 disabled:cursor-not-allowed disabled:opacity-50"
        size="lg"
        aria-label="Submit verification and release funds"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Releasing Funds…
          </>
        ) : (
          `Submit & Release ${releaseAmount} USDC`
        )}
      </Button>
    </form>
  );
}

MilestoneVerificationForm.displayName = 'MilestoneVerificationForm';
