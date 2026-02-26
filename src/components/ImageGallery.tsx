"use client";
import React, { useState, useCallback } from 'react';
import { type GalleryImage } from '../types/gallery';
import { Lightbox } from './Lightbox'; 

interface ImageGalleryProps {
  images: GalleryImage[];
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => (prev !== null && prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  return (
    <section className="w-full flex justify-center p-4">
      {/* 'justify-items-center' centers the boxes inside the grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center w-full max-w-6xl">
        {images.map((img, index) => (
          <button
            key={img.id}
            onClick={() => setSelectedIndex(index)}
            className="group relative flex items-center justify-center overflow-hidden rounded-xl bg-gray-100 shadow-md hover:shadow-xl transition-all duration-300 w-full max-w-85.5"
          >
            <img
              src={img.url}
              alt={img.alt}
              className="w-full aspect-4/3 object-cover transition-transform duration-500 group-hover:scale-110"
            />
            {/* Hover overlay for a 'fine' look */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
               <span className="text-white font-semibold border-2 border-white px-4 py-2 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-transform">
                 View Image
               </span>
            </div>
          </button>
        ))}
      </div>

      {selectedIndex !== null && (
        <Lightbox
          image={images[selectedIndex]}
          onClose={() => setSelectedIndex(null)}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
    </section>
  );
};