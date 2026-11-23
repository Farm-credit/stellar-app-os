/**
 * Social sharing types and interfaces
 */

export type SharePlatform = 'twitter' | 'facebook' | 'linkedin' | 'whatsapp' | 'copy';

export interface ShareConfig {
  platform: SharePlatform;
  url: string;
  getShareUrl: (baseUrl: string, encodedText: string) => string;
  label: string;
  icon: string;
  color: string;
  ariaLabel: string;
}

export interface ShareOptions {
  url: string;
  title: string;
  description?: string;
  donationAmount?: number;
  impact?: string;
}

export interface ShareEvent {
  platform: SharePlatform;
  url: string;
  success: boolean;
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

export interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;
}

/**
 * Options for sharing a tree species quiz result card.
 */
export interface QuizShareOptions {
  /** Canonical URL of the quiz (used as the base for share links). */
  quizUrl: string;
  /** Title of the quiz, e.g. "Which Tree Are You?". */
  quizTitle: string;
  /** The user's quiz result archetype name, e.g. "The Steady Oak". */
  resultTitle: string;
  /** Short description of the result archetype. */
  resultDescription?: string;
  /** Names of the recommended tree species shown on the result card. */
  recommendedSpecies?: string[];
  /** URL to the sponsorship page for the recommended species. */
  sponsorUrl?: string;
  /** Optional image URL for the shareable result card. */
  imageUrl?: string;
  /** Optional hashtags to append to social share text. */
  hashtags?: string[];
}

/**
 * The outcome of a quiz share attempt, used to drive UI feedback.
 */
export interface QuizShareResult {
  /** Platform the result was shared to. */
  platform: SharePlatform;
  /** Whether the share action completed successfully. */
  success: boolean;
  /** The fully-formed share URL that was opened or copied. */
  shareUrl: string;
  /** Timestamp (ms since epoch) of the share attempt. */
  timestamp: number;
  /** Optional error message when success is false. */
  error?: string;
}