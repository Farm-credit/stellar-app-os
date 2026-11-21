'use client';

import React, { useRef, useState } from 'react';
import { Award, Check, Copy, Download, Share2, Sparkles, X } from 'lucide-react';
import type { SponsorMilestone } from '@/lib/gamification/sponsor-milestones';
import { ConfettiBurst } from '@/components/molecules/ConfettiBurst';
import html2canvas from 'html2canvas';

interface CelebrationModalProps {
  milestone: SponsorMilestone | null;
  isOpen: boolean;
  onClose: () => void;
  sponsorName?: string;
}

export function CelebrationModal({
  milestone,
  isOpen,
  onClose,
  sponsorName = 'Tree Sponsor',
}: CelebrationModalProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen || !milestone) return null;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(milestone.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    try {
      setIsDownloading(true);
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#064e3b',
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `milestone-${milestone.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to export milestone card', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(milestone.shareText);
    const url = encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `${milestone.shareText} ${typeof window !== 'undefined' ? window.location.href : ''}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <ConfettiBurst active={true} />

        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close celebration"
          className="absolute right-4 top-4 z-50 rounded-full bg-black/10 p-2 text-slate-700 transition hover:bg-black/20 dark:bg-white/10 dark:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> Milestone Unlocked
            </span>
            <h2
              id="celebration-title"
              className="mt-3 text-2xl font-bold text-slate-900 dark:text-white"
            >
              {milestone.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {milestone.description}
            </p>
          </div>

          {/* Shareable Card Image preview */}
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-800 to-teal-900 p-6 text-white shadow-lg"
          >
            <div className="flex items-center justify-between opacity-80 text-xs">
              <span className="font-semibold tracking-wider uppercase">Stellar Tree Sponsor</span>
              <span>{new Date(milestone.achievedAt).toLocaleDateString()}</span>
            </div>
            <div className="my-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <Award className="h-9 w-9 text-amber-300" />
              </div>
              <h3 className="text-xl font-bold text-white drop-shadow-sm">{milestone.title}</h3>
              <p className="mt-1 text-sm text-emerald-100">Awarded to {sponsorName}</p>
            </div>
            <div className="flex items-center justify-between border-t border-white/20 pt-3 text-xs text-emerald-200">
              <span>Verified On-Chain</span>
              <span>#ClimateAction</span>
            </div>
          </div>

          {/* Social post prefill section */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="share-text"
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Pre-filled social post
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              id="share-text"
              readOnly
              rows={3}
              value={milestone.shareText}
              className="w-full resize-none bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>

          {/* Share Actions */}
          <div className="mt-6 flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition"
            >
              <Download className="h-4 w-4" />
              {isDownloading ? 'Generating...' : 'Save Image'}
            </button>

            <button
              type="button"
              onClick={handleShareTwitter}
              aria-label="Share on X"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleShareLinkedIn}
              className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 transition"
            >
              LinkedIn
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center justify-center rounded-xl bg-green-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-green-700 transition"
            >
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
