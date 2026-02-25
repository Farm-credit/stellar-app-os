'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  onGenerated?: (dataUrl: string) => void;
  onError?: (error: Error) => void;
}

function QrCode({ value, size = 128, className, onGenerated, onError }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 })
      .then(() => {
        const dataUrl = canvasRef.current?.toDataURL('image/png') ?? '';
        onGenerated?.(dataUrl);
        setHasError(false);
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error('QR generation failed');
        setHasError(true);
        onError?.(error);
      });
  }, [value, size, onGenerated, onError]);

  if (hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded border border-dashed border-border bg-muted text-xs text-muted-foreground',
          className
        )}
        style={{ width: size, height: size }}
        role="img"
        aria-label="QR code unavailable"
      >
        QR unavailable
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn('rounded', className)}
      aria-label={`QR code linking to ${value}`}
      role="img"
    />
  );
}

export { QrCode };
export type { QrCodeProps };
