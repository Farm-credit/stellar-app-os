'use client';

import { useMemo, useState, useRef, type FormEvent } from 'react';
import exifr from 'exifr';
import { StrKey } from '@stellar/stellar-sdk';
import {
  AlertCircle,
  CheckCircle2,
  Camera,
  MapPin,
  Upload,
  ClipboardList,
  ChevronDown,
  Lock,
  ShieldCheck,
  Send,
  FileImage,
  Fingerprint,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { DuplicatePhotoAlert } from '@/components/molecules/DuplicatePhotoAlert/DuplicatePhotoAlert';
import { useAnnouncer } from '@/components/ui/live-region';
import type { IpfsUploadResult } from '@/lib/ipfs/upload';
import {
  CLIENT_DEFAULT_DUPLICATE_THRESHOLD,
  recordLocalPhotoHash,
  runClientDuplicatePrecheck,
  warnDuplicatePhotoDetected,
  type DuplicateFlagDetails,
} from '@/lib/image/client-phash';
import type { PHashHex } from '@/lib/image/dct-core';

interface JobOption {
  id: string;
  projectName: string;
  location: string;
  treesTarget: number;
}

interface GpsReading {
  lat: number;
  lon: number;
  capturedAt?: Date | null;
  source?: 'exif' | 'manual';
}

type Status = 'idle' | 'reading-gps' | 'checking-hash' | 'uploading' | 'success' | 'error';

interface PlantingPhotoUploadApiResponse {
  message?: string;
  error?: string;
  code?: string;
  ipfsCid?: string;
  ipfsUrl?: string;
  gatewayUrl?: string;
  hash?: string;
  distance?: number;
  similarity?: number;
  threshold?: number;
  duplicateOf?: number;
}

const FARMER_JOBS: JobOption[] = [
  {
    id: 'na-001',
    projectName: 'Jigawa Dryland Restoration',
    location: 'Jigawa State, Nigeria',
    treesTarget: 600,
  },
  {
    id: 'na-002',
    projectName: 'Katsina Sahel Buffer',
    location: 'Katsina State, Nigeria',
    treesTarget: 350,
  },
  {
    id: 'na-003',
    projectName: 'Kano Reforestation Phase 2',
    location: 'Kano State, Nigeria',
    treesTarget: 500,
  },
];

export interface FarmerVerificationPortalProps {
  /** Optional custom image decoder seam for deterministic headless testing. */
  decodeToGrayscale?: (file: Blob) => Promise<Float64Array>;
}

export function FarmerVerificationPortal({
  decodeToGrayscale,
}: FarmerVerificationPortalProps = {}) {
  const [farmerAddress, setFarmerAddress] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoHash, setPhotoHash] = useState<PHashHex | null>(null);
  const [duplicateFlag, setDuplicateFlag] = useState<DuplicateFlagDetails | null>(null);
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [gpsSource, setGpsSource] = useState<'exif' | 'manual' | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<(IpfsUploadResult & { hash?: string }) | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const announcePolite = useAnnouncer('planting-proof-status', false);
  const announceAssertive = useAnnouncer('planting-proof-alert', true);

  const selectedJob = useMemo(
    () => FARMER_JOBS.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId]
  );

  const trimmedAddress = farmerAddress.trim();
  const isValidStellarAddress =
    trimmedAddress.length > 0 && StrKey.isValidEd25519PublicKey(trimmedAddress);
  const showAddressWarning = trimmedAddress.length > 0 && !isValidStellarAddress;

  const effectiveGps = useMemo<GpsReading | null>(() => {
    if (gps) return gps;
    const parsedLat = Number.parseFloat(manualLat);
    const parsedLon = Number.parseFloat(manualLon);
    if (
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLon) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLon >= -180 &&
      parsedLon <= 180
    ) {
      return { lat: parsedLat, lon: parsedLon, source: 'manual' };
    }
    return null;
  }, [gps, manualLat, manualLon]);

  const photoLacksCoordinates = Boolean(photo) && !gps;

  const canSubmit = useMemo(() => {
    return (
      isValidStellarAddress &&
      Boolean(selectedJob) &&
      Boolean(photo) &&
      Boolean(effectiveGps) &&
      !duplicateFlag &&
      status !== 'uploading' &&
      status !== 'checking-hash' &&
      status !== 'reading-gps'
    );
  }, [isValidStellarAddress, selectedJob, photo, effectiveGps, duplicateFlag, status]);

  async function handlePhotoChange(file: File | null) {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setPhotoHash(null);
    setDuplicateFlag(null);
    setGps(null);
    setGpsSource(null);
    setResult(null);
    setErrorMessage(null);
    setMessage(null);

    if (!file) return;

    setStatus('checking-hash');

    const [exifOutcome, precheckOutcome] = await Promise.allSettled([
      exifr.parse(file, ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate']),
      runClientDuplicatePrecheck(file, {
        entityType: 'tree',
        entityId: selectedJobId || trimmedAddress || undefined,
        decodeToGrayscale,
      }),
    ]);

    if (exifOutcome.status === 'fulfilled' && exifOutcome.value) {
      const data = exifOutcome.value as {
        latitude?: number;
        longitude?: number;
        DateTimeOriginal?: Date;
        CreateDate?: Date;
      };
      if (data.latitude != null && data.longitude != null) {
        const photoDate: Date | null = data.DateTimeOriginal ?? data.CreateDate ?? null;
        setGps({
          lat: data.latitude,
          lon: data.longitude,
          capturedAt: photoDate,
          source: 'exif',
        });
        setGpsSource('exif');
      }
    }

    if (precheckOutcome.status === 'fulfilled') {
      const precheck = precheckOutcome.value;
      if (precheck.hash) {
        setPhotoHash(precheck.hash.hex);
      }
      if (precheck.isDuplicate && precheck.flag) {
        setDuplicateFlag(precheck.flag);
        setStatus('error');
        return;
      }
      if (precheck.hash) {
        announcePolite(
          `Photo perceptual hash ${precheck.hash.hex} verified. No duplicate planting proof detected.`
        );
      }
    }

    setStatus('idle');
  }

  function clearPhoto() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoHash(null);
    setDuplicateFlag(null);
    setGps(null);
    setGpsSource(null);
    setResult(null);
    setErrorMessage(null);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function resetForm() {
    setFarmerAddress('');
    setSelectedJobId('');
    setManualLat('');
    setManualLon('');
    clearPhoto();
    setStatus('idle');
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !photo || !effectiveGps) {
      setStatus('error');
      setErrorMessage(
        'Please select a job, provide GPS coordinates, and attach an original photo.'
      );
      return;
    }

    if (!isValidStellarAddress) {
      setStatus('error');
      setErrorMessage('Please enter a valid Stellar Ed25519 public key (starts with G).');
      return;
    }

    if (duplicateFlag) {
      warnDuplicatePhotoDetected(duplicateFlag, 'planting-proof-blocked-submit');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setErrorMessage(null);
    setMessage('Verifying perceptual hash and uploading planting proof to IPFS...');

    try {
      const formData = new FormData();
      formData.append('photo', photo);
      formData.append('lat', String(effectiveGps.lat));
      formData.append('lon', String(effectiveGps.lon));
      formData.append('farmerId', trimmedAddress);
      formData.append('treeId', selectedJob.id);
      formData.append('region', selectedJob.location);

      const response = await fetch('/api/planting/photo', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as PlantingPhotoUploadApiResponse;

      if (!response.ok) {
        if (
          response.status === 422 &&
          (payload.code === 'DUPLICATE_PHOTO' ||
            (typeof payload.error === 'string' && /duplicate/i.test(payload.error)))
        ) {
          const resolvedHash = (payload.hash ?? photoHash ?? '0000000000000000') as PHashHex;
          const distance = payload.distance ?? 0;
          const threshold = payload.threshold ?? CLIENT_DEFAULT_DUPLICATE_THRESHOLD;
          const serverFlag: DuplicateFlagDetails = {
            hash: resolvedHash,
            distance,
            threshold,
            similarityScore:
              typeof payload.similarity === 'number'
                ? payload.similarity
                : Math.max(0, Math.min(1, 1 - distance / 64)),
            source: 'upload-response',
            duplicateId: payload.duplicateOf,
          };
          warnDuplicatePhotoDetected(serverFlag, 'planting-proof-upload');
          setDuplicateFlag(serverFlag);
          setMessage(null);
          setStatus('error');
          return;
        }

        const errText = payload.error ?? 'Verification submission failed.';
        announceAssertive(errText);
        setErrorMessage(errText);
        setMessage(null);
        setStatus('error');
        return;
      }

      const finalHash = payload.hash ?? photoHash ?? undefined;
      if (finalHash && /^[0-9a-f]{16}$/i.test(finalHash)) {
        recordLocalPhotoHash({
          hash: finalHash.toLowerCase(),
          entityType: 'tree',
          entityId: selectedJob.id,
          fileName: photo.name,
          storageRef: payload.ipfsCid,
        });
      }

      const cid = payload.ipfsCid ?? 'bafy-verified-proof';
      setResult({
        cid,
        size: photo.size,
        ipfsUrl: payload.ipfsUrl ?? `ipfs://${cid}`,
        gatewayUrl: payload.gatewayUrl ?? '',
        hash: finalHash,
      });
      setStatus('success');
      setMessage('Planting proof verified and pinned to IPFS.');
      announcePolite('Planting photo verified as unique and uploaded to IPFS.');
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : 'Verification submission failed. Please try again.';
      announceAssertive(errText);
      setErrorMessage(errText);
      setMessage(null);
      setStatus('error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-0 sm:px-4">
      {/* Header */}
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Badge variant="success">Planter upload</Badge>
          <Badge variant="secondary">IPFS storage</Badge>
          <Badge variant="outline">pHash dedup</Badge>
        </div>
        <Text as="h1" variant="h1" className="text-2xl sm:text-3xl">
          Submit planting proof
        </Text>
        <Text className="text-sm text-muted-foreground sm:text-base">
          Upload a GPS-tagged photo to verify your tree planting. Perceptual hashing (pHash)
          automatically screens uploads against reused or stock imagery before pinning to IPFS.
        </Text>
      </div>

      {/* Step indicator */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-2 text-center shadow-xs">
        {[
          { icon: ClipboardList, label: 'Select job' },
          { icon: Camera, label: 'Photo + pHash' },
          { icon: Upload, label: 'Upload' },
        ].map(({ icon: Icon, label }, i) => (
          <div key={label} className="rounded-lg px-2 py-2 text-center sm:py-3">
            <Icon className="mx-auto h-4 w-4 text-stellar-blue sm:h-5 sm:w-5" aria-hidden="true" />
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground sm:text-xs">
              {i + 1}. {label}
            </p>
          </div>
        ))}
      </div>

      {/* Process steps */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-card p-2 text-center shadow-sm sm:gap-3 sm:p-3">
        <div className="px-2">
          <Lock className="mx-auto h-5 w-5 text-stellar-blue" aria-hidden="true" />
          <p className="mt-1 text-xs font-semibold">Encrypt</p>
        </div>
        <div className="px-2">
          <ShieldCheck className="mx-auto h-5 w-5 text-stellar-green" aria-hidden="true" />
          <p className="mt-1 text-xs font-semibold">pHash Check</p>
        </div>
        <div className="px-2">
          <Send className="mx-auto h-5 w-5 text-stellar-purple" aria-hidden="true" />
          <p className="mt-1 text-xs font-semibold">Verify</p>
        </div>
      </div>

      {status === 'success' && result ? (
        /* ── Success state ── */
        <Card className="rounded-xl border-stellar-green/30 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-stellar-green" aria-hidden="true" />
            <Text variant="h2" className="text-xl">
              Photo uploaded!
            </Text>
            <Text className="max-w-sm text-sm text-muted-foreground">
              Your planting photo passed perceptual hash verification and has been linked to{' '}
              <strong>{selectedJob?.projectName}</strong>.
            </Text>
            <div className="w-full max-w-sm space-y-2 rounded-lg bg-muted/50 p-4 text-left font-mono text-xs">
              <div className="flex justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">IPFS CID:</span>
                <span className="break-all font-semibold">{result.cid}</span>
              </div>
              {result.hash && (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">pHash (64-bit):</span>
                  <span className="break-all font-semibold">{result.hash}</span>
                </div>
              )}
              {result.gatewayUrl && (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Gateway:</span>
                  <a
                    href={result.gatewayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-stellar-blue underline underline-offset-2"
                  >
                    View photo
                  </a>
                </div>
              )}
            </div>
            <Button type="button" stellar="primary-outline" onClick={resetForm} className="mt-2">
              Upload another
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ── Form ── */
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 1: Farmer + Job */}
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 shrink-0 text-stellar-green" aria-hidden="true" />
                <span>Tree job</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Select the planting assignment and confirm your Stellar account identity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Your Stellar address</span>
                <Input
                  value={farmerAddress}
                  onChange={(e) => setFarmerAddress(e.target.value)}
                  placeholder="G..."
                  inputSize="lg"
                  aria-invalid={showAddressWarning}
                  required
                />
                {showAddressWarning && (
                  <p className="text-xs text-destructive" role="alert">
                    Enter a valid 56-character Stellar Ed25519 public key starting with G.
                  </p>
                )}
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Planting assignment</span>
                <div className="relative">
                  <select
                    aria-label="Planting assignment"
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    required
                    className="h-12 w-full appearance-none rounded-lg border border-input bg-background pl-4 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select an assignment…</option>
                    {FARMER_JOBS.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.projectName} — {job.treesTarget} trees
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              </label>

              {selectedJob && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-stellar-blue" aria-hidden="true" />
                  <span>
                    <strong>{selectedJob.projectName}</strong> &mdash; {selectedJob.location}{' '}
                    &mdash; {selectedJob.treesTarget} trees
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Photo + GPS */}
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4 shrink-0 text-stellar-blue" aria-hidden="true" />
                <span>Photo &amp; GPS location</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Take an original photo at the planting site. GPS coordinates are read from EXIF
                metadata or can be entered manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Photo upload area */}
              <div
                onClick={() => !photo && fileInputRef.current?.click()}
                className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stellar-blue/30 bg-muted/20 px-4 py-6 text-center transition-colors hover:border-stellar-blue/60 active:bg-muted/40"
              >
                {photoPreview ? (
                  <div className="relative w-full max-w-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Planting site preview"
                      className="h-48 w-full rounded-lg object-cover shadow-xs"
                    />
                    <button
                      type="button"
                      aria-label="Remove selected planting photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearPhoto();
                      }}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white shadow-xs"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <>
                    <FileImage className="h-8 w-8 text-stellar-blue/60" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">Tap to take or choose a photo</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      Enable GPS/camera permissions. Photos with embedded GPS metadata are
                      preferred.
                    </p>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  id="planting-proof-photo-input"
                  aria-label="Upload planting proof photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
                  className="sr-only"
                  required={!photo}
                />
              </div>

              {!photo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                  Take photo
                </Button>
              )}

              {status === 'checking-hash' && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-lg border border-stellar-blue/30 bg-stellar-blue/5 px-4 py-3 text-xs text-muted-foreground"
                >
                  <Fingerprint
                    className="h-4 w-4 shrink-0 animate-pulse text-stellar-blue"
                    aria-hidden="true"
                  />
                  <span>Computing 64-bit perceptual hash (pHash) to screen for duplicates…</span>
                </div>
              )}

              {/* Duplicate image detection accessible notification */}
              {duplicateFlag && (
                <DuplicatePhotoAlert
                  flag={duplicateFlag}
                  onReplacePhoto={() => {
                    clearPhoto();
                    fileInputRef.current?.click();
                  }}
                />
              )}

              {/* Unique pHash verification badge */}
              {photoHash && !duplicateFlag && status !== 'checking-hash' && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stellar-green/30 bg-stellar-green/5 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Fingerprint
                      className="h-4 w-4 shrink-0 text-stellar-green"
                      aria-hidden="true"
                    />
                    <span>Originality verified via pHash</span>
                  </div>
                  <Badge variant="success" className="font-mono text-[11px]">
                    {photoHash}
                  </Badge>
                </div>
              )}

              {/* GPS from EXIF */}
              {gpsSource === 'exif' && gps && (
                <div className="flex items-start gap-3 rounded-lg border border-stellar-green/30 bg-stellar-green/5 p-4">
                  <MapPin
                    className="mt-0.5 h-5 w-5 shrink-0 text-stellar-green"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">GPS from photo metadata</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}

              {/* Warning + manual fallback when EXIF GPS is absent */}
              {photoLacksCoordinates && (
                <div className="space-y-3">
                  <div
                    className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <AlertCircle
                      className="mt-0.5 h-5 w-5 shrink-0 text-stellar-blue"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold">Missing EXIF Location Metadata</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        This photo does not contain embedded GPS coordinates. Enter the planting
                        site coordinates below or choose a GPS-tagged photo.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Latitude (-90 to 90)</span>
                      <Input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        placeholder="e.g. 12.1542"
                        value={manualLat}
                        onChange={(e) => setManualLat(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Longitude (-180 to 180)</span>
                      <Input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        placeholder="e.g. 9.3491"
                        value={manualLon}
                        onChange={(e) => setManualLon(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span>Coordinates and image hash are verified before IPFS pinning.</span>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {message ? (
                <Text variant="muted" role="status" aria-live="polite">
                  {message}
                </Text>
              ) : null}

              <Button type="submit" stellar="primary" disabled={!canSubmit}>
                {status === 'uploading' ? 'Submitting...' : 'Submit verification'}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}

FarmerVerificationPortal.displayName = 'FarmerVerificationPortal';
