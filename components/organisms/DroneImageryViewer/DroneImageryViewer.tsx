'use client';

/**
 * Drone Imagery Viewer - Issue #1680
 *
 * Interactive viewer for drone survey imagery with zoom and measurement tools
 */

import { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Ruler, Calendar, MapPin, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import type { DroneImage, DroneMeasurement } from '@/lib/types/drone-imagery';

interface DroneImageryViewerProps {
  images: DroneImage[];
  projectId: string;
  className?: string;
}

export function DroneImageryViewer({ images, projectId, className }: DroneImageryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [measurements, setMeasurements] = useState<DroneMeasurement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handlePrevious = () => {
    setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
    setZoom(1);
    setMeasurements([]);
  };

  const handleNext = () => {
    setCurrentIndex(i => (i < images.length - 1 ? i + 1 : 0));
    setZoom(1);
    setMeasurements([]);
  };

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!showMeasurements || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (!isDrawing) {
      setIsDrawing(true);
      setDrawStart({ x, y });
    } else if (drawStart) {
      // Calculate distance (simplified for demo)
      const dx = x - drawStart.x;
      const dy = y - drawStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const newMeasurement: DroneMeasurement = {
        type: 'distance',
        value: distance * 10, // Scale factor for demo
        unit: 'm',
        points: [drawStart, { x, y }],
        label: `${(distance * 10).toFixed(1)}m`,
      };

      setMeasurements([...measurements, newMeasurement]);
      setIsDrawing(false);
      setDrawStart(null);
    }
  }, [showMeasurements, isDrawing, drawStart, measurements]);

  const clearMeasurements = () => {
    setMeasurements([]);
    setIsDrawing(false);
    setDrawStart(null);
  };

  if (images.length === 0) {
    return (
      <div className={className}>
        <Card className="p-8 text-center">
          <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <Text variant="body" className="text-muted-foreground">
            No drone imagery available for this project
          </Text>
        </Card>
      </div>
    );
  }

  return (
    <div className={className}>
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <Text variant="h3" className="font-semibold">
              Drone Imagery Viewer
            </Text>
            <Text variant="small" className="text-muted-foreground">
              {currentIndex + 1} of {images.length}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {currentImage.metadata.resolution}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {currentImage.metadata.droneModel}
            </Badge>
          </div>
        </div>

        {/* Image Viewer */}
        <div className="relative bg-black">
          <div
            ref={imageRef}
            className="relative overflow-hidden cursor-crosshair"
            style={{ height: '500px' }}
            onClick={handleImageClick}
          >
            <img
              src={currentImage.imageUrl}
              alt={`Drone imagery ${currentIndex + 1}`}
              className="w-full h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />

            {/* Measurement overlays */}
            {measurements.map((measurement, idx) => (
              <div
                key={idx}
                className="absolute border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none"
                style={{
                  left: `${Math.min(measurement.points[0].x, measurement.points[1].x)}%`,
                  top: `${Math.min(measurement.points[0].y, measurement.points[1].y)}%`,
                  width: `${Math.abs(measurement.points[1].x - measurement.points[0].x)}%`,
                  height: `${Math.abs(measurement.points[1].y - measurement.points[0].y)}%`,
                }}
              >
                <span className="absolute -top-6 left-0 bg-yellow-400 text-black text-xs px-2 py-1 rounded font-semibold">
                  {measurement.label}
                </span>
              </div>
            ))}

            {/* Drawing indicator */}
            {isDrawing && drawStart && (
              <div
                className="absolute border-2 border-dashed border-yellow-400 pointer-events-none"
                style={{
                  left: `${drawStart.x}%`,
                  top: `${drawStart.y}%`,
                  width: '2px',
                  height: '2px',
                }}
              />
            )}
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-lg p-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Text variant="small" className="text-white min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </Text>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleZoomIn}
              disabled={zoom >= 4}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleResetZoom}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Measurement toggle */}
          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-lg p-2">
            <Button
              type="button"
              variant={showMeasurements ? 'default' : 'ghost'}
              size="sm"
              className={showMeasurements ? 'bg-yellow-400 text-black hover:bg-yellow-500' : 'text-white hover:bg-white/20'}
              onClick={() => {
                setShowMeasurements(!showMeasurements);
                clearMeasurements();
              }}
            >
              <Ruler className="w-4 h-4 mr-2" />
              {showMeasurements ? 'Stop Measuring' : 'Measure'}
            </Button>
            {showMeasurements && measurements.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={clearMeasurements}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={handlePrevious}
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={handleNext}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            </>
          )}
        </div>

        {/* Image metadata */}
        <div className="p-4 border-t space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <Text variant="small" className="text-muted-foreground">Captured</Text>
                <Text variant="small" className="font-medium">
                  {new Date(currentImage.capturedAt).toLocaleDateString()}
                </Text>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div>
                <Text variant="small" className="text-muted-foreground">Location</Text>
                <Text variant="small" className="font-medium">
                  {currentImage.geotag.latitude.toFixed(4)}, {currentImage.geotag.longitude.toFixed(4)}
                </Text>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <div>
                <Text variant="small" className="text-muted-foreground">Altitude</Text>
                <Text variant="small" className="font-medium">
                  {currentImage.geotag.altitude}m
                </Text>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-muted-foreground" />
              <div>
                <Text variant="small" className="text-muted-foreground">Coverage</Text>
                <Text variant="small" className="font-medium">
                  {currentImage.metadata.coverageArea.toLocaleString()} m²
                </Text>
              </div>
            </div>
          </div>

          {/* Auto-measurements */}
          {currentImage.measurements && (
            <div className="pt-3 border-t">
              <Text variant="small" className="font-semibold mb-2">
                AI Analysis
              </Text>
              <div className="flex flex-wrap gap-3">
                {currentImage.measurements.treeCount && (
                  <Badge variant="outline" className="text-xs">
                    {currentImage.measurements.treeCount.toLocaleString()} trees
                  </Badge>
                )}
                {currentImage.measurements.canopyCover && (
                  <Badge variant="outline" className="text-xs">
                    {currentImage.measurements.canopyCover}% canopy
                  </Badge>
                )}
                {currentImage.measurements.avgHeight && (
                  <Badge variant="outline" className="text-xs">
                    {currentImage.measurements.avgHeight}m avg height
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
