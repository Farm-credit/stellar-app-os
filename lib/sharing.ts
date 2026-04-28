/**
 * Social sharing configuration and utilities
 */

import type { ShareConfig, ShareOptions, SharePlatform } from '@/types/sharing';
import { trackEvent } from '@/lib/analytics';

/**
 * Share platform configurations
 */
export const shareConfigs: Record<SharePlatform, ShareConfig> = {
  twitter: {
    platform: 'twitter',
    url: '',
    getShareUrl: (baseUrl: string, encodedText: string) =>
      `https://twitter.com/intent/tweet?url=${baseUrl}&text=${encodedText}`,
    label: 'Twitter/X',
    icon: 'Twitter',
    color: 'bg-black hover:bg-gray-900',
    ariaLabel: 'Share on Twitter',
  },
  facebook: {
    platform: 'facebook',
    url: '',
    getShareUrl: (baseUrl: string) => `https://www.facebook.com/sharer/sharer.php?u=${baseUrl}`,
    label: 'Facebook',
    icon: 'Facebook',
    color: 'bg-blue-600 hover:bg-blue-700',
    ariaLabel: 'Share on Facebook',
  },
  linkedin: {
    platform: 'linkedin',
    url: '',
    getShareUrl: (baseUrl: string, _encodedText: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${baseUrl}`,
    label: 'LinkedIn',
    icon: 'Linkedin',
    color: 'bg-blue-700 hover:bg-blue-800',
    ariaLabel: 'Share on LinkedIn',
  },
  whatsapp: {
    platform: 'whatsapp',
    url: '',
    getShareUrl: (baseUrl: string, encodedText: string) =>
      `https://wa.me/?text=${encodedText}%20${baseUrl}`,
    label: 'WhatsApp',
    icon: 'MessageCircle',
    color: 'bg-green-500 hover:bg-green-600',
    ariaLabel: 'Share on WhatsApp',
  },
  copy: {
    platform: 'copy',
    url: '',
    getShareUrl: () => '',
    label: 'Copy Link',
    icon: 'Copy',
    color: 'bg-gray-600 hover:bg-gray-700',
    ariaLabel: 'Copy link to clipboard',
  },
};

/**
 * Generate share text based on options
 */
export function generateShareText(options: ShareOptions): string {
  const { title, description, donationAmount, impact } = options;

  if (donationAmount && impact) {
    return `I just donated $${donationAmount} to FarmCredit supporting sustainable agriculture! ${impact} 🌾 ${title}`;
  }

  if (donationAmount) {
    return `I just donated $${donationAmount} to FarmCredit supporting sustainable agriculture! 🌾 ${title}`;
  }

  if (impact) {
    return `${title} - ${impact} Join me in supporting FarmCredit on Stellar!`;
  }

  if (description) {
    return `${title} - ${description}`;
  }

  return title;
}

/**
 * Check if device is mobile
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const mobileRegex = /iPhone|iPad|Android|Windows Phone|Opera Mini|IEMobile|Mobile/i;
  return mobileRegex.test(navigator.userAgent);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      trackEvent('copy_link', { success: true });
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();

      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        trackEvent('copy_link', { success: true });
        return true;
      } catch {
        document.body.removeChild(textArea);
        trackEvent('copy_link', { success: false });
        return false;
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Sharing Error]', error);
    }
    trackEvent('copy_link', { success: false });
    return false;
  }
}

/**
 * Open share URL in new window
 */
export function openShareWindow(url: string, platform: SharePlatform): void {
  try {
    trackEvent('share', { platform, url });
    window.open(url, '_blank', 'width=600,height=400,noopener,noreferrer');
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Share Window Error]', error);
    }
  }
}
