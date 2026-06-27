'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { MapPin, Camera, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { GpsCoordinates, MilestoneReleaseResponse } from '@/lib/types/escrow';

export interface MilestoneVerificationFormProps {
  loanId: string;
  farmerWalletAddress: string;
  escrowSecretKey: string;
  totalAmountUsdc: number;
  network: 'testnet' | 'mainnet';
  onSuccess?: (result: MilestoneReleaseResponse) => void;
  onError?: (error: string) => void;
}

type FormStatus = 'idle' | 'locating' | 'submitting' | 'success' | 'error';

export function MilestoneVerificationForm({
  loanId,
  farmerWalletAddress,
  escrowSecretKey,
  totalAmountUsdc,
  network,
  onSuccess,
  onError,
}: MilestoneVerificationFormProps) {
  const [gps, setGps] = useState<GpsCoordinates | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.split(',')[1];
      setPhotoBase64(base64);
      setPhotoMimeType(file.type);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gps || !photoBase64) return;

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

      const data = (await response.json()) as MilestoneReleaseResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Release failed');
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
      <div className="rounded-2xl border border-stellar-green/30 bg-stellar-green/5 p-8 space-y-4 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-stellar-green" aria-hidden="true" />
        <Text variant="h3" as="h2">
          Funds Released!
        </Text>
        <Text variant="muted">
          <strong className="text-stellar-green">{result.releasedAmountUsdc.toFixed(2)} USDC</strong>{' '}
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-2">
        <Text variant="h4" as="h2">
          Milestone 1 Verification
        </Text>
        <Text variant="muted" className="text-sm">
          Submit GPS location and a photo to release{' '}
          <strong>{releaseAmount} USDC</strong> (75% of escrow).
        </Text>
      </div>

      {/* GPS */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
          <Text className="font-semibold">GPS Location</Text>
          {gps && (
            <CheckCircle className="h-4 w-4 text-stellar-green ml-auto" aria-hidden="true" />
          )}
        </div>

        {gps ? (
          <div className="text-sm text-gray-600 space-y-1">
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
          <Text className="font-semibold">Field Photo</Text>
          {photoBase64 && (
            <CheckCircle className="h-4 w-4 text-stellar-green ml-auto" aria-hidden="true" />
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoChange}
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Describe the current state of the farm…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stellar-blue resize-none"
          disabled={status === 'submitting'}
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {errorMsg}
        </div>
      )}

      <Button
        type="submit"
        disabled={!gps || !photoBase64 || status === 'submitting' || status === 'locating'}
        className="w-full bg-stellar-green hover:bg-stellar-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
