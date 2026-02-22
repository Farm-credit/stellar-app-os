"use client";

import React, { useState } from "react";
import Image from "next/image";
import type { Project } from "@/lib/types/project";


function ShareStrip({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const encodedTitle = encodeURIComponent(title);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Share this project">
      {/* Twitter / X */}
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X (Twitter)"
        className="share-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className="share-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>

      {/* Copy link */}
      <button
        onClick={copyLink}
        aria-label={copied ? "Link copied!" : "Copy link to clipboard"}
        className="share-btn"
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Project["status"], string> = {
  active: "Active Project",
  completed: "Completed",
  paused: "Paused",
  upcoming: "Coming Soon",
};

const STATUS_COLORS: Record<Project["status"], string> = {
  active: "bg-stellar-green/20 text-stellar-green border-stellar-green/30",
  completed: "bg-stellar-blue/20 text-stellar-blue border-stellar-blue/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  upcoming: "bg-stone-500/20 text-stone-400 border-stone-500/30",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface HeroSectionProps {
  project: Project;
}

export function HeroSection({ project }: HeroSectionProps) {
  const [imgError, setImgError] = useState(false);
  const treePct = project.progress.treesTarget > 0
    ? Math.round((project.progress.treesPlanted / project.progress.treesTarget) * 100)
    : 0;

  return (
    <section className="relative w-full" aria-label="Project hero">
      {/* ── Media ── */}
      <div className="relative h-[62vh] min-h-[480px] max-h-[720px] overflow-hidden">
        {project.hero.kind === "video" ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay muted loop playsInline
            poster={project.hero.poster}
            aria-label={project.hero.alt}
          >
            <source src={project.hero.src} type="video/mp4" />
          </video>
        ) : imgError ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-900 via-green-800 to-lime-900"
            role="img"
            aria-label="Project image unavailable"
          >
            <div className="text-center opacity-40">
              <div className="text-7xl mb-2" aria-hidden="true">🌿</div>
              <p className="text-cream/60 text-sm font-body">Image unavailable</p>
            </div>
          </div>
        ) : (
          <Image
            src={project.hero.src}
            alt={project.hero.alt}
            fill
            priority
            className="object-cover"
            onError={() => setImgError(true)}
            sizes="100vw"
          />
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-stone-950/5" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/70 via-transparent to-transparent" aria-hidden="true" />

        {/* ── Top bar ── */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-6 md:p-8">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm ${STATUS_COLORS[project.status]}`}
          >
            {project.status === "active" && (
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
            )}
            {STATUS_LABELS[project.status]}
          </span>
          <ShareStrip title={project.title} />
        </div>

        {/* ── Hero text ── */}
        <div className="absolute bottom-0 inset-x-0 px-6 pb-10 md:px-12 md:pb-14 max-w-4xl">
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {project.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded text-xs font-medium bg-white/10 text-cream/70 px-2.5 py-0.5 backdrop-blur-sm border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-cream leading-tight mb-4 tracking-tight drop-shadow-lg">
            {project.title}
          </h1>

          <p className="font-body text-base md:text-lg text-cream/70 max-w-2xl leading-relaxed mb-6 drop-shadow">
            {project.tagline}
          </p>

          {/* Location pill */}
          <div className="flex items-center gap-1.5 text-cream/55 text-sm">
            <svg className="w-4 h-4 shrink-0 text-stellar-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{project.location.label}, {project.location.country}</span>
          </div>
        </div>
      </div>

      {/* ── Progress strip ── */}
      <div className="bg-stone-900/90 backdrop-blur-md border-b border-stone-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="font-mono text-xs text-stone-400 shrink-0">{treePct}%</span>
          <div
            className="flex-1 h-1.5 rounded-full bg-stone-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={treePct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tree planting progress"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-stellar-green to-emerald-400 transition-all duration-1000"
              style={{ width: `${treePct}%` }}
            />
          </div>
          <span className="font-mono text-xs text-stellar-green shrink-0">
            {(project.progress.treesPlanted / 1_000_000).toFixed(2)}M / {(project.progress.treesTarget / 1_000_000).toFixed(1)}M trees
          </span>
        </div>
      </div>
    </section>
  );
}
