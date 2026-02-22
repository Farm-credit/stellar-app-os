"use client";

import React, { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { RelatedProject } from "@/lib/types/project";
import { fmt, fmtUsd } from "@/lib/utils/project-data";

const STATUS_DOT: Record<RelatedProject["status"], string> = {
  active: "text-stellar-green",
  completed: "text-stellar-blue",
  paused: "text-amber-400",
  upcoming: "text-stone-500",
};

function RelatedCard({ project }: { project: RelatedProject }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex-shrink-0 w-72 md:w-80 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-green rounded-2xl"
      aria-label={`View ${project.title} — ${project.location}`}
    >
      <article className="rounded-2xl border border-stone-800 bg-stone-900/60 overflow-hidden hover:border-stone-700 hover:bg-stone-900 transition-all duration-200 h-full">
        {/* Image */}
        <div className="relative h-44 bg-stone-800 overflow-hidden">
          {!imgErr ? (
            <Image
              src={project.coverSrc}
              alt={`${project.title} cover image`}
              fill
              loading="lazy"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              onError={() => setImgErr(true)}
              sizes="(max-width: 768px) 288px, 320px"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 to-stone-900/60 flex items-center justify-center">
              <span className="text-4xl" aria-hidden="true">🌿</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 to-transparent" aria-hidden="true" />
          <div className="absolute top-3 right-3">
            <span className="rounded-lg bg-stone-950/80 backdrop-blur-sm border border-stone-700 px-2.5 py-1 font-mono text-xs font-bold text-stellar-green">
              {fmtUsd(project.creditPriceUsd)}/credit
            </span>
          </div>
          <div className="absolute top-3 left-3">
            <span className={`font-mono text-xs font-semibold ${STATUS_DOT[project.status]}`}>
              ● {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </span>
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-display text-base font-bold text-cream/90 group-hover:text-cream transition-colors mb-1 line-clamp-2">
            {project.title}
          </h3>
          <p className="text-xs text-stone-500 mb-4 flex items-center gap-1">
            <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
            </svg>
            {project.location}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-stellar-green/8 border border-stellar-green/15 p-2.5">
              <p className="text-xs text-stone-500 mb-0.5">Trees</p>
              <p className="font-mono text-sm font-bold text-stellar-green">{fmt(project.treesPlanted)}</p>
            </div>
            <div className="rounded-xl bg-stellar-blue/8 border border-stellar-blue/15 p-2.5">
              <p className="text-xs text-stone-500 mb-0.5">CO₂</p>
              <p className="font-mono text-sm font-bold text-stellar-blue">{fmt(project.co2RemovedTonnes)} t</p>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function RelatedProjects({ projects }: { projects: RelatedProject[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanLeft(scrollLeft > 8);
    setCanRight(scrollLeft < scrollWidth - clientWidth - 8);
  };

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  if (!projects.length) return null;

  return (
    <section className="py-20 border-t border-stone-800/60" aria-labelledby="related-heading">
      <div className="px-6 md:px-10 max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-6 w-1 rounded-full bg-stone-500" aria-hidden="true" />
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">More Projects</span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <h2 id="related-heading" className="font-display text-3xl md:text-4xl font-bold text-cream">
            Related Projects
          </h2>
          <div className="flex gap-2" role="group" aria-label="Carousel navigation">
            {[
              { dir: "left" as const, disabled: !canLeft, label: "Scroll left" },
              { dir: "right" as const, disabled: !canRight, label: "Scroll right" },
            ].map(({ dir, disabled, label }) => (
              <button
                key={dir}
                onClick={() => scroll(dir)}
                disabled={disabled}
                aria-label={label}
                className="h-10 w-10 rounded-xl border border-stone-700 flex items-center justify-center text-stone-500 hover:text-cream hover:border-stone-500 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dir === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex gap-4 overflow-x-auto px-6 md:px-10 pb-4 scrollbar-hide snap-x snap-mandatory"
        role="list"
        aria-label="Related projects"
        tabIndex={0}
      >
        {projects.map((p) => (
          <div key={p.id} role="listitem" className="snap-start">
            <RelatedCard project={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
