'use client';
import React, { useEffect } from 'react';
import { type GalleryImage } from '../types/gallery';

interface LightboxProps {
  image: GalleryImage;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ image, onClose, onNext, onPrev }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
      <button
        onClick={onClose}
        className="absolute top-8 right-8 text-white/70 hover:text-white text-4xl p-2 transition-colors"
        aria-label="Close"
      >
        &times;
      </button>

      <button
        onClick={onPrev}
        className="absolute left-8 text-white/50 hover:text-white text-5xl p-4 transition-colors hidden md:block"
        aria-label="Previous"
      >
        &#8249;
      </button>

      <div className="flex flex-col items-center max-w-5xl w-full animate-in fade-in zoom-in duration-300">
        <img
          src={image.url} // FIXED: Changed from src to url
          alt={image.alt}
          className="max-h-[80vh] w-auto object-contain rounded shadow-2xl"
        />
        {(image.caption || image.alt) && (
          <p className="mt-6 text-white text-center text-xl font-light tracking-wide">
            {image.caption || image.alt}
          </p>
        )}
      </div>

      <button
        onClick={onNext}
        className="absolute right-8 text-white/50 hover:text-white text-5xl p-4 transition-colors hidden md:block"
        aria-label="Next"
      >
        &#8250;
      </button>
    </div>
  );
};
