'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, MapPin, Upload } from 'lucide-react';
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

const FARMER_JOBS: JobOption[] = [
  { id: 'na-001', projectName: 'Jigawa Dryland Restoration', location: 'Jigawa State, Nigeria', treesTarget: 600 },
  { id: 'na-002', projectName: 'Katsina Sahel Buffer', location: 'Katsina State, Nigeria', treesTarget: 350 },
  { id: 'na-003', projectName: 'Kano Reforestation Phase 2', location: 'Kano State, Nigeria', treesTarget: 500 },
];

export function FarmerVerificationPortal() {
  const [farmerAddress, setFarmerAddress] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(() => FARMER_JOBS.find((job) => job.id === selectedJobId) ?? null, [selectedJobId]);

  const canSubmit = useMemo(() => {
    return Boolean(farmerAddress.trim() && selectedJob && photoPreview && lat && lon && status !== 'uploading');
  }, [farmerAddress, selectedJob, photoPreview, lat, lon, status]);

  const handlePhotoChange = (file: File | null) => {
    if (!file) {
      setPhotoPreview(null);
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
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Farmer Verification</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Text variant="small" className="font-medium">
              Farmer address
            </Text>
            <Input value={farmerAddress} onChange={(event) => setFarmerAddress(event.target.value)} placeholder="Enter wallet address" />
          </div>

          <div className="space-y-2">
            <Text variant="small" className="font-medium">
              Select job
            </Text>
            <select
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Choose a job</option>
              {FARMER_JOBS.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.projectName} — {job.location}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Text variant="small" className="font-medium">
              Upload photo
            </Text>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
              />
              <div>
                <Camera className="mx-auto mb-2 h-8 w-8" />
                <p>Click to add a photo</p>
              </div>
            </label>
            {photoPreview ? (
              <div className="overflow-hidden rounded-lg border">
                <img src={photoPreview} alt="Preview" className="h-48 w-full object-cover" />
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Text variant="small" className="font-medium">
                Latitude
              </Text>
              <Input value={lat} onChange={(event) => setLat(event.target.value)} placeholder="12.3456" />
            </div>
            <div className="space-y-2">
              <Text variant="small" className="font-medium">
                Longitude
              </Text>
              <Input value={lon} onChange={(event) => setLon(event.target.value)} placeholder="-1.2345" />
            </div>
          </div>

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
