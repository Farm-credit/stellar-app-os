import { useEffect, useState, useCallback } from 'react';

/**
 * Cookie Categories
 */
export interface CookieCategories {
  necessary: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

/**
 * Cookie Consent State
 */
export interface CookieConsentState {
  hasConsented: boolean;
  preferences: CookieCategories;
  consentTimestamp: number | null;
}

/**
 * Storage key for consent preferences
 */
const COOKIE_CONSENT_KEY = 'stellar_cookie_consent';

/**
 * Default consent: necessary only
 */
const DEFAULT_CONSENT: CookieConsentState = {
  hasConsented: false,
  preferences: {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  },
  consentTimestamp: null,
};

/**
 * All consent (Accept All)
 */
const ALL_CONSENT: CookieConsentState = {
  hasConsented: true,
  preferences: {
    necessary: true,
    analytics: true,
    marketing: true,
    preferences: true,
  },
  consentTimestamp: Date.now(),
};

/**
 * Minimal consent (Reject Non-Essential)
 */
const MINIMAL_CONSENT: CookieConsentState = {
  hasConsented: true,
  preferences: {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  },
  consentTimestamp: Date.now(),
};

/**
 * useCookieConsent Hook
 *
 * Manages cookie consent preferences and persistence.
 *
 * Features:
 * - Persists consent to localStorage
 * - Returns consent preferences
 * - Provides methods to accept all, reject non-essential, or customize
 * - Prevents non-essential cookies before consent
 * - Does not re-show banner after choice
 *
 * @returns Object with consent state and control methods
 */
export function useCookieConsent() {
  const [consentState, setConsentState] = useState<CookieConsentState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /**
   * Load consent from localStorage on mount
   */
  useEffect(() => {
    const loadConsent = (): void => {
      try {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);

        if (stored) {
          const parsed: CookieConsentState = JSON.parse(stored);
          setConsentState(parsed);
        } else {
          setConsentState(DEFAULT_CONSENT);
        }
      } catch {
        // If localStorage fails or parsing fails, use default
        setConsentState(DEFAULT_CONSENT);
      } finally {
        setIsLoading(false);
      }
    };

    loadConsent();
  }, []);

  /**
   * Save consent to localStorage with proper error handling
   */
  const saveConsent = useCallback((consent: CookieConsentState): void => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
      setConsentState(consent);

      // Fire consent changed event for third-party integrations
      const event = new CustomEvent('cookieConsentChanged', { detail: consent });
      window.dispatchEvent(event);
    } catch {
      // Silently fail if localStorage is unavailable (private browsing, etc.)
      console.warn('Failed to save cookie consent to localStorage');
    }
  }, []);

  /**
   * Accept all cookies
   */
  const acceptAll = useCallback((): void => {
    saveConsent(ALL_CONSENT);
  }, [saveConsent]);

  /**
   * Reject non-essential cookies (necessary only)
   */
  const rejectNonEssential = useCallback((): void => {
    saveConsent(MINIMAL_CONSENT);
  }, [saveConsent]);

  /**
   * Set custom preferences
   */
  const setPreferences = useCallback((preferences: CookieCategories): void => {
    const customConsent: CookieConsentState = {
      hasConsented: true,
      preferences: {
        necessary: true, // Always required
        analytics: preferences.analytics,
        marketing: preferences.marketing,
        preferences: preferences.preferences,
      },
      consentTimestamp: Date.now(),
    };
    saveConsent(customConsent);
  }, [saveConsent]);

  /**
   * Check if a specific cookie category is allowed
   */
  const isCategoryAllowed = useCallback((category: keyof CookieCategories): boolean => {
    if (!consentState) return category === 'necessary';
    return consentState.preferences[category];
  }, [consentState]);

  /**
   * Check if user has made a consent choice
   */
  const hasUserConsented = useCallback((): boolean => {
    if (!consentState) return false;
    return consentState.hasConsented;
  }, [consentState]);

  /**
   * Reset consent (for testing or user request)
   */
  const resetConsent = useCallback((): void => {
    try {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
      setConsentState(DEFAULT_CONSENT);
    } catch {
      console.warn('Failed to reset cookie consent');
    }
  }, []);

  return {
    // State
    consentState,
    isLoading,
    hasConsented: consentState?.hasConsented ?? false,
    preferences: consentState?.preferences ?? DEFAULT_CONSENT.preferences,

    // Methods
    acceptAll,
    rejectNonEssential,
    setPreferences,
    isCategoryAllowed,
    hasUserConsented,
    resetConsent,
  };
}
