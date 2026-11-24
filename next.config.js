/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pg'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        dns: false,
        net: false,
        tls: false,
        os: false,
        path: false,
        cluster: false,
        v8: false,
        readline: false,
      };
    }
    return config;
  },
  headers: async () => {
    return [
      {
        // Serve the service worker with the correct scope and no caching.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Content-Type', value: 'application/manifest.json' }],
      },
    ];
  },
};

module.exports = nextConfig;
