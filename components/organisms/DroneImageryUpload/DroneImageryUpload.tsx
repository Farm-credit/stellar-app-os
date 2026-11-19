'use client';

/**
 * Drone Imagery Upload - Issue #1680
 *
 * Upload component for partner organizations to submit drone survey imagery
 */

import { useState, useCallback } from 'react';
import { Upload, MapPin, Camera, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import type { DroneImageUpload } from '@/lib/types/drone-imagery';

interface DroneImageryUploadProps {
  projectId: string;
  onUploadSuccess: (image: DroneImage) => void;
  className?: string;
}

export function DroneImageryUpload({ projectId, onUploadSuccess, className }: DroneImageryUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const [geotag, setGeotag] = useState({
    latitude: 0,
    longitude: 0,
    altitude: 100,
  });

  const [metadata, setMetadata] = useState({
    droneModel: 'DJI Phantom 4 Pro',
    camera: 'FC6310',
    resolution: '4K',
    flightAltitude: 120,
    coverageArea: 50000,
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('Please select a valid image file (JPEG, PNG, or WebP)');
        return;
      }

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      setSelectedFile(file);
      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Simulate successful upload response
      const mockUploadedImage: DroneImage = {
        id: `di-${Date.now()}`,
        projectId,
        imageUrl: uploadedImage || '',
        thumbnailUrl: uploadedImage || '',
        capturedAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'partner-001',
        geotag,
        metadata,
        measurements: {
          treeCount: Math.floor(Math.random() * 1000) + 1000,
          canopyCover: Math.floor(Math.random() * 30) + 60,
          avgHeight: Math.floor(Math.random() * 10) + 8,
        },
      };

      onUploadSuccess(mockUploadedImage);
      setSelectedFile(null);
      setUploadedImage(null);
      setUploadProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [selectedFile, projectId, uploadedImage, geotag, metadata, onUploadSuccess]);

  const handleReset = () => {
    setSelectedFile(null);
    setUploadedImage(null);
    setError(null);
    setUploadProgress(0);
  };

  return (
    <div className={className}>
      <Card className="p-6">
        <Text variant="h3" className="text-lg font-semibold mb-4">
          Upload Drone Imagery
        </Text>

        {!selectedFile ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-stellar-blue/50 transition-colors">
            <input
              type="file"
              id="drone-image-upload"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <label
              htmlFor="drone-image-upload"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-stellar-blue/10">
                <Upload className="w-8 h-8 text-stellar-blue" />
              </div>
              <div>
                <Text variant="body" className="font-semibold">
                  Click to upload drone imagery
                </Text>
                <Text variant="small" className="text-muted-foreground mt-1">
                  JPEG, PNG, or WebP (max 50MB)
                </Text>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Image preview */}
            {uploadedImage && (
              <div className="relative rounded-lg overflow-hidden">
                <img
                  src={uploadedImage}
                  alt="Preview"
                  className="w-full h-64 object-cover"
                />
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center">
                      <LoadingSpinner size="lg" />
                      <Text variant="small" className="text-white mt-2">
                        Uploading... {uploadProgress}%
                      </Text>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Geotag input */}
            <div>
              <Text variant="body" className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Geotag Information
              </Text>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={geotag.latitude || ''}
                    onChange={(e) => setGeotag({ ...geotag, latitude: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={geotag.longitude || ''}
                    onChange={(e) => setGeotag({ ...geotag, longitude: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Altitude (m)</label>
                  <input
                    type="number"
                    value={geotag.altitude || ''}
                    onChange={(e) => setGeotag({ ...geotag, altitude: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
              </div>
            </div>

            {/* Metadata input */}
            <div>
              <Text variant="body" className="font-semibold mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Flight Metadata
              </Text>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Drone Model</label>
                  <input
                    type="text"
                    value={metadata.droneModel}
                    onChange={(e) => setMetadata({ ...metadata, droneModel: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Camera</label>
                  <input
                    type="text"
                    value={metadata.camera}
                    onChange={(e) => setMetadata({ ...metadata, camera: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Resolution</label>
                  <select
                    value={metadata.resolution}
                    onChange={(e) => setMetadata({ ...metadata, resolution: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  >
                    <option value="4K">4K</option>
                    <option value="5.4K">5.4K</option>
                    <option value="8K">8K</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Flight Altitude (m)</label>
                  <input
                    type="number"
                    value={metadata.flightAltitude}
                    onChange={(e) => setMetadata({ ...metadata, flightAltitude: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-muted-foreground mb-1">Coverage Area (m²)</label>
                  <input
                    type="number"
                    value={metadata.coverageArea}
                    onChange={(e) => setMetadata({ ...metadata, coverageArea: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    disabled={uploading}
                  />
                </div>
              </div>
            </div>

            {/* Error display */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <Text variant="small" className="text-destructive">
                  {error}
                </Text>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="xs" />
                    Uploading...
                  </span>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Imagery
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
