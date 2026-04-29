import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 25,
  },
  images: {
    remotePatterns: [
      {
        // Allow any HTTPS image source — the CMS will provide the actual domain.
        // Restrict this to specific domains once the CMS URL is known.
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
