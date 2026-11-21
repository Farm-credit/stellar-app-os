'use client';

import React, { useState } from 'react';

interface ARTreeViewerProps {
  treeId: string;
  species: string;
  modelUrl?: string;
}

export const ARTreeViewer: React.FC<ARTreeViewerProps> = ({
  treeId,
  species,
  modelUrl = '/models/default-tree.glb',
}) => {
  const [isARSupported, setIsARSupported] = useState<boolean>(true);
  const [screenshotCaptured, setScreenshotCaptured] = useState<boolean>(false);

  const handleCaptureScreenshot = () => {
    // Simulate shareable AR screenshot capture
    setScreenshotCaptured(true);
    setTimeout(() => setScreenshotCaptured(false), 3000);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-stellar-navy text-white rounded-lg shadow-lg w-full max-w-md mx-auto">
      <h3 className="text-lg font-bold mb-2">AR Tree Visualisation: {species}</h3>
      <p className="text-sm text-stellar-cyan mb-4">Tree ID: {treeId}</p>

      <div className="relative w-full h-64 bg-slate-800 rounded flex items-center justify-center border border-stellar-blue">
        {isARSupported ? (
          <div className="text-center p-4">
            <p className="text-xs text-stellar-green mb-2">● WebAR Ready (Real-Scale 3D)</p>
            <div className="w-32 h-32 mx-spec bg-slate-700 rounded-full animate-pulse flex items-center justify-center">
              <span className="text-2xl">🌲</span>
            </div>
            <p className="text-xs text-slate-300 mt-2">Point camera at floor to place tree</p>
          </div>
        ) : (
          <p className="text-red-400 text-sm">AR is not supported on this device/browser.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2 w-full">
        <button
          onClick={handleCaptureScreenshot}
          className="flex-1 bg-stellar-blue hover:bg-stellar-cyan text-stellar-navy font-semibold py-2 px-4 rounded transition"
        >
          Capture AR Snapshot
        </button>
      </div>

      {screenshotCaptured && (
        <div className="mt-2 p-2 bg-stellar-green text-stellar-navy text-xs rounded font-medium text-center w-full animate-fade-in">
          📸 AR Screenshot saved successfully for sharing!
        </div>
      )}
    </div>
  );
};
export default ARTreeViewer;
