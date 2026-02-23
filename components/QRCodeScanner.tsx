import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type ScanResult = { type: 'url'; url: string } | { type: 'address'; address: string };

interface QRCodeScannerProps {
  onResult?: (result: ScanResult) => void;
  manualLabel?: string;
  autoStart?: boolean;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onResult,
  manualLabel = 'Enter code or address',
  autoStart = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState<string>('');

  const parseScanned = (raw: string): ScanResult => {
    const trimmed = raw.trim();
    try {
      const u = new URL(trimmed);
      return { type: 'url', url: u.toString() };
    } catch {
      const stellarRegex = /^G[A-Z2-7]{55}$/;
      if (stellarRegex.test(trimmed)) {
        return { type: 'address', address: trimmed };
      }
      return { type: 'address', address: trimmed };
    }
  };

  const stopCamera = (): void => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startCamera = async (): Promise<void> => {
    setError(null);
    try {
      const constraints: MediaStreamConstraints = { video: { facingMode: 'environment' } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // small play guard
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        videoRef.current.play();
      }
      setScanning(true);
      tick();
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err && err.name === 'NotAllowedError') {
        setError('camera-denied');
      } else {
        setError('camera-error');
      }
      setScanning(false);
    }
  };

  useEffect(() => {
    if (autoStart) startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = (): void => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const targetW = Math.min(640, vw);
    const scale = targetW / vw;
    const targetH = Math.floor(vh * scale);
    canvas.width = targetW;
    canvas.height = targetH;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) {
      const parsed = parseScanned(code.data);
      if (onResult) onResult(parsed);
      stopCamera();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  };

  const handleManualSubmit = (): void => {
    if (!manualValue) return;
    const parsed = parseScanned(manualValue);
    if (onResult) onResult(parsed);
  };

  return (
    <div aria-live="polite" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ position: 'relative', paddingTop: '56.25%' }}>
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted
          playsInline
          aria-label="Camera preview for QR scanning"
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            aria-hidden
            style={{
              width: '64%',
              height: '44%',
              border: '3px dashed rgba(255,255,255,0.9)',
              borderRadius: 12,
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        {!scanning && error !== 'camera-denied' && (
          <button onClick={startCamera} aria-label="Open camera to scan QR">
            Open camera
          </button>
        )}

        {scanning && (
          <button onClick={stopCamera} aria-label="Stop camera">
            Stop camera
          </button>
        )}

        {error === 'camera-denied' && (
          <div role="alert" style={{ color: '#b00020' }}>
            Camera access was denied. Use manual input below.
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="manual-input" style={{ display: 'block', fontWeight: 600 }}>
          {manualLabel}
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            id="manual-input"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            aria-label="Manual QR input"
            style={{ flex: 1 }}
          />
          <button onClick={handleManualSubmit} aria-label="Submit manual code">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
