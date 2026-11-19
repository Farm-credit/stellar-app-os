/**
 * Analytics event tracking utility
 * Tracks user events for analytics purposes
 */

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
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
    const analyticsEvent: AnalyticsEvent = {
      event,
      properties,
      timestamp: Date.now(),
    };

    // In a production environment, this would send to your analytics service
    // For now, we'll log to console and could integrate with services like:
    // - Google Analytics
    // - Mixpanel
    // - Segment
    // - PostHog
    // etc.

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', analyticsEvent);
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

/**
 * Track auction creation for transparent price discovery
 * @param properties - Auction details (projectId, quantity, startingPrice, etc.)
 */
export function trackAuctionCreated(properties?: Record<string, unknown>): void {
  trackEvent('auction_created', properties);
}

/**
 * Track a bid placement in an auction
 * @param properties - Bid details (auctionId, bidderId, amount, etc.)
 */
export function trackBidPlaced(properties?: Record<string, unknown>): void {
  trackEvent('bid_placed', properties);
}

/**
 * Track auction settlement (winner determined, credits transferred)
 * @param properties - Settlement details (auctionId, winningBid, winnerId, etc.)
 */
export function trackAuctionSettled(properties?: Record<string, unknown>): void {
  trackEvent('auction_settled', properties);
}

/**
 * Track historical carbon data queries for usage analysis
 * @param properties - Query details (region, projectType, dateRange, etc.)
 */
export function trackHistoricalDataQuery(properties?: Record<string, unknown>): void {
  trackEvent('historical_data_query', properties);
}
