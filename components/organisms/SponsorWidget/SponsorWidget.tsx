// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  TreePine,
  Award,
  Coins,
  ExternalLink,
  Users,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  SponsorWidgetData,
  WidgetTheme,
  WidgetLayout,
  SponsorRewardDistribution,
} from '@/lib/types/sponsor-widget';

export interface SponsorWidgetProps {
  sponsor: string;
  theme?: WidgetTheme;
  layout?: WidgetLayout;
  showBranding?: boolean;
  primaryColor?: string;
  title?: string;
  showRecentRewards?: boolean;
  initialData?: SponsorWidgetData;
  className?: string;
}

export function SponsorWidget({
  sponsor,
  theme = 'auto',
  layout = 'card',
  showBranding = true,
  primaryColor,
  title,
  showRecentRewards = true,
  initialData,
  className = '',
}: SponsorWidgetProps) {
  const [data, setData] = useState<SponsorWidgetData | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [showDistributionsModal, setShowDistributionsModal] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    if (!sponsor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/sponsor/widget-data?sponsor=${encodeURIComponent(sponsor)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to load sponsor impact (${res.status})`);
      }
      const json: SponsorWidgetData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [sponsor]);

  useEffect(() => {
    if (!initialData) {
      void fetchData();
    }
  }, [fetchData, initialData]);

  // Handle postMessage resize event for iframes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      const notifyHeight = () => {
        const height = document.documentElement.scrollHeight || document.body.scrollHeight;
        window.parent.postMessage({ type: 'fc-sponsor-widget-resize', height }, '*');
      };
      notifyHeight();
      const observer = new MutationObserver(notifyHeight);
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [data, loading, layout]);

  const activeThemeClass =
    theme === 'dark'
      ? 'dark bg-slate-950 text-slate-50 border-slate-800'
      : theme === 'light'
      ? 'bg-white text-slate-900 border-slate-200'
      : 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-800';

  const accentHex = primaryColor || data?.sponsor.primaryColor || '#10b981';

  if (loading) {
    return (
      <div
        data-testid="sponsor-widget-loading"
        className={`rounded-2xl border p-6 shadow-sm transition-all ${activeThemeClass} ${className}`}
      >
        <div className="flex items-center gap-3 mb-4 animate-pulse">
          <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4 animate-pulse">
          <div className="h-16 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
          <div className="h-16 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
        </div>
        <div className="h-24 bg-slate-100 dark:bg-slate-800/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        data-testid="sponsor-widget-error"
        className={`rounded-2xl border p-6 text-center ${activeThemeClass} ${className}`}
      >
        <div className="text-red-500 font-semibold text-sm mb-1">Impact Data Unavailable</div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error || 'Sponsor could not be loaded'}</p>
        <button
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const { sponsor: sp, metrics, communityRewards, recentDistributions } = data;
  const displayTitle = title || `${sp.brandName} Impact`;

  return (
    <div
      data-testid="sponsor-widget-root"
      className={`rounded-2xl border shadow-md overflow-hidden transition-all ${activeThemeClass} ${className}`}
    >
      {/* Header section */}
      <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {sp.logoUrl ? (
              <img
                src={sp.logoUrl}
                alt={sp.brandName}
                className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0"
              />
            ) : (
              <div
                className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-lg shrink-0"
                style={{ color: accentHex, backgroundColor: `${accentHex}15` }}
              >
                {sp.brandName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight truncate">{displayTitle}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  Stellar Verified
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">• Testnet</span>
              </div>
            </div>
          </div>

          {sp.stellarExplorerUrl && (
            <a
              href={sp.stellarExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Inspect on Stellar Expert"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Main Core Impact Metrics */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
              <TreePine className="w-3.5 h-3.5 text-emerald-500" />
              Trees Funded
            </div>
            <div
              className="text-2xl font-black tracking-tight"
              style={{ color: accentHex }}
            >
              {metrics.fundedTreesCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {metrics.activeProjectsCount} eco-restoration plots
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              CO₂ Sequestered
            </div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {metrics.co2OffsetTonnes.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">tCO₂e</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {metrics.hectaresRestored} ha canopy restored
            </div>
          </div>
        </div>

        {/* Community Rewards Distributed Section */}
        {showRecentRewards && (
          <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-50/50 via-teal-50/20 to-blue-50/40 dark:from-emerald-950/20 dark:via-slate-900/40 dark:to-blue-950/20 border border-emerald-500/20 dark:border-emerald-500/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Coins className="w-3.5 h-3.5" />
                Community Rewards Distributed
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                Soroban Escrow
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-emerald-500/10">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Coins className="w-3.5 h-3.5 text-emerald-500" />
                  CARBON Tokens Rewarded
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {communityRewards.carbonTokensDistributed.toLocaleString()} CARBON
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-emerald-500/10">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Award className="w-3.5 h-3.5 text-purple-500" />
                  NFT Impact Certificates Minted
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {communityRewards.nftCertificatesIssued.toLocaleString()} Certificates
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  Steward & Farmer Stipends
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${communityRewards.totalRewardsDistributedUsdc.toLocaleString()} USDC ({communityRewards.farmersRewardedCount + communityRewards.stewardsRewardedCount} recipients)
                </span>
              </div>
            </div>

            {recentDistributions && recentDistributions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDistributionsModal(true)}
                className="w-full mt-2 pt-2 border-t border-emerald-500/10 text-left flex items-center justify-between text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition"
              >
                <span>View {recentDistributions.length} recent verified payouts</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer / White-label branding */}
      <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div>
          {showBranding ? (
            <span>
              Powered by{' '}
              <a
                href="https://farmcredit.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                FarmCredit
              </a>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" /> Cryptographically Verified
            </span>
          )}
        </div>

        <a
          href={sp.stellarExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold hover:underline"
          style={{ color: accentHex }}
        >
          Verify Ledger <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Modal for Recent Distributions */}
      {showDistributionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-500" />
                Verified Community Reward Logs
              </h4>
              <button
                onClick={() => setShowDistributionsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none p-1"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {recentDistributions.map((dist) => (
                <div
                  key={dist.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">{dist.recipientName}</span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      +{dist.carbonTokens} CARBON
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                    <span className="capitalize">{dist.recipientRole.replace('_', ' ')} • {dist.treesVerified} trees</span>
                    <span>${dist.usdcAmount} USDC</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate pt-1">
                    tx: {dist.txHash.slice(0, 16)}...{dist.txHash.slice(-8)}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowDistributionsModal(false)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
