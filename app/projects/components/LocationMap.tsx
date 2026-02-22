"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/lib/types/project";

interface LocationMapProps {
  coordinates: Coordinates;
  label: string;
  country: string;
}

export function LocationMap({ coordinates, label, country }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Lazy-load: only mount the iframe when the section enters viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.05, rootMargin: "300px" }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { lat, lng } = coordinates;
  // OpenStreetMap embed — zero API key required
  const bbox = `${lng - 2},${lat - 2},${lng + 2},${lat + 2}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const mapsHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=9/${lat}/${lng}`;

  return (
    <section
      ref={containerRef}
      className="py-20 px-6 md:px-10 border-t border-stone-800/60"
      aria-labelledby="map-heading"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-6 w-1 rounded-full bg-amber-500" aria-hidden="true" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Location</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <h2 id="map-heading" className="font-display text-3xl md:text-4xl font-bold text-cream">
            Where It Happens
          </h2>
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-700/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 transition-all shrink-0"
            aria-label={`Open ${label} in OpenStreetMap`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
            </svg>
            Open in Maps
          </a>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-stone-800">
          {/* Coordinate badge */}
          <div
            className="absolute top-4 left-4 z-10 rounded-lg bg-stone-950/90 backdrop-blur-sm border border-stone-700 px-3 py-1.5 font-mono text-xs text-stone-400"
            aria-label={`GPS coordinates: ${lat.toFixed(4)} latitude, ${lng.toFixed(4)} longitude`}
          >
            {lat.toFixed(4)}°, {lng.toFixed(4)}°
          </div>

          {visible ? (
            <iframe
              src={mapSrc}
              title={`Map of project location: ${label}, ${country}`}
              className="w-full h-[420px] md:h-[500px]"
              loading="lazy"
              style={{
                border: 0,
                filter: "invert(93%) hue-rotate(180deg) saturate(0.75) brightness(0.88)",
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div
              className="w-full h-[420px] md:h-[500px] bg-stone-900 flex items-center justify-center"
              aria-live="polite"
              aria-label="Map loading"
            >
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin mx-auto mb-3" aria-hidden="true" />
                <p className="text-stone-500 text-sm">Loading map…</p>
              </div>
            </div>
          )}

          {/* bottom fade */}
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-stone-950/50 to-transparent pointer-events-none" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
