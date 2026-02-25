/**
 * Analytics event tracking utility
 * Tracks user events for analytics purposes
 */

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
}

/**
 * Track an analytics event
 * @param event - Event name
 * @param properties - Optional event properties
 */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // In a production environment, this would send to your analytics service
    // For now, we'll log to console and could integrate with services like:
    // - Google Analytics
    // - Mixpanel
    // - Segment
    // - PostHog
    // etc.

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.info('[Analytics]', event, properties);
    }

    // Example: Send to analytics service
    // if (window.gtag) {
    //   window.gtag("event", event, properties);
    // }

    // Example: Send to custom analytics endpoint
    // fetch("/api/analytics", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ event, properties }),
    // }).catch(console.error);
  } catch (error) {
    // Silently fail analytics tracking to not break user experience
    if (process.env.NODE_ENV === 'development') {
      console.error('[Analytics Error]', error);
    }
  }
}
