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
  ImageIcon,
  ClipboardList,
  ChevronDown,
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

interface IpfsUploadResult {
  cid: string;
  ipfsUrl: string;
  gatewayUrl: string;
}

interface JobOption {
  id: string;
  projectName: string;
  location: string;
  treesTarget: number;
}

type UploadStatus = 'idle' | 'reading-gps' | 'uploading' | 'success' | 'error';

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

export function FarmerVerificationPortal() {
  const [farmerAddress, setFarmerAddress] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsSource, setGpsSource] = useState<'exif' | 'manual' | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [photoLacksCoordinates, setPhotoLacksCoordinates] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IpfsUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(
    () => FARMER_JOBS.find((j) => j.id === selectedJobId) ?? null,
    [selectedJobId]
  );

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
    setGpsSource(null);
    setResult(null);
    setError(null);
    setPhotoLacksCoordinates(false);

    if (!file) return;

    try {
      setStatus('reading-gps');
      const reading = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | null;

      if (typeof reading?.latitude === 'number' && typeof reading.longitude === 'number') {
        setGps({ lat: reading.latitude, lon: reading.longitude });
        setGpsSource('exif');
      }

      setStatus('reading-photo');
      const reading = (await exifr.parse(file)) as {
        latitude?: number;
        longitude?: number;
        DateTimeOriginal?: Date | string;
      } | null;

      if (typeof reading?.latitude !== 'number' || typeof reading.longitude !== 'number') {
        setPhotoLacksCoordinates(true);
        throw new Error(
          'This photo does not include GPS metadata. Take a new photo with location enabled.'
        );
      }

      let capturedAt = new Date().toISOString();
      if (reading.DateTimeOriginal) {
        const parsedDate = new Date(reading.DateTimeOriginal);
        if (!isNaN(parsedDate.getTime())) {
          capturedAt = parsedDate.toISOString();
        }
      } else if (file.lastModified) {
        capturedAt = new Date(file.lastModified).toISOString();
      }

      setGps({
        lat: reading.latitude,
        lon: reading.longitude,
        capturedAt,
        source: 'exif',
      });
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
    setGps({ lat, lon });
    setGpsSource('manual');
    setError(null);
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    setGps(null);
    setGpsSource(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!photo || !gps || !selectedJob) return;

    try {
      setStatus('uploading');

      const formData = new FormData();
      formData.append('photo', photo);
      formData.append('lat', gps.lat.toString());
      formData.append('lon', gps.lon.toString());
      formData.append('farmerId', farmerAddress.trim());
      formData.append('treeId', selectedJob.id);
      formData.append('projectName', selectedJob.projectName);

      const response = await fetch('/api/planting/photo', {
        method: 'POST',
        body: formData,
      });

      const body = (await response.json()) as {
        message?: string;
        ipfsCid?: string;
        ipfsUrl?: string;
        gatewayUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? 'Upload failed');
      }

      setResult({
        cid: body.ipfsCid ?? '',
        ipfsUrl: body.ipfsUrl ?? '',
        gatewayUrl: body.gatewayUrl ?? '',
      });
      setStatus('success');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Upload failed');
    }
  }

  function resetForm() {
    setStatus('idle');
    setError(null);
    setResult(null);
    setPhoto(null);
    setPhotoPreview(null);
    setGps(null);
    setGpsSource(null);
    setSelectedJobId('');
    setManualLat('');
    setManualLon('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const busy = status === 'reading-gps' || status === 'uploading';

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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="success">Farmer verification</Badge>
            <Badge variant="secondary">Client-side encrypted</Badge>
          </div>
          <Text as="h1" variant="h1" className="text-2xl sm:text-3xl md:text-4xl">
            Planting verification
          </Text>
          <Text className="mt-3 text-muted-foreground">
            Submit a GPS-tagged planting photo and tree count for ZK location proof generation and
            Stellar verification.
          </Text>
        </div>
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
        ))}
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
      <form
        onSubmit={handleSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sprout className="h-5 w-5 text-stellar-green" />
              Planting details
            </CardTitle>
            <CardDescription>
              Use the same wallet address registered to your farmer profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Farmer Stellar address</span>
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
            <label className="block space-y-2">
              <span className="text-sm font-medium">GPS planting photo</span>
              <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-stellar-blue/40 bg-secondary/40 px-4 py-6 text-center">
                <FileImage className="h-8 w-8 text-stellar-blue" />
                <p className="mt-3 text-sm font-semibold">
                  {photo ? photo.name : 'Choose or take a photo'}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  The photo must include embedded GPS metadata from the device camera.
                </p>
                <Input
                  className="mt-4 max-w-sm"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
            </label>

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

            {gps && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4">
                <MapPin className="h-5 w-5 text-stellar-green" />
                <div>
                  <p className="text-sm font-semibold">GPS metadata found</p>
                  <p className="font-mono text-xs text-muted-foreground text-left">
                    Location: {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-left">
                    Captured At: {new Date(gps.capturedAt).toLocaleString()}
                  </p>
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
                    <ImageIcon className="h-8 w-8 text-stellar-blue/60" />
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
              {gpsSource === 'exif' && (
                <div className="flex items-start gap-3 rounded-lg border border-stellar-green/30 bg-stellar-green/5 p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-stellar-green" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">GPS from photo metadata</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {gps!.lat.toFixed(6)}, {gps!.lon.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}

              {/* Manual GPS fallback */}
              <details className="group rounded-lg border border-input">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  {gpsSource === 'manual' ? 'GPS set manually' : 'Enter GPS coordinates manually'}
                </summary>
                <div className="space-y-3 border-t border-input px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Latitude</span>
                      <Input
                        type="number"
                        step="any"
                        placeholder="e.g. 12.1234"
                        value={manualLat}
                        onChange={(e) => {
                          setManualLat(e.target.value);
                          if (gpsSource === 'manual') {
                            setGps(null);
                            setGpsSource(null);
                          }
                        }}
                        inputSize="md"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Longitude</span>
                      <Input
                        type="number"
                        step="any"
                        placeholder="e.g. 8.5678"
                        value={manualLon}
                        onChange={(e) => {
                          setManualLon(e.target.value);
                          if (gpsSource === 'manual') {
                            setGps(null);
                            setGpsSource(null);
                          }
                        }}
                        inputSize="md"
                      />
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyManualGps}
                    disabled={!manualLat || !manualLon}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Apply coordinates
                  </Button>
                  {gpsSource === 'manual' && gps && (
                    <p className="font-mono text-xs text-stellar-green">
                      {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                    </p>
                  )}
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Error display */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            stellar="success"
            width="full"
            disabled={!canSubmit || busy}
            className="h-12 gap-2 text-base"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {status === 'reading-gps' ? 'Reading GPS…' : 'Uploading to IPFS…'}
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Upload to IPFS
              </>
            )}
          </Button>

          {!canSubmit && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {!farmerAddress.trim() && <li>&bull; Enter your Stellar address</li>}
              {!selectedJob && <li>&bull; Select a planting assignment</li>}
              {!photo && <li>&bull; Take or choose a planting photo</li>}
              {!gps && photo && <li>&bull; Set GPS coordinates (from photo or manual)</li>}
            </ul>
          )}
        </form>
      )}
    </div>
  );
}
