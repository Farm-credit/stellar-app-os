import type { Metadata } from 'next';
import { FieldCaptureApp } from '@/components/organisms/FieldCapture/FieldCaptureApp';

export const metadata: Metadata = {
  title: 'Field Capture | Stellar Farm Credit',
  description: 'Photograph and tag trees in the field. Works offline and syncs when you reconnect.',
  robots: { index: false, follow: false },
};

export default function FieldCapturePage() {
  return (
    <main className="min-h-screen bg-background">
      <FieldCaptureApp />
    </main>
  );
}
