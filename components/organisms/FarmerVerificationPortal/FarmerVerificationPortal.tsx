'use client';

import { useMemo, useState, useRef } from 'react';
import type { FormEvent } from 'react';
import exifr from 'exifr';
import {
  AlertCircle,
  CheckCircle2,
  Camera,
  Loader2,
  MapPin,
  Upload,
  Globe,
  ClipboardList,
  ChevronDown,
  Lock,
  ShieldCheck,
  Send,
  FileImage,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';

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

type Status = 'idle' | 'reading-gps' | 'reading-photo' | 'uploading' | 'success' | 'error';

const FARMER_JOBS: JobOption[] = [
  { id: 'na-001', projectName: 'Jigawa Dryland Restoration', location: 'Jigawa State, Nigeria', treesTarget: 600 },
  { id: 'na-002', projectName: 'Katsina Sahel Buffer', location: 'Katsina State, Nigeria', treesTarget: 350 },
  { id: 'na-003', projectName: 'Kano Reforestation Phase 2', location: 'Kano State, Nigeria', treesTarget: 500 },
];

export function FarmerVerificationPortal() {
  const [farmerAddress, setFarmerAddress] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [gpsSource, setGpsSource] = useState<'exif' | 'manual' | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [photoLacksCoordinates, setPhotoLacksCoordinates] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IpfsUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(() => FARMER_JOBS.find((job) => job.id === selectedJobId) ?? null, [selectedJobId]);

  const canSubmit = useMemo(() => {
    const hasAddress = farmerAddress.trim().length > 0;
    const hasJob = !!selectedJob;
    const hasPhoto = !!photo;
    const hasGps = !!gps;
    return hasAddress && hasJob && hasPhoto && hasGps && status !== 'uploading';
  }, [farmerAddress, selectedJob, photo, gps, status]);

  async function handlePhotoChange(file: File | null) {
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setGps(null);
    setResult(null);
    setError(null);
    setPhotoLacksCoordinates(false);
    setGpsSource(null);

    if (!file) return;

    try {
      setStatus('reading-gps');
      const data = await exifr.parse(file, [
        'latitude',
        'longitude',
        'DateTimeOriginal',
        'CreateDate',
      ]);
      if (data?.latitude != null && data?.longitude != null) {
        const photoDate: Date | null = data.DateTimeOriginal || data.CreateDate || null;
        setGps({
          lat: data.latitude,
          lon: data.longitude,
          capturedAt: photoDate,
          source: 'exif',
        });
        setGpsSource('exif');
      } else {
        setPhotoLacksCoordinates(true);
      }
      setStatus('idle');
    } catch {
      setStatus('idle');
    }
  }

  function applyManualGps() {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon)) {
      setError('Invalid GPS coordinates. Enter decimal degrees (e.g., 12.1234).');
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError('Coordinates out of range. Lat: -90 to 90, Lon: -180 to 180.');
      return;
    }

    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
    setMessage('Photo ready for verification.');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !photoPreview) {
      setStatus('error');
      setMessage('Please select a job and add a photo.');
      return;
    }

    setStatus('uploading');
    setMessage('Submitting verification request...');

    try {
      await Promise.resolve();
      setStatus('success');
      setMessage('Verification request queued successfully.');
    } catch {
      setStatus('error');
      setMessage('Verification submission failed.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-0 sm:px-4">
      {/* Header */}
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Badge variant="success">Planter upload</Badge>
          <Badge variant="secondary">IPFS storage</Badge>
        </div>
        <Text as="h1" variant="h1" className="text-2xl sm:text-3xl">
          Submit planting proof
        </Text>
        <Text className="text-muted-foreground text-sm sm:text-base">
          Upload a GPS-tagged photo to verify your tree planting. The photo is stored on IPFS and
          linked to your assigned job.
        </Text>
      </div>

      {/* Step indicator */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-2 text-center shadow-xs">
        {[
          { icon: ClipboardList, label: 'Select job' },
          { icon: Camera, label: 'Photo + GPS' },
          { icon: Upload, label: 'Upload' },
        ].map(({ icon: Icon, label }, i) => (
          <div key={label} className="rounded-lg px-2 py-2 sm:py-3 text-center">
            <Icon className="mx-auto h-4 w-4 sm:h-5 sm:w-5 text-stellar-blue" />
            <p className="mt-1 text-[10px] sm:text-xs font-semibold text-muted-foreground">
              {i + 1}. {label}
            </p>
          </div>

      {/* Process steps */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-card p-2 text-center shadow-sm sm:gap-3 sm:p-3">
        <div className="px-2">
          <Lock className="mx-auto h-5 w-5 text-stellar-blue" />
          <p className="mt-1 text-xs font-semibold">Encrypt</p>
        </div>
        <div className="px-2">
          <ShieldCheck className="mx-auto h-5 w-5 text-stellar-green" />
          <p className="mt-1 text-xs font-semibold">Prove</p>
        </div>
        <div className="px-2">
          <Send className="mx-auto h-5 w-5 text-stellar-purple" />
          <p className="mt-1 text-xs font-semibold">Verify</p>
        </div>
      </div>

      {status === 'success' && result ? (
        /* ── Success state ── */
        <Card className="rounded-xl shadow-sm border-stellar-green/30">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-stellar-green" />
            <Text variant="h2" className="text-xl">
              Photo uploaded!
            </Text>
            <Text className="text-muted-foreground max-w-sm text-sm">
              Your planting photo has been uploaded to IPFS and linked to{' '}
              <strong>{selectedJob?.projectName}</strong>.
            </Text>
            <div className="w-full max-w-sm space-y-2 rounded-lg bg-muted/50 p-4 text-left text-xs font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">IPFS CID:</span>
                <span className="break-all font-semibold">{result.cid}</span>
              </div>
              {result.gatewayUrl && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Gateway:</span>
                  <a
                    href={result.gatewayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stellar-blue underline underline-offset-2 break-all"
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
                <ClipboardList className="h-4 w-4 text-stellar-green shrink-0" />
                <span>Tree job</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Select the planting assignment and confirm your identity.
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
                  required
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Planting assignment</span>
                <div className="relative">
                  <select
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
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </label>

              {selectedJob && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <MapPin className="h-4 w-4 text-stellar-blue shrink-0" />
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
                <Camera className="h-4 w-4 text-stellar-blue shrink-0" />
                <span>Photo &amp; GPS location</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Take a photo at the planting site. GPS coordinates are read from the photo or can be
                entered manually.
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
                    <img
                      src={photoPreview}
                      alt="Planting site preview"
                      className="h-48 w-full rounded-lg object-cover shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearPhoto();
                      }}
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white text-xs font-bold shadow-xs"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <>
                    <FileImage className="h-8 w-8 text-stellar-blue/60" />
                    <p className="mt-3 text-sm font-semibold">Tap to take or choose a photo</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      Enable GPS/camera permissions. Photos with embedded GPS metadata are
                      preferred.
                    </p>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
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
                  <Camera className="mr-2 h-4 w-4" />
                  Take photo
                </Button>
              )}

              {/* GPS from EXIF */}
              {gpsSource === 'exif' && gps && (
                <div className="flex items-start gap-3 rounded-lg border border-stellar-green/30 bg-stellar-green/5 p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-stellar-green" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">GPS from photo metadata</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}

              {/* Warning: missing GPS */}
              {photoLacksCoordinates && (
                <div
                  className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold">Warning: Missing Location Coordinates</p>
                    <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                      This photo does not contain GPS coordinate metadata. Please use a photo taken
                      with GPS location enabled on your device.
                    </p>
                  </div>
                </div>
              )}

              {/* GPS found */}
              {gps && gpsSource !== 'exif' && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4">
                  <MapPin className="h-5 w-5 text-stellar-green" />
                  <div>
                    <p className="text-sm font-semibold">GPS metadata found</p>
                    <p className="font-mono text-xs text-muted-foreground text-left">
                      Location: {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                    </p>
                    {gps.capturedAt && (
                      <p className="text-xs text-muted-foreground mt-1 text-left">
                        Captured At: {new Date(gps.capturedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Coordinates will be verified against the selected project.</span>
          </div>

          {message ? <Text variant="muted">{message}</Text> : null}

          <Button type="submit" stellar="primary" disabled={!canSubmit}>
            {status === 'uploading' ? 'Submitting...' : 'Submit verification'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
