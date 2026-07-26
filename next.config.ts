import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  staticPageGenerationTimeout: 300,
  experimental: {
    // Throttle the build to a single core to keep memory pressure under
    // the 7GB GitHub-hosted CI runner's limit. Webpack is much more
    // memory-hungry than Turbopack and will OOM-kill the build worker
    // without these throttles. Turbopack was tried (commit 7ea16c0) but
    // hit `NftJsonAsset: cannot handle filepath url` during the
    // `output: 'standalone'` file-tracing step, so we reverted to Webpack.
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    // Keep page batching optimization (not a throttle).
    staticGenerationMinPagesPerWorker: 25,
  },
  output: 'standalone',
  outputFileTracingRoot: __dirname,
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
