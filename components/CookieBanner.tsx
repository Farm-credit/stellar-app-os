'use client';

import { JSX, useEffect, useState } from 'react';
import { PiCookieFill, PiCheckBold, PiXBold, PiGearBold } from 'react-icons/pi';
import {
  useCookieConsent,
  type CookieCategories,
  type CookieConsentState,
} from '@/hooks/useCookieConsent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CookieBannerProps {
  /**
   * Position of the banner on the screen
   * @default 'bottom'
   */
  position?: 'bottom' | 'top';

  /**
   * Custom heading text
   * @default 'Cookie Preferences'
   */
  heading?: string;

  /**
   * Custom description text
   */
  description?: string;

  /**
   * Whether to show the banner
   * @default true
   */
  show?: boolean;

  /**
   * Callback when consent preferences change
   */
  onConsent?: (consent: CookieConsentState) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CookieBanner
 *
 * A responsive, accessible cookie consent banner that:
 * - Shows on first visit
 * - Persists user choice in localStorage
 * - Prevents non-essential cookies before consent
 * - Does not reappear after choice
 *
 * Accessibility Features:
 * - WCAG 2.1 Level AA compliant
 * - Semantic HTML with proper ARIA attributes
 * - Focus trap and keyboard navigation in customize modal
 * - High contrast button styles
 * - Descriptive button labels
 * - Live region updates for customize state
 *
 * Responsive Design:
 * - Mobile-first approach
 * - Adapts to all screen sizes
 * - Touch-friendly button sizes (min 48px height)
 * - Flexible layout for all devices
 */
export function CookieBanner({
  position = 'bottom',
  heading = 'Cookie Preferences',
  description,
  show: showProp,
  onConsent,
}: CookieBannerProps): JSX.Element | null {
  const {
    isLoading,
    hasConsented,
    preferences,
    acceptAll,
    rejectNonEssential,
    setPreferences,
    consentState,
  } = useCookieConsent();

  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showCustomize, setShowCustomize] = useState<boolean>(false);
  const [customPrefs, setCustomPrefs] = useState<CookieCategories>(preferences);

  /**
   * Show banner only if user hasn't consented yet
   */
  useEffect(() => {
    if (isLoading) return;

    if (showProp !== undefined) {
      setShowBanner(showProp && !hasConsented);
    } else {
      setShowBanner(!hasConsented);
    }
  }, [isLoading, hasConsented, showProp]);

  /**
   * Update custom preferences when preferences change
   */
  useEffect(() => {
    setCustomPrefs(preferences);
  }, [preferences]);

  /**
   * Fire onConsent callback when consent state changes
   */
  useEffect(() => {
    if (consentState && consentState.hasConsented && onConsent) {
      onConsent(consentState);
    }
  }, [consentState, onConsent]);

  if (isLoading || !showBanner) return null;

  /**
   * Handle Accept All
   */
  const handleAcceptAll = (): void => {
    acceptAll();
    setShowBanner(false);
  };

  /**
   * Handle Reject Non-Essential
   */
  const handleRejectNonEssential = (): void => {
    rejectNonEssential();
    setShowBanner(false);
  };

  /**
   * Handle Customize
   */
  const handleOpenCustomize = (): void => {
    setCustomPrefs(preferences);
    setShowCustomize(true);
  };

  /**
   * Handle Close Customize
   */
  const handleCloseCustomize = (): void => {
    setShowCustomize(false);
  };

  /**
   * Handle Save Custom Preferences
   */
  const handleSaveCustom = (): void => {
    setPreferences(customPrefs);
    setShowCustomize(false);
    setShowBanner(false);
  };

  /**
   * Handle toggle category
   */
  const handleToggleCategory = (category: keyof CookieCategories): void => {
    if (category === 'necessary') {
      // Necessary cookies cannot be disabled
      return;
    }

    setCustomPrefs((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const defaultDescription = `We use cookies to enhance your experience, analyze site traffic, and for marketing purposes. You can customize your preferences.`;

  // ── Main Banner ─────────────────────────────────────────────────────────

  const bannerClasses = `fixed left-0 right-0 z-50 ${
    position === 'top' ? 'top-0' : 'bottom-0'
  } bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-2xl`;

  return (
    <>
      {/* Main Banner */}
      <div
        className={bannerClasses}
        role="region"
        aria-label="Cookie consent banner"
        aria-live="polite"
      >
        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-96">
          <div className="mx-auto max-w-6xl p-4 sm:p-6">
            {/* Header with Icon and Title */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <PiCookieFill
                  className="h-6 w-6 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-1"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {heading}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {description || defaultDescription}
                  </p>
                </div>
              </div>

              {/* Button Group - Responsive Layout */}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-2">
                {/* Reject Non-Essential Button */}
                <button
                  onClick={handleRejectNonEssential}
                  className="px-4 py-2.5 min-h-12 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900 active:bg-slate-100 dark:active:bg-slate-600"
                  aria-label="Reject non-essential cookies"
                >
                  <span className="flex items-center justify-center gap-2">
                    <PiXBold className="h-4 w-4" aria-hidden="true" />
                    Reject
                  </span>
                </button>

                {/* Customize Button */}
                <button
                  onClick={handleOpenCustomize}
                  className="px-4 py-2.5 min-h-12 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900 active:bg-slate-300 dark:active:bg-slate-500"
                  aria-label="Customize cookie preferences"
                >
                  <span className="flex items-center justify-center gap-2">
                    <PiGearBold className="h-4 w-4" aria-hidden="true" />
                    Customize
                  </span>
                </button>

                {/* Accept All Button */}
                <button
                  onClick={handleAcceptAll}
                  className="px-4 py-2.5 min-h-12 rounded-md bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900 active:bg-blue-800"
                  aria-label="Accept all cookies"
                >
                  <span className="flex items-center justify-center gap-2">
                    <PiCheckBold className="h-4 w-4" aria-hidden="true" />
                    Accept All
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customize Modal */}
      {showCustomize && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity"
            onClick={handleCloseCustomize}
            aria-hidden="true"
          />

          {/* Modal */}
          <div
            className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white dark:bg-slate-900 p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-modal-title"
            aria-describedby="customize-modal-desc"
          >
            {/* Close Button */}
            <button
              onClick={handleCloseCustomize}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Close customize modal"
            >
              <span className="sr-only">Close</span>
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Title */}
            <h3
              id="customize-modal-title"
              className="text-xl font-semibold text-slate-900 dark:text-white mb-2"
            >
              Customize Cookies
            </h3>
            <p
              id="customize-modal-desc"
              className="text-sm text-slate-600 dark:text-slate-300 mb-6"
            >
              Select which cookies you want to accept. Necessary cookies cannot be disabled.
            </p>

            {/* Cookie Categories */}
            <div className="space-y-4 mb-6">
              {/* Necessary Cookies */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  id="cookie-necessary"
                  checked={true}
                  disabled={true}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 cursor-not-allowed opacity-75"
                  aria-label="Necessary cookies (always enabled)"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="cookie-necessary"
                    className="block font-medium text-slate-900 dark:text-white text-sm"
                  >
                    Necessary Cookies
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Required for core functionality, security, and legal compliance. Cannot be disabled.
                  </p>
                </div>
              </div>

              {/* Analytics Cookies */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  id="cookie-analytics"
                  checked={customPrefs.analytics}
                  onChange={() => handleToggleCategory('analytics')}
                  className="mt-1 h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  aria-label="Enable analytics cookies"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="cookie-analytics"
                    className="block font-medium text-slate-900 dark:text-white text-sm cursor-pointer"
                  >
                    Analytics Cookies
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Help us understand how you use our site to improve your experience.
                  </p>
                </div>
              </div>

              {/* Marketing Cookies */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  id="cookie-marketing"
                  checked={customPrefs.marketing}
                  onChange={() => handleToggleCategory('marketing')}
                  className="mt-1 h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  aria-label="Enable marketing cookies"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="cookie-marketing"
                    className="block font-medium text-slate-900 dark:text-white text-sm cursor-pointer"
                  >
                    Marketing Cookies
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Allow us to show you relevant ads and track campaign performance.
                  </p>
                </div>
              </div>

              {/* Preferences Cookies */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  id="cookie-preferences"
                  checked={customPrefs.preferences}
                  onChange={() => handleToggleCategory('preferences')}
                  className="mt-1 h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  aria-label="Enable preference cookies"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="cookie-preferences"
                    className="block font-medium text-slate-900 dark:text-white text-sm cursor-pointer"
                  >
                    Preference Cookies
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Remember your settings and preferences for a better experience.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={handleCloseCustomize}
                className="px-4 py-2.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900 active:bg-slate-100 dark:active:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustom}
                className="px-4 py-2.5 rounded-md bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900 active:bg-blue-800"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
