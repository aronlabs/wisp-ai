/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    // Match the portfolio's first-party Rybbit proxy; expose only tracking endpoints.
    return [
      'script.js',
      'replay.js',
      'metrics.js',
      'track',
      'identify',
      'site/tracking-config/:siteId',
      'site/:siteId/feature-flags/evaluate',
      'session-replay/record/:siteId',
    ].map((path) => ({
      source: `/_fm/${path}`,
      destination: `https://rybbit.fedeminaya.com/api/${path}`,
    }));
  },
  async headers() {
    return [
      {
        source: '/barrens-hero-v1.avif',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      ...(process.env.VERCEL_ENV === 'preview'
        ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
        : []),
    ];
  },
};
export default nextConfig;
