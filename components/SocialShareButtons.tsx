'use client';

import React, { useMemo } from 'react';
import { Twitter, Facebook, Linkedin, MessageCircle, Copy, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  shareConfigs,
  generateShareText,
  isMobileDevice,
  copyToClipboard,
  openShareWindow,
} from '@/lib/sharing';
import { trackEvent } from '@/lib/analytics';
import { type ShareOptions, type SharePlatform } from '@/types/sharing';

interface SocialShareButtonsProps {
  url?: string;
  title: string;
  description?: string;
  donationAmount?: number;
  impact?: string;
  className?: string;
  /** Optional override for the generated share text (e.g. quiz result text). */
  shareTextOverride?: string;
  /** Optional URL of a result-card image to attach to the share. */
  imageUrl?: string;
  /** Optional context label used when tracking share events (e.g. 'quiz'). */
  shareContext?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  Twitter: <Twitter className="w-4 h-4" />,
  Facebook: <Facebook className="w-4 h-4" />,
  Linkedin: <Linkedin className="w-4 h-4" />,
  MessageCircle: <MessageCircle className="w-4 h-4" />,
  Copy: <Copy className="w-4 h-4" />,
  Share2: <Share2 className="w-4 h-4" />,
};

export default function SocialShareButtons({
  url,
  title,
  description,
  donationAmount,
  impact,
  className = '',
  shareTextOverride,
  imageUrl,
  shareContext,
}: SocialShareButtonsProps): React.ReactElement {
  const { addToast } = useToast();
  const isMobile = isMobileDevice();

  const shareUrl = useMemo(() => {
    return url || (typeof window !== 'undefined' ? window.location.href : '');
  }, [url]);

  const shareText = useMemo(() => {
    if (shareTextOverride) {
      return shareTextOverride;
    }
    const shareOptions: ShareOptions = {
      url: shareUrl,
      title,
      description,
      donationAmount,
      impact,
    };
    return generateShareText(shareOptions);
  }, [shareUrl, title, description, donationAmount, impact, shareTextOverride]);

  const encodedUrl = useMemo(() => encodeURIComponent(shareUrl), [shareUrl]);
  const encodedText = useMemo(() => encodeURIComponent(shareText), [shareText]);

  const handleShare = (platform: SharePlatform): void => {
    const config = shareConfigs[platform];
    const shareUrl = config.getShareUrl(encodedUrl, encodedText);
    trackEvent('share', {
      platform,
      context: shareContext ?? 'default',
      hasImage: Boolean(imageUrl),
    });
    openShareWindow(shareUrl, platform);
  };

  const handleCopyLink = async (): Promise<void> => {
    const success = await copyToClipboard(shareUrl);
    trackEvent('share', {
      platform: 'copy',
      context: shareContext ?? 'default',
      success,
      hasImage: Boolean(imageUrl),
    });
    if (success) {
      addToast('Link copied to clipboard!', 'success', 3000);
    } else {
      addToast('Failed to copy link. Please try again.', 'error', 3000);
    }
  };

  const platforms: SharePlatform[] = isMobile
    ? ['twitter', 'facebook', 'linkedin', 'whatsapp', 'copy']
    : ['twitter', 'facebook', 'linkedin', 'copy'];

  return (
    <section aria-labelledby="share-heading" className={`w-full ${className}`}>
      <h2 id="share-heading" className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Share This
      </h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2">
        {platforms.map((platform: SharePlatform) => {
          const config = shareConfigs[platform];

          if (platform === 'copy') {
            return (
              <button
                key={platform}
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${config.color}`}
                aria-label={config.ariaLabel}
                type="button"
              >
                {iconMap[config.icon]}
                <span>{config.label}</span>
              </button>
            );
          }

          return (
            <button
              key={platform}
              onClick={() => handleShare(platform)}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${config.color}`}
              aria-label={config.ariaLabel}
              type="button"
            >
              {iconMap[config.icon]}
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Share text: &quot;{shareText}&quot;
      </p>
    </section>
  );
}
