import React, { useState, useRef } from 'react';
import { getARAssetForSpecies, type ARSpeciesAsset } from './arSpeciesData';

interface TreeARViewerProps {
  species: string;
  treeId: string;
  onClose?: () => void;
}

export const TreeARViewer: React.FC<TreeARViewerProps> = ({ species, treeId, onClose }) => {
  const asset: ARSpeciesAsset | undefined = getARAssetForSpecies(species);
  const [arActive, setArActive] = useState<boolean>(false);
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!asset) {
    return (
      <div className="p-6 bg-stellar-navy text-white rounded-lg text-center">
        <h3 className="text-lg font-bold text-stellar-cyan">AR Unavailable</h3>
        <p className="text-sm text-gray-300 mt-2">
          3D model for species &quot;{species}&quot; is currently not among our top 20 AR-supported
          species.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-stellar-blue text-white rounded-md"
          >
            Back to Tree Profile
          </button>
        )}
      </div>
    );
  }

  const handleCaptureScreenshot = () => {
    if (containerRef.current) {
      // Simulate AR canvas snapshot capture
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#14B6E7';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        ctx.fillText(`Harvesta AR - Tree #${treeId} (${asset.name})`, 30, 50);
        setSnapshotUri(canvas.toDataURL('image/png'));
      }
    }
  };

  const handleShare = async () => {
    if (!snapshotUri) return;
    if (navigator.share) {
      try {
        const blob = await (await fetch(snapshotUri)).blob();
        const file = new File([blob], `tree-${treeId}-ar.png`, { type: 'image/png' });
        await navigator.share({
          title: `My Sponsored Tree (${asset.name})`,
          text: `Check out my sponsored tree in AR on Harvesta! Tree ID: ${treeId}`,
          files: [file],
        });
      } catch (err) {
        console.error('Error sharing AR screenshot:', err);
      }
    } else {
      alert('Share API not supported on this browser. Image is ready to save.');
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[85vh] bg-black rounded-xl overflow-hidden flex flex-col items-center justify-between p-4"
    >
      {/* Header Bar */}
      <div className="w-full flex justify-between items-center bg-black/60 backdrop-blur p-3 rounded-lg z-10">
        <div>
          <h2 className="text-white font-bold text-base">{asset.name}</h2>
          <p className="text-xs text-stellar-cyan italic">
            {asset.scientificName} • ID: {treeId}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white bg-red-600/80 px-3 py-1 rounded text-sm">
            Close AR
          </button>
        )}
      </div>

      {/* AR Viewport / Model Viewer simulation */}
      <div className="flex-1 w-full flex items-center justify-center relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-64 h-64 border-2 border-dashed border-stellar-cyan rounded-full animate-pulse" />
        </div>

        {/* WebAR Model Container */}
        <div className="text-center z-0 p-6 bg-stellar-navy/80 rounded-2xl border border-stellar-blue/40 max-w-sm">
          <p className="text-stellar-cyan font-medium text-sm mb-2">🌿 Real-Scale AR Ready</p>
          <p className="text-xs text-gray-300 mb-4">
            Point your smartphone camera at a flat surface to place your {asset.name} in your room
            or outdoor space.
          </p>
          <button
            onClick={() => setArActive(true)}
            className="w-full py-3 bg-stellar-green text-stellar-navy font-bold rounded-xl shadow-lg hover:bg-stellar-cyan transition"
          >
            Launch Camera AR
          </button>
        </div>

        {snapshotUri && (
          <div className="absolute inset-0 bg-black/90 z-30 flex flex-col items-center justify-center p-4">
            <h4 className="text-white font-bold mb-2">AR Screenshot Captured!</h4>
            <img
              src={snapshotUri}
              alt="AR Snapshot"
              className="max-h-64 rounded border border-stellar-blue mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-stellar-blue text-white rounded-lg"
              >
                Share Snapshot
              </button>
              <button
                onClick={() => setSnapshotUri(null)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg"
              >
                Retake
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="w-full flex justify-around items-center bg-black/60 backdrop-blur p-3 rounded-lg z-10">
        <button
          onClick={handleCaptureScreenshot}
          className="px-4 py-2 bg-stellar-purple text-white text-sm font-semibold rounded-lg hover:bg-stellar-blue"
        >
          📷 Capture AR Photo
        </button>
        <span className="text-xs text-gray-400">
          {arActive ? 'AR Mode Active' : 'Tap launch to start camera'}
        </span>
      </div>
    </div>
  );
};
