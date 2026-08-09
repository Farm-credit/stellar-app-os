'use client';

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, Image as ImageIcon, XCircle, Loader2 } from 'lucide-react';
import { compressImage } from '@/lib/utils/imageCompression';

interface ImageDropzoneProps {
  onImageProcessed: (file: File) => void;
  maxSizeMB?: number;
  disabled?: boolean;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  onImageProcessed,
  maxSizeMB = 5,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.type.startsWith('image/')) {
        setError('Please upload a valid image file (JPEG, PNG, WebP).');
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size exceeds the ${maxSizeMB}MB limit.`);
        return;
      }

      setIsProcessing(true);

      try {
        const compressedFile = await compressImage(file, 1920, 0.8);
        const objectUrl = URL.createObjectURL(compressedFile);

        setPreviewUrl(objectUrl);
        onImageProcessed(compressedFile);
      } catch (err) {
        setError('An error occurred while processing the image.');
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [maxSizeMB, onImageProcessed]
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || isProcessing) return;
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled && !isProcessing) fileInputRef.current?.click();
    }
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full space-y-2">
      <div
        role="button"
        tabIndex={disabled || isProcessing ? -1 : 0}
        aria-disabled={disabled || isProcessing}
        aria-label="Image upload dropzone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && !isProcessing && fileInputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={`
          relative flex flex-col items-center justify-center w-full min-h-[240px] p-6 
          border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : 'cursor-pointer'}
          ${isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
          ${error ? 'border-red-400 bg-red-50/30' : ''}
          ${previewUrl ? 'border-transparent p-1' : ''}
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          accept="image/jpeg, image/png, image/webp"
          className="hidden"
          disabled={disabled || isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center text-blue-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="text-sm font-medium">Compressing & optimizing...</p>
          </div>
        ) : previewUrl ? (
          <div className="relative w-full h-full group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Upload preview"
              className="w-full h-48 sm:h-64 object-cover rounded-lg shadow-sm"
            />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full 
                         opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 focus:opacity-100"
              aria-label="Remove image"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-gray-500">
            <UploadCloud
              className={`w-12 h-12 mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`}
            />
            <p className="text-base font-semibold text-gray-700 mb-1">
              Drag & drop your image here
            </p>
            <p className="text-sm text-gray-500 text-center">or click to browse files</p>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-400 font-medium">
              <ImageIcon className="w-4 h-4" />
              <span>JPEG, PNG, WebP up to {maxSizeMB}MB</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 font-medium flex items-center gap-1.5" role="alert">
          <XCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};
