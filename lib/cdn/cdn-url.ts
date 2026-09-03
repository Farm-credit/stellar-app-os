/**
 * CDN URL utilities for global edge delivery
 * 
 * All photos, map tiles, and static assets are served through CloudFront
 * with edge locations ensuring <100ms TTFB globally.
 */

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
}

/**
 * Get CDN URL for a photo stored in S3
 * Falls back to signed S3 URL if CDN is not configured
 * 
 * @param s3Key - S3 object key (e.g., "planting-photos/farmer123/timestamp.jpg")
 * @param options - Optional image optimization parameters
 * @returns CDN URL with edge caching
 */
export function getCdnPhotoUrl(s3Key: string, options?: ImageOptimizationOptions): string {
  if (!CDN_URL) {
    // Fallback: use direct S3 access (will be slower, no CDN)
    console.warn('[CDN] CDN_URL not configured, falling back to S3 direct access');
    return `/api/planting/photo/${encodeURIComponent(s3Key)}`;
  }

  const url = new URL(s3Key, CDN_URL);

  if (options) {
    if (options.width) url.searchParams.set('w', options.width.toString());
    if (options.height) url.searchParams.set('h', options.height.toString());
    if (options.quality) url.searchParams.set('q', options.quality.toString());
    if (options.format) url.searchParams.set('format', options.format);
  }

  return url.toString();
}

/**
 * Get CDN URL for map tiles API endpoint
 * 
 * @param region - Optional region filter
 * @param zoom - Optional zoom level
 * @param bbox - Optional bounding box
 * @returns CDN URL for map tiles with edge caching
 */
export function getCdnMapTilesUrl(params?: {
  region?: string;
  zoom?: number;
  bbox?: string;
}): string {
  const baseUrl = CDN_URL || '';
  const url = new URL('/api/planting/map', baseUrl || window.location.origin);

  if (params) {
    if (params.region) url.searchParams.set('region', params.region);
    if (params.zoom) url.searchParams.set('zoom', params.zoom.toString());
    if (params.bbox) url.searchParams.set('bbox', params.bbox);
  }

  return url.toString();
}

/**
 * Get CDN URL for static assets
 * 
 * @param assetPath - Path to static asset (e.g., "assets/logo.svg", "icons/icon-192x192.png")
 * @returns CDN URL with aggressive edge caching
 */
export function getCdnAssetUrl(assetPath: string): string {
  if (!CDN_URL) {
    // Fallback to Next.js static serving
    return `/${assetPath}`;
  }

  return `${CDN_URL}/${assetPath}`;
}

/**
 * Check if CDN is enabled and configured
 */
export function isCdnEnabled(): boolean {
  return Boolean(CDN_URL);
}

/**
 * Get CloudFront distribution ID (for cache invalidation)
 */
export function getDistributionId(): string | undefined {
  return CLOUDFRONT_DISTRIBUTION_ID;
}

/**
 * Generate responsive image srcset for CDN delivery
 * 
 * @param s3Key - S3 object key
 * @param widths - Array of widths for responsive images
 * @param format - Image format (default: webp)
 * @returns srcset string for <img> tag
 */
export function getCdnImageSrcSet(
  s3Key: string,
  widths: number[] = [320, 640, 1024, 1920],
  format: 'webp' | 'avif' = 'webp'
): string {
  return widths
    .map((width) => {
      const url = getCdnPhotoUrl(s3Key, { width, quality: 85, format });
      return `${url} ${width}w`;
    })
    .join(', ');
}

/**
 * Get cache headers for CDN-compatible responses
 * 
 * @param type - Content type (photo, map, static)
 * @returns Cache-Control header value
 */
export function getCdnCacheHeaders(
  type: 'photo' | 'map' | 'static'
): Record<string, string> {
  const headers: Record<string, string> = {};

  switch (type) {
    case 'photo':
      // 1 day default, revalidate in background
      headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=86400';
      headers['CDN-Cache-Control'] = 'max-age=86400';
      break;

    case 'map':
      // 5 minutes, revalidate frequently
      headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=300';
      headers['CDN-Cache-Control'] = 'max-age=300';
      break;

    case 'static':
      // 1 year, immutable
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      headers['CDN-Cache-Control'] = 'max-age=31536000';
      break;
  }

  return headers;
}

/**
 * Invalidate CDN cache for specific paths
 * 
 * This is a server-side only function
 * 
 * @param paths - Array of paths to invalidate
 * @returns Invalidation ID or null if CDN not configured
 */
export async function invalidateCdnCache(paths: string[]): Promise<string | null> {
  if (!CLOUDFRONT_DISTRIBUTION_ID) {
    console.warn('[CDN] Cannot invalidate cache: CLOUDFRONT_DISTRIBUTION_ID not set');
    return null;
  }

  // This requires AWS SDK on server-side
  // Import dynamically to avoid client-side bundle
  try {
    const { CloudFrontClient, CreateInvalidationCommand } = await import(
      '@aws-sdk/client-cloudfront'
    );

    const client = new CloudFrontClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    const command = new CreateInvalidationCommand({
      DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    });

    const response = await client.send(command);
    return response.Invalidation?.Id || null;
  } catch (error) {
    console.error('[CDN] Cache invalidation failed:', error);
    return null;
  }
}
